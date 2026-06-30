import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

const DEFAULT_DAILY_LIMIT = 10
const MAX_DAILY_LIMIT = 25
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MIN_AUTO_POST_CONFIDENCE = 88
const ALLOWED_TYPES = new Set(['meet', 'car show', 'track day', 'cruise'])

const PRIVATE_LOCATION_RE =
  /\b(dm|dms|message|text|ask|close friends|cfs|addy|address will not|secret location|tba|tbd)\b/i
const CAR_EVENT_RE =
  /\b(car|cars|truck|trucks|bike|bikes|auto|automotive|meet|show|cruise|cars\s*&\s*coffee|coffee\s*&\s*cars|motorfest|track|race|racing|stance|jdm|exotic|classic)\b/i
const US_STATE_ABBR =
  /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i
const STREET_ADDRESS_RE =
  /\b\d{2,6}\s+[A-Za-z0-9 .'-]+(?:street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|lane|ln|court|ct|way|highway|hwy|route|rt|pike|parkway|pkwy|place|pl|circle|cir)\b/i
const DATE_SIGNAL_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|today|tomorrow|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|\d{1,2}[/-]\d{1,2}|\d{1,2}(?:st|nd|rd|th))\b/i
const TIME_SIGNAL_RE = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i
const FLYER_SIGNAL_RE =
  /\b(flyer|presents|hosted by|all builds|vendors?|food trucks?|music|trophies|admission|roll[-\s]?in|show cars?|respect the lot|no burnouts?|no revving|car meet|car show|cars\s*&\s*coffee|cars and coffee|cruise night|pop[-\s]?up|benefit)\b/i
const LOW_SIGNAL_RE = /\b(ad|sponsored|learn more|for sale|giveaway|merch|repost)\b/i

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const norm = (value) =>
  String(value ?? '')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

const lowerNorm = (value) => norm(value).toLowerCase()

const safeInt = (value, fallback) => {
  const n = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(n) ? n : fallback
}

const parseJsonMaybe = (value, fallback) => {
  const raw = String(value || '').trim()
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : [])

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nested = firstNonEmpty(...value)
      if (nested) return nested
      continue
    }
    const normalized = norm(value)
    if (normalized) return normalized
  }
  return ''
}

const tagsFrom = (value) => {
  if (Array.isArray(value))
    return value
      .map((v) => norm(v))
      .filter(Boolean)
      .slice(0, 10)
  return String(value || '')
    .split(',')
    .map((v) => norm(v))
    .filter(Boolean)
    .slice(0, 10)
}

const dateKeyLocalToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

const validIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())

const buildAppOrigin = (req) => {
  const explicit = process.env.FLYER_IMPORT_APP_ORIGIN || process.env.VITE_APP_ORIGIN
  if (explicit) return String(explicit).replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  const host = req.headers.host
  return host ? `https://${host}` : ''
}

const getAdminClient = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const unauthorized = (req) => {
  const expected = process.env.CRON_SECRET
  if (!expected) return true
  const auth = String(req.headers.authorization || '')
  if (auth === `Bearer ${expected}`) return false
  const manualSecret = String(req.query?.secret || '').trim()
  return manualSecret !== expected
}

async function resolveFlyerAgentUserId(supabase) {
  const direct = norm(process.env.FLYER_AGENT_USER_ID)
  if (direct) return direct

  const email = norm(process.env.FLYER_AGENT_EMAIL)
  if (!email) throw new Error('Missing FLYER_AGENT_USER_ID or FLYER_AGENT_EMAIL')

  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  const user = (data?.users || []).find((u) => lowerNorm(u.email) === lowerNorm(email))
  if (!user?.id) throw new Error(`Flyer agent user not found for ${email}`)
  return user.id
}

async function createRun(supabase, dryRun) {
  const { data, error } = await supabase
    .from('flyer_import_runs')
    .insert([{ dry_run: dryRun, status: 'running' }])
    .select('*')
    .single()
  if (error) throw error
  return data
}

