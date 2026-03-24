import { createClient } from '@supabase/supabase-js'
import { compressImageForUpload } from './compressImageForUpload'
import { apiUrl, apiUrlCandidates } from './apiOrigin'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://wyjbiqgczacqrxwulsts.supabase.co'
// Important: fallback must be valid for your Supabase project.
// Using the project's anon public key prevents "Invalid API key" in builds where env vars aren't injected.
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_WQTdt-GLFcEBE681slkTGQ_y3W5ZQHt'

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

const DUPLICATE_EVENT_MESSAGE = 'An event with the same title, date, and city already exists. Please edit the existing event instead.'

const mapCreateEventError = (error) => {
  const code = String(error?.code || '')
  const message = String(error?.message || '')
  const details = String(error?.details || '')
  if (code === '23505' || /events_title_date_city_unique/i.test(message) || /events_title_date_city_unique/i.test(details)) {
    return new Error(DUPLICATE_EVENT_MESSAGE)
  }
  return error
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

const fetchLatestEventUpdateMap = async (eventIds) => {
  if (!Array.isArray(eventIds) || eventIds.length === 0) return {}
  const { data, error } = await supabase
    .from('event_updates')
    .select('id, event_id, message, created_at')
    .in('event_id', eventIds)
    .order('created_at', { ascending: false })
  if (error) throw error
  const map = {}
  for (const row of data || []) {
    if (!map[row.event_id]) {
      map[row.event_id] = {
        latest_update_id: row.id,
        latest_update_message: row.message || '',
        latest_update_created_at: row.created_at || '',
      }
    }
  }
  return map
}

const fetchEventRsvpStatsMap = async (eventIds) => {
  if (!Array.isArray(eventIds) || eventIds.length === 0) return {}
  const { data, error } = await supabase
    .from('event_rsvps')
    .select('event_id, status')
    .in('event_id', eventIds)
  if (error) throw error
  const map = {}
  for (const row of data || []) {
    if (!map[row.event_id]) map[row.event_id] = { interested_count: 0, going_count: 0 }
    if (row.status === 'going') map[row.event_id].going_count += 1
    if (row.status === 'interested') map[row.event_id].interested_count += 1
  }
  return map
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

export const fetchLatestEventUpdates = async (eventIds) => {
  return fetchLatestEventUpdateMap(eventIds)
}

export const createEventUpdate = async (eventId, userId, message) => {
  if (!eventId || !userId || !String(message || '').trim()) throw new Error('Missing event update data')
  const { data, error } = await supabase
    .from('event_updates')
    .insert([{
      event_id: eventId,
      user_id: userId,
      message: String(message).trim(),
    }])
    .select('id, event_id, message, created_at')
    .single()
  if (error) throw error
  return data
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
    const updateMap = await fetchLatestEventUpdateMap(rows.map(e => e.id))
    const rsvpMap = await fetchEventRsvpStatsMap(rows.map(e => e.id))
    return rows.map(e => ({
      ...e,
      status: statusMap[e.id]?.status || 'active',
      status_note: statusMap[e.id]?.status_note || '',
      latest_update_id: updateMap[e.id]?.latest_update_id || '',
      latest_update_message: updateMap[e.id]?.latest_update_message || '',
      latest_update_created_at: updateMap[e.id]?.latest_update_created_at || '',
      interested_count: rsvpMap[e.id]?.interested_count || 0,
      going_count: rsvpMap[e.id]?.going_count || 0,
    }))
  } catch {
    return rows.map(e => ({
      ...e,
      status: 'active',
      status_note: '',
      latest_update_id: '',
      latest_update_message: '',
      latest_update_created_at: '',
      interested_count: 0,
      going_count: e.event_attendees?.[0]?.count || e.attendee_count || 0,
    }))
  }
}

export const createEvent = async (eventData, userId) => {
  const { data, error } = await supabase
    .from('events')
    .insert([{ ...eventData, user_id: userId }])
    .select('id, user_id, title, type, date, time, location, city, address, lat, lng, description, tags, host, photo_url, featured, created_at, event_attendees(count)')
    .single()
  if (error) throw mapCreateEventError(error)
  const status = normalizeStatus(eventData?.status)
  const statusNote = eventData?.status_note || ''
  try {
    await upsertEventStatus(data.id, status, statusNote)
  } catch {}
  return {
    ...data,
    status,
    status_note: statusNote,
    latest_update_id: '',
    latest_update_message: '',
    latest_update_created_at: '',
    interested_count: 0,
    going_count: 0,
  }
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
  let latest = { latest_update_id: '', latest_update_message: '', latest_update_created_at: '' }
  try {
    const updateMap = await fetchLatestEventUpdateMap([eventId])
    latest = updateMap[eventId] || latest
  } catch {}
  let rsvpStats = { interested_count: 0, going_count: 0 }
  try {
    const rsvpMap = await fetchEventRsvpStatsMap([eventId])
    rsvpStats = rsvpMap[eventId] || rsvpStats
  } catch {
    rsvpStats = { interested_count: 0, going_count: data.event_attendees?.[0]?.count || 0 }
  }
  return { ...data, status: finalStatus, status_note: finalStatusNote, ...latest, ...rsvpStats }
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

function useR2Storage() {
  const v = import.meta.env.VITE_USE_R2_STORAGE
  if (v === true) return true
  const s = String(v ?? '')
    .trim()
    .toLowerCase()
  return s === 'true' || s === '1' || s === 'yes'
}

/** Browser PUT to R2 using Vercel-issued presigned URL (secrets stay on server). */
async function uploadImageViaR2Presign(file, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Sign in to upload photos')

  const presignUrls = apiUrlCandidates('/api/storage-presign')
  let json = {}
  let lastPresignErr = null
  for (const url of presignUrls) {
    try {
      const pres = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const j = await pres.json().catch(() => ({}))
      if (pres.ok && j?.uploadUrl && j?.publicUrl && j?.key) {
        json = j
        break
      }
      lastPresignErr = new Error(j.error || `Presign failed (${pres.status})`)
    } catch (e) {
      lastPresignErr = e
    }
  }
  if (!json?.uploadUrl) {
    throw lastPresignErr || new Error('Could not reach upload service. Try again.')
  }
  const { uploadUrl, publicUrl, key } = json
  if (!uploadUrl || !publicUrl || !key) throw new Error('Invalid presign response')

  try {
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
    })
    if (!put.ok) {
      const t = await put.text().catch(() => '')
      throw new Error(`Upload failed (${put.status}) ${t.slice(0, 120)}`)
    }
  } catch (err) {
    // Mobile WebView CORS quirks: fallback to server-side upload via API (try multiple hosts).
    const base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const result = String(reader.result || '')
          const comma = result.indexOf(',')
          resolve(comma >= 0 ? result.slice(comma + 1) : '')
        } catch (e) {
          reject(e)
        }
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    const relayPayload = JSON.stringify({
      key,
      contentType: file.type || 'application/octet-stream',
      base64Data,
    })
    const relayUrls = apiUrlCandidates('/api/storage-upload')
    let lastRelayErr = err
    for (const relayUrl of relayUrls) {
      try {
        const relay = await fetch(relayUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: relayPayload,
        })
        const relayJson = await relay.json().catch(() => ({}))
        if (relay.ok) {
          return publicUrl
        }
        lastRelayErr = new Error(relayJson.error || `Upload relay failed (${relay.status})`)
      } catch (e) {
        lastRelayErr = e
      }
    }
    throw lastRelayErr instanceof Error ? lastRelayErr : new Error(String(lastRelayErr))
  }
  return publicUrl
}

