// Converts stored `event.time` (usually "HH:MM" 24-hour) into "h:mm AM/PM".
export const formatEventTime = (timeStr) => {
  const s = typeof timeStr === 'string' ? timeStr.trim() : ''
  if (!s) return ''

  // If already looks like "7:00 PM" (or similar), don't reformat.
  if (/[a-zA-Z]/.test(s) && /am|pm/i.test(s)) {
    return s.toUpperCase().replace(/\s+/g, ' ')
  }

  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return s

  const rawH = Number(m[1])
  const mm = m[2]
  if (!Number.isFinite(rawH)) return s

  const isPM = rawH >= 12
  const h12 = ((rawH + 11) % 12) + 1
  const period = isPM ? 'PM' : 'AM'

  return `${h12}:${mm} ${period}`
}