async function finishRun(supabase, runId, updates) {
  if (!runId) return null
  const { data, error } = await supabase
    .from('flyer_import_runs')
    .update({ ...updates, finished_at: new Date().toISOString() })
    .eq('id', runId)
    .select('*')
    .single()
  if (error) throw error
  return data
}

async function insertCandidateLog(supabase, runId, candidate) {
  const payload = {
    run_id: runId,
    source_url: candidate.sourceUrl,
    source_account: candidate.sourceAccount || null,
    source_provider: candidate.sourceProvider || null,
    source_posted_at: candidate.sourcePostedAt || null,
    image_url: candidate.imageUrl || null,
    status: 'pending',
  }
  const { data, error } = await supabase
    .from('flyer_import_candidates')
    .insert([payload])
    .select('*')
    .single()
  if (error) throw error
  return data
}

async function updateCandidateLog(supabase, candidateId, updates) {
  const { data, error } = await supabase
    .from('flyer_import_candidates')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', candidateId)
    .select('*')
    .single()
  if (error) throw error
  return data
}

function normalizeCandidate(raw, source = {}) {
  const sourceUrl =
    norm(raw.sourceUrl) ||
    norm(raw.source_url) ||
    norm(raw.permalink) ||
    norm(raw.url) ||
    norm(raw.postUrl)
  const imageUrl = firstNonEmpty(
    raw.imageUrl,
    raw.image_url,
    raw.mediaUrl,
    raw.media_url,
    raw.displayUrl,
    raw.thumbnailUrl,
    raw.images,
    raw.childPosts?.map?.((post) => post?.displayUrl || post?.imageUrl || post?.thumbnailUrl),
  )
  if (!sourceUrl || !imageUrl) return null
  const caption = firstNonEmpty(
    raw.caption,
    raw.text,
    raw.description,
    raw.alt,
    raw.firstComment,
    raw.metaData?.caption,
  )
  const sourceAccount = firstNonEmpty(
    raw.sourceAccount,
    raw.account,
    raw.username,
    raw.ownerUsername,
    raw.ownerFullName,
    raw.inputUrl,
    source.name,
  )
  return {
    sourceUrl,
    imageUrl,
    caption,
    sourceAccount,
    sourceProvider: norm(raw.sourceProvider || raw.provider || source.provider || source.name),
    sourcePostedAt: norm(raw.sourcePostedAt || raw.postedAt || raw.timestamp || raw.created_at),
    extracted: raw.extracted && typeof raw.extracted === 'object' ? raw.extracted : null,
  }
}

