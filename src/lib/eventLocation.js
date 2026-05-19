/**
 * Location strings for geocoding and Google Maps links.
 * Street + city are stored separately; always combine when the street line has no comma.
 */

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

/** Google Maps link for "Directions" — prefers pinned coordinates, else full address. */
export function getDirectionsUrl(event) {
  if (!event) return ''
  const lat = parseFloat(event.lat)
  const lng = parseFloat(event.lng)
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
  }
  const query = buildEventLocationQuery(event)
  if (!query) return ''
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
