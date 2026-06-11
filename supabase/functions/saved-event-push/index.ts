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

/** Supabase secrets often store PEM newlines as literal \\n. */
const normalizePrivateKey = (raw: string) => {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''
  return trimmed.includes('-----BEGIN') ? trimmed.replace(/\\n/g, '\n') : trimmed
}

// FCM HTTP v1 auth (service account) — Android
const FCM_PROJECT_ID = Deno.env.get('FCM_PROJECT_ID') || ''
const FCM_CLIENT_EMAIL = Deno.env.get('FCM_CLIENT_EMAIL') || ''
const FCM_PRIVATE_KEY = normalizePrivateKey(Deno.env.get('FCM_PRIVATE_KEY') || '')

// APNs HTTP/2 — iOS (Auth Key .p8 from Apple Developer)
const APNS_KEY_ID = Deno.env.get('APNS_KEY_ID') || ''
const APNS_TEAM_ID = Deno.env.get('APNS_TEAM_ID') || ''
const APNS_PRIVATE_KEY = normalizePrivateKey(Deno.env.get('APNS_PRIVATE_KEY') || '')
const APNS_BUNDLE_ID = Deno.env.get('APNS_BUNDLE_ID') || 'com.findcarmeets.app'
const APNS_ENV = Deno.env.get('APNS_ENV') || 'production'

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

const apnsConfigured = () => Boolean(APNS_KEY_ID && APNS_TEAM_ID && APNS_PRIVATE_KEY)

function derEcdsaToJose(der: Uint8Array, size = 32) {
  if (!der?.length || der[0] !== 0x30) {
    throw new Error('Invalid ECDSA signature DER')
  }
  let offset = 2
  if (der[1] & 0x80) offset += der[1] & 0x7f
  if (offset >= der.length || der[offset] !== 0x02) {
    throw new Error('Invalid ECDSA signature DER (missing r)')
  }
  offset += 1
  const rLen = der[offset++]
  if (offset + rLen > der.length) throw new Error('Invalid ECDSA signature DER (r length)')
  let r = der.slice(offset, offset + rLen)
  offset += rLen
  if (offset >= der.length || der[offset] !== 0x02) {
    throw new Error('Invalid ECDSA signature DER (missing s)')
  }
  offset += 1
  const sLen = der[offset++]
  if (offset + sLen > der.length) throw new Error('Invalid ECDSA signature DER (s length)')
  let s = der.slice(offset, offset + sLen)
  while (r.length > size && r[0] === 0) r = r.slice(1)
  while (s.length > size && s[0] === 0) s = s.slice(1)
  const raw = new Uint8Array(size * 2)
  raw.set(r, size - r.length)
  raw.set(s, size * 2 - s.length)
  return raw
}

let cachedApnsJwt = ''
let cachedApnsJwtExpMs = 0

async function signApnsJwt() {
  const now = Date.now()
  if (cachedApnsJwt && cachedApnsJwtExpMs - now > 60_000) return cachedApnsJwt
  if (!apnsConfigured()) throw new Error('Missing APNs env vars')

  const header = { alg: 'ES256', kid: APNS_KEY_ID }
  const iat = Math.floor(now / 1000)
  const payload = { iss: APNS_TEAM_ID, iat }
  const enc = new TextEncoder()
  const headerPart = b64url(enc.encode(JSON.stringify(header)))
  const payloadPart = b64url(enc.encode(JSON.stringify(payload)))
  const data = enc.encode(`${headerPart}.${payloadPart}`)

  const pemContents = APNS_PRIVATE_KEY.replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '')
  const keyBytes = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, data),
  )
  // Web Crypto returns raw r||s (64 bytes for P-256); some runtimes return ASN.1 DER instead.
  const joseSig = sig.length === 64 ? sig : derEcdsaToJose(sig)
  cachedApnsJwt = `${headerPart}.${payloadPart}.${b64url(joseSig)}`
  cachedApnsJwtExpMs = now + 50 * 60 * 1000
  return cachedApnsJwt
}

async function sendApns(token: string, title: string, body: string, eventId: string) {
  const jwt = await signApnsJwt()
  const host = APNS_ENV === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'
  const deviceToken = String(token || '')
    .replace(/\s+/g, '')
    .toLowerCase()
  const url = `https://${host}/3/device/${deviceToken}`
  const messageBody = {
    aps: {
      alert: { title, body },
      sound: 'default',
    },
    event_id: eventId,
    click_action: 'OPEN_EVENT',
    deep_link: `${APP_DEEPLINK_BASE}${eventId}`,
    web_link: `${APP_WEB_BASE}${eventId}`,
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': APNS_BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: JSON.stringify(messageBody),
  })
  const text = await res.text().catch(() => '')
  if (!res.ok) {
    console.error('APNs rejected push', res.status, text, { env: APNS_ENV, topic: APNS_BUNDLE_ID })
  }
  return { ok: res.ok, status: res.status, payload: text }
}

