/**
 * Post local flyer PNGs to Meetmap (extract + geocode + create event).
 * Usage: node scripts/post-local-flyers.mjs [folder] [--dry-run]
 * Env: load from .env.local / .env (vercel env pull) — needs SUPABASE_SERVICE_ROLE_KEY,
 *      FLYER_AGENT_USER_ID, ANTHROPIC_API_KEY (via extract API), R2_* optional.
 */
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const ALLOWED_TYPES = new Set(['meet', 'car show', 'track day', 'cruise'])

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    const key = m[1].trim()
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    val = val.replace(/\r$/, '').trim()
    val = val
      .replace(/\\r\\n/g, '')
      .replace(/\\n/g, '')
      .replace(/\\r/g, '')
    if (process.env[key] == null || process.env[key] === '') process.env[key] = val
  }
}

loadEnvFile(path.join(process.cwd(), '.env'))
loadEnvFile(path.join(process.cwd(), '.env.local'))

const norm = (v) =>
  String(v ?? '')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

function normPlace(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\b(united states|u\.s\.a\.?|usa)\b/g, ' ')
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function samePlaceText(left, right) {
  const a = normPlace(left)
  const b = normPlace(right)
  return a.length >= 8 && a === b
}

function sameAddressOrVenue(a, b) {
  return (
    samePlaceText(a.address, b.address) ||
    samePlaceText(a.location, b.location) ||
    samePlaceText(a.address, b.location) ||
    samePlaceText(a.location, b.address)
  )
}

const args = process.argv.slice(2).filter((a) => a !== '--dry-run')
const dryRun = process.argv.includes('--dry-run')
const folder = path.resolve(args[0] || 'instagram-events/run1')

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
const FLYER_AGENT_USER_ID = norm(process.env.FLYER_AGENT_USER_ID)
// Mobile app host has /api/extract-flyer; desktop origin may not.
const APP_ORIGIN = process.env.MEETMAP_EXTRACT_ORIGIN || 'https://meetmap-gilt.vercel.app'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run: npx vercel env pull .env.local',
  )
  process.exit(1)
}
if (!FLYER_AGENT_USER_ID && dryRun === false) {
  console.error('Missing FLYER_AGENT_USER_ID')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function r2Client() {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKeyId || !secretAccessKey) return null
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

function mediaTypeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  return 'image/jpeg'
}

