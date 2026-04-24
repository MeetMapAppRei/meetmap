/**
 * One-time backfill for missing event coordinates.
 *
 * Usage:
 *   node scripts/backfill-coords.mjs
 *
 * Env (recommended):
 *   SUPABASE_URL=https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=...   (preferred for backfill)
 *
 * Fallbacks:
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (may fail if RLS blocks updates)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function todayKeyUtc() {
  return new Date().toISOString().slice(0, 10)
}

function loadDotEnvFileBestEffort(envPath) {
  if (!fs.existsSync(envPath)) return
  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue
    const key = trimmed.slice(0, idx).trim()
    let val = trimmed.slice(idx + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] == null) process.env[key] = val
  }
}

function loadDotEnvBestEffort() {
  // Keep it dependency-free (no dotenv). Only loads simple KEY=VALUE lines.
  // Does not override existing process.env.
  const repoRoot = path.resolve(__dirname, '..')
  const candidates = ['.env.backfill', '.env.migrate', '.env.local', '.env']
  for (const name of candidates) {
    loadDotEnvFileBestEffort(path.join(repoRoot, name))
  }
}

function buildGeocodeQuery({ address, location, city }) {
  const a = String(address || '').trim()
  const l = String(location || '').trim()
  const c = String(city || '').trim()

  if (a) return a
  if (l && c) return `${l}, ${c}`.trim()
  if (c) return c
  if (l) return l
  return ''
}

async function nominatimGeocode(query) {
  const q = encodeURIComponent(String(query || '').trim())
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'MeetMap/1.0 (findcarmeets.com)',
    },
  })
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  const data = await res.json().catch(() => null)
  const row = Array.isArray(data) && data.length ? data[0] : null
  if (!row?.lat || !row?.lon) return null
  const lat = Number.parseFloat(row.lat)
  const lng = Number.parseFloat(row.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

async function fetchUpcomingMissingCoords(supabase) {
  const rows = []
  const today = todayKeyUtc()
  const pageSize = 1000
  for (let page = 0; page < 50; page++) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('events')
      .select('id, title, date, address, location, city, lat, lng')
      .gte('date', today)
      .or('lat.is.null,lng.is.null')
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)

    if (error) throw error
    const chunk = data || []
    rows.push(...chunk)
    if (chunk.length < pageSize) break
  }
  return rows
}

async function updateEventCoords(supabase, id, coords) {
  const { error } = await supabase.from('events').update(coords).eq('id', id)
  if (error) throw error
}

async function main() {
  loadDotEnvBestEffort()

  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    'https://wyjbiqgczacqrxwulsts.supabase.co'
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY

  if (!key) {
    console.error(
      'Missing SUPABASE_SERVICE_ROLE_KEY (preferred) or SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY.',
    )
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const events = await fetchUpcomingMissingCoords(supabase)
  console.log(`Found ${events.length} upcoming events missing lat/lng.`)

  let updated = 0
  let failed = 0

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const title = String(ev?.title || '').trim() || `(untitled ${ev?.id || ''})`
    const query = buildGeocodeQuery({
      address: ev?.address,
      location: ev?.location,
      city: ev?.city,
    })

    if (!query) {
      failed++
      console.log(`[${i + 1}/${events.length}] ${title} | query="" | FAIL (no location fields)`)
      continue
    }

    let coords = null
    let ok = false
    let errMsg = ''
    try {
      coords = await nominatimGeocode(query)
      if (coords) {
        await updateEventCoords(supabase, ev.id, coords)
        updated++
        ok = true
      } else {
        failed++
      }
    } catch (e) {
      failed++
      errMsg = e?.message || String(e)
    }

    if (ok) {
      console.log(
        `[${i + 1}/${events.length}] ${title} | query="${query}" | OK (${coords.lat}, ${coords.lng})`,
      )
    } else {
      console.log(
        `[${i + 1}/${events.length}] ${title} | query="${query}" | FAIL${
          errMsg ? ` (${errMsg})` : ''
        }`,
      )
    }

    // Nominatim ToS: 1 request / second.
    if (i < events.length - 1) await sleep(1000)
  }

  console.log(`\nSummary: ${updated} updated, ${failed} failed`)
}

main().catch((e) => {
  console.error('Backfill failed:', e)
  process.exit(1)
})