async function sendPush(
  platform: string,
  token: string,
  title: string,
  body: string,
  eventId: string,
) {
  if (platform === 'ios') {
    if (!apnsConfigured()) {
      return { ok: false, status: 503, payload: 'APNs not configured' }
    }
    return sendApns(token, title, body, eventId)
  }
  return sendFcmV1(token, title, body, eventId)
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

type EventMeta = { title: string; date: string; time: string }

async function getEventMeta(eventId: string): Promise<EventMeta | null> {
  const { data, error } = await supabase
    .from('events')
    .select('title, date, time')
    .eq('id', eventId)
    .maybeSingle()
  if (error) throw error
  if (!data?.date) return null
  return {
    title: norm(data.title) || 'Saved event',
    date: String(data.date),
    time: String(data.time || ''),
  }
}

function isEventUpcoming(meta: EventMeta | null): boolean {
  if (!meta?.date) return false
  const today = new Date().toISOString().slice(0, 10)
  if (meta.date < today) return false
  const timePart = /^\d{2}:\d{2}/.test(meta.time) ? meta.time : '00:00'
  const startMs = new Date(`${meta.date}T${timePart}`).getTime()
  if (!Number.isFinite(startMs)) return meta.date >= today
  return startMs > Date.now()
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
    .select(
      'user_id, reminders_enabled, event_updates_enabled, reminder_24h_enabled, reminder_2h_enabled',
    )
    .in('user_id', userIds)
  if (prefsErr) throw prefsErr
  const prefMap = new Map<
    string,
    {
      reminders_enabled: boolean
      event_updates_enabled: boolean
      reminder_24h_enabled: boolean
      reminder_2h_enabled: boolean
    }
  >()
  for (const p of prefs || []) {
    prefMap.set(p.user_id, {
      reminders_enabled: p.reminders_enabled !== false,
      event_updates_enabled: p.event_updates_enabled !== false,
      reminder_24h_enabled: p.reminder_24h_enabled !== false,
      reminder_2h_enabled: p.reminder_2h_enabled !== false,
    })
  }

  const { data: tokens, error: tokenErr } = await supabase
    .from('device_push_tokens')
    .select('user_id, token, platform')
    .in('platform', ['android', 'ios'])
    .eq('active', true)
    .in('user_id', userIds)
  if (tokenErr) throw tokenErr

  return (tokens || []).map((row) => ({
    userId: row.user_id as string,
    token: row.token as string,
    platform: (row.platform as string) || 'android',
    prefs: prefMap.get(row.user_id as string) || {
      reminders_enabled: true,
      event_updates_enabled: true,
      reminder_24h_enabled: true,
      reminder_2h_enabled: true,
    },
  }))
}

/** Dedupe per device so every active token for a user gets the same alert. */
function deviceDedupeKey(baseKey: string, token: string) {
  return `${baseKey}::${token}`
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
  const meta = await getEventMeta(eventId)
  if (!isEventUpcoming(meta)) return { sent: 0, skipped: 0 }
  const eventTitle = meta?.title || 'Saved event'
  const message = norm(req.updateMessage) || 'The host posted a new update.'
  const recipients = await getRecipientsForEvent(eventId)
  let sent = 0
  let skipped = 0
  const failures: Array<{ platform: string; status: number; detail: string }> = []

  for (const r of recipients) {
    if (!r.prefs.event_updates_enabled) {
      skipped += 1
      continue
    }
    const dedupeKey = deviceDedupeKey(`event_update:${eventId}:${message.slice(0, 120)}`, r.token)
    if (await alreadySent(r.userId, dedupeKey)) {
      skipped += 1
      continue
    }
    let response
    try {
      response = await sendPush(
        r.platform,
        r.token,
        `New host update: ${eventTitle}`,
        message,
        eventId,
      )
    } catch (error) {
      const detail = String(error)
      console.error('push send failed', r.platform, detail)
      failures.push({ platform: r.platform, status: 0, detail })
      continue
    }
    if (!response.ok) {
      const text = String(response.payload || '')
      console.error('push send rejected', r.platform, response.status, text)
      failures.push({ platform: r.platform, status: response.status, detail: text })
      if (
        response.status === 400 ||
        response.status === 404 ||
        response.status === 410 ||
        /InvalidRegistration|NotRegistered|BadDeviceToken|Unregistered|BadDeviceToken/i.test(text)
      ) {
        await supabase.from('device_push_tokens').update({ active: false }).eq('token', r.token)
      }
      continue
    }
    await markSent(r.userId, eventId, 'event_update', dedupeKey)
    sent += 1
  }
  return { sent, skipped, failures }
}

async function notifySavedEventStatus(req: NotifyRequest) {
  const eventId = norm(req.eventId)
  if (!eventId) return { sent: 0, skipped: 0 }
  const meta = await getEventMeta(eventId)
  if (!isEventUpcoming(meta)) return { sent: 0, skipped: 0 }
  const eventTitle = meta?.title || 'Saved event'
  const statusLabel = norm(req.statusLabel) || 'Updated'
  const recipients = await getRecipientsForEvent(eventId)
  let sent = 0
  let skipped = 0

  for (const r of recipients) {
    if (!r.prefs.event_updates_enabled) {
      skipped += 1
      continue
    }
    const dedupeKey = deviceDedupeKey(
      `event_status:${eventId}:${statusLabel.toLowerCase()}`,
      r.token,
    )
    if (await alreadySent(r.userId, dedupeKey)) {
      skipped += 1
      continue
    }
    let response
    try {
      response = await sendPush(
        r.platform,
        r.token,
        `Status changed: ${eventTitle}`,
        statusLabel,
        eventId,
      )
    } catch (error) {
      console.error('push send failed', r.platform, String(error))
      continue
    }
    if (!response.ok) {
      console.error('push send rejected', r.platform, response.status, response.payload)
      continue
    }
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
        if (w.id === '24h' && r.prefs.reminder_24h_enabled === false) {
          skipped += 1
          continue
        }
        if (w.id === '2h' && r.prefs.reminder_2h_enabled === false) {
          skipped += 1
          continue
        }
        const dedupeKey = deviceDedupeKey(`reminder:${event.id}:${w.id}`, r.token)
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
        let response
        try {
          response = await sendPush(
            r.platform,
            r.token,
            `Upcoming saved event: ${event.title || 'Event'}`,
            body,
            event.id,
          )
        } catch (error) {
          console.error('push send failed', r.platform, String(error))
          continue
        }
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
