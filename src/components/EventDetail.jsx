import { useState, useEffect, useRef } from 'react'
import {
  fetchComments,
  postComment,
  getEventRsvpStatus,
  setEventRsvp,
  toggleAttendance,
  getAttendanceStatus,
  fetchEventAttendeeCount,
  updateEvent,
  uploadEventPhoto,
  supabase,
  createEventUpdate,
  fetchEventUpdates,
} from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useTheme } from '../lib/ThemeContext'
import { getEventQuality } from '../lib/eventQuality'
import { formatEventTime } from '../lib/formatEventTime'
import { getAppOrigin } from '../lib/apiOrigin'
import { geocodeAddress } from '../lib/geocode'
import { makeClientUuid } from '../lib/clientUuid'
import { userMessageForPostSubmitError } from '../lib/postErrorMessages'
import ReportEventModal from './ReportEventModal'

const TYPE_COLORS = {
  meet: '#FF6B35',
  'car show': '#FFD700',
  'track day': '#00D4FF',
  cruise: '#7CFF6B',
}
const STATUS_META = {
  active: { label: 'Active', fg: '#7CFF6B', bg: '#7CFF6B22' },
  moved: { label: 'Moved', fg: '#00D4FF', bg: '#00D4FF22' },
  delayed: { label: 'Delayed', fg: '#FFD700', bg: '#FFD70022' },
  canceled: { label: 'Canceled', fg: '#FF6060', bg: '#FF353522' },
}
const getDirectionsUrl = (event) => {
  const query = (event?.address || `${event?.location || ''}, ${event?.city || ''}`).trim()
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

const formatRelativeTime = (value) => {
  const ms = value ? new Date(value).getTime() : NaN
  if (!Number.isFinite(ms)) return ''
  const diffSec = Math.round((ms - Date.now()) / 1000)
  const abs = Math.abs(diffSec)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (abs < 60) return rtf.format(diffSec, 'second')
  const diffMin = Math.round(diffSec / 60)
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute')
  const diffHr = Math.round(diffMin / 60)
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, 'hour')
  const diffDay = Math.round(diffHr / 24)
  if (Math.abs(diffDay) < 7) return rtf.format(diffDay, 'day')
  const diffWeek = Math.round(diffDay / 7)
  if (Math.abs(diffWeek) < 5) return rtf.format(diffWeek, 'week')
  const diffMonth = Math.round(diffDay / 30)
  if (Math.abs(diffMonth) < 12) return rtf.format(diffMonth, 'month')
  const diffYear = Math.round(diffDay / 365)
  return rtf.format(diffYear, 'year')
}

