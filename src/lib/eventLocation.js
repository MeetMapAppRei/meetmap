/**
 * Location strings for geocoding and Google Maps links.
 * Street + city are stored separately; always combine when the street line has no comma.
 */

const US_STATE_ABBR =
  /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i

export function buildGeocodeQuery(address, city) {
  const a = String(address || '').trim()
  const c = String(city || '').trim()
  if (!a) return ''
  if (!c) return a
  if (a.includes(',')) return a
  return `${a}, ${c}`
}

/** Best single-line query from an event row (address, venue, or city). */
export function buildEventLocationQuery(event) {
  const a = String(event?.address || '').trim()
  const l = String(event?.location || '').trim()
  const c = String(event?.city || '').trim()
  if (a) return buildGeocodeQuery(a, c)
  if (l && c) return `${l}, ${c}`
  if (c) return c
  if (l) return l
  return ''
}

/** Street-only queries (no comma) are ambiguous worldwide — e.g. "37 E Market St" → UK. */
export function isAmbiguousDirectionsQuery(query) {
  const q = String(query || '').trim()
  if (!q) return true
  return !q.includes(',')
}

/** Append USA when we can tell this is a US address (helps Google disambiguate). */
export function enrichDirectionsQuery(query, city = '') {
  const q = String(query || '').trim()
  if (!q) return ''
  if (/\b(USA|United States|U\.S\.A\.)\b/i.test(q)) return q
  const ctx = `${q} ${city || ''}`
  if (US_STATE_ABBR.test(ctx)) return `${q}, USA`
  return q
}

function googleMapsSearchUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&region=us`
}

/**
 * Google Maps link for "Directions".
 * - Full "street, city, ST" text → send that (Google resolves well; Boston case).
 * - Street-only text but pin exists → use lat/lng (West Chester case when city missing in row).
 * - Always bias to US region for this app.
 */
export function getDirectionsUrl(event) {
  if (!event) return ''
  const query = enrichDirectionsQuery(buildEventLocationQuery(event), event?.city)
  const lat = parseFloat(event.lat)
  const lng = parseFloat(event.lng)
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)

  if (query && !isAmbiguousDirectionsQuery(query)) {
    return googleMapsSearchUrl(query)
  }
  if (hasCoords) {
    return googleMapsSearchUrl(`${lat},${lng}`)
  }
  if (query) {
    return googleMapsSearchUrl(query)
  }
  return ''
}
