import { useState, useEffect, useCallback } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { createEvent, fetchEvents, fetchFlyerImports, createFlyerImport, updateFlyerImportStatus, updateFlyerImport, signOut, uploadFlyerImportImage, fetchSavedEventIds, setSavedEventStatus, upsertSavedEvents } from './lib/supabase'
import { ThemeProvider, useTheme } from './lib/ThemeContext'
import AuthModal from './components/AuthModal'
import PostEventForm from './components/PostEventForm'
import EventDetail from './components/EventDetail'
import EventCard from './components/EventCard'
import MapView from './components/MapView'
import ImportQueueModal from './components/ImportQueueModal'

const parseCsvEnv = (value) =>
  String(value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)

const IMPORT_ADMIN_EMAILS = parseCsvEnv(import.meta.env.VITE_IMPORT_ADMIN_EMAILS).map(v => v.toLowerCase())
const IMPORT_ADMIN_USER_IDS = parseCsvEnv(import.meta.env.VITE_IMPORT_ADMIN_USER_IDS)
const REMINDER_WINDOWS = [
  { id: '24h', leadMs: 24 * 60 * 60 * 1000, windowMs: 60 * 60 * 1000 },
  { id: '2h', leadMs: 2 * 60 * 60 * 1000, windowMs: 20 * 60 * 1000 },
]

const isImportAdminUser = (user) => {
  if (!user) return false
  const email = String(user.email || '').toLowerCase()
  return IMPORT_ADMIN_EMAILS.includes(email) || IMPORT_ADMIN_USER_IDS.includes(user.id)
}
const getSavedEventsStorageKey = (user) => `meetmap:saved-events:${user?.id || 'anon'}`
const getReminderLogStorageKey = (user) => `meetmap:sent-reminders:${user?.id || 'anon'}`

const eventStartMs = (event) => {
  if (!event?.date) return null
  const timePart = event.time && /^\d{2}:\d{2}/.test(event.time) ? event.time : '00:00'
  const dt = new Date(`${event.date}T${timePart}`)
  const ms = dt.getTime()
  return Number.isFinite(ms) ? ms : null
}

