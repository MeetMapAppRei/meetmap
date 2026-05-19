/**
 * Location strings for geocoding and Google Maps links.
 * Street + city are stored separately; always combine when the street line has no comma.
 */

const US_STATE_ABBR =
  /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i

/** ISO 3166-1 alpha-2 hints for Mapbox / Nominatim country filters. */
const PH_MARKERS =
  /\b(philippines|pilipinas|quezon city|metro manila|makati|manila|cebu|davao|taguig|pasig|caloocan|pasay|paranaque|parañaque|muntinlupa|las piñas|las pinas|marikina|valenzuela|malabon|navotas|mandaluyong|antipolo|katipunan)\b/i

/**
 * @param {string} query
 * @param {string} [city]
 * @returns {'us' | 'ph' | null}
 */
export function inferGeocodeCountry(query, city = '') {
  const ctx = `${String(query || '')} ${String(city || '')}`.trim()
  if (!ctx) return null
  if (/\b(USA|United States|U\.S\.A\.)\b/i.test(ctx)) return 'us'
  if (US_STATE_ABBR.test(ctx)) return 'us'
  if (/\b(philippines|pilipinas)\b/i.test(ctx) || PH_MARKERS.test(ctx)) return 'ph'
  return null
}

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

/** Append country when missing (helps Google / geocoders disambiguate). */
export function enrichDirectionsQuery(query, city = '') {
  const q = String(query || '').trim()
  if (!q) return ''
  if (/\b(USA|United States|U\.S\.A\.)\b/i.test(q)) return q
  if (/\b(philippines|pilipinas)\b/i.test(q)) return q
  const country = inferGeocodeCountry(q, city)
  if (country === 'us') return `${q}, USA`
  if (country === 'ph') return `${q}, Philippines`
  return q
}

function googleMapsSearchUrl(query, region) {
  const base = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
  return region ? `${base}&region=${region}` : base
}

/**
 * Google Maps link for "Directions".
 * - Full "street, city, ST" text → send that (Google resolves well; Boston case).
 * - Street-only text but pin exists → use lat/lng (West Chester case when city missing in row).
 * - Bias Google region to US or PH when the address context suggests it.
 */
export function getDirectionsUrl(event) {
  if (!event) return ''
  const rawQuery = buildEventLocationQuery(event)
  const query = enrichDirectionsQuery(rawQuery, event?.city)
  const region = inferGeocodeCountry(rawQuery, event?.city) || undefined
  const lat = parseFloat(event.lat)
  const lng = parseFloat(event.lng)
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)

  if (query && !isAmbiguousDirectionsQuery(query)) {
    return googleMapsSearchUrl(query, region)
  }
  if (hasCoords) {
    return googleMapsSearchUrl(`${lat},${lng}`, region)
  }
  if (query) {
    return googleMapsSearchUrl(query, region)
  }
  return ''
}
