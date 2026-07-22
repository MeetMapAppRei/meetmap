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
      'User-Agent': 'MeetMap/1.0 (+https://www.findcarmeets.com)',
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

  // #region agent log
  const dbg = (message, hypothesisId, data) => {
    const payload = {
      sessionId: '34c561',
      runId: 'pre-fix',
      hypothesisId,
      location: 'geocode.js:geocodeAddress',
      message,
      data: { ...data, hasMapboxToken: Boolean(MAPBOX_TOKEN) },
      timestamp: Date.now(),
    }
    fetch('http://127.0.0.1:7310/ingest/922490f1-8ac5-411c-9457-0cd61c4e0489', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '34c561' },
      body: JSON.stringify(payload),
    }).catch(() => {})
    try {
      const origins = [
        typeof window !== 'undefined' && window?.Capacitor ? 'https://www.findcarmeets.com' : '',
        typeof window !== 'undefined' ? window.location?.origin : '',
        'https://meetmap-gilt.vercel.app',
      ].filter(Boolean)
      const body = JSON.stringify({
        event: 'debug_geocode',
        stage: 'geocodeAddress',
        hypothesisId,
        message,
        details: JSON.stringify(payload.data).slice(0, 800),
        platform:
          typeof window !== 'undefined' && window?.Capacitor?.getPlatform
            ? window.Capacitor.getPlatform()
            : 'web',
      })
      origins.slice(0, 2).forEach((origin) => {
        fetch(`${origin}/api/client-log`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
          cache: 'no-store',
          credentials: 'omit',
        }).catch(() => {})
      })
    } catch {
      /* ignore */
    }
  }
  dbg('geocode_start', 'B', {
    raw: raw.slice(0, 120),
    query: query.slice(0, 160),
    country,
    cityHint: String(cityHint || '').slice(0, 80),
  })
  // #endregion

  let lastError
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, retryDelayMs * attempt))
      }
      let mapboxStatus = null
      let mapboxPlace = null
      let mapbox = null
      try {
        if (!MAPBOX_TOKEN) {
          mapboxStatus = 'no_token'
        } else {
          const countryParam = country ? `&country=${encodeURIComponent(country)}` : ''
          const mbUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${encodeURIComponent(MAPBOX_TOKEN)}&limit=1${countryParam}`
          const mbRes = await fetch(mbUrl, { headers: { Accept: 'application/json' } })
          mapboxStatus = mbRes.status
          const mb = mbRes.ok ? await mbRes.json().catch(() => null) : null
          mapboxPlace = mb?.features?.[0]?.place_name || null
          const center = mb?.features?.[0]?.center
          if (Array.isArray(center) && center.length >= 2) {
            const coords = { lng: Number(center[0]), lat: Number(center[1]) }
            mapbox = coordsPlausibleForCountry(coords, country) ? coords : null
            if (!mapbox) mapboxStatus = `${mbRes.status}_implausible`
          }
        }
      } catch (e) {
        mapboxStatus = `throw:${String(e?.message || e).slice(0, 80)}`
      }
      // #region agent log
      dbg('geocode_mapbox', 'B', {
        attempt,
        mapboxStatus,
        mapboxPlace: mapboxPlace ? String(mapboxPlace).slice(0, 120) : null,
        mapboxHit: Boolean(mapbox),
      })
      // #endregion
      if (mapbox) return mapbox
      const nominatim = await tryNominatim(query, country)
      // #region agent log
      dbg('geocode_nominatim', 'C', {
        attempt,
        nominatimHit: Boolean(nominatim),
        nominatimLat: nominatim?.lat ?? null,
      })
      // #endregion
      if (nominatim) return nominatim
      // #region agent log
      dbg('geocode_miss', 'B', { attempt, query: query.slice(0, 160) })
      // #endregion
      return null
    } catch (e) {
      lastError = e
      // #region agent log
      dbg('geocode_throw', 'B', {
        attempt,
        err: String(e?.message || e).slice(0, 120),
      })
      // #endregion
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