function scoreCandidateForImport(candidate) {
  const hay = `${candidate.sourceAccount || ''} ${candidate.caption || ''} ${
    candidate.sourceUrl || ''
  }`
  let score = 0
  if (FLYER_SIGNAL_RE.test(hay)) score += 30
  if (STREET_ADDRESS_RE.test(hay)) score += 28
  if (/\b\d{5}(?:-\d{4})?\b/.test(hay)) score += 10
  if (US_STATE_ABBR.test(hay)) score += 8
  if (DATE_SIGNAL_RE.test(hay)) score += 18
  if (TIME_SIGNAL_RE.test(hay)) score += 10
  if (CAR_EVENT_RE.test(hay)) score += 12
  if (candidate.imageUrl) score += 4
  if (/\/explore\/tags\//i.test(candidate.sourceUrl)) score -= 8
  if (LOW_SIGNAL_RE.test(hay)) score -= 6
  if (PRIVATE_LOCATION_RE.test(hay)) score -= 25
  if (!DATE_SIGNAL_RE.test(hay)) score -= 12
  if (!STREET_ADDRESS_RE.test(hay) && !/\b\d{5}(?:-\d{4})?\b/.test(hay)) score -= 12
  return score
}

function sourceConfigsFromEnv() {
  const configs = []
  const inline = parseJsonMaybe(process.env.FLYER_IMPORT_SOURCE_LIST, null)
  if (Array.isArray(inline)) configs.push(...inline)

  const directCandidates = parseJsonMaybe(process.env.FLYER_IMPORT_CANDIDATES_JSON, null)
  if (Array.isArray(directCandidates))
    configs.push({ name: 'inline-candidates', candidates: directCandidates })

  const urlList = String(process.env.FLYER_IMPORT_SOURCE_URLS || '')
    .split(/\r?\n|,/)
    .map((v) => v.trim())
    .filter(Boolean)
  configs.push(...urlList.map((url) => ({ name: url, url })))
  return configs
}

async function readCandidatesFromSource(source) {
  if (Array.isArray(source?.candidates)) {
    return source.candidates.map((c) => normalizeCandidate(c, source)).filter(Boolean)
  }

  const url = norm(source?.url || source?.apiUrl)
  if (!url) return []

  const headers = {
    Accept: 'application/json',
    ...(source.headers && typeof source.headers === 'object' ? source.headers : {}),
  }
  if (process.env.FLYER_IMPORT_PROVIDER_API_KEY && source.authHeader !== false) {
    headers.Authorization = `Bearer ${process.env.FLYER_IMPORT_PROVIDER_API_KEY}`
  }

  const res = await fetch(url, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error(`Source ${source.name || url} failed (${res.status})`)
  const json = await res.json()
  const rows = Array.isArray(json) ? json : json.candidates || json.items || json.posts || []
  return rows.map((c) => normalizeCandidate(c, source)).filter(Boolean)
}

async function loadCandidates() {
  const sources = sourceConfigsFromEnv()
  const candidates = []
  const errors = []
  for (const source of sources) {
    try {
      const rows = await readCandidatesFromSource(source)
      candidates.push(...rows)
    } catch (error) {
      errors.push({ source: source?.name || source?.url || 'unknown', error: error.message })
    }
  }

  const seen = new Set()
  const unique = []
  for (const candidate of candidates) {
    const key = lowerNorm(candidate.sourceUrl)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push({
      ...candidate,
      discoveryScore: scoreCandidateForImport(candidate),
    })
  }
  unique.sort((a, b) => b.discoveryScore - a.discoveryScore)
  return { sources, candidates: unique, errors }
}

async function extractFlyer(req, candidate, appOrigin) {
  if (candidate.extracted) return candidate.extracted
  const endpoint =
    process.env.FLYER_IMPORT_EXTRACT_URL || (appOrigin ? `${appOrigin}/api/extract-flyer` : '')
  if (!endpoint) throw new Error('No extract endpoint available')
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrl: candidate.imageUrl,
      sourceUrl: candidate.sourceUrl,
      contextText: [candidate.sourceAccount, candidate.caption]
        .filter(Boolean)
        .join('\n')
        .slice(0, 1800),
      correlationId: `auto-${Date.now()}`,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Flyer extraction failed (${res.status})`)
  if (!json?.extracted) throw new Error('No extracted event details')
  return json.extracted
}

function normalizeExtractedEvent(extracted) {
  const type = lowerNorm(extracted?.type)
  const normalizedType = ALLOWED_TYPES.has(type) ? type : 'meet'
  const date = norm(extracted?.date)
  const tags = tagsFrom(extracted?.tags)
  return {
    title: norm(extracted?.title),
    type: normalizedType,
    date,
    time: norm(extracted?.time),
    location: norm(extracted?.location),
    address: norm(extracted?.address),
    city: norm(extracted?.city),
    host: norm(extracted?.host),
    description: norm(extracted?.description),
    tags,
  }
}

function buildGeocodeCandidates(event) {
  const candidates = []
  const push = (value) => {
    const v = norm(value)
    if (v && !candidates.includes(v)) candidates.push(v)
  }
  if (event.address && event.city) push(`${event.address}, ${event.city}`)
  push(event.address)
  if (event.location && event.city) push(`${event.location}, ${event.city}`)
  if (event.location && event.address) push(`${event.location}, ${event.address}`)
  return candidates
}

function formatNominatimAddress(hit) {
  const a = hit?.address || {}
  const house = norm(a.house_number)
  const road = norm(a.road || a.pedestrian || a.footway || a.path)
  const city = norm(a.city || a.town || a.village || a.hamlet || a.suburb || a.neighbourhood)
  const state = norm(a.state || a.state_code)
  const zip = norm(a.postcode)
  const line1 = [house, road].filter(Boolean).join(' ')
  return [line1, [city, state].filter(Boolean).join(', '), zip].filter(Boolean).join(', ')
}

async function nominatimLookup(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=us&q=${encodeURIComponent(
    query,
  )}`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'MeetMapAutoImporter/1.0 (+https://findcarmeets.com)',
    },
  })
  if (!res.ok) return null
  const json = await res.json()
  const hit = Array.isArray(json) ? json[0] : null
  if (!hit) return null
  const a = hit.address || {}
  const hasHouse = !!norm(a.house_number)
  const hasRoad = !!norm(a.road || a.pedestrian || a.footway || a.path)
  const precision = hasHouse && hasRoad ? 'address' : hasRoad ? 'street' : 'place'
  return {
    provider: 'nominatim',
    precision,
    lat: Number.parseFloat(hit.lat),
    lng: Number.parseFloat(hit.lon),
    displayName: norm(hit.display_name),
    address: formatNominatimAddress(hit) || norm(hit.display_name),
  }
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
    provider: 'census',
    precision: 'address',
    lat: Number(match.coordinates.y),
    lng: Number(match.coordinates.x),
    displayName: norm(match.matchedAddress),
    address: norm(match.matchedAddress),
  }
}