export const uploadEventPhoto = async (file, eventId) => {
  const ready = await compressImageForUpload(file)
  const ext = (ready.name.split('.').pop() || 'jpg').toLowerCase()
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg'
  const contentType = ready.type || `image/${safeExt === 'jpg' ? 'jpeg' : safeExt}`

  if (useR2Storage()) {
    return uploadImageViaR2Presign(ready, {
      folder: 'events',
      eventId,
      fileExt: safeExt,
      contentType,
    })
  }

  const path = `events/${eventId}/${Date.now()}.${safeExt}`
  const { error } = await supabase.storage.from('event-photos').upload(path, ready, {
    contentType,
    upsert: false,
  })
  if (error) throw error
  const { data } = supabase.storage.from('event-photos').getPublicUrl(path)
  return data.publicUrl
}

export const uploadFlyerImportImage = async (file, userId) => {
  if (!file) throw new Error('Missing file')
  if (!userId) throw new Error('Missing userId')
  const ready = await compressImageForUpload(file)
  const ext = (ready.name.split('.').pop() || 'jpg').toLowerCase()
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg'
  const contentType = ready.type || `image/${safeExt === 'jpg' ? 'jpeg' : safeExt}`

  if (useR2Storage()) {
    return uploadImageViaR2Presign(ready, {
      folder: 'flyer-imports',
      userId,
      fileExt: safeExt,
      contentType,
    })
  }

  const path = `flyer-imports/${userId}/${Date.now()}.${safeExt}`
  const { error } = await supabase.storage.from('event-photos').upload(path, ready, {
    upsert: false,
    contentType,
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

export const getEventRsvpStatus = async (eventId, userId) => {
  if (!eventId || !userId) return null
  try {
    const { data, error } = await supabase
      .from('event_rsvps')
      .select('status')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data?.status || null
  } catch {
    const attending = await getAttendanceStatus(eventId, userId).catch(() => false)
    return attending ? 'going' : null
  }
}

export const setEventRsvp = async (eventId, userId, status) => {
  if (!eventId || !userId) return null
  if (!status) {
    try {
      const { error } = await supabase
        .from('event_rsvps')
        .delete()
        .eq('event_id', eventId)
        .eq('user_id', userId)
      if (error) throw error
      return null
    } catch {
      await supabase.from('event_attendees').delete().eq('event_id', eventId).eq('user_id', userId)
      return null
    }
  }

  if (!['interested', 'going'].includes(status)) throw new Error('Invalid RSVP status')

  try {
    const { error } = await supabase
      .from('event_rsvps')
      .upsert([{ event_id: eventId, user_id: userId, status }], { onConflict: 'event_id,user_id' })
    if (error) throw error
    return status
  } catch {
    if (status === 'going') {
      const attending = await getAttendanceStatus(eventId, userId).catch(() => false)
      if (!attending) await supabase.from('event_attendees').insert([{ event_id: eventId, user_id: userId }])
      return 'going'
    }
    return 'interested'
  }
}

export const fetchEventRsvpStats = async (eventIds) => {
  try {
    return await fetchEventRsvpStatsMap(eventIds)
  } catch {
    return {}
  }
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

// ═══ EVENT REPORTS (moderation queue) ═══════════════════════
export const createEventReport = async (eventId, reporterUserId, reason, details) => {
  const safeReason = String(reason || '').trim()
  const safeDetails = details == null ? '' : String(details || '').trim()
  if (!eventId || !reporterUserId) throw new Error('Missing report data')
  if (!safeReason) throw new Error('Missing report reason')

  const { data, error } = await supabase
    .from('event_reports')
    .insert([{ event_id: eventId, reporter_user_id: reporterUserId, reason: safeReason, details: safeDetails || null }])
    .select('id, event_id, reason, details, status, created_at')
    .single()

  if (error) throw error
  return data
}

export const fetchEventReports = async (status = 'pending') => {
  try {
    const { data, error } = await supabase
      .from('event_reports')
      .select('id, event_id, reason, details, status, created_at, review_note, reviewed_at, reporter_user_id, profiles(username, avatar_url), events(title, type, date, location, city, photo_url)')
      .eq('status', status)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  } catch {
    return []
  }
}

export const resolveEventReport = async (reportId, reviewerUserId, status, reviewNote) => {
  if (!reportId || !reviewerUserId) throw new Error('Missing resolve data')
  const safeStatus = status === 'ignored' ? 'ignored' : 'resolved'
  const safeNote = reviewNote == null ? '' : String(reviewNote || '').trim()

  const { data, error } = await supabase
    .from('event_reports')
    .update({
      status: safeStatus,
      review_note: safeNote || null,
      reviewed_by: reviewerUserId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', reportId)
    .select('id, status, reviewed_at')
    .single()

  if (error) throw error
  return data
}
