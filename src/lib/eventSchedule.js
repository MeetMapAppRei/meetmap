export const toDateKeyLocal = (d) => {
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export const dateKeyLocalToday = () => toDateKeyLocal(new Date())

export const eventStartMs = (event) => {
  if (!event?.date) return null
  const timePart = event.time && /^\d{2}:\d{2}/.test(event.time) ? event.time : '00:00'
  const dt = new Date(`${event.date}T${timePart}`)
  const ms = dt.getTime()
  return Number.isFinite(ms) ? ms : null
}

/** True when the event has not started yet (local device time). */
export const isEventUpcoming = (event) => {
  if (!event?.date) return false
  const startMs = eventStartMs(event)
  if (startMs != null) return startMs > Date.now()
  return String(event.date) >= dateKeyLocalToday()
}