async function geocodeEvent(event) {
  const candidates = buildGeocodeCandidates(event)
  for (const query of candidates) {
    const census = await censusLookup(query).catch(() => null)
    if (census?.lat && census?.lng) return { ...census, query }
    await sleep(200)
    const nominatim = await nominatimLookup(query).catch(() => null)
    if (nominatim?.lat && nominatim?.lng) return { ...nominatim, query }
    await sleep(900)
  }
  return null
}

function validateExtracted(candidate, extracted, event, geocode) {
  const reasons = []
  const textBlob = `${candidate.caption || ''} ${event.title} ${event.location} ${event.address} ${event.city} ${
    event.description
  }`
  const hasFutureDate = validIsoDate(event.date) && event.date > dateKeyLocalToday()
  const hasPublicAddress =
    !!event.address &&
    /\d/.test(event.address) &&
    (US_STATE_ABBR.test(`${event.address} ${event.city}`) ||
      /\bUnited States|USA\b/i.test(event.address)) &&
    !PRIVATE_LOCATION_RE.test(textBlob)
  const hasVenueOrLocation = !!event.location
  const isCarEvent = CAR_EVENT_RE.test(textBlob)
  const geocodeOk =
    geocode?.precision === 'address' && Number.isFinite(geocode.lat) && Number.isFinite(geocode.lng)
  const typeOk = ALLOWED_TYPES.has(event.type)

  if (!event.title) reasons.push('missing_title')
  if (!hasFutureDate) reasons.push('missing_or_past_date')
  if (!hasPublicAddress) reasons.push('no_public_street_address')
  if (!hasVenueOrLocation) reasons.push('missing_location')
  if (!event.city) reasons.push('missing_city')
  if (!isCarEvent) reasons.push('not_car_event')
  if (!geocodeOk) reasons.push('weak_geocode')
  if (!typeOk) reasons.push('unsupported_type')

  let confidence = 0
  if (event.title) confidence += 10
  if (typeOk && isCarEvent) confidence += 12
  if (hasFutureDate) confidence += 22
  if (hasPublicAddress) confidence += 22
  if (geocodeOk) confidence += 24
  if (hasVenueOrLocation) confidence += 5
  if (candidate.imageUrl) confidence += 5

  return {
    ok: reasons.length === 0 && confidence >= MIN_AUTO_POST_CONFIDENCE,
    confidence: Math.min(100, confidence),
    reasons,
    checks: {
      hasFutureDate,
      hasPublicAddress,
      hasVenueOrLocation,
      isCarEvent,
      geocodeOk,
      typeOk,
      minConfidence: MIN_AUTO_POST_CONFIDENCE,
    },
    geocode,
    extracted,
  }
}