const S = {
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

function EditForm({ event, onSaved, onCancel }) {
  const fileRef = useRef()
  const [form, setForm] = useState({
    title: event.title || '',
    type: event.type || 'meet',
    date: event.date || '',
    time: event.time || '',
    location: event.location || '',
    city: event.city || '',
    address: event.address || '',
    description: event.description || '',
    tags: (event.tags || []).join(', '),
    host: event.host || '',
    status: event.status || 'active',
    status_note: event.status_note || '',
  })
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(event.photo_url || null)
  const [coords, setCoords] = useState(
    event.lat && event.lng ? { lat: event.lat, lng: event.lng } : null,
  )
  const [geocoding, setGeocoding] = useState(false)
  const [addressStatus, setAddressStatus] = useState(event.lat ? 'found' : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }))

  const buildGeocodeQuery = (address, city) => {
    const a = String(address || '').trim()
    const c = String(city || '').trim()
    if (!a) return ''
    if (!c) return a
    if (a.includes(',')) return a
    return `${a}, ${c}`
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

  const handleSave = async () => {
    const required = [
      { key: 'title', label: 'Event Name' },
      { key: 'date', label: 'Date' },
      { key: 'city', label: 'City, State' },
    ]
    const missing = required.filter((f) => !String(form[f.key] || '').trim())
    if (missing.length > 0) {
      setError(`Please complete: ${missing.map((m) => m.label).join(', ')}.`)
      return
    }
    setError('')
    setSaving(true)
    const correlationId = makeClientUuid()
    try {
      let finalCoords = coords
      if (form.address && !finalCoords)
        finalCoords = await geocodeAddress(buildGeocodeQuery(form.address, form.city)).catch(
          () => null,
        )

      const tagsArray = form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const safeLocation = String(form.location || '').trim() || String(form.city || '').trim()
      const updates = {
        title: form.title,
        type: form.type,
        date: form.date,
        time: form.time,
        location: safeLocation,
        city: form.city,
        address: form.address,
        description: form.description,
        tags: tagsArray,
        host: form.host,
        status: form.status,
        status_note: form.status_note,
        lat: finalCoords?.lat || null,
        lng: finalCoords?.lng || null,
      }

      if (photo) {
        try {
          const photoUrl = await uploadEventPhoto(photo, event.id, { correlationId })
          updates.photo_url = photoUrl
        } catch (e) {
          setError(userMessageForPostSubmitError('uploading_photo', e, correlationId))
          return
        }
      }

      const updated = await updateEvent(event.id, updates)
      onSaved(updated)
    } catch (e) {
      setError(userMessageForPostSubmitError('creating_event', e, correlationId))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '20px 20px 40px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 24,
            letterSpacing: 2,
            color: '#FF6B35',
          }}
        >
          EDIT EVENT
        </div>
        <button
          onClick={onCancel}
          style={{
            background: 'none',
            border: 'none',
            color: '#555',
            fontSize: 26,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>

      {error && (
        <div
          style={{
            background: '#1A0A0A',
            border: '1px solid #FF353544',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 14,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            color: '#FF6060',
          }}
        >
          {error}
        </div>
      )}

      {/* Photo */}
      <label style={S.label}>Event Photo</label>
      <div
        onClick={() => fileRef.current.click()}
        style={{
          border: '2px dashed #222',
          borderRadius: 10,
          marginBottom: 14,
          height: photoPreview ? 160 : 80,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          background: '#111',
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
            <div style={{ fontSize: 24 }}>📸</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#555' }}>
              Tap to change photo
            </div>
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files[0]
          if (f) {
            setPhoto(f)
            setPhotoPreview(URL.createObjectURL(f))
          }
        }}
        style={{ display: 'none' }}
      />

      <label style={S.label}>Event Type</label>
      <select style={S.select} value={form.type} onChange={(e) => set('type', e.target.value)}>
        <option value="meet">Meet</option>
        <option value="car show">Car Show</option>
        <option value="track day">Track Day</option>
        <option value="cruise">Cruise</option>
      </select>

      <label style={S.label}>Event Name *</label>
      <input
        style={S.input}
        value={form.title}
        onChange={(e) => set('title', e.target.value)}
        placeholder="Sunday Funday Car Meet"
      />

      <label style={S.label}>Street Address</label>
      <input
        style={{
          ...S.input,
          marginBottom: 4,
          borderColor: addressStatus === 'found' ? '#FF6B3580' : '#222',
        }}
        value={form.address}
        onChange={(e) => {
          set('address', e.target.value)
          setAddressStatus('')
          setCoords(null)
        }}
        onBlur={handleAddressBlur}
        placeholder="123 Main St, Riverside, CA"
      />
      <div
        style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 12, height: 16 }}
      >
        {geocoding && <span style={{ color: '#555' }}>🔍 Looking up address...</span>}
        {!geocoding && addressStatus === 'found' && (
          <span style={{ color: '#FF6B35' }}>✓ Address found</span>
        )}
        {!geocoding && addressStatus === 'notfound' && (
          <span style={{ color: '#FF9944' }}>⚠️ Address not found</span>
        )}
      </div>

      <label style={S.label}>Venue / Spot Name (optional)</label>
      <input
        style={S.input}
        value={form.location}
        onChange={(e) => set('location', e.target.value)}
        placeholder="Walmart East Lot"
      />

      <label style={S.label}>City, State *</label>
      <input
        style={S.input}
        value={form.city}
        onChange={(e) => set('city', e.target.value)}
        placeholder="Riverside, CA"
      />

      <label style={S.label}>Hosted By</label>
      <input
        style={S.input}
        value={form.host}
        onChange={(e) => set('host', e.target.value)}
        placeholder="Your crew / org name"
      />

      <label style={S.label}>Tags (comma separated)</label>
      <input
        style={S.input}
        value={form.tags}
        onChange={(e) => set('tags', e.target.value)}
        placeholder="JDM, Stance, All Welcome"
      />

      <label style={S.label}>Event Status</label>
      <select style={S.select} value={form.status} onChange={(e) => set('status', e.target.value)}>
        <option value="active">Active</option>
        <option value="moved">Moved</option>
        <option value="delayed">Delayed</option>
        <option value="canceled">Canceled</option>
      </select>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={S.label}>Date *</label>
          <input
            style={S.input}
            type="date"
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
          />
        </div>
        <div>
          <label style={S.label}>Time</label>
          <input
            style={S.input}
            type="time"
            value={form.time}
            onChange={(e) => set('time', e.target.value)}
          />
        </div>
      </div>

      <label style={S.label}>Details</label>
      <textarea
        value={form.description}
        onChange={(e) => set('description', e.target.value)}
        rows={3}
        placeholder="What's the vibe?"
        style={{ ...S.input, resize: 'none', marginBottom: 20 }}
      />

      <label style={S.label}>Status Note</label>
      <input
        style={S.input}
        value={form.status_note}
        onChange={(e) => set('status_note', e.target.value)}
        placeholder="Optional: New address or timing update"
      />

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1,
            background: 'transparent',
            color: '#666',
            border: '1px solid #222',
            borderRadius: 10,
            padding: 14,
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 18,
            cursor: 'pointer',
          }}
        >
          CANCEL
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 2,
            background: saving ? '#333' : '#FF6B35',
            color: saving ? '#666' : '#0A0A0A',
            border: 'none',
            borderRadius: 10,
            padding: 14,
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 18,
            letterSpacing: 1.5,
            cursor: saving ? 'default' : 'pointer',
          }}
        >
          {saving ? 'SAVING...' : 'SAVE CHANGES'}
        </button>
      </div>
    </div>
  )
}