function AppInner() {
  const { user, loading: authLoading } = useAuth()
  const { toggleTheme, isLight } = useTheme()
  const canAccessImports = isImportAdminUser(user)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [view, setView] = useState('list')
  const [filterType, setFilterType] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const [showPost, setShowPost] = useState(false)
  const [mapSelected, setMapSelected] = useState(null)
  const [showPast, setShowPast] = useState(false)
  const [showSavedOnly, setShowSavedOnly] = useState(false)
  const [savedEventIds, setSavedEventIds] = useState([])
  const [savedSyncAvailable, setSavedSyncAvailable] = useState(true)
  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'unsupported'
  )

  const [showImportQueue, setShowImportQueue] = useState(false)
  const [imports, setImports] = useState([])
  const [importsLoading, setImportsLoading] = useState(false)
  const [approvingImportId, setApprovingImportId] = useState(null)
  const [importProcessing, setImportProcessing] = useState(false)
  const [importParams, setImportParams] = useState(null) // { sourceUrl, imageUrl }
  const [importError, setImportError] = useState(null)
  const [importUploading, setImportUploading] = useState(false)

  const RADIUS_MILES = 25
  const [nearMeOnly, setNearMeOnly] = useState(false)
  const [nearMeCoords, setNearMeCoords] = useState(null)
  const [nearMeError, setNearMeError] = useState('')

  // Prevent triggering Supabase queries on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 400)
    return () => clearTimeout(t)
  }, [searchQuery])

  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchEvents({ type: filterType, search: debouncedSearchQuery, showPast })
      setEvents(data || [])
    } catch (e) {
      console.error('Failed to load events:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [filterType, debouncedSearchQuery, showPast])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  // Check for shared event link on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const eventId = params.get('event')
    if (eventId && events.length > 0) {
      const found = events.find(e => e.id === eventId)
      if (found) setSelectedEvent(found)
    }
  }, [events])

  const handlePosted = (newEvent) => {
    setEvents(prev => [newEvent, ...prev])
  }

  const handleUpdated = (updatedEvent) => {
    if (!updatedEvent) return
    setEvents(prev => prev.map(e => (e.id === updatedEvent.id ? updatedEvent : e)))
    setSelectedEvent(updatedEvent)
  }

  const handleAuthNeeded = () => {
    setSelectedEvent(null)
    setShowAuth(true)
  }

  useEffect(() => {
    let active = true
    const loadSavedEvents = async () => {
      let localIds = []
      try {
        const raw = window.localStorage.getItem(getSavedEventsStorageKey(user))
        const parsed = raw ? JSON.parse(raw) : []
        localIds = Array.isArray(parsed) ? parsed : []
      } catch {
        localIds = []
      }

      if (!user) {
        if (active) {
          setSavedSyncAvailable(true)
          setSavedEventIds(localIds)
        }
        return
      }

      try {
        const cloudIds = await fetchSavedEventIds(user.id)
        const merged = Array.from(new Set([...localIds, ...cloudIds]))
        if (active) {
          setSavedSyncAvailable(true)
          setSavedEventIds(merged)
        }
        await upsertSavedEvents(user.id, merged)
      } catch (e) {
        console.error('Saved events cloud sync unavailable:', e)
        if (active) {
          setSavedSyncAvailable(false)
          setSavedEventIds(localIds)
        }
      }
    }

    loadSavedEvents()
    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    try {
      window.localStorage.setItem(getSavedEventsStorageKey(user), JSON.stringify(savedEventIds))
    } catch {}
  }, [user, savedEventIds])

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    setNotificationPermission(window.Notification.permission)
  }, [])

  const toRad = (deg) => (deg * Math.PI) / 180
  const distanceMiles = (lat1, lon1, lat2, lon2) => {
    const R = 3958.8 // Earth radius in miles
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  async function geocodeAddress(address) {
    if (!address || !address.trim()) return null
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`)
    const data = await res.json()
    if (!data.length) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  }

  const handleToggleSaved = async (eventId) => {
    if (!eventId) return
    let shouldSave = false
    setSavedEventIds(prev => {
      const exists = prev.includes(eventId)
      shouldSave = !exists
      return exists ? prev.filter(id => id !== eventId) : [eventId, ...prev]
    })

    if (user && savedSyncAvailable) {
      try {
        await setSavedEventStatus(user.id, eventId, shouldSave)
      } catch (e) {
        console.error('Failed to sync saved event:', e)
        setSavedSyncAvailable(false)
      }
    }
  }

  const handleEnableNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    try {
      const permission = await window.Notification.requestPermission()
      setNotificationPermission(permission)
    } catch (e) {
      console.error('Notification permission request failed:', e)
    }
  }

  const baseEvents = showSavedOnly
    ? events.filter(e => savedEventIds.includes(e.id))
    : events

  const eventsForDisplay = nearMeOnly && nearMeCoords
    ? baseEvents
      .filter(e => Number.isFinite(e.lat) && Number.isFinite(e.lng) && distanceMiles(nearMeCoords.lat, nearMeCoords.lng, e.lat, e.lng) <= RADIUS_MILES)
      .sort((a, b) => (
        distanceMiles(nearMeCoords.lat, nearMeCoords.lng, a.lat, a.lng) -
        distanceMiles(nearMeCoords.lat, nearMeCoords.lng, b.lat, b.lng)
      ))
    : baseEvents

  const upcomingCount = eventsForDisplay.filter(e => e.date >= new Date().toISOString().split('T')[0]).length

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (notificationPermission !== 'granted') return
    if (!savedEventIds.length || !events.length) return

    const reminderLogKey = getReminderLogStorageKey(user)
    let reminderLog = {}
    try {
      reminderLog = JSON.parse(window.localStorage.getItem(reminderLogKey) || '{}') || {}
    } catch {
      reminderLog = {}
    }

    const now = Date.now()
    let changed = false
    const savedSet = new Set(savedEventIds)
    const candidateEvents = events.filter(e => savedSet.has(e.id))

    for (const event of candidateEvents) {
      const startMs = eventStartMs(event)
      if (!startMs || startMs <= now) continue
      const eventLog = reminderLog[event.id] || {}

      for (const w of REMINDER_WINDOWS) {
        if (eventLog[w.id]) continue
        const reminderMs = startMs - w.leadMs
        if (now >= reminderMs && now <= reminderMs + w.windowMs) {
          try {
            const when = new Date(startMs).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
            const place = event.address || `${event.location || ''}${event.city ? `, ${event.city}` : ''}`.trim()
            new window.Notification(`Upcoming saved event: ${event.title}`, {
              body: `${when}${place ? ` • ${place}` : ''}`,
              icon: '/og-image.svg',
            })
            eventLog[w.id] = true
            reminderLog[event.id] = eventLog
            changed = true
          } catch (e) {
            console.error('Failed to send reminder notification:', e)
          }
        }
      }
    }

    if (changed) {
      try {
        window.localStorage.setItem(reminderLogKey, JSON.stringify(reminderLog))
      } catch {}
    }
  }, [notificationPermission, savedEventIds, events, user])

  const requestNearMe = () => {
    setNearMeError('')
    if (!navigator.geolocation) {
      setNearMeError('Geolocation not supported')
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setNearMeCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setNearMeOnly(true)
      },
      err => setNearMeError(err.message || 'Could not get location'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    )
  }

  const loadPendingImports = useCallback(async () => {
    if (!user || !canAccessImports) return
    setImportsLoading(true)
    try {
      const data = await fetchFlyerImports(user.id, 'pending')
      setImports(data || [])
    } catch (e) {
      console.error('Failed to load flyer imports:', e)
    } finally {
      setImportsLoading(false)
    }
  }, [user, canAccessImports])

  useEffect(() => {
    if (!showImportQueue) return
    if (!user) return
    loadPendingImports()
  }, [showImportQueue, user, loadPendingImports])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const importFlag = params.get('import')
    if (importFlag !== '1') return
    const sourceUrl = params.get('sourceUrl') || ''
    const imageUrl = params.get('imageUrl') || ''
    if (!sourceUrl || !imageUrl) return

    setImportParams({ sourceUrl, imageUrl })
    setImportError(null)
    setShowImportQueue(true)
  }, [])

  useEffect(() => {
    if (!importParams) return
    if (authLoading) return
    if (!user) {
      setShowAuth(true)
      return
    }
    if (!canAccessImports) {
      setImportParams(null)
      setImportError(null)
      setShowImportQueue(false)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [importParams, authLoading, user, canAccessImports])

  useEffect(() => {
    if (!importParams) return
    if (!user) return
    if (!canAccessImports) return
    if (!showImportQueue) return
    let cancelled = false

    const run = async () => {
      setImportProcessing(true)
      setImportError(null)
      try {
        const processedKey = `meetmap:import:${user.id}:${importParams.sourceUrl}`
        try {
          if (window.sessionStorage.getItem(processedKey) === '1') {
            setImportParams(null)
            setImportError(null)
            window.history.replaceState({}, '', window.location.pathname)
            await loadPendingImports()
            return
          }
        } catch {}

        const resp = await fetch('/api/extract-flyer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: importParams.imageUrl, sourceUrl: importParams.sourceUrl }),
        })
        const json = await resp.json()
        if (!resp.ok) {
          const msg =
            typeof json.error === 'string'
              ? json.error
              : json.error
                ? JSON.stringify(json.error)
                : 'Extraction failed'
          const status = json.status ? ` (status ${json.status})` : ''
          throw new Error(msg + status)
        }
        if (!json?.extracted) throw new Error('No extracted data returned')

        await createFlyerImport({
          userId: user.id,
          sourceUrl: importParams.sourceUrl,
          imageUrl: importParams.imageUrl,
          extracted: json.extracted,
        })

        if (!cancelled) {
          setImportParams(null)
          setImportError(null)
          window.history.replaceState({}, '', window.location.pathname)
          await loadPendingImports()
        }

        // Mark as processed only after success.
        try {
          window.sessionStorage.setItem(processedKey, '1')
        } catch {}
      } catch (e) {
        console.error('Import processing failed:', e)
        if (!cancelled) {
          setImportError(e?.message || 'Import processing failed')
        }
      } finally {
        if (!cancelled) setImportProcessing(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [importParams, user, canAccessImports, showImportQueue, loadPendingImports])

  const handleUploadFlyer = async (file) => {
    if (!canAccessImports) return
    if (!file || !importParams?.sourceUrl) return
    setImportUploading(true)
    setImportError(null)
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onerror = () => reject(new Error('Failed to read file'))
        r.onload = () => resolve(String(r.result || ''))
        r.readAsDataURL(file)
      })

      const m = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/)
      if (!m) throw new Error('Unsupported image file')
      const mediaType = m[1]
      const imageBase64 = m[2]

      const resp = await fetch('/api/extract-flyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: importParams.sourceUrl,
          imageUrl: importParams.imageUrl || '',
          imageBase64,
          mediaType,
        }),
      })
      const json = await resp.json()
      if (!resp.ok) {
        const msg =
          typeof json.error === 'string'
            ? json.error
            : json.error
              ? JSON.stringify(json.error)
              : 'Extraction failed'
        const status = json.status ? ` (status ${json.status})` : ''
        throw new Error(msg + status)
      }
      if (!json?.extracted) throw new Error('No extracted data returned')

      if (!user) {
        setImportError('Log in to create this flyer import.')
        setShowAuth(true)
        return
      }

      const storedImageUrl = await uploadFlyerImportImage(file, user.id)

      await createFlyerImport({
        userId: user.id,
        sourceUrl: importParams.sourceUrl,
        imageUrl: storedImageUrl,
        extracted: json.extracted,
      })

      setImportParams(null)
      window.history.replaceState({}, '', window.location.pathname)
      await loadPendingImports()
    } catch (e) {
      setImportError(e?.message || 'Upload failed')
    } finally {
      setImportUploading(false)
    }
  }

  const handleApproveImport = async (imp) => {
    if (!canAccessImports || !user || !imp) return
    setApprovingImportId(imp.id)
    try {
      const required = ['title', 'type', 'date', 'location', 'city']
      const ready = required.every(k => typeof imp?.[k] === 'string' ? imp[k].trim().length > 0 : !!imp?.[k])
      if (!ready) return

      let coords = null
      // Prefer AI-provided full address; otherwise fall back to venue + city.
      const query = imp.address?.trim() ? imp.address : `${imp.location || ''}, ${imp.city || ''}`.trim()
      if (query) coords = await geocodeAddress(query).catch(() => null)

      const tags = Array.isArray(imp.tags) ? imp.tags : []

      const created = await createEvent({
        title: imp.title,
        type: imp.type,
        date: imp.date,
        time: imp.time || null,
        location: imp.location,
        city: imp.city,
        address: imp.address || null,
        description: imp.description || null,
        tags,
        host: imp.host || null,
        lat: coords?.lat || null,
        lng: coords?.lng || null,
        photo_url: imp.image_url || null,
      }, user.id)

      await updateFlyerImportStatus(imp.id, 'approved')
      // Add into the local feed immediately for better UX.
      setEvents(prev => [created, ...prev])
      setSelectedEvent(created)
      setShowImportQueue(false)
    } catch (e) {
      console.error('Approve failed:', e)
    } finally {
      setApprovingImportId(null)
    }
  }

  const handleRejectImport = async (imp) => {
    if (!canAccessImports || !user || !imp) return
    try {
      await updateFlyerImportStatus(imp.id, 'rejected')
      await loadPendingImports()
    } catch (e) {
      console.error('Reject failed:', e)
    }
  }

  const handleUpdateImport = async (importId, nextDraft) => {
    if (!canAccessImports || !user || !importId || !nextDraft) return
    const tags = (nextDraft.tagsText || '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)

    const tagsText = (nextDraft.tagsText || '').trim()

    const updates = {
      title: nextDraft.title?.trim() || null,
      type: nextDraft.type?.trim() || null,
      date: nextDraft.date?.trim() || null,
      time: nextDraft.time?.trim() || null,
      location: nextDraft.location?.trim() || null,
      city: nextDraft.city?.trim() || null,
      address: nextDraft.address?.trim() || null,
      host: nextDraft.host?.trim() || null,
      description: nextDraft.description?.trim() || null,
      tags,
      extracted: {
        title: nextDraft.title || '',
        type: nextDraft.type || '',
        date: nextDraft.date || '',
        time: nextDraft.time || '',
        location: nextDraft.location || '',
        address: nextDraft.address || '',
        city: nextDraft.city || '',
        host: nextDraft.host || '',
        description: nextDraft.description || '',
        tags: tagsText,
      },
    }

    await updateFlyerImport(importId, updates)
    await loadPendingImports()
  }

  return (
    <div style={{
      fontFamily: "'Bebas Neue', 'Impact', sans-serif",
      background: isLight ? '#F6F6F6' : '#0A0A0A',
      minHeight: '100vh',
      color: isLight ? '#111111' : '#F0F0F0',
      maxWidth: 480, margin: '0 auto', position: 'relative',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #FF6B35; border-radius: 2px; }
        input, textarea, select { outline: none !important; }
        input::placeholder, textarea::placeholder { color: #3A3A3A; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        .fade-up { animation: fadeUp 0.3s ease forwards; }
        .live-dot { animation: pulse 2s infinite; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{
        background: isLight ? '#F6F6F6' : '#0A0A0A',
        borderBottom: `1px solid ${isLight ? '#E5E5E5' : '#171717'}`,
        padding: '14px 18px 10px', position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', rowGap: 8 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 20 }}>🚗</span>
              <span style={{ fontSize: 26, letterSpacing: 4, color: '#FF6B35' }}>MEET</span>
              <span style={{ fontSize: 26, letterSpacing: 4 }}>MAP</span>
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: '#444', letterSpacing: 1, marginTop: -1 }}>
              <span className="live-dot" style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#FF6B35', marginRight: 5 }} />
              {upcomingCount} UPCOMING EVENTS
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
            {user ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#555' }}>
                  👤 {user.user_metadata?.username || user.email?.split('@')[0]}
                </div>
                <button
                  onClick={signOut}
                  style={{ background: 'none', border: '1px solid #222', borderRadius: 6, padding: '5px 8px', color: '#555', fontFamily: "'DM Sans', sans-serif", fontSize: 11, cursor: 'pointer' }}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                style={{ background: 'none', border: '1px solid #FF6B3555', borderRadius: 8, padding: '7px 10px', color: '#FF6B35', fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 1.2, cursor: 'pointer' }}
              >
                LOG IN
              </button>
            )}
            <button
              onClick={toggleTheme}
              style={{
                background: 'none',
                border: `1px solid ${isLight ? '#E5E5E5' : '#222'}`,
                borderRadius: 8,
                padding: '7px 9px',
                color: isLight ? '#444' : '#555',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11,
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              {isLight ? 'LIGHT' : 'DARK'}
            </button>
            <button
              onClick={handleEnableNotifications}
              style={{
                background: 'none',
                border: `1px solid ${notificationPermission === 'granted' ? '#FF6B35' : (isLight ? '#E5E5E5' : '#222')}`,
                borderRadius: 8,
                padding: '7px 9px',
                color: notificationPermission === 'granted' ? '#FF8A5C' : (isLight ? '#444' : '#555'),
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11,
                cursor: 'pointer',
                fontWeight: 700,
              }}
              title="Enable reminders for saved events"
            >
              {notificationPermission === 'granted' ? 'Alerts On' : 'Alerts'}
            </button>
            {canAccessImports && (
              <button
                onClick={() => setShowImportQueue(true)}
                style={{
                  background: 'none',
                  border: `1px solid ${isLight ? '#E5E5E5' : '#222'}`,
                  borderRadius: 8,
                  padding: '7px 9px',
                  color: isLight ? '#444' : '#555',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: 800,
                  letterSpacing: 0.3,
                  textTransform: 'uppercase',
                }}
              >
                Imports
              </button>
            )}
            <button
              onClick={() => user ? setShowPost(true) : setShowAuth(true)}
              style={{ background: '#FF6B35', color: '#0A0A0A', border: 'none', borderRadius: 8, padding: '8px 10px', fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 1.2, cursor: 'pointer' }}
            >
              + POST
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 9 }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 13, pointerEvents: 'none' }}>🔍</span>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search events, city, tags..."
            style={{ width: '100%', background: isLight ? '#FFFFFF' : '#111', border: `1px solid ${isLight ? '#E5E5E5' : '#1A1A1A'}`, borderRadius: 8, padding: '9px 12px 9px 33px', color: isLight ? '#222' : '#F0F0F0', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}
          />
        </div>

        {/* Filter chips + past toggle */}
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', overflowX: 'visible', paddingBottom: 2, alignItems: 'center' }}>
          {/* All Events */}
          <button
            onClick={() => setFilterType('all')}
            style={{
              background: filterType === 'all' ? '#FF6B35' : isLight ? '#F2F2F2' : '#111',
              color: filterType === 'all' ? '#0A0A0A' : '#666',
              border: '1px solid', borderColor: filterType === 'all' ? '#FF6B35' : isLight ? '#E5E5E5' : '#1A1A1A',
              borderRadius: 20, padding: '5px 13px',
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            All Events
          </button>

          {/* Near Me (next to All Events) */}
          <button
            onClick={() => {
              if (nearMeOnly) setNearMeOnly(false)
              else requestNearMe()
            }}
            style={{
              background: nearMeOnly ? '#333' : isLight ? '#F2F2F2' : '#111',
              color: nearMeOnly ? '#aaa' : '#444',
              border: '1px solid', borderColor: nearMeOnly ? '#FF6B35' : isLight ? '#E5E5E5' : '#1A1A1A',
              borderRadius: 20, padding: '5px 13px',
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {nearMeOnly ? `✓ Near Me` : `Near Me`}
          </button>

          {/* Other type filters */}
          {['meet', 'car show', 'track day', 'cruise'].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              style={{
                background: filterType === type ? '#FF6B35' : isLight ? '#F2F2F2' : '#111',
                color: filterType === type ? '#0A0A0A' : '#666',
                border: '1px solid', borderColor: filterType === type ? '#FF6B35' : isLight ? '#E5E5E5' : '#1A1A1A',
                borderRadius: 20, padding: '5px 13px',
                fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
                cursor: 'pointer', textTransform: 'capitalize',
              }}
            >
              {type}
            </button>
          ))}

          {/* Past events toggle */}
          <button
            onClick={() => setShowPast(p => !p)}
            style={{
              background: showPast ? '#333' : isLight ? '#F2F2F2' : '#111',
              color: showPast ? '#aaa' : '#444',
              border: '1px solid', borderColor: showPast ? '#444' : isLight ? '#E5E5E5' : '#1A1A1A',
              borderRadius: 20, padding: '5px 13px',
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {showPast ? '✓ Past Events' : 'Past Events'}
          </button>
          <button
            onClick={() => setShowSavedOnly(p => !p)}
            style={{
              background: showSavedOnly ? '#26140E' : isLight ? '#F2F2F2' : '#111',
              color: showSavedOnly ? '#FF8A5C' : '#444',
              border: '1px solid', borderColor: showSavedOnly ? '#FF6B35' : isLight ? '#E5E5E5' : '#1A1A1A',
              borderRadius: 20, padding: '5px 13px',
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {showSavedOnly ? `★ Saved (${savedEventIds.length})` : 'Saved'}
          </button>
        </div>

        {nearMeError && nearMeOnly && (
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#FF9944', marginTop: 6 }}>
            {nearMeError}
          </div>
        )}
      </div>

      {/* ── MAP VIEW ── */}
      {view === 'map' && (
        <div className="fade-up">
          <MapView
            events={eventsForDisplay}
            onSelectEvent={e => { setMapSelected(e); setSelectedEvent(e) }}
            centerOn={nearMeOnly ? nearMeCoords : null}
          />
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <div className="fade-up" style={{ padding: '12px 16px 110px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#333' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>⚙️</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>Loading events...</div>
            </div>
          ) : loadError ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#FF6B35', letterSpacing: 1, marginBottom: 8 }}>CONNECTION ERROR</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#555', marginBottom: 20 }}>Could not load events. Check your connection and try again.</div>
              <button onClick={() => { setLoadError(false); loadEvents() }} style={{ background: '#FF6B35', color: '#0A0A0A', border: 'none', borderRadius: 8, padding: '10px 24px', fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1, cursor: 'pointer' }}>RETRY</button>
            </div>
          ) : eventsForDisplay.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#333' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🚗</div>
              <div style={{ fontSize: 22, letterSpacing: 1, marginBottom: 6 }}>NO EVENTS YET</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#444' }}>Be the first to post a meet in your area!</div>
            </div>
          ) : (
            <>
              {!debouncedSearchQuery && filterType === 'all' && eventsForDisplay.some(e => e.featured) && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#FF6B35', letterSpacing: 2, marginBottom: 8 }}>⭐ FEATURED</div>
                  {eventsForDisplay.filter(e => e.featured).map(e => (
                    <EventCard key={e.id} event={e} saved={savedEventIds.includes(e.id)} onToggleSaved={handleToggleSaved} onClick={() => setSelectedEvent(e)} />
                  ))}
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#444', letterSpacing: 2, marginBottom: 8, marginTop: 14 }}>ALL EVENTS</div>
                </div>
              )}
              {eventsForDisplay
                .filter(e => (debouncedSearchQuery || filterType !== 'all') ? true : !e.featured)
                .map(e => (
                  <EventCard key={e.id} event={e} saved={savedEventIds.includes(e.id)} onToggleSaved={handleToggleSaved} onClick={() => setSelectedEvent(e)} />
                ))}
            </>
          )}
        </div>
      )}

      {/* ── BOTTOM NAV ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 480, background: isLight ? '#F6F6F6' : '#0A0A0A',
        borderTop: `1px solid ${isLight ? '#E5E5E5' : '#171717'}`, display: 'flex',
        justifyContent: 'space-around', padding: '10px 0 20px', zIndex: 200,
      }}>
        {[{ id: 'list', icon: '☰', label: 'LIST' }, { id: 'map', icon: '🗺', label: 'MAP' }].map(nav => (
          <button
            key={nav.id}
            onClick={() => setView(nav.id)}
            style={{
              background: 'none', border: 'none',
              color: view === nav.id ? '#FF6B35' : '#3A3A3A',
              cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}
          >
            <span style={{ fontSize: 22 }}>{nav.icon}</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: 1 }}>{nav.label}</span>
          </button>
        ))}
      </div>

      {/* ── MODALS ── */}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      {showPost && <PostEventForm onClose={() => setShowPost(false)} onPosted={handlePosted} />}
      {showImportQueue && canAccessImports && (
        <ImportQueueModal
          imports={imports}
          loading={importsLoading || importProcessing}
          approvingId={approvingImportId}
          onApprove={handleApproveImport}
          onReject={handleRejectImport}
          onUpdateImport={handleUpdateImport}
          requiresAuth={!user}
          errorMessage={importError}
          showUpload={!!importParams && !!importError && (String(importError).includes('robots.txt') || String(importError).includes('Could not fetch image'))}
          uploading={importUploading}
          onPickUpload={handleUploadFlyer}
          onClose={() => setShowImportQueue(false)}
        />
      )}
      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          saved={savedEventIds.includes(selectedEvent.id)}
          onToggleSaved={() => handleToggleSaved(selectedEvent.id)}
          onClose={() => setSelectedEvent(null)}
          onAuthNeeded={handleAuthNeeded}
          onUpdated={handleUpdated}
          onDeleted={(id) => {
            setEvents(prev => prev.filter(e => e.id !== id))
            setSelectedEvent(null)
          }}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ThemeProvider>
  )
}
