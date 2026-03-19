import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://wyjbiqgczacqrxwulsts.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5amJpcWdjelFjcXJ4d3Vsc3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMTEyMjIsImV4cCI6MjA4ODk4NzIyMn0.I6Rk6Ea7GsJyGab0YBH68fDR0A3XPT14VSYz13073Nc'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ═══ AUTH ═══════════════════════════════════════════════════

export const signUp = (email, password, username) =>
  supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  })

export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password })

export const signOut = () => supabase.auth.signOut()

export const getUser = () => supabase.auth.getUser()

const normalizeStatus = (value) => {
  const v = String(value || '').toLowerCase()
  return ['active', 'moved', 'delayed', 'canceled'].includes(v) ? v : 'active'
}

const fetchEventStatusMap = async (eventIds) => {
  if (!Array.isArray(eventIds) || eventIds.length === 0) return {}
  const { data, error } = await supabase
    .from('event_statuses')
    .select('event_id, status, status_note')
    .in('event_id', eventIds)
  if (error) throw error
  const map = {}
  for (const row of data || []) {
    map[row.event_id] = {
      status: normalizeStatus(row.status),
      status_note: row.status_note || '',
    }
  }
  return map
}

const upsertEventStatus = async (eventId, status = 'active', statusNote = '') => {
  if (!eventId) return
  const { error } = await supabase
    .from('event_statuses')
    .upsert([{
      event_id: eventId,
      status: normalizeStatus(status),
      status_note: statusNote || null,
      updated_at: new Date().toISOString(),
    }], { onConflict: 'event_id' })
  if (error) throw error
}

export const fetchEventStatuses = async (eventIds) => {
  if (!Array.isArray(eventIds) || eventIds.length === 0) return {}
  const { data, error } = await supabase
    .from('event_statuses')
    .select('event_id, status, status_note, updated_at')
    .in('event_id', eventIds)
  if (error) throw error
  const map = {}
  for (const row of data || []) {
    map[row.event_id] = {
      status: normalizeStatus(row.status),
      status_note: row.status_note || '',
      updated_at: row.updated_at || '',
    }
  }
  return map
}

// ═══ EVENTS ══════════════════════════════════════════════════

export const fetchEvents = async (filters = {}) => {
  let query = supabase
    .from('events')
    // Explicitly include `address` so the UI can always display the full street address.
    .select('id, user_id, title, type, date, time, location, city, address, lat, lng, description, tags, host, photo_url, featured, created_at, event_attendees(count)')
    .order('date', { ascending: true })

  if (filters.type && filters.type !== 'all') {
    query = query.eq('type', filters.type)
  }

  if (filters.search) {
    query = query.or(
      `title.ilike.%${filters.search}%,city.ilike.%${filters.search}%,tags.cs.{${filters.search}}`
    )
  }

  // Hide past events by default unless showPast is true
  if (!filters.showPast) {
    const today = new Date().toISOString().split('T')[0]
    query = query.gte('date', today)
  }

  const { data, error } = await query
  if (error) throw error
  const rows = data || []
  try {
    const statusMap = await fetchEventStatusMap(rows.map(e => e.id))
    return rows.map(e => ({
      ...e,
      status: statusMap[e.id]?.status || 'active',
      status_note: statusMap[e.id]?.status_note || '',
    }))
  } catch {
    return rows.map(e => ({ ...e, status: 'active', status_note: '' }))
  }
}

export const createEvent = async (eventData, userId) => {
  const { data, error } = await supabase
    .from('events')
    .insert([{ ...eventData, user_id: userId }])
    .select('id, user_id, title, type, date, time, location, city, address, lat, lng, description, tags, host, photo_url, featured, created_at, event_attendees(count)')
    .single()
  if (error) throw error
  const status = normalizeStatus(eventData?.status)
  const statusNote = eventData?.status_note || ''
  try {
    await upsertEventStatus(data.id, status, statusNote)
  } catch {}
  return { ...data, status, status_note: statusNote }
}

export const updateEvent = async (eventId, updates) => {
  const { status, status_note, ...eventUpdates } = updates || {}
  const { data, error } = await supabase
    .from('events')
    .update(eventUpdates)
    .eq('id', eventId)
    .select('id, user_id, title, type, date, time, location, city, address, lat, lng, description, tags, host, photo_url, featured, created_at, event_attendees(count)')
    .single()
  if (error) throw error
  let finalStatus = normalizeStatus(status)
  let finalStatusNote = status_note || ''
  if (status !== undefined || status_note !== undefined) {
    try {
      await upsertEventStatus(eventId, finalStatus, finalStatusNote)
    } catch {}
  } else {
    try {
      const statusMap = await fetchEventStatusMap([eventId])
      finalStatus = statusMap[eventId]?.status || 'active'
      finalStatusNote = statusMap[eventId]?.status_note || ''
    } catch {
      finalStatus = 'active'
      finalStatusNote = ''
    }
  }
  return { ...data, status: finalStatus, status_note: finalStatusNote }
}