export default function EventDetail({
  event: initialEvent,
  saved = false,
  onToggleSaved,
  onClose,
  onAuthNeeded,
  onDeleted,
  onUpdated,
}) {
  const { user } = useAuth()
  const { isLight } = useTheme()
  const [event, setEvent] = useState(initialEvent)
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [showAllComments, setShowAllComments] = useState(false)
  const [rsvpStatus, setRsvpStatus] = useState(null)
  const [interestedCount, setInterestedCount] = useState(initialEvent.interested_count || 0)
  const [goingCount, setGoingCount] = useState(initialEvent.attendee_count || 0)
  const [isGoing, setIsGoing] = useState(false)
  const [posting, setPosting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [updates, setUpdates] = useState([])
  const [updatesLoaded, setUpdatesLoaded] = useState(false)
  const [showUpdateComposer, setShowUpdateComposer] = useState(false)
  const [updateMessage, setUpdateMessage] = useState('')
  const [updateError, setUpdateError] = useState('')
  const [postingUpdate, setPostingUpdate] = useState(false)
  const [toast, setToast] = useState('')
  const [showReport, setShowReport] = useState(false)
  const bottomRef = useRef()

  const color = TYPE_COLORS[event.type] || '#FF6B35'
  const statusKey = ['active', 'moved', 'delayed', 'canceled'].includes(
    String(event.status || '').toLowerCase(),
  )
    ? String(event.status).toLowerCase()
    : 'active'
  const statusMeta = STATUS_META[statusKey]
  const quality = getEventQuality(event)
  const directionsUrl = getDirectionsUrl(event)
  const isOwner = user && event.user_id === user.id

  useEffect(() => {
    fetchComments(event.id).then(setComments).catch(console.error)
    if (user) {
      getEventRsvpStatus(event.id, user.id).then(setRsvpStatus)
      getAttendanceStatus(event.id, user.id)
        .then(setIsGoing)
        .catch(() => setIsGoing(false))
    }
    fetchEventAttendeeCount(event.id)
      .then(setGoingCount)
      .catch(() => {})
  }, [event.id, user])

  useEffect(() => {
    let cancelled = false
    setUpdatesLoaded(false)
    fetchEventUpdates(event.id)
      .then((rows) => {
        if (cancelled) return
        setUpdates(Array.isArray(rows) ? rows : [])
        setUpdatesLoaded(true)
      })
      .catch((e) => {
        if (cancelled) return
        console.warn('Failed to load event updates:', e)
        setUpdates([])
        setUpdatesLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [event.id])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const handleToggleGoing = async () => {
    if (!user) return onAuthNeeded()
    try {
      const next = await toggleAttendance(event.id, user.id)
      setIsGoing(next)
      const nextCount = await fetchEventAttendeeCount(event.id).catch(() => null)
      if (typeof nextCount === 'number') setGoingCount(nextCount)
    } catch (e) {
      console.error(e)
    }
  }

  const handleSetInterested = async () => {
    if (!user) return onAuthNeeded()
    const current = rsvpStatus === 'interested'
    const desired = current ? null : 'interested'
    try {
      await setEventRsvp(event.id, user.id, desired)
      setRsvpStatus(desired)
      setInterestedCount((prev) => (current ? Math.max(0, prev - 1) : prev + 1))
    } catch (e) {
      console.error(e)
    }
  }

  const handleComment = async () => {
    if (!user) return onAuthNeeded()
    const text = commentText.trim()
    if (!text) return
    setPosting(true)
    const optimisticId = `optimistic-${makeClientUuid()}`
    const optimistic = {
      id: optimisticId,
      event_id: event.id,
      user_id: user.id,
      text,
      created_at: new Date().toISOString(),
      profiles: {
        username: user?.user_metadata?.username || user?.email || 'You',
        avatar_url: null,
      },
    }
    setComments((prev) => [...prev, optimistic])
    setCommentText('')
    try {
      const comment = await postComment(event.id, user.id, text)
      setComments((prev) => prev.map((c) => (c.id === optimisticId ? comment : c)))
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (e) {
      console.error(e)
      setComments((prev) => prev.filter((c) => c.id !== optimisticId))
    } finally {
      setPosting(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await supabase.from('events').delete().eq('id', event.id)
      onDeleted(event.id)
      onClose()
    } catch (e) {
      console.error(e)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const handleShare = async () => {
    let shareBase = getAppOrigin()
    if (!shareBase) {
      try {
        shareBase = window.location.origin
      } catch {
        shareBase = 'https://findcarmeets.com'
      }
    }
    const normalized = String(shareBase).replace(/\/$/, '')
    const url = `${normalized}/?event=${event.id}`
    try {
      if (navigator.share) {
        await navigator.share({
          title: event.title || 'Meet Map event',
          text: event.title || 'Check out this event on Meet Map',
          url,
        })
      } else {
        await navigator.clipboard.writeText(url)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      const el = document.createElement('textarea')
      el.value = url
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const handlePostUpdate = async () => {
    const message = updateMessage.trim()
    if (!message) return
    if (!user) return onAuthNeeded()
    setPostingUpdate(true)
    setUpdateError('')
    try {
      const row = await createEventUpdate(event.id, user.id, message)
      setUpdates((prev) => [row, ...(Array.isArray(prev) ? prev : [])])
      const updatedEvent = {
        ...event,
        latest_update_id: row.id,
        latest_update_message: row.message,
        latest_update_created_at: row.created_at,
      }
      setEvent(updatedEvent)
      onUpdated?.(updatedEvent)
      setUpdateMessage('')
      setShowUpdateComposer(false)
      setToast('Update posted')
    } catch (e) {
      setUpdateError(e.message || 'Failed to post update')
    } finally {
      setPostingUpdate(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const isPast = event.date < today

  const overlayBg = isLight ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.92)'
  const panelBg = isLight ? '#FFFFFF' : '#0F0F0F'
  const panelBorder = isLight ? '#E5E5E5' : '#1A1A1A'
  const dividerBg = isLight ? '#E5E5E5' : '#1A1A1A'
  const closeBg = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.6)'
  const closeColor = isLight ? '#333' : '#fff'
  const muted = isLight ? '#666' : '#888'
  const muted2 = isLight ? '#777' : '#555'
  const inputBg = isLight ? '#FFFFFF' : '#141414'
  const inputBorder = isLight ? '#E5E5E5' : '#222'
  const commentsText = isLight ? '#666' : '#888'
  const shareBg = isLight ? '#F2F2F2' : '#141414'
  const shareBorder = isLight ? '#E5E5E5' : '#222'
  const shareText = isLight ? '#666' : '#888'

  if (editing) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: overlayBg,
          zIndex: 700,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 480,
            background: panelBg,
            borderRadius: '20px 20px 0 0',
            border: `1px solid ${panelBorder}`,
            maxHeight: '92vh',
            overflowY: 'auto',
          }}
        >
          <EditForm
            event={event}
            onSaved={(updated) => {
              setEvent(updated)
              setEditing(false)
              onUpdated?.(updated)
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: overlayBg,
        zIndex: 700,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: panelBg,
          borderRadius: '20px 20px 0 0',
          border: `1px solid ${panelBorder}`,
          maxHeight: '92vh',
          overflowY: 'auto',
          animation: 'slideUp 0.3s ease',
        }}
      >
        {/* Hero image or color band */}
        {event.photo_url ? (
          <div
            style={{
              position: 'relative',
              height: 320,
              background: isLight ? '#F2F2F2' : '#0B0B0B',
            }}
          >
            <img
              src={event.photo_url}
              loading="lazy"
              decoding="async"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                background: isLight ? '#F2F2F2' : '#0B0B0B',
              }}
              alt={event.title}
            />
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                background: closeBg,
                border: 'none',
                color: closeColor,
                fontSize: 22,
                width: 36,
                height: 36,
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
        ) : (
          <div style={{ height: 8, background: color, borderRadius: '20px 20px 0 0' }} />
        )}

        <div style={{ padding: '20px 20px 0' }}>
          {!event.photo_url && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#555',
                  fontSize: 26,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>
          )}

          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              background: color + '22',
              color,
              padding: '3px 10px',
              borderRadius: 20,
              textTransform: 'capitalize',
              letterSpacing: 0.5,
            }}
          >
            {event.type}
          </span>
          {statusKey !== 'active' && (
            <span
              style={{
                marginLeft: 8,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11,
                fontWeight: 700,
                color: statusMeta.fg,
                background: statusMeta.bg,
                padding: '3px 10px',
                borderRadius: 20,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {statusMeta.label}
            </span>
          )}
          {quality && (
            <span
              style={{
                marginLeft: 8,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11,
                fontWeight: 700,
                color: quality.fg,
                background: quality.bg,
                padding: '3px 10px',
                borderRadius: 20,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
              title={`${quality.label} (${quality.score}/100)`}
            >
              {quality.short}
            </span>
          )}

          <h2
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 30,
              letterSpacing: 1.5,
              marginTop: 10,
              marginBottom: 4,
              lineHeight: 1.1,
            }}
          >
            {event.title}
          </h2>
          {statusKey !== 'active' && (
            <div
              style={{
                marginBottom: 10,
                border: `1px solid ${statusMeta.fg}66`,
                background: statusMeta.bg,
                color: statusMeta.fg,
                borderRadius: 8,
                padding: '8px 10px',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {statusMeta.label}
              {event.status_note ? `: ${event.status_note}` : ''}
            </div>
          )}

          <div
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              color: muted,
              marginBottom: 6,
            }}
          >
            📍 {event.address || `${event.location} · ${event.city}`}
          </div>
          <div
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              color: muted,
              marginBottom: 6,
            }}
          >
            <span style={{ color }}> 📅 {event.date}</span>
            {event.time && <span> · ⏰ {formatEventTime(event.time)}</span>}
          </div>
          {event.host && (
            <div
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                color: muted2,
                marginBottom: 10,
              }}
            >
              🎤 Hosted by <span style={{ color: isLight ? '#888' : '#aaa' }}>{event.host}</span>
            </div>
          )}

          {event.tags?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              {event.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    display: 'inline-block',
                    padding: '3px 10px',
                    borderRadius: 20,
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 11,
                    fontWeight: 600,
                    border: `1px solid ${color}44`,
                    color,
                    background: color + '0D',
                    margin: '2px',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {event.description && (
            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                color: commentsText,
                lineHeight: 1.6,
                marginBottom: 16,
              }}
            >
              {event.description}
            </p>
          )}

          {/* Lightweight comment prompt */}
          <div style={{ marginBottom: 14 }}>
            {user ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  placeholder="Leave a note for other attendees…"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleComment()}
                  style={{
                    flex: 1,
                    background: inputBg,
                    border: `1px solid ${inputBorder}`,
                    borderRadius: 10,
                    padding: '12px 13px',
                    color: isLight ? '#222' : '#F0F0F0',
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleComment}
                  disabled={posting || !commentText.trim()}
                  style={{
                    background: posting || !commentText.trim() ? shareBg : color,
                    color: posting || !commentText.trim() ? shareText : '#0A0A0A',
                    border: `1px solid ${posting || !commentText.trim() ? shareBorder : color}`,
                    borderRadius: 10,
                    padding: '0 16px',
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 16,
                    cursor: posting || !commentText.trim() ? 'default' : 'pointer',
                    letterSpacing: 1.2,
                  }}
                >
                  {posting ? '...' : 'SEND'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={onAuthNeeded}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    color: isLight ? '#D1491A' : '#FF8A5C',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    textUnderlineOffset: 3,
                  }}
                >
                  Sign in to comment
                </button>
              </div>
            )}
          </div>

          {updatesLoaded && updates.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 18,
                  letterSpacing: 2,
                  color: '#555',
                  marginBottom: 10,
                }}
              >
                UPDATES
              </div>
              {updates.map((u) => (
                <div
                  key={u.id}
                  style={{
                    border: `1px solid ${isLight ? '#E5E5E5' : '#1A1A1A'}`,
                    background: isLight ? '#FFFFFF' : '#101010',
                    borderRadius: 10,
                    padding: '10px 12px',
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 13,
                      color: isLight ? '#444' : '#D8D8D8',
                      lineHeight: 1.45,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {u.message}
                  </div>
                  <div
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 11,
                      color: muted,
                      marginTop: 6,
                    }}
                  >
                    {formatRelativeTime(u.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Report button */}
          {!isOwner && (
            <div style={{ marginBottom: 10 }}>
              <button
                onClick={() => {
                  if (!user) return onAuthNeeded()
                  setShowReport(true)
                }}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: `1px solid ${shareBorder}`,
                  borderRadius: 10,
                  padding: '12px 12px',
                  fontFamily: "'Bebas Neue'",
                  fontSize: 16,
                  letterSpacing: 1.2,
                  cursor: 'pointer',
                  color: isLight ? '#444' : '#aaa',
                }}
              >
                🚩 REPORT EVENT
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            {!isPast && (
              <>
                <button
                  onClick={handleToggleGoing}
                  style={{
                    flex: 1.4,
                    background: color,
                    color: '#0A0A0A',
                    border: `1px solid ${color}`,
                    borderRadius: 10,
                    padding: '12px',
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 16,
                    letterSpacing: 1.2,
                    cursor: 'pointer',
                  }}
                >
                  {isGoing ? `✓ You're going · ${goingCount} going` : `GOING · ${goingCount} going`}
                </button>
                <button
                  onClick={handleSetInterested}
                  style={{
                    flex: 1.2,
                    background: rsvpStatus === 'interested' ? '#261D08' : shareBg,
                    color: rsvpStatus === 'interested' ? '#FFD700' : shareText,
                    border: `1px solid ${rsvpStatus === 'interested' ? '#FFD700' : shareBorder}`,
                    borderRadius: 10,
                    padding: '12px',
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 15,
                    letterSpacing: 1,
                    cursor: 'pointer',
                  }}
                >
                  {rsvpStatus === 'interested'
                    ? `★ INTERESTED · ${interestedCount}`
                    : `INTERESTED · ${interestedCount}`}
                </button>
              </>
            )}
            <button
              onClick={onToggleSaved}
              style={{
                flex: 1,
                background: saved ? '#26140E' : shareBg,
                color: saved ? '#FF8A5C' : shareText,
                border: `1px solid ${saved ? '#FF6B35' : shareBorder}`,
                borderRadius: 10,
                padding: '12px',
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 16,
                letterSpacing: 1,
                cursor: 'pointer',
              }}
            >
              {saved ? '★ SAVED' : '☆ SAVE'}
            </button>
            <button
              onClick={handleShare}
              style={{
                flex: 1,
                background: shareBg,
                color: copied ? '#7CFF6B' : shareText,
                border: `1px solid ${shareBorder}`,
                borderRadius: 10,
                padding: '12px',
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 16,
                letterSpacing: 1,
                cursor: 'pointer',
              }}
            >
              {copied ? '✓ COPIED!' : '🔗 SHARE'}
            </button>
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                background: shareBg,
                color: isLight ? '#D1491A' : '#FF8A5C',
                border: `1px solid ${shareBorder}`,
                borderRadius: 10,
                padding: '12px',
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 16,
                letterSpacing: 1,
                textDecoration: 'none',
                textAlign: 'center',
              }}
            >
              📍 DIRECTIONS
            </a>
          </div>

          {/* Owner controls: Edit + Delete */}
          {isOwner && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => {
                    setUpdateError('')
                    setShowUpdateComposer(true)
                  }}
                  style={{
                    flex: 1,
                    background: isLight ? '#FFF3ED' : '#1A110D',
                    color: isLight ? '#D1491A' : '#FF8A5C',
                    border: `1px solid ${isLight ? '#F0C3B3' : '#3A241C'}`,
                    borderRadius: 10,
                    padding: '10px',
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 15,
                    letterSpacing: 1,
                    cursor: 'pointer',
                  }}
                >
                  📣 POST UPDATE
                </button>
                <button
                  onClick={() => setEditing(true)}
                  style={{
                    flex: 1,
                    background: '#141414',
                    color: '#888',
                    border: '1px solid #222',
                    borderRadius: 10,
                    padding: '10px',
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 15,
                    letterSpacing: 1,
                    cursor: 'pointer',
                  }}
                >
                  ✏️ EDIT
                </button>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      color: '#555',
                      border: '1px solid #1A1A1A',
                      borderRadius: 10,
                      padding: '10px',
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 15,
                      letterSpacing: 1,
                      cursor: 'pointer',
                    }}
                  >
                    🗑 DELETE
                  </button>
                ) : (
                  <div
                    style={{
                      flex: 1,
                      background: '#1A0A0A',
                      border: '1px solid #FF353544',
                      borderRadius: 10,
                      padding: '10px',
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 12,
                        color: '#FF6060',
                      }}
                    >
                      Sure?
                    </span>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      style={{
                        background: '#222',
                        color: '#888',
                        border: 'none',
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      NO
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      style={{
                        background: '#FF3535',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      {deleting ? '...' : 'YES'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: dividerBg }} />

        {/* Comments */}
        <div style={{ padding: '16px 20px 24px' }}>
          <div
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 18,
              letterSpacing: 2,
              color: '#555',
              marginBottom: 16,
            }}
          >
            COMMENTS {comments.length > 0 && <span style={{ color }}>{comments.length}</span>}
          </div>

          {(showAllComments ? comments : comments.slice(Math.max(0, comments.length - 3))).map(
            (c) => (
              <div key={c.id} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: color + '33',
                      border: `1px solid ${color}44`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 14,
                      color,
                    }}
                  >
                    {(c.profiles?.username || 'U')[0].toUpperCase()}
                  </div>
                  <span
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#aaa',
                    }}
                  >
                    {c.profiles?.username || 'Anonymous'}
                  </span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: muted }}>
                    {formatRelativeTime(c.created_at)}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    color: commentsText,
                    paddingLeft: 36,
                    lineHeight: 1.5,
                  }}
                >
                  {c.text}
                </div>
              </div>
            ),
          )}
          <div ref={bottomRef} />

          {!showAllComments && comments.length >= 3 && (
            <button
              onClick={() => setShowAllComments(true)}
              style={{
                width: '100%',
                marginTop: 12,
                background: 'transparent',
                border: `1px solid ${shareBorder}`,
                borderRadius: 10,
                padding: '10px 12px',
                fontFamily: "'Bebas Neue'",
                fontSize: 15,
                letterSpacing: 1.1,
                cursor: 'pointer',
                color: isLight ? '#444' : '#aaa',
              }}
            >
              Show all {comments.length} comments
            </button>
          )}
        </div>
      </div>
      {showReport && (
        <ReportEventModal
          event={event}
          user={user}
          onAuthNeeded={onAuthNeeded}
          onClose={() => setShowReport(false)}
        />
      )}

      {showUpdateComposer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: overlayBg,
            zIndex: 900,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              background: panelBg,
              borderRadius: '20px 20px 0 0',
              border: `1px solid ${panelBorder}`,
              maxHeight: '86vh',
              overflowY: 'auto',
              padding: 18,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 22,
                  letterSpacing: 2,
                  color: '#FF6B35',
                }}
              >
                POST UPDATE
              </div>
              <button
                onClick={() => {
                  setShowUpdateComposer(false)
                  setUpdateError('')
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: muted,
                  fontSize: 26,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: muted }}>
                Max 280 characters
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: muted }}>
                {280 - String(updateMessage || '').length}
              </div>
            </div>

            <textarea
              value={updateMessage}
              onChange={(e) => setUpdateMessage(e.target.value.slice(0, 280))}
              rows={4}
              placeholder="Type an update for attendees..."
              style={{
                ...S.input,
                background: inputBg,
                border: `1px solid ${inputBorder}`,
                color: isLight ? '#222' : '#F0F0F0',
                resize: 'none',
              }}
            />

            {updateError && (
              <div
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  color: '#FF7A7A',
                  marginBottom: 12,
                }}
              >
                {updateError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => {
                  setShowUpdateComposer(false)
                  setUpdateError('')
                }}
                style={{
                  flex: 1,
                  background: 'transparent',
                  color: muted,
                  border: `1px solid ${inputBorder}`,
                  borderRadius: 10,
                  padding: 12,
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 16,
                  letterSpacing: 1.2,
                  cursor: 'pointer',
                }}
              >
                CANCEL
              </button>
              <button
                onClick={handlePostUpdate}
                disabled={postingUpdate || !updateMessage.trim()}
                style={{
                  flex: 2,
                  background: postingUpdate || !updateMessage.trim() ? '#333' : '#FF6B35',
                  color: postingUpdate || !updateMessage.trim() ? '#666' : '#0A0A0A',
                  border: 'none',
                  borderRadius: 10,
                  padding: 12,
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 16,
                  letterSpacing: 1.4,
                  cursor: postingUpdate || !updateMessage.trim() ? 'default' : 'pointer',
                }}
              >
                {postingUpdate ? 'POSTING...' : 'POST'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 'calc(env(safe-area-inset-bottom) + 22px)',
            transform: 'translateX(-50%)',
            zIndex: 1200,
            background: isLight ? '#111' : '#F2F2F2',
            color: isLight ? '#fff' : '#111',
            borderRadius: 999,
            padding: '10px 14px',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            border: `1px solid ${isLight ? '#222' : '#E5E5E5'}`,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
