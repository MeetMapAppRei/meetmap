/**
 * OpenStreetMap Nominatim forward geocoding.
 * Retries help with flaky mobile / WebView connections (avoids one-off "Failed to fetch").
 */
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'

/**
 * @param {string} address
 * @param {{ retries?: number, retryDelayMs?: number }} [options]
 * @returns {Promise<{ lat: number, lng: number } | null>}
 */
export async function geocodeAddress(address, options = {}) {
  const { retries = 3, retryDelayMs = 600 } = options
  if (!address || !String(address).trim()) return null

  const q = encodeURIComponent(String(address).trim())
  const url = `${NOMINATIM}?q=${q}&format=json&limit=1`

  let lastError
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, retryDelayMs * attempt))
      }
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      })
      if (!res.ok) {
        lastError = new Error(`Geocoding failed (${res.status})`)
        continue
      }
      const data = await res.json()
      if (!Array.isArray(data) || data.length === 0) return null
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
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
  const rawMsg = err?.message || (typeof err === 'string' ? err : String(err))
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
