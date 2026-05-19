/**
 * Forward geocoding for map pins.
 * - Prefer Mapbox (same provider as the map)
 * - Fallback: Nominatim
 * - US addresses bias country=us; Philippines uses country=ph; otherwise worldwide
 */
import {
  buildEventLocationQuery,
  enrichDirectionsQuery,
  inferGeocodeCountry,
} from './eventLocation'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const MAPBOX_TOKEN = String(import.meta.env.VITE_MAPBOX_TOKEN || '').trim()

/** Rough bounds to reject obvious wrong-country hits (e.g. White Plains, MD for Quezon City). */
export function coordsPlausibleForCountry({ lat, lng }, country) {
  if (!country || !Number.isFinite(lat) || !Number.isFinite(lng)) return true
  if (country === 'us') return lat >= 18 && lat <= 72 && lng >= -180 && lng <= -65
  if (country === 'ph') return lat >= 4 && lat <= 22 && lng >= 115 && lng <= 128
  return true
}

/** True when stored pin matches address country context (or country is unknown). */
export function areEventCoordsPlausible(event) {
  const lat = parseFloat(event?.lat)
  const lng = parseFloat(event?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true
  const country = inferGeocodeCountry(buildEventLocationQuery(event), event?.city)
  return coordsPlausibleForCountry({ lat, lng }, country)
}

async function tryMapbox(query, country) {
  if (!MAPBOX_TOKEN) return null
  const countryParam = country ? `&country=${encodeURIComponent(country)}` : ''
  const mbUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${encodeURIComponent(MAPBOX_TOKEN)}&limit=1${countryParam}`
  const mbRes = await fetch(mbUrl, { headers: { Accept: 'application/json' } })
  if (!mbRes.ok) return null
  const mb = await mbRes.json().catch(() => null)
  const center = mb?.features?.[0]?.center
  if (!Array.isArray(center) || center.length < 2) return null
  const coords = { lng: Number(center[0]), lat: Number(center[1]) }
  return coordsPlausibleForCountry(coords, country) ? coords : null
}

async function tryNominatim(query, country) {
  const countryParam = country ? `&countrycodes=${encodeURIComponent(country)}` : ''
  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1${countryParam}`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'MeetMap/1.0 (+https://findcarmeets.com)',
    },
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) return null
  const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  return coordsPlausibleForCountry(coords, country) ? coords : null
}

/**
 * @param {string} address
 * @param {{ retries?: number, retryDelayMs?: number, cityHint?: string }} [options]
 * @returns {Promise<{ lat: number, lng: number } | null>}
 */
export async function geocodeAddress(address, options = {}) {
  const { retries = 3, retryDelayMs = 600, cityHint = '' } = options
  const raw = String(address || '').trim()
  if (!raw) return null

  const query = enrichDirectionsQuery(raw, cityHint)
  const country = inferGeocodeCountry(raw, cityHint)

  let lastError
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, retryDelayMs * attempt))
      }
      const mapbox = await tryMapbox(query, country)
      if (mapbox) return mapbox
      const nominatim = await tryNominatim(query, country)
      if (nominatim) return nominatim
      return null
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

/** User-facing message when fetch / network fails */
export function humanizeFetchError(err) {
  const type = String(err?.type || '')
  const name = String(err?.name || '')
  const rawMsg =
    err?.message ||
    err?.error_description ||
    err?.cause?.message ||
    (typeof err === 'string' ? err : String(err))
  const msg = String(rawMsg || '').trim()
  if (/\[object ProgressEvent\]/i.test(msg) || /progress/i.test(type) || /progress/i.test(name)) {
    return 'Connection problem. Check your signal and try again.'
  }
  if (/aborterror|timeout/i.test(name) || /abort|timeout/i.test(msg)) {
    return 'Connection timed out. Please try again.'
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return 'Connection problem. Check your signal and try again.'
  }
  return msg || 'Something went wrong. Please try again.'
}