async function extractFromFile(filePath) {
  const buf = fs.readFileSync(filePath)
  if (!buf.length) throw new Error('Empty file')
  const base64 = buf.toString('base64')
  const mediaType = mediaTypeForFile(filePath)
  const sourceUrl = `local://${path.basename(filePath)}`
  const res = await fetch(`${APP_ORIGIN.replace(/\/$/, '')}/api/extract-flyer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: base64,
      mediaType,
      sourceUrl,
      correlationId: `local-${Date.now()}`,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `extract failed (${res.status})`)
  if (!json?.extracted) throw new Error('No extracted data')
  return json.extracted
}

function normalizeEvent(extracted) {
  const type = norm(extracted?.type).toLowerCase()
  const tagsRaw = extracted?.tags
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw
        .map((t) => norm(t))
        .filter(Boolean)
        .slice(0, 10)
    : String(tagsRaw || '')
        .split(',')
        .map((t) => norm(t))
        .filter(Boolean)
        .slice(0, 10)
  return {
    title: norm(extracted?.title),
    type: ALLOWED_TYPES.has(type) ? type : 'meet',
    date: norm(extracted?.date),
    time: norm(extracted?.time) || null,
    location: norm(extracted?.location),
    address: norm(extracted?.verified_address || extracted?.address),
    city: norm(extracted?.city),
    host: norm(extracted?.host),
    description: norm(extracted?.description),
    tags,
    lat: extracted?.verified_lat ?? null,
    lng: extracted?.verified_lng ?? null,
  }
}

function buildGeocodeCandidates(event) {
  const out = []
  const push = (v) => {
    const x = norm(v)
    if (x && !out.includes(x)) out.push(x)
  }
  if (event.address && event.city) push(`${event.address}, ${event.city}`)
  push(event.address)
  if (event.location && event.city) push(`${event.location}, ${event.city}`)
  return out
}

async function censusLookup(query) {
  const params = new URLSearchParams({
    address: query,
    benchmark: 'Public_AR_Current',
    format: 'json',
  })
  const res = await fetch(
    `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`,
  )
  if (!res.ok) return null
  const json = await res.json()
  const match = json?.result?.addressMatches?.[0]
  if (!match?.coordinates) return null
  return {
    lat: Number(match.coordinates.y),
    lng: Number(match.coordinates.x),
    address: norm(match.matchedAddress),
  }
}

async function geocodeEvent(event) {
  if (Number.isFinite(Number(event.lat)) && Number.isFinite(Number(event.lng))) {
    return { lat: Number(event.lat), lng: Number(event.lng), address: event.address }
  }
  for (const query of buildGeocodeCandidates(event)) {
    const hit = await censusLookup(query).catch(() => null)
    if (hit?.lat && hit?.lng) return hit
  }
  return null
}

async function uploadPhoto(eventId, filePath) {
  const buffer = fs.readFileSync(filePath)
  const mediaType = mediaTypeForFile(filePath)
  const ext = mediaType.includes('png') ? 'png' : 'jpg'
  const key = `events/${eventId}/${Date.now()}.${ext}`
  const r2 = r2Client()
  const bucket = process.env.R2_BUCKET_NAME
  const publicBase = String(process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '')
  if (r2 && bucket && publicBase) {
    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mediaType,
      }),
    )
    return `${publicBase}/${key}`
  }
  const { error } = await supabase.storage.from('event-photos').upload(key, buffer, {
    contentType: mediaType,
    upsert: false,
  })
  if (error) throw error
  const { data } = supabase.storage.from('event-photos').getPublicUrl(key)
  return data.publicUrl
}

async function duplicateExists(event) {
  if (!event.date) return null
  const { data, error } = await supabase
    .from('events')
    .select('id,title,date,city,address,location')
    .eq('date', event.date)
    .limit(500)
  if (error) throw error
  const t = norm(event.title).toLowerCase()
  for (const row of data || []) {
    if (sameAddressOrVenue(event, row)) return row
    if (norm(row.title).toLowerCase() === t) {
      const sameCity = norm(row.city).toLowerCase() === norm(event.city).toLowerCase()
      const sameAddr =
        norm(event.address) && norm(row.address).toLowerCase() === norm(event.address).toLowerCase()
      if (sameCity || sameAddr) return row
    }
  }
  return null
}

async function createEvent(userId, eventId, event, geocode, photoUrl) {
  const row = {
    id: eventId,
    user_id: userId,
    title: event.title,
    type: event.type,
    date: event.date,
    time: event.time,
    location: event.location,
    city: event.city,
    address: geocode?.address || event.address,
    lat: geocode?.lat ?? null,
    lng: geocode?.lng ?? null,
    description: event.description,
    tags: event.tags,
    host: event.host,
    photo_url: photoUrl,
    featured: false,
  }
  const { data, error } = await supabase
    .from('events')
    .insert([row])
    .select('id,title,date,city')
    .single()
  if (error) throw error
  await supabase
    .from('event_statuses')
    .upsert([{ event_id: data.id, status: 'active', updated_at: new Date().toISOString() }], {
      onConflict: 'event_id',
    })
  return data
}

function listFlyerFiles(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .map((f) => path.join(dir, f))
    .filter((p) => {
      try {
        return fs.statSync(p).size > 1000
      } catch {
        return false
      }
    })
    .filter((p) => !/-raw\.(png|jpe?g|webp)$/i.test(p))
    .sort()
}

const today = new Date().toISOString().slice(0, 10)
const files = listFlyerFiles(folder)
console.log(`Folder: ${folder}`)
console.log(`Files: ${files.length}${dryRun ? ' (dry-run)' : ''}`)

const results = []
for (const filePath of files) {
  const name = path.basename(filePath)
  try {
    console.log(`\n→ ${name}`)
    const extracted = await extractFromFile(filePath)
    const event = normalizeEvent(extracted)
    if (!event.title) throw new Error('missing title')
    if (!event.date || event.date <= today) throw new Error(`missing or past date (${event.date})`)
    if (!event.city) throw new Error('missing city')

    const dup = await duplicateExists(event)
    if (dup) {
      console.log(`  skip duplicate: ${dup.id} (${dup.title})`)
      results.push({ file: name, status: 'duplicate', eventId: dup.id })
      continue
    }

    const geocode = await geocodeEvent(event)
    if (!geocode?.lat || !geocode?.lng) throw new Error('geocode failed')

    const dupAfterGeocode = await duplicateExists({
      ...event,
      address: geocode.address || event.address,
    })
    if (dupAfterGeocode) {
      console.log(`  skip duplicate: ${dupAfterGeocode.id} (${dupAfterGeocode.title})`)
      results.push({ file: name, status: 'duplicate', eventId: dupAfterGeocode.id })
      continue
    }

    if (dryRun) {
      console.log(`  ok (dry-run): ${event.title} | ${event.date} | ${event.city}`)
      results.push({ file: name, status: 'dry_run', title: event.title, date: event.date })
      continue
    }

    const eventId = crypto.randomUUID()
    const photoUrl = await uploadPhoto(eventId, filePath)
    const created = await createEvent(FLYER_AGENT_USER_ID, eventId, event, geocode, photoUrl)
    console.log(`  posted: ${created.id} — ${created.title} (${created.date})`)
    results.push({ file: name, status: 'posted', eventId: created.id, title: created.title })
  } catch (err) {
    console.log(`  failed: ${err.message}`)
    results.push({ file: name, status: 'failed', error: err.message })
  }
}

const posted = results.filter((r) => r.status === 'posted').length
const skipped = results.filter((r) => r.status === 'duplicate').length
const failed = results.filter((r) => r.status === 'failed').length
console.log(`\nDone: ${posted} posted, ${skipped} duplicates, ${failed} failed`)
