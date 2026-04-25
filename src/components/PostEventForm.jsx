import { useState, useRef, useEffect } from 'react'
import {
  createEvent,
  uploadEventPhoto,
  uploadFlyerImportImage,
  supabase,
  R2_RELAY_IMAGE_MAX_BYTES,
} from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { useTheme } from '../lib/useTheme'
import { apiUrl } from '../lib/apiOrigin'
import { geocodeAddress, humanizeFetchError } from '../lib/geocode'
import { userMessageForPostSubmitError } from '../lib/postErrorMessages'
import { compressImageForUploadUnder } from '../lib/compressImageForUpload'
import { eventsLikelyDuplicatePair } from '../lib/eventDedupe'
import { makeClientUuid } from '../lib/clientUuid'
import { savePostPrefill, loadAndConsumePostPrefill, clearPostPrefill } from '../lib/postPrefill'

function isTransientNetworkError(e) {
  const m = String(
    e?.message ||
      e?.error_description ||
      e?.cause?.message ||
      e?.details ||
      e?.hint ||
      e?.status ||
      e?.statusCode ||
      e?.code ||
      e ||
      '',
  )
  // Supabase / fetch / WebView often surface as TypeError, empty body, or gateway errors.
  return /failed to fetch|networkerror|load failed|network request failed|timeout|abort|502|503|504|econnreset|etimedout|socket|connection refused|eai_again|enotfound|econnrefused|tls|gateway/i.test(
    m,
  )
}

function normalizeFlyerDates(info) {
  const raw = info?.dates
  if (Array.isArray(raw) && raw.length) {
    const list = [
      ...new Set(
        raw.map((d) => String(d ?? '').trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
      ),
    ].sort()
    if (list.length) return list
  }
  const one = String(info?.date ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(one) ? [one] : []
}

function formatIsoDateLabel(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return String(iso || '')
  const dt = new Date(`${iso}T12:00:00`)
  return dt.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function buildGeocodeQuery(address, city) {
  const a = String(address || '').trim()
  const c = String(city || '').trim()
  if (!a) return ''
  // If the address already contains a comma (often includes city/state), don't double-append.
  if (!c) return a
  if (a.includes(',')) return a
  return `${a}, ${c}`
}

function buildBestEventGeocodeQuery({ address, location, city }) {
  const a = String(address || '').trim()
  const l = String(location || '').trim()
  const c = String(city || '').trim()
  if (a) return buildGeocodeQuery(a, c)
  if (l && c) return `${l}, ${c}`.trim()
  if (c) return c
  if (l) return l
  return ''
}

async function withNetworkRetries(fn, attempts = 5) {
  let last
  for (let i = 0; i < attempts; i++) {
    try {
      if (i > 0) {
        const jitter = Math.floor(Math.random() * 400)
        // Backoff helps on mobile when the first request hits a cold start / brief outage.
        await new Promise((r) => setTimeout(r, 900 * i + jitter))
      }
      return await fn()
    } catch (e) {
      last = e
      if (!isTransientNetworkError(e) || i === attempts - 1) throw e
    }
  }
  throw last
}

async function deleteEventBestEffort(eventId) {
  if (!eventId) return
  // Best-effort cleanup for cases where the event row was created but the client failed later.
  // If FKs are configured with `on delete cascade`, these extra deletes are harmless.
  const deleteTables = [
    'comments',
    'event_updates',
    'event_statuses',
    'event_attendees',
    'saved_events',
  ]
  await Promise.all(
    deleteTables.map(async (t) => {
      try {
        await supabase.from(t).delete().eq('event_id', eventId)
      } catch {}
    }),
  )
  try {
    await supabase.from('events').delete().eq('id', eventId)
  } catch {}
}

const S = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.9)',
    zIndex: 600,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    background: '#0F0F0F',
    borderRadius: '20px 20px 0 0',
    border: '1px solid #1A1A1A',
    maxHeight: '92vh',
    overflowY: 'auto',
    padding: '24px 20px 48px',
    animation: 'slideUp 0.3s ease',
  },
  label: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 11,
    color: '#555',
    letterSpacing: 1,
    display: 'block',
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  input: {
    width: '100%',
    background: '#141414',
    border: '1px solid #222',
    borderRadius: 8,
    padding: '11px 13px',
    color: '#F0F0F0',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 14,
    outline: 'none',
    marginBottom: 14,
    colorScheme: 'dark',
  },
  select: {
    width: '100%',
    background: '#141414',
    border: '1px solid #222',
    borderRadius: 8,
    padding: '11px 13px',
    color: '#F0F0F0',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 14,
    outline: 'none',
    marginBottom: 14,
    colorScheme: 'dark',
    appearance: 'none',
  },
}

