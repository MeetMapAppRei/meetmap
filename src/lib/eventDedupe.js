const norm = (value) =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()

const dateKey = (d) => String(d ?? '').slice(0, 10)

const datesEqual = (a, b) => dateKey(a) === dateKey(b)

const COORDS_CLOSE_KM = 0.35

function coordsLikelySamePlace(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return false
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa))
  return R * c < COORDS_CLOSE_KM
}

/** Symmetric: same flyer / venue fingerprint (used for list + insert guard). */
export function eventsLikelyDuplicatePair(a, b) {
  if (!a || !b) return false
  if (!datesEqual(a.date, b.date)) return false
  if (norm(a.title) !== norm(b.title)) return false
  if (norm(a.city) === norm(b.city)) return true

  const cross = [
    [a.address, b.address],
    [a.location, b.location],
    [a.address, b.location],
    [a.location, b.address],
  ]
  for (const [x, y] of cross) {
    const nx = norm(x)
    const ny = norm(y)
    if (nx && ny && nx === ny) return true
  }

  const pa = String(a.photo_url || '').trim()
  const pb = String(b.photo_url || '').trim()
  if (pa && pb && pa === pb) return true

  return coordsLikelySamePlace(a.lat, a.lng, b.lat, b.lng)
}

/**
 * Collapses rows that look like the same real-world event (existing DB duplicates).
 * Preserves list order; keeps the newer row when replacing.
 */
export function dedupeEventsByLikelyDuplicate(events) {
  if (!Array.isArray(events) || events.length < 2) return events
  const kept = []
  for (const e of events) {
    const i = kept.findIndex((k) => eventsLikelyDuplicatePair(k, e))
    if (i === -1) {
      kept.push(e)
      continue
    }
    const cur = kept[i]
    if (String(e.created_at || '') >= String(cur.created_at || '')) {
      kept[i] = e
    }
  }
  return kept
}