// ═══ FLYER IMPORTS (approval queue) ═══════════════════════
export const fetchFlyerImports = async (userId, status = 'pending') => {
  const { data, error } = await supabase
    .from('flyer_imports')
    .select('id, user_id, source_url, image_url, status, extracted, title, type, date, time, location, city, address, host, description, tags, created_at')
    .eq('user_id', userId)
    .eq('status', status)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export const createFlyerImport = async ({ userId, sourceUrl, imageUrl, extracted }) => {
  // Prevent duplicates (extension can trigger multiple times due to browser/app retries).
  // IMPORTANT: Instagram can return slightly different image URLs (poster/thumbnails)
  // for the same reel. So dedupe must be based on sourceUrl only.
  const { data: existing, error: existingErr } = await supabase
    .from('flyer_imports')
    .select('*')
    .eq('user_id', userId)
    .eq('source_url', sourceUrl)
    .eq('status', 'pending')
    .maybeSingle()

  if (existingErr) throw existingErr
  if (existing) return existing

  const tagsArray = extracted?.tags && Array.isArray(extracted.tags) ? extracted.tags : extracted?.tags || []
  const payload = {
    user_id: userId,
    source_url: sourceUrl,
    image_url: imageUrl,
    extracted: extracted || {},
    title: extracted?.title || null,
    type: extracted?.type || null,
    date: extracted?.date || null,
    time: extracted?.time || null,
    location: extracted?.location || null,
    city: extracted?.city || null,
    address: extracted?.address || null,
    host: extracted?.host || null,
    description: extracted?.description || null,
    tags: typeof tagsArray === 'string' ? tagsArray.split(',').map(t => t.trim()).filter(Boolean) : tagsArray,
  }
  const { data, error } = await supabase.from('flyer_imports').insert([payload]).select('*').single()
  if (error) throw error
  return data
}

export const updateFlyerImportStatus = async (importId, status) => {
  const { data, error } = await supabase
    .from('flyer_imports')
    .update({ status })
    .eq('id', importId)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export const updateFlyerImport = async (importId, updates) => {
  const { data, error } = await supabase
    .from('flyer_imports')
    .update(updates)
    .eq('id', importId)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export const uploadEventPhoto = async (file, eventId) => {
  const ext = file.name.split('.').pop()
  const path = `events/${eventId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('event-photos').upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from('event-photos').getPublicUrl(path)
  return data.publicUrl
}

export const uploadFlyerImportImage = async (file, userId) => {
  if (!file) throw new Error('Missing file')
  if (!userId) throw new Error('Missing userId')
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg'
  const path = `flyer-imports/${userId}/${Date.now()}.${safeExt}`
  const { error } = await supabase.storage.from('event-photos').upload(path, file, {
    upsert: false,
    contentType: file.type || `image/${safeExt === 'jpg' ? 'jpeg' : safeExt}`,
  })
  if (error) throw error
  const { data } = supabase.storage.from('event-photos').getPublicUrl(path)
  return data.publicUrl
}

// ═══ ATTENDEES ═══════════════════════════════════════════════

export const toggleAttendance = async (eventId, userId) => {
  const { data: existing } = await supabase
    .from('event_attendees')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .single()

  if (existing) {
    await supabase.from('event_attendees').delete().eq('id', existing.id)
    return false
  } else {
    await supabase.from('event_attendees').insert([{ event_id: eventId, user_id: userId }])
    return true
  }
}

export const getAttendanceStatus = async (eventId, userId) => {
  const { data } = await supabase
    .from('event_attendees')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .single()
  return !!data
}

// ═══ COMMENTS ════════════════════════════════════════════════

export const fetchComments = async (eventId) => {
  const { data, error } = await supabase
    .from('comments')
    .select('*, profiles(username, avatar_url)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export const postComment = async (eventId, userId, text) => {
  const { data, error } = await supabase
    .from('comments')
    .insert([{ event_id: eventId, user_id: userId, text }])
    .select('*, profiles(username, avatar_url)')
    .single()
  if (error) throw error
  return data
}

export const fetchSavedEventIds = async (userId) => {
  if (!userId) return []
  const { data, error } = await supabase
    .from('saved_events')
    .select('event_id')
    .eq('user_id', userId)
  if (error) throw error
  return (data || []).map(row => row.event_id).filter(Boolean)
}

export const setSavedEventStatus = async (userId, eventId, shouldSave) => {
  if (!userId || !eventId) return
  if (shouldSave) {
    const { error } = await supabase
      .from('saved_events')
      .upsert([{ user_id: userId, event_id: eventId }], { onConflict: 'user_id,event_id', ignoreDuplicates: true })
    if (error) throw error
    return true
  }
  const { error } = await supabase
    .from('saved_events')
    .delete()
    .eq('user_id', userId)
    .eq('event_id', eventId)
  if (error) throw error
  return false
}

export const upsertSavedEvents = async (userId, eventIds) => {
  if (!userId || !Array.isArray(eventIds) || eventIds.length === 0) return
  const rows = eventIds.filter(Boolean).map(eventId => ({ user_id: userId, event_id: eventId }))
  if (rows.length === 0) return
  const { error } = await supabase
    .from('saved_events')
    .upsert(rows, { onConflict: 'user_id,event_id', ignoreDuplicates: true })
  if (error) throw error
}