function extractFlyerFetchTimeoutMs({ imageUrl }) {
  const cap = typeof window !== 'undefined' && window.Capacitor
  // Tiny JSON when the server fetches the image itself — WebView-friendly.
  if (imageUrl) return cap ? 90000 : 55000
  // Large base64 body: Android WebView often needs more time for upload + serverless cold start.
  return cap ? 120000 : 55000
}

async function postExtractFlyer(endpoint, { imageBase64, mediaType, imageUrl, correlationId }) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timeoutMs = extractFlyerFetchTimeoutMs({ imageUrl })
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  const body = {}
  if (correlationId) body.correlationId = correlationId
  if (imageUrl) {
    body.imageUrl = imageUrl
  } else {
    body.imageBase64 = imageBase64
    body.mediaType = mediaType || 'image/jpeg'
  }
  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Reduce caching oddities; also avoid sending cookies to third-party endpoints.
      cache: 'no-store',
      credentials: 'omit',
      body: JSON.stringify(body),
      signal: controller?.signal,
    })
  } finally {
    if (timeout) clearTimeout(timeout)
  }
  return response
}

async function extractFlyerInfoOnce(
  imageBase64,
  mediaType = 'image/jpeg',
  correlationId = '',
  options = {},
) {
  const imageUrl = String(options.imageUrl || '').trim()
  const useUrl = Boolean(imageUrl)
  if (!useUrl && !String(imageBase64 || '').trim()) {
    throw new Error('Missing flyer image')
  }
  const candidates = [
    apiUrl('/api/extract-flyer'),
    'https://findcarmeets.com/api/extract-flyer',
    'https://www.findcarmeets.com/api/extract-flyer',
    'https://meetmap-gilt.vercel.app/api/extract-flyer',
  ]
  const endpoints = Array.from(new Set(candidates.filter(Boolean)))
  let response = null
  let lastNetworkError = null

  for (const endpoint of endpoints) {
    try {
      response = await postExtractFlyer(endpoint, {
        imageBase64: useUrl ? undefined : imageBase64,
        mediaType,
        imageUrl: useUrl ? imageUrl : undefined,
        correlationId,
      })
      if (response.ok) break

      // If the server responded with a transient 5xx, try the next endpoint.
      // This avoids "first endpoint was temporarily broken" failures.
      const status = response.status
      const statusText = response.statusText
      const contentType = response.headers.get('content-type') || ''
      const rawText = await response.text()
      let data = {}
      try {
        data = rawText ? JSON.parse(rawText) : {}
      } catch {
        data = {}
      }

      const err =
        data?.error?.message ||
        data?.error ||
        data?.message ||
        (status === 413 ? 'Flyer image is too large. Try a smaller/cropped image.' : '') ||
        statusText ||
        `Request failed (${status})`

      const transient5xx = [502, 503, 504, 520, 521, 522, 524, 529].includes(status)
      const transientByBody =
        /bad gateway|temporarily|timeout|upstream|gateway|overloaded|rate limit|too many requests/i.test(
          String(err || ''),
        )

      if (transient5xx || transientByBody) {
        lastNetworkError = new Error(err)
        continue
      }

      // Non-transient error: stop and surface it.
      const preview = (rawText || JSON.stringify(data) || '').replace(/\s+/g, ' ').slice(0, 220)
      throw new Error(
        contentType?.includes('json') ? err : `${err}${preview ? ` (Response: ${preview})` : ''}`,
      )
    } catch (e) {
      lastNetworkError = e
      const msg = String(e?.message || '')
      const retryableNetwork =
        /failed to fetch|networkerror|load failed|network request failed|abort|timeout|overloaded|rate limit|too many requests/i.test(
          msg,
        )
      if (!retryableNetwork) throw e
    }
  }

  if (!response) {
    throw lastNetworkError || new Error('Connection problem while reading flyer.')
  }

  const responseUrl = response.url || ''
  const isFallback =
    responseUrl.includes('findcarmeets.com') || responseUrl.includes('meetmap-gilt.vercel.app')
  const status = response.status
  const statusText = response.statusText
  const contentType = response.headers.get('content-type') || ''
  const rawText = await response.text()
  let data = {}
  try {
    data = rawText ? JSON.parse(rawText) : {}
  } catch {
    data = {}
  }

  if (!response.ok) {
    const err =
      data?.error?.message ||
      data?.error ||
      data?.message ||
      (status === 413 ? 'Flyer image is too large. Try a smaller/cropped image.' : '') ||
      statusText ||
      `Request failed (${status})`
    throw new Error(isFallback ? `${err}` : err)
  }

  if (!('extracted' in (data || {})) || data?.extracted == null) {
    const preview = (rawText || JSON.stringify(data) || '').replace(/\s+/g, ' ').slice(0, 220)
    throw new Error(
      `No extracted data returned (status ${status}, content-type "${contentType}"). Response: ${preview}`,
    )
  }
  return data.extracted
}

