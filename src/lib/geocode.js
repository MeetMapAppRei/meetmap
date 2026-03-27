/**
 * Forward geocoding.
 * - Primary: OpenStreetMap Nominatim (free, but occasionally misses/ratelimits)
 * - Fallback: Mapbox Geocoding API (matches what the map uses; usually closer to Google results)
 *
 * Retries help with flaky mobile / WebView connections (avoids one-off "Failed to fetch").
 */
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const MAPBOX_TOKEN = String(import.meta.env.VITE_MAPBOX_TOKEN || '').trim()

/**
 * @param {string} address
 * @param {{ retries?: number, retryDelayMs?: number }} [options]
 * @returns {Promise<{ lat: number, lng: number } | null>}
 */
export async function geocodeAddress(address, options = {}) {
  const { retries = 3, retryDelayMs = 600 } = options
  if (!address || !String(address).trim()) return null

  const query = String(address).trim()
  const q = encodeURIComponent(query)
  const url = `${NOMINATIM}?q=${q}&format=json&limit=1&addressdetails=1`

  let lastError
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, retryDelayMs * attempt))
      }
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          // Nominatim requires a valid User-Agent identifying the app (usage policy).
          'User-Agent': 'MeetMap/1.0 (+https://findcarmeets.com)',
        },
      })
      if (!res.ok) {
        lastError = new Error(`Geocoding failed (${res.status})`)
        continue
      }
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
      }
      // Nominatim returned no results — try Mapbox as a higher-recall fallback.
      if (MAPBOX_TOKEN) {
        const mbUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${encodeURIComponent(MAPBOX_TOKEN)}&limit=1&country=us`
        const mbRes = await fetch(mbUrl, { headers: { Accept: 'application/json' } })
        if (mbRes.ok) {
          const mb = await mbRes.json().catch(() => null)
          const coords = mb?.features?.[0]?.center
          if (Array.isArray(coords) && coords.length >= 2) {
            return { lng: Number(coords[0]), lat: Number(coords[1]) }
          }
        }
      }
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