async function duplicateExists(supabase, event, geocode) {
  const { data, error } = await supabase
    .from('events')
    .select('id,title,date,city,address,location,lat,lng,photo_url')
    .eq('date', event.date)
    .limit(1000)
  if (error) throw error
  const targetTitle = lowerNorm(event.title)
  const targetAddress = lowerNorm(event.address)
  for (const row of data || []) {
    if (lowerNorm(row.title) === targetTitle) {
      const sameCity = lowerNorm(row.city) === lowerNorm(event.city)
      const sameAddress = targetAddress && lowerNorm(row.address) === targetAddress
      if (sameCity || sameAddress) return row
    }
    const lat = Number(row.lat)
    const lng = Number(row.lng)
    if (Number.isFinite(lat) && Number.isFinite(lng) && geocode?.lat && geocode?.lng) {
      const close = Math.abs(lat - geocode.lat) < 0.0035 && Math.abs(lng - geocode.lng) < 0.0035
      if (close && lowerNorm(row.title) === targetTitle) return row
    }
  }
  return null
}

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

function extensionFromContentType(contentType) {
  const ct = lowerNorm(contentType)
  if (ct.includes('png')) return 'png'
  if (ct.includes('webp')) return 'webp'
  return 'jpg'
}

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
      'User-Agent': 'MeetMapAutoImporter/1.0 (+https://findcarmeets.com)',
    },
  })
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`)
  const contentType = res.headers.get('content-type') || 'image/jpeg'
  if (!contentType.startsWith('image/'))
    throw new Error(`Image URL did not return an image (${contentType})`)
  const arrayBuffer = await res.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  if (!buffer.length) throw new Error('Image is zero bytes')
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Image is too large')
  return { buffer, contentType }
}

async function uploadEventPhoto(supabase, eventId, candidate) {
  const { buffer, contentType } = await downloadImage(candidate.imageUrl)
  const ext = extensionFromContentType(contentType)
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
        ContentType: contentType,
      }),
    )
    return `${publicBase}/${key}`
  }

  const { error } = await supabase.storage.from('event-photos').upload(key, buffer, {
    contentType,
    upsert: false,
  })
  if (error) throw error
  const { data } = supabase.storage.from('event-photos').getPublicUrl(key)
  return data.publicUrl
}

async function createEventFromCandidate(supabase, userId, eventId, event, geocode, photoUrl) {
  const row = {
    id: eventId,
    user_id: userId,
    title: event.title,
    type: event.type,
    date: event.date,
    time: event.time || null,
    location: event.location,
    city: event.city,
    address: geocode.address || event.address,
    lat: geocode.lat,
    lng: geocode.lng,
    description: event.description,
    tags: event.tags,
    host: event.host,
    photo_url: photoUrl,
    featured: false,
  }
  const { data, error } = await supabase
    .from('events')
    .insert([row])
    .select('id,title,date,city,address,lat,lng,photo_url')
    .single()
  if (error) throw error
  await supabase
    .from('event_statuses')
    .upsert([{ event_id: data.id, status: 'active', updated_at: new Date().toISOString() }], {
      onConflict: 'event_id',
    })
  return data
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (unauthorized(req)) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = getAdminClient()
  if (!supabase) return res.status(500).json({ error: 'Supabase service role is not configured' })

  const dryRun =
    String(req.query?.dryRun ?? req.body?.dryRun ?? process.env.FLYER_IMPORT_DRY_RUN ?? 'true')
      .trim()
      .toLowerCase() !== 'false'
  const dailyLimit = Math.min(
    MAX_DAILY_LIMIT,
    Math.max(
      1,
      safeInt(req.query?.limit ?? process.env.FLYER_IMPORT_DAILY_LIMIT, DEFAULT_DAILY_LIMIT),
    ),
  )
  const appOrigin = buildAppOrigin(req)
  let run = null
  const results = []
  let sourceErrors = []

  try {
    run = await createRun(supabase, dryRun)
    const flyerAgentUserId = dryRun ? null : await resolveFlyerAgentUserId(supabase)
    const loaded = await loadCandidates()
    sourceErrors = loaded.errors
    const candidates = loaded.candidates.slice(0, dailyLimit)

    for (const candidate of candidates) {
      let log = null
      try {
        log = await insertCandidateLog(supabase, run.id, candidate)
        const extracted = await extractFlyer(req, candidate, appOrigin)
        const event = normalizeExtractedEvent(extracted)
        const geocode = await geocodeEvent(event)
        const validation = validateExtracted(candidate, extracted, event, geocode)
        const dup = validation.ok ? await duplicateExists(supabase, event, geocode) : null

        if (dup) {
          validation.ok = false
          validation.reasons.push('duplicate_event')
          validation.duplicate = { id: dup.id, title: dup.title }
        }

        const commonUpdates = {
          confidence: validation.confidence,
          validation,
          extracted,
          title: event.title || null,
          type: event.type || null,
          date: validIsoDate(event.date) ? event.date : null,
          time: event.time || null,
          location: event.location || null,
          city: event.city || null,
          address: geocode?.address || event.address || null,
          host: event.host || null,
          description: event.description || null,
          tags: event.tags,
          lat: geocode?.lat || null,
          lng: geocode?.lng || null,
        }

        if (!validation.ok) {
          const skipReason = validation.reasons.join(',') || 'low_confidence'
          await updateCandidateLog(supabase, log.id, {
            ...commonUpdates,
            status: 'skipped',
            skip_reason: skipReason,
          })
          results.push({ sourceUrl: candidate.sourceUrl, status: 'skipped', reason: skipReason })
          continue
        }

        if (dryRun) {
          await updateCandidateLog(supabase, log.id, {
            ...commonUpdates,
            status: 'dry_run',
            skip_reason: 'dry_run',
          })
          results.push({ sourceUrl: candidate.sourceUrl, status: 'dry_run', title: event.title })
          continue
        }

        const eventId = crypto.randomUUID()
        const photoUrl = await uploadEventPhoto(supabase, eventId, candidate)
        const created = await createEventFromCandidate(
          supabase,
          flyerAgentUserId,
          eventId,
          event,
          geocode,
          photoUrl,
        )
        await updateCandidateLog(supabase, log.id, {
          ...commonUpdates,
          status: 'posted',
          stored_image_url: photoUrl,
          event_id: created.id,
        })
        results.push({ sourceUrl: candidate.sourceUrl, status: 'posted', eventId: created.id })
      } catch (error) {
        if (log?.id) {
          await updateCandidateLog(supabase, log.id, {
            status: 'failed',
            error_message: error.message || 'Candidate failed',
          }).catch(() => null)
        }
        results.push({ sourceUrl: candidate.sourceUrl, status: 'failed', error: error.message })
      }
    }

    const posted = results.filter((r) => r.status === 'posted').length
    const skipped = results.filter((r) => r.status === 'skipped' || r.status === 'dry_run').length
    const failed = results.filter((r) => r.status === 'failed').length
    const finalStatus = failed || sourceErrors.length ? 'completed_with_errors' : 'completed'
    const updatedRun = await finishRun(supabase, run.id, {
      status: finalStatus,
      source_count: loaded.sources.length,
      candidate_count: candidates.length,
      posted_count: posted,
      skipped_count: skipped,
      error_count: failed + sourceErrors.length,
      summary: { results, sourceErrors, dailyLimit },
    })

    return res.status(200).json({
      ok: true,
      dryRun,
      run: updatedRun,
      results,
      sourceErrors,
    })
  } catch (error) {
    if (run?.id) {
      await finishRun(supabase, run.id, {
        status: 'failed',
        error_message: error.message || 'Import failed',
        summary: { results, sourceErrors },
        error_count: results.filter((r) => r.status === 'failed').length + 1,
      }).catch(() => null)
    }
    return res.status(500).json({ ok: false, error: error.message || 'Import failed' })
  }
}