async function extractFlyerInfo(
  imageBase64,
  mediaType = 'image/jpeg',
  correlationId = '',
  options = {},
) {
  const maxAttempts = 4
  let lastErr
  for (let i = 0; i < maxAttempts; i++) {
    try {
      if (i > 0) await new Promise((r) => setTimeout(r, 750 * i))
      return await extractFlyerInfoOnce(imageBase64, mediaType, correlationId, options)
    } catch (e) {
      lastErr = e
      const msg = e?.message || ''
      const retryable =
        /failed to fetch|networkerror|load failed|network request failed|timeout|abort|overloaded|rate limit|too many requests/i.test(
          msg,
        )
      if (retryable && i < maxAttempts - 1) continue
      throw e
    }
  }
  throw lastErr
}

function detectClientPlatform() {
  try {
    const ua = String(navigator?.userAgent || '')
    if (/android/i.test(ua)) return 'android'
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
    return 'web'
  } catch {
    return 'unknown'
  }
}

async function reportClientLogEvent(event, payload) {
  try {
    const body = {
      ...payload,
      event,
      platform: detectClientPlatform(),
      online: typeof navigator !== 'undefined' ? navigator.onLine : null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      url: typeof window !== 'undefined' ? window.location.href : '',
      appVersion:
        typeof import.meta !== 'undefined' ? String(import.meta.env?.VITE_APP_VERSION || '') : '',
    }
    const endpoint = apiUrl('/api/client-log')
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
      cache: 'no-store',
      credentials: 'omit',
    }).catch(() => {})
  } catch {}
}

async function reportSubmitDiagnostic(payload) {
  return reportClientLogEvent('post_event_submit_failed', payload)
}

async function reportFlyerScanDiagnostic(payload) {
  return reportClientLogEvent('flyer_scan_failed', payload)
}

function refSuffixForLog(correlationId) {
  if (!correlationId) return ''
  const short = String(correlationId).replace(/-/g, '').slice(0, 8)
  return short ? ` Ref: ${short}` : ''
}

