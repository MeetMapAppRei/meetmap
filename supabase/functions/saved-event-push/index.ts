import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type NotifyMode = 'event_update' | 'event_status' | 'reminder_tick'

type NotifyRequest = {
  mode: NotifyMode
  eventId?: string
  updateMessage?: string
  statusLabel?: string
  reminderWindowId?: string
  nowIso?: string
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const INTERNAL_BEARER = Deno.env.get('SAVED_EVENT_PUSH_BEARER') || ''
const APP_DEEPLINK_BASE = Deno.env.get('APP_DEEPLINK_BASE') || 'meetmap://event/'
const APP_WEB_BASE = Deno.env.get('APP_WEB_BASE') || 'https://www.findcarmeets.com/?event='

// FCM HTTP v1 auth (service account)
const FCM_PROJECT_ID = Deno.env.get('FCM_PROJECT_ID') || ''
const FCM_CLIENT_EMAIL = Deno.env.get('FCM_CLIENT_EMAIL') || ''
const FCM_PRIVATE_KEY = (Deno.env.get('FCM_PRIVATE_KEY') || '').replace(/\\n/g, '\n')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const norm = (v: unknown) => String(v || '').trim()

function b64url(bytes: Uint8Array) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function signJwtRs256(payload: Record<string, unknown>) {
  const header = { alg: 'RS256', typ: 'JWT' }
  const enc = new TextEncoder()
  const headerPart = b64url(enc.encode(JSON.stringify(header)))
  const payloadPart = b64url(enc.encode(JSON.stringify(payload)))
  const data = enc.encode(`${headerPart}.${payloadPart}`)

  const pkcs8 = FCM_PRIVATE_KEY.replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '')
  const keyBytes = Uint8Array.from(atob(pkcs8), (c) => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, cryptoKey, data)
  return `${headerPart}.${payloadPart}.${b64url(new Uint8Array(sig))}`
}

let cachedAccessToken = ''
let cachedAccessTokenExpMs = 0

async function getFcmAccessToken() {
  const now = Date.now()
  if (cachedAccessToken && cachedAccessTokenExpMs - now > 60_000) return cachedAccessToken
  if (!FCM_CLIENT_EMAIL || !FCM_PRIVATE_KEY) throw new Error('Missing FCM service account env vars')

  const iat = Math.floor(now / 1000)
  const exp = iat + 60 * 55
  const jwt = await signJwtRs256({
    iss: FCM_CLIENT_EMAIL,
    sub: FCM_CLIENT_EMAIL,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    iat,
    exp,
  })

  const body = new URLSearchParams()
  body.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer')
  body.set('assertion', jwt)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json?.access_token) {
    throw new Error(`Failed to get FCM access token (${res.status}) ${JSON.stringify(json)}`)
  }
  cachedAccessToken = String(json.access_token)
  cachedAccessTokenExpMs = now + Number(json.expires_in || 3300) * 1000
  return cachedAccessToken
}

