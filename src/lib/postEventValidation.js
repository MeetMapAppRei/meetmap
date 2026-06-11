/** Required fields for posting a meet (client + user-facing labels). */
export const POST_EVENT_REQUIRED_FIELDS = [
  { key: 'title', label: 'Event Name', hint: 'Add an event name' },
  { key: 'date', label: 'Date', hint: 'Pick a date for this meet' },
  { key: 'city', label: 'City, State', hint: 'Add the city and state' },
]

export function getMissingPostEventFields(form) {
  return POST_EVENT_REQUIRED_FIELDS.filter((f) => !String(form?.[f.key] || '').trim())
}

/** User-facing banner copy when required fields are empty. */
export function messageForMissingPostEventFields(missing) {
  if (!missing?.length) return ''
  if (missing.length === 1) {
    return `Please fill in ${missing[0].label} before posting.`
  }
  return `Please fill in these required fields before posting:\n${missing.map((m) => `• ${m.label}`).join('\n')}`
}

/**
 * Map Postgres / PostgREST constraint errors to form fields so users see field guidance
 * instead of raw SQL.
 */
export function inferMissingFieldsFromDbError(err) {
  const blob = `${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`.toLowerCase()
  const code = String(err?.code || '')
  const looksLikeConstraint =
    code === '23502' ||
    code === '23514' ||
    /null value in column|violates not-null constraint|violates check constraint/i.test(blob)
  if (!looksLikeConstraint) return []

  const found = []
  const add = (key, label, hint) => {
    if (!found.some((f) => f.key === key)) found.push({ key, label, hint })
  }

  if (/column "title"|"title" of relation/i.test(blob)) add('title', 'Event Name', 'Add an event name')
  if (/column "date"|"date" of relation/i.test(blob)) add('date', 'Date', 'Pick a date for this meet')
  if (/column "city"|"city" of relation/i.test(blob)) add('city', 'City, State', 'Add the city and state')
  if (/column "location"|"location" of relation/i.test(blob)) {
    add('location', 'Venue / Spot Name', 'Add a venue or spot name')
  }
  if (/column "type"|events_type/i.test(blob)) add('type', 'Event Type', 'Choose an event type')

  return found
}