export default function PostEventForm({ onClose, onPosted }) {
  const { user } = useAuth()
  const { isLight } = useTheme()
  const fileRef = useRef()
  const flyerRef = useRef()
  /** Blocks double-submit before React re-renders disabled={loading}. */
  const submitGuardRef = useRef(false)
  const [form, setForm] = useState({
    title: '',
    type: 'meet',
    date: '',
    time: '',
    location: '',
    city: '',
    address: '',
    description: '',
    tags: '',
    host: '',
  })
  const [coords, setCoords] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [error, setError] = useState('')
  const [missingFields, setMissingFields] = useState([])
  const [addressStatus, setAddressStatus] = useState('')
  const [flyerSuccess, setFlyerSuccess] = useState(false)
  /** YYYY-MM-DD list from last flyer scan (shown when 2+ dates). */
  const [flyerDates, setFlyerDates] = useState([])
  const [prefillBanner, setPrefillBanner] = useState(false)

  useEffect(() => {
    const snap = loadAndConsumePostPrefill()
    if (!snap?.form) return
    setForm((prev) => ({ ...prev, ...snap.form }))
    if (snap.flyerDates?.length) setFlyerDates(snap.flyerDates)
    if (snap.coords?.lat != null && snap.coords?.lng != null) {
      setCoords(snap.coords)
      setAddressStatus('found')
    }
    setPrefillBanner(true)
  }, [])

  // Warm serverless routes (reduces first-request cold-start failures on mobile web).
  useEffect(() => {
    const urls = Array.from(
      new Set(
        [
          apiUrl('/api/storage-health'),
          'https://meetmap-gilt.vercel.app/api/storage-health',
        ].filter(Boolean),
      ),
    )
    urls.forEach((u) => {
      fetch(u, { method: 'GET', cache: 'no-store', credentials: 'omit' }).catch(() => {})
    })
  }, [])

  const overlayStyle = {
    ...S.overlay,
    background: isLight ? 'rgba(0,0,0,0.28)' : S.overlay.background,
  }
  const sheetStyle = {
    ...S.sheet,
    background: isLight ? '#FFFFFF' : S.sheet.background,
    border: `1px solid ${isLight ? '#E5E5E5' : '#1A1A1A'}`,
  }
  const labelStyle = { ...S.label, color: isLight ? '#666' : S.label.color }
  const inputStyle = {
    ...S.input,
    background: isLight ? '#FFFFFF' : S.input.background,
    border: `1px solid ${isLight ? '#E5E5E5' : '#222'}`,
    color: isLight ? '#111111' : S.input.color,
    colorScheme: isLight ? 'light' : 'dark',
  }
  const selectStyle = {
    ...S.select,
    background: isLight ? '#FFFFFF' : S.select.background,
    border: `1px solid ${isLight ? '#E5E5E5' : '#222'}`,
    color: isLight ? '#111111' : S.select.color,
    colorScheme: isLight ? 'light' : 'dark',
  }
  const closeColor = isLight ? '#666' : '#555'
  const errorStyle = {
    background: isLight ? '#FFF1F1' : '#1A0A0A',
    border: `1px solid ${isLight ? '#FF6B6B55' : '#FF353544'}`,
    borderRadius: 8,
    padding: '10px 14px',
    marginBottom: 14,
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 13,
    color: isLight ? '#B00020' : '#FF6060',
  }
  const photoBorder = isLight ? '#E5E5E5' : '#222'
  const photoBg = isLight ? '#F7F7F7' : '#111'
  const geocodeText = isLight ? '#666' : '#555'

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }))

  const handlePhoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handleFlyerUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setScanning(true)
    setError('')
    setFlyerSuccess(false)
    setFlyerDates([])
    clearPostPrefill()
    let flyerCorrelationId = ''
    try {
      flyerCorrelationId = makeClientUuid()
      // Same size budget as uploadEventPhoto → R2 relay: smaller base64 JSON, fewer mobile failures.
      // Also normalizes HEIC/large originals to JPEG before we set `photo` for submit.
      const ready = await compressImageForUploadUnder(file, R2_RELAY_IMAGE_MAX_BYTES, {
        maxWidth: 1400,
        quality: 0.72,
      })

      // Reuse the flyer as the event photo — must be `ready`, not the original file.
      setPhoto(ready)
      setPhotoPreview(URL.createObjectURL(ready))

      const mediaType = ready.type || 'image/jpeg'
      // Signed-in: upload to storage first, then call extract with a small JSON body. Large base64
      // POSTs often fail in Android WebView; server fetches the public image URL instead.
      let info = null
      if (user?.id) {
        try {
          const publicUrl = await withNetworkRetries(
            () =>
              uploadFlyerImportImage(ready, user.id, {
                correlationId: flyerCorrelationId,
                skipCompress: true,
              }),
            5,
          )
          info = await extractFlyerInfo('', mediaType, flyerCorrelationId, { imageUrl: publicUrl })
        } catch (e) {
          console.warn('meetmap: flyer upload-then-extract failed, falling back to inline image', e)
        }
      }
      if (!info) {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result.split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(ready)
        })
        info = await extractFlyerInfo(base64, mediaType, flyerCorrelationId)
      }
      // Fill in the form with extracted info
      const bestAddress = info.verified_address || info.address || ''
      const geocodeQuery = buildGeocodeQuery(bestAddress, info.city)
      const allDates = normalizeFlyerDates(info)
      const primaryDate = allDates[0] || info.date || ''
      if (allDates.length > 1) setFlyerDates(allDates)
      setForm((prev) => ({
        ...prev,
        title: info.title || prev.title,
        type: info.type || prev.type,
        date: primaryDate || prev.date,
        time: info.time || prev.time,
        location: info.location || prev.location,
        address: bestAddress || prev.address,
        city: info.city || prev.city,
        host: info.host || prev.host,
        description: info.description || prev.description,
        tags: info.tags || prev.tags,
      }))
      setFlyerSuccess(true)
      // Auto-geocode after import — failures must not look like "flyer failed" (see green success banner).
      if (bestAddress) {
        try {
          const result = await geocodeAddress(geocodeQuery)
          if (result) {
            setCoords(result)
            setAddressStatus('found')
          } else {
            setAddressStatus('notfound')
          }
        } catch {
          setAddressStatus('error')
        }
      }
    } catch (e) {
      const msg = humanizeFetchError(e) || (typeof e === 'string' ? e : String(e))
      const base = msg || 'Could not read flyer. Try a clearer image or fill in manually.'
      setError(base + refSuffixForLog(flyerCorrelationId))
      void reportFlyerScanDiagnostic({
        correlationId: flyerCorrelationId,
        message: String(e?.message || ''),
        code: String(e?.code || ''),
        details: String(e?.details || e?.hint || ''),
        stage: 'flyer_extract',
      })
    } finally {
      setScanning(false)
    }
  }

  const handleAddressBlur = async () => {
    if (!form.address.trim()) return
    setGeocoding(true)
    setAddressStatus('')
    setCoords(null)
    try {
      const result = await geocodeAddress(buildGeocodeQuery(form.address, form.city))
      if (result) {
        setCoords(result)
        setAddressStatus('found')
      } else setAddressStatus('notfound')
    } catch {
      setAddressStatus('error')
    } finally {
      setGeocoding(false)
    }
  }

  const handleSubmit = async () => {
    if (submitGuardRef.current) return
    const required = [
      { key: 'title', label: 'Event Name' },
      { key: 'date', label: 'Date' },
      { key: 'city', label: 'City, State' },
    ]
    const missing = required.filter((f) => !String(form[f.key] || '').trim())
    if (missing.length > 0) {
      setMissingFields(missing.map((m) => m.key))
      setError(`Please complete: ${missing.map((m) => m.label).join(', ')}.`)
      return
    }
    if (!user?.id) {
      setError('Sign in again to post a meet.')
      return
    }
    setMissingFields([])
    setError('')
    setLoading(true)
    submitGuardRef.current = true
    let created = null
    let eventPayload = null
    let didAttemptCreate = false
    let rollbackRequired = false
    let stage = ''
    let correlationId = ''
    try {
      correlationId = makeClientUuid()
      let finalCoords = coords
      if (!finalCoords) {
        const query = buildBestEventGeocodeQuery(form)
        if (query) {
          finalCoords = await withNetworkRetries(() => geocodeAddress(query, { retries: 2 })).catch(
            () => null,
          )
        }
      }
      const tagsArray = form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const safeLocation = String(form.location || '').trim() || String(form.city || '').trim()
      const hasPhotoAtSubmit = !!photo
      const clientEventId = hasPhotoAtSubmit ? makeClientUuid() : null

      // Upload the photo first so a connection error cannot leave a partially-created event row.
      let photoUrl = null
      if (hasPhotoAtSubmit && clientEventId) {
        stage = 'uploading_photo'
        photoUrl = await withNetworkRetries(
          () => uploadEventPhoto(photo, clientEventId, { correlationId }),
          7,
        )
        if (!String(photoUrl || '').trim()) {
          throw new Error('Connection problem while uploading photo. Please try again.')
        }
      }

      eventPayload = {
        id: clientEventId || undefined,
        title: form.title,
        type: form.type,
        date: form.date,
        time: form.time,
        // DB requires location, so if it's omitted we safely fall back to city.
        location: safeLocation,
        city: form.city,
        address: form.address,
        description: form.description,
        tags: tagsArray,
        host: form.host,
        lat: finalCoords?.lat || null,
        lng: finalCoords?.lng || null,
        photo_url: photoUrl || null,
        user_id: user.id,
      }
      didAttemptCreate = true
      stage = 'creating_event'
      created = await withNetworkRetries(() => createEvent(eventPayload, user.id), 7)
      if (hasPhotoAtSubmit && !String(created?.photo_url || '').trim()) {
        rollbackRequired = true
        throw new Error('Connection problem while saving photo. Please try again.')
      }
      savePostPrefill({ form, flyerDates, coords: finalCoords })
      onPosted(created)
      onClose()
    } catch (e) {
      console.error('PostEventForm submit failed', { stage, correlationId, err: e })
      const isConn = isTransientNetworkError(e)
      setError(userMessageForPostSubmitError(stage, e, correlationId))
      void reportSubmitDiagnostic({
        stage,
        correlationId,
        message: String(e?.message || ''),
        code: String(e?.code || ''),
        details: String(e?.details || e?.hint || ''),
        hasPhoto: !!photo,
      })

      // If this submit hit a connection error after the event was created,
      // delete the event so it doesn't "go through" even though the client failed.
      if ((isConn || rollbackRequired) && didAttemptCreate) {
        if (created?.id) {
          await deleteEventBestEffort(created.id)
        } else if (eventPayload?.id) {
          // We generated a client UUID (when photo existed), so deletion by ID is safest.
          await deleteEventBestEffort(eventPayload.id)
        } else if (eventPayload?.date) {
          try {
            const dateKey = String(eventPayload.date).slice(0, 10)
            const { data: rows } = await supabase
              .from('events')
              .select(
                'id, user_id, title, type, date, time, location, city, address, lat, lng, description, tags, host, photo_url, featured, created_at, event_attendees(count)',
              )
              .eq('date', dateKey)
              .eq('user_id', user.id)
              .limit(80)

            const match = (rows || []).find((r) => eventsLikelyDuplicatePair(r, eventPayload))
            if (match?.id) await deleteEventBestEffort(match.id)
          } catch {}
        }
      }
    } finally {
      setLoading(false)
      submitGuardRef.current = false
    }
  }

  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={sheetStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 22,
          }}
        >
          <div
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 26,
              letterSpacing: 2,
              color: '#FF6B35',
            }}
          >
            POST A MEET
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: closeColor,
              fontSize: 26,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        {prefillBanner && (
          <div
            style={{
              background: isLight ? '#E8F5E9' : '#0F1F12',
              border: `1px solid ${isLight ? '#B8D4B8' : '#2A3F2C'}`,
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 14,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              color: isLight ? '#1B5E20' : '#7CFF6B',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <span>
              Restored from your last post for this multi-date flyer (saved a few days if you close
              the tab). The next date is selected when more than one remains. Add a photo again if
              you want one on the listing.
            </span>
            <button
              type="button"
              onClick={() => setPrefillBanner(false)}
              style={{
                background: 'none',
                border: 'none',
                color: isLight ? '#2E7D32' : '#7CFF6B',
                fontSize: 18,
                lineHeight: 1,
                cursor: 'pointer',
                flexShrink: 0,
              }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {/* FLYER IMPORT BUTTON */}
        <div
          onClick={() => flyerRef.current.click()}
          style={{
            border: scanning ? '2px solid #FF6B35' : '2px dashed #FF6B3555',
            borderRadius: 12,
            padding: '14px',
            marginBottom: 18,
            cursor: scanning ? 'default' : 'pointer',
            background: flyerSuccess
              ? isLight
                ? '#ECFFF2'
                : '#0A1A0A'
              : isLight
                ? '#FFFFFF'
                : '#0F0F0F',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            transition: 'all 0.2s',
          }}
        >
          <div style={{ fontSize: 28 }}>{scanning ? '⏳' : flyerSuccess ? '✅' : '📸'}</div>
          <div>
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 16,
                letterSpacing: 1.5,
                color: flyerSuccess ? '#7CFF6B' : '#FF6B35',
              }}
            >
              {scanning
                ? 'READING FLYER...'
                : flyerSuccess
                  ? 'FLYER IMPORTED!'
                  : 'IMPORT FROM FLYER'}
            </div>
            <div
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11,
                color: geocodeText,
                marginTop: 2,
              }}
            >
              {scanning
                ? 'AI is extracting event details...'
                : flyerSuccess
                  ? 'Review the details below and edit if needed'
                  : 'Upload a flyer and AI will fill in the details'}
            </div>
          </div>
          {scanning && (
            <div
              style={{
                marginLeft: 'auto',
                width: 18,
                height: 18,
                border: '2px solid #FF6B35',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
          )}
        </div>
        <input
          ref={flyerRef}
          type="file"
          accept="image/*"
          onChange={handleFlyerUpload}
          style={{ display: 'none' }}
        />

        {error && <div style={errorStyle}>{error}</div>}

        {/* Photo upload */}
        <label style={labelStyle}>Event Photo</label>
        <div
          onClick={() => fileRef.current.click()}
          style={{
            border: `2px dashed ${photoBorder}`,
            borderRadius: 10,
            marginBottom: 14,
            height: photoPreview ? 180 : 90,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            background: photoBg,
          }}
        >
          {photoPreview ? (
            <img
              src={photoPreview}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              alt="preview"
            />
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 4 }}>📸</div>
              <div
                style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: geocodeText }}
              >
                Tap to add a photo
              </div>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handlePhoto}
          style={{ display: 'none' }}
        />

        <label style={labelStyle}>Event Type</label>
        <select style={selectStyle} value={form.type} onChange={(e) => set('type', e.target.value)}>
          <option value="meet">Meet</option>
          <option value="car show">Car Show</option>
          <option value="track day">Track Day</option>
          <option value="cruise">Cruise</option>
        </select>

        <label style={labelStyle}>Event Name *</label>
        <input
          style={{
            ...inputStyle,
            borderColor: missingFields.includes('title') ? '#FF6060' : inputStyle.border,
          }}
          placeholder="Sunday Funday Car Meet"
          value={form.title}
          onChange={(e) => {
            set('title', e.target.value)
            if (missingFields.includes('title'))
              setMissingFields((prev) => prev.filter((k) => k !== 'title'))
          }}
        />

        <label style={labelStyle}>Street Address (for map pin)</label>
        <input
          style={{
            ...inputStyle,
            marginBottom: 4,
            borderColor: addressStatus === 'found' ? '#FF6B3580' : photoBorder,
          }}
          placeholder="123 Main St, Riverside, CA 92501"
          value={form.address}
          onChange={(e) => {
            set('address', e.target.value)
            setAddressStatus('')
            setCoords(null)
          }}
          onBlur={handleAddressBlur}
        />
        <div
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11,
            marginBottom: 12,
            minHeight: 16,
          }}
        >
          {geocoding && <span style={{ color: geocodeText }}>🔍 Looking up address...</span>}
          {!geocoding && addressStatus === 'found' && (
            <span style={{ color: '#FF6B35' }}>✓ Address found — pin will appear on map</span>
          )}
          {!geocoding && addressStatus === 'notfound' && (
            <span style={{ color: '#FF9944' }}>
              ⚠️ Address not found — try adding city and state
            </span>
          )}
          {!geocoding && addressStatus === 'error' && (
            <span style={{ color: '#FF9944' }}>
              ⚠️ Couldn’t verify address on the map (connection issue). Tap the address field and
              tap away to retry.
            </span>
          )}
        </div>

        <label style={labelStyle}>Venue / Spot Name (optional)</label>
        <input
          style={{
            ...inputStyle,
            borderColor: missingFields.includes('location') ? '#FF6060' : inputStyle.border,
          }}
          placeholder="Walmart East Lot, AutoZone Parking"
          value={form.location}
          onChange={(e) => {
            set('location', e.target.value)
            if (missingFields.includes('location'))
              setMissingFields((prev) => prev.filter((k) => k !== 'location'))
          }}
        />

        <label style={labelStyle}>City, State *</label>
        <input
          style={{
            ...inputStyle,
            borderColor: missingFields.includes('city') ? '#FF6060' : inputStyle.border,
          }}
          placeholder="Riverside, CA"
          value={form.city}
          onChange={(e) => {
            set('city', e.target.value)
            if (missingFields.includes('city'))
              setMissingFields((prev) => prev.filter((k) => k !== 'city'))
          }}
        />

        <label style={labelStyle}>Hosted By</label>
        <input
          style={inputStyle}
          placeholder="Your crew / org name"
          value={form.host}
          onChange={(e) => set('host', e.target.value)}
        />

        <label style={labelStyle}>Tags (comma separated)</label>
        <input
          style={inputStyle}
          placeholder="JDM, Stance, All Welcome"
          value={form.tags}
          onChange={(e) => set('tags', e.target.value)}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Date *</label>
            <input
              style={{
                ...inputStyle,
                borderColor: missingFields.includes('date') ? '#FF6060' : inputStyle.border,
              }}
              type="date"
              value={form.date}
              onChange={(e) => {
                set('date', e.target.value)
                if (missingFields.includes('date'))
                  setMissingFields((prev) => prev.filter((k) => k !== 'date'))
              }}
            />
          </div>
          <div>
            <label style={labelStyle}>Time</label>
            <input
              style={inputStyle}
              type="time"
              value={form.time}
              onChange={(e) => set('time', e.target.value)}
            />
          </div>
        </div>

        {flyerDates.length > 1 && (
          <div style={{ marginTop: -6, marginBottom: 14 }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>Dates on flyer</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {flyerDates.map((d) => {
                const active = form.date === d
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      set('date', d)
                      if (missingFields.includes('date'))
                        setMissingFields((prev) => prev.filter((k) => k !== 'date'))
                    }}
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 13,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: `1px solid ${active ? '#FF6B35' : isLight ? '#E5E5E5' : '#333'}`,
                      background: active
                        ? isLight
                          ? '#FFF4EF'
                          : '#2A1810'
                        : isLight
                          ? '#FFFFFF'
                          : '#141414',
                      color: isLight ? '#111' : '#F0F0F0',
                      cursor: 'pointer',
                    }}
                  >
                    {formatIsoDateLabel(d)}
                  </button>
                )
              })}
            </div>
            <div
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11,
                color: geocodeText,
                marginTop: 8,
                lineHeight: 1.4,
              }}
            >
              Tap a date for this listing (one date per post). After you post, use &quot;Next flyer
              date&quot; to jump to another day with the same details, then post again.
            </div>
            <button
              type="button"
              onClick={() => {
                const idx = flyerDates.indexOf(form.date)
                const next = idx >= 0 ? flyerDates[(idx + 1) % flyerDates.length] : flyerDates[0]
                set('date', next)
                if (missingFields.includes('date'))
                  setMissingFields((prev) => prev.filter((k) => k !== 'date'))
              }}
              style={{
                marginTop: 10,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                padding: '10px 14px',
                borderRadius: 8,
                border: `1px solid ${isLight ? '#E5E5E5' : '#333'}`,
                background: isLight ? '#FFFFFF' : '#1A1A1A',
                color: isLight ? '#111' : '#F0F0F0',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              Next flyer date →
            </button>
          </div>
        )}

        <label style={labelStyle}>Details</label>
        <textarea
          placeholder="What's the vibe? Rules, food trucks, special guests..."
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: 'none', marginBottom: 20 }}
        />

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || scanning}
          style={{
            width: '100%',
            background: loading || scanning ? (isLight ? '#E5E5E5' : '#333') : '#FF6B35',
            color: loading || scanning ? (isLight ? '#666' : '#666') : '#0A0A0A',
            border: 'none',
            borderRadius: 10,
            padding: 14,
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 20,
            letterSpacing: 2,
            cursor: loading || scanning ? 'default' : 'pointer',
          }}
        >
          {loading ? 'POSTING...' : scanning ? 'READING FLYER...' : 'DROP THE PIN 📍'}
        </button>
      </div>
    </div>
  )
}