async function sendFcmV1(token: string, title: string, body: string, eventId: string) {
  const accessToken = await getFcmAccessToken()
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(FCM_PROJECT_ID)}/messages:send`
  const messageBody = {
    message: {
      token,
      notification: { title, body },
      data: {
        event_id: eventId,
        click_action: 'OPEN_EVENT',
        deep_link: `${APP_DEEPLINK_BASE}${eventId}`,
        web_link: `${APP_WEB_BASE}${eventId}`,
      },
      android: { priority: 'HIGH' },
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(messageBody),
  })
  const payload = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, payload }
}

async function getEventTitle(eventId: string) {
  const { data, error } = await supabase
    .from('events')
    .select('title')
    .eq('id', eventId)
    .maybeSingle()
  if (error) throw error
  return norm(data?.title) || 'Saved event'
}

async function getRecipientsForEvent(eventId: string) {
  const { data, error } = await supabase
    .from('saved_events')
    .select('user_id')
    .eq('event_id', eventId)
  if (error) throw error
  const userIds = Array.from(new Set((data || []).map((r) => r.user_id).filter(Boolean)))
  if (userIds.length === 0) return []

  const { data: prefs, error: prefsErr } = await supabase
    .from('user_notification_preferences')
    .select('user_id, reminders_enabled, event_updates_enabled')
    .in('user_id', userIds)
  if (prefsErr) throw prefsErr
  const prefMap = new Map<string, { reminders_enabled: boolean; event_updates_enabled: boolean }>()
  for (const p of prefs || []) {
    prefMap.set(p.user_id, {
      reminders_enabled: p.reminders_enabled !== false,
      event_updates_enabled: p.event_updates_enabled !== false,
    })
  }

  const { data: tokens, error: tokenErr } = await supabase
    .from('device_push_tokens')
    .select('user_id, token')
    .eq('platform', 'android')
    .eq('active', true)
    .in('user_id', userIds)
  if (tokenErr) throw tokenErr

  return (tokens || []).map((row) => ({
    userId: row.user_id as string,
    token: row.token as string,
    prefs: prefMap.get(row.user_id as string) || {
      reminders_enabled: true,
      event_updates_enabled: true,
    },
  }))
}

async function alreadySent(userId: string, dedupeKey: string) {
  const { data, error } = await supabase
    .from('push_notification_sends')
    .select('id')
    .eq('user_id', userId)
    .eq('dedupe_key', dedupeKey)
    .maybeSingle()
  if (error) throw error
  return !!data?.id
}

async function markSent(userId: string, eventId: string, kind: string, dedupeKey: string) {
  const { error } = await supabase.from('push_notification_sends').insert([
    {
      user_id: userId,
      event_id: eventId,
      kind,
      dedupe_key: dedupeKey,
    },
  ])
  if (error) throw error
}

async function notifySavedEventUpdate(req: NotifyRequest) {
  const eventId = norm(req.eventId)
  if (!eventId) return { sent: 0, skipped: 0 }
  const eventTitle = await getEventTitle(eventId)
  const message = norm(req.updateMessage) || 'The host posted a new update.'
  const recipients = await getRecipientsForEvent(eventId)
  let sent = 0
  let skipped = 0

  for (const r of recipients) {
    if (!r.prefs.event_updates_enabled) {
      skipped += 1
      continue
    }
    const dedupeKey = `event_update:${eventId}:${message.slice(0, 120)}`
    if (await alreadySent(r.userId, dedupeKey)) {
      skipped += 1
      continue
    }
    const response = await sendFcmV1(r.token, `New host update: ${eventTitle}`, message, eventId)
    if (!response.ok) {
      // Deactivate stale tokens when FCM reports invalid registration.
      const text = JSON.stringify(response.payload || {})
      if (
        response.status === 400 ||
        response.status === 404 ||
        /InvalidRegistration|NotRegistered/i.test(text)
      ) {
        await supabase.from('device_push_tokens').update({ active: false }).eq('token', r.token)
      }
      continue
    }
    await markSent(r.userId, eventId, 'event_update', dedupeKey)
    sent += 1
  }
  return { sent, skipped }
}

async function notifySavedEventStatus(req: NotifyRequest) {
  const eventId = norm(req.eventId)
  if (!eventId) return { sent: 0, skipped: 0 }
  const eventTitle = await getEventTitle(eventId)
  const statusLabel = norm(req.statusLabel) || 'Updated'
  const recipients = await getRecipientsForEvent(eventId)
  let sent = 0
  let skipped = 0

  for (const r of recipients) {
    if (!r.prefs.event_updates_enabled) {
      skipped += 1
      continue
    }
    const dedupeKey = `event_status:${eventId}:${statusLabel.toLowerCase()}`
    if (await alreadySent(r.userId, dedupeKey)) {
      skipped += 1
      continue
    }
    const response = await sendFcmV1(r.token, `Status changed: ${eventTitle}`, statusLabel, eventId)
    if (!response.ok) continue
    await markSent(r.userId, eventId, 'event_status', dedupeKey)
    sent += 1
  }
  return { sent, skipped }
}

async function runReminderTick(req: NotifyRequest) {
  const now = req.nowIso ? new Date(req.nowIso) : new Date()
  const nowMs = now.getTime()
  const windows = [
    { id: '24h', leadMs: 24 * 60 * 60 * 1000, widthMs: 60 * 60 * 1000 },
    { id: '2h', leadMs: 2 * 60 * 60 * 1000, widthMs: 20 * 60 * 1000 },
  ]
  const onlyWindow = norm(req.reminderWindowId)

  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, date, time, location, city, address')
    .gte('date', now.toISOString().slice(0, 10))
    .lte('date', new Date(nowMs + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
  if (error) throw error

  let sent = 0
  let skipped = 0
  for (const event of events || []) {
    const time = /^\d{2}:\d{2}/.test(String(event.time || '')) ? String(event.time) : '00:00'
    const startMs = new Date(`${event.date}T${time}`).getTime()
    if (!Number.isFinite(startMs) || startMs <= nowMs) continue

    for (const w of windows) {
      if (onlyWindow && w.id !== onlyWindow) continue
      const reminderMs = startMs - w.leadMs
      if (nowMs < reminderMs || nowMs > reminderMs + w.widthMs) continue
      const recipients = await getRecipientsForEvent(event.id)
      for (const r of recipients) {
        if (!r.prefs.reminders_enabled) {
          skipped += 1
          continue
        }
        const dedupeKey = `reminder:${event.id}:${w.id}`
        if (await alreadySent(r.userId, dedupeKey)) {
          skipped += 1
          continue
        }
        const when = new Date(startMs).toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
        const place =
          norm(event.address) ||
          `${norm(event.location)}${event.city ? `, ${event.city}` : ''}`.trim()
        const body = `${when}${place ? ` - ${place}` : ''}`
        const response = await sendFcmV1(
          r.token,
          `Upcoming saved event: ${event.title || 'Event'}`,
          body,
          event.id,
        )
        if (!response.ok) continue
        await markSent(r.userId, event.id, 'reminder', dedupeKey)
        sent += 1
      }
    }
  }
  return { sent, skipped }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' })
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
    return json(500, { error: 'Missing Supabase env vars' })
  if (!FCM_PROJECT_ID) return json(500, { error: 'Missing FCM_PROJECT_ID' })
  if (!FCM_CLIENT_EMAIL) return json(500, { error: 'Missing FCM_CLIENT_EMAIL' })
  if (!FCM_PRIVATE_KEY) return json(500, { error: 'Missing FCM_PRIVATE_KEY' })
  if (INTERNAL_BEARER) {
    const auth = request.headers.get('Authorization') || ''
    if (auth !== `Bearer ${INTERNAL_BEARER}`) return json(401, { error: 'Unauthorized' })
  }

  try {
    const body = (await request.json()) as NotifyRequest
    const mode = body?.mode
    if (!mode) return json(400, { error: 'Missing mode' })

    if (mode === 'event_update') {
      const result = await notifySavedEventUpdate(body)
      return json(200, { ok: true, mode, ...result })
    }
    if (mode === 'event_status') {
      const result = await notifySavedEventStatus(body)
      return json(200, { ok: true, mode, ...result })
    }
    if (mode === 'reminder_tick') {
      const result = await runReminderTick(body)
      return json(200, { ok: true, mode, ...result })
    }
    return json(400, { error: 'Invalid mode' })
  } catch (error) {
    return json(500, { error: String(error) })
  }
})
