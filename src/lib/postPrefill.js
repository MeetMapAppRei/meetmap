/**
 * One-shot restore after a successful post **only for multi-date flyers** (2+ dates) so the next
 * date can be listed quickly. Single-date posts do not persist (avoids restoring unrelated events).
 * Persists in localStorage (survives tab close) with a TTL; falls back to sessionStorage if needed.
 * Photo is not persisted (File cannot be serialized); user re-uploads flyer if needed.
 */
const STORAGE_KEY = 'meetmap_post_prefill_v1'
/** Drop stale snapshots so old meets don't reappear weeks later. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function storageGet(key) {
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key, val) {
  try {
    localStorage.setItem(key, val)
    return
  } catch {
    try {
      sessionStorage.setItem(key, val)
    } catch {
      // quota / private mode
    }
  }
}

function storageRemove(key) {
  try {
    localStorage.removeItem(key)
  } catch {}
  try {
    sessionStorage.removeItem(key)
  } catch {}
}

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
  const dates = Array.isArray(flyerDates) ? flyerDates : []
  if (dates.length < 2) {
    // Drop legacy snapshots from older clients that saved every post, and skip single-date posts.
    clearPostPrefill()
    return
  }

  const nextDate = pickNextFlyerDate(form.date, dates)
  const payload = {
    v: 2,
    savedAt: Date.now(),
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
    flyerDates: [...dates],
    coords:
      coords && coords.lat != null && coords.lng != null
        ? { lat: Number(coords.lat), lng: Number(coords.lng) }
        : null,
  }
  storageSet(STORAGE_KEY, JSON.stringify(payload))
}

export function loadAndConsumePostPrefill() {
  try {
    const raw = storageGet(STORAGE_KEY)
    if (!raw) return null
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      storageRemove(STORAGE_KEY)
      return null
    }
    if (!data?.form) {
      storageRemove(STORAGE_KEY)
      return null
    }
    const loadedDates = Array.isArray(data.flyerDates) ? data.flyerDates : []
    if (loadedDates.length < 2) {
      storageRemove(STORAGE_KEY)
      return null
    }
    if (data.v === 2 && typeof data.savedAt === 'number') {
      if (Date.now() - data.savedAt > MAX_AGE_MS) {
        storageRemove(STORAGE_KEY)
        return null
      }
    }
    storageRemove(STORAGE_KEY)
    return {
      form: data.form,
      flyerDates: loadedDates,
      coords: data.coords || null,
    }
  } catch {
    return null
  }
}

export function clearPostPrefill() {
  storageRemove(STORAGE_KEY)
}
