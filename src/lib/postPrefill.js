/**
 * One-shot session restore after a successful post so multi-date flyers can be listed quickly.
 * Photo is not persisted (File cannot be serialized); user re-uploads flyer if needed.
 */
const STORAGE_KEY = 'meetmap_post_prefill_v1'

/** Next date in sorted flyer list after `current` (wraps). */
export function pickNextFlyerDate(current, list) {
  const u = [...new Set((list || []).filter(Boolean))].sort()
  if (u.length < 2) return current || ''
  const idx = u.indexOf(current)
  if (idx < 0) return u[0]
  return u[(idx + 1) % u.length]
}

/**
 * @param {{ form: Record<string, string>, flyerDates: string[], coords: { lat: number, lng: number } | null }} snap
 */
export function savePostPrefill({ form, flyerDates, coords }) {
  const nextDate =
    flyerDates.length > 1 ? pickNextFlyerDate(form.date, flyerDates) : form.date || ''
  const payload = {
    v: 1,
    form: {
      title: form.title || '',
      type: form.type || 'meet',
      date: nextDate,
      time: form.time || '',
      location: form.location || '',
      city: form.city || '',
      address: form.address || '',
      description: form.description || '',
      tags: form.tags || '',
      host: form.host || '',
    },
    flyerDates: Array.isArray(flyerDates) ? [...flyerDates] : [],
    coords:
      coords && coords.lat != null && coords.lng != null
        ? { lat: Number(coords.lat), lng: Number(coords.lng) }
        : null,
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // quota / private mode
  }
}

export function loadAndConsumePostPrefill() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    sessionStorage.removeItem(STORAGE_KEY)
    const data = JSON.parse(raw)
    if (!data || data.v !== 1 || !data.form) return null
    return data
  } catch {
    return null
  }
}

export function clearPostPrefill() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {}
}
