import { useState, useEffect, useCallback, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { AuthProvider } from './lib/AuthContext'
import { useAuth } from './lib/useAuth'
import {
  createEvent,
  fetchEvents,
  fetchFlyerImports,
  createFlyerImport,
  updateFlyerImportStatus,
  updateFlyerImport,
  signOut,
  uploadFlyerImportImage,
  fetchSavedEventIds,
  setSavedEventStatus,
  upsertSavedEvents,
  fetchEventById,
  fetchEventScheduleByIds,
  fetchEventStatuses,
  fetchLatestEventUpdates,
  fetchEventReports,
  resolveEventReport,
  upsertDevicePushToken,
  upsertNotificationPreferences,
  fetchNotificationPreferences,
} from './lib/supabase'
import { dedupeEventsByLikelyDuplicate } from './lib/eventDedupe'
import { ThemeProvider } from './lib/ThemeContext'
import { useTheme } from './lib/useTheme'
import {
  getWebNotificationPermission,
  requestWebNotificationPermission,
  initializeNativePush,
  isNativePushSupported,
  getNativePushPlatform,
  getNativePushPermission,
  getWebAlertsUnavailableMessage,
} from './lib/pushNotifications'
import AuthModal from './components/AuthModal'
import NotificationSettingsModal from './components/NotificationSettingsModal'
import AppSettingsModal from './components/AppSettingsModal'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  normalizeNotificationPreferences,
  isReminderWindowEnabled,
} from './lib/notificationPreferences'
import PostEventForm from './components/PostEventForm'
import EventDetail from './components/EventDetail'
import EventCard from './components/EventCard'
import MapView from './components/MapView'
import ImportQueueModal from './components/ImportQueueModal'
import ModerationQueueModal from './components/ModerationQueueModal'
import PlayStoreBanner from './components/PlayStoreBanner'
import FirstEventNudge from './components/FirstEventNudge'
import { apiUrl } from './lib/apiOrigin'
import { geocodeAddress } from './lib/geocode'
import { buildEventLocationQuery } from './lib/eventLocation'
import { makeClientUuid } from './lib/clientUuid'
import { appAlert } from './lib/appAlert'
import { isEventUpcoming } from './lib/eventSchedule'
import { getCurrentCoords } from './lib/geolocation'
import { addNativePushTapListener } from './lib/pushNotifications'

const parseCsvEnv = (value) =>
  String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)

const eventIdFromNotificationData = (data) => {
  const direct = String(data?.event_id || '').trim()
  if (direct) return direct
  const url = String(data?.web_link || data?.deep_link || '').trim()
  if (!url) return ''
  try {
    const parsed = new URL(url, window.location.origin)
    return String(parsed.searchParams.get('event') || '').trim()
  } catch {
    return ''
  }
}

const openNotificationLink = async (action, openEventById) => {
  try {
    const data = action?.notification?.data || {}
    const eventId = eventIdFromNotificationData(data)
    if (eventId && openEventById) {
      await openEventById(eventId)
      return
    }
    const url = String(data.web_link || data.deep_link || '').trim()
    if (!url) return
    window.location.href = url
  } catch (e) {
    console.warn('Failed to open notification link:', e)
  }
}

const IMPORT_ADMIN_EMAILS = parseCsvEnv(import.meta.env.VITE_IMPORT_ADMIN_EMAILS).map((v) =>
  v.toLowerCase(),
)
const IMPORT_ADMIN_USER_IDS = parseCsvEnv(import.meta.env.VITE_IMPORT_ADMIN_USER_IDS)
// Push feature flag from env only. Do NOT call isNativeAndroidPushSupported() here — at module load the
// Capacitor bridge often is not ready yet, so that returns false and the Alerts button stays disabled forever on Android.
// Opt out: VITE_DISABLE_NATIVE_PUSH=true or VITE_ENABLE_NATIVE_PUSH=false
const nativePushExplicitlyOff =
  String(import.meta.env.VITE_DISABLE_NATIVE_PUSH || '')
    .trim()
    .toLowerCase() === 'true' ||
  String(import.meta.env.VITE_ENABLE_NATIVE_PUSH || '')
    .trim()
    .toLowerCase() === 'false'
const NATIVE_PUSH_ENABLED = !nativePushExplicitlyOff
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
const getStatusSnapshotStorageKey = (user) => `meetmap:status-snapshot:${user?.id || 'anon'}`
const getStatusNotifiedStorageKey = (user) => `meetmap:status-notified:${user?.id || 'anon'}`
const getUpdateSnapshotStorageKey = (user) => `meetmap:update-snapshot:${user?.id || 'anon'}`
const getUpdateNotifiedStorageKey = (user) => `meetmap:update-notified:${user?.id || 'anon'}`
const NATIVE_PUSH_TOKEN_STORAGE_KEY = 'meetmap:native-push-token'
const NEAR_ME_RADIUS_STORAGE_KEY = 'meetmap:near-me-radius-miles'
const DEFAULT_NEAR_ME_RADIUS_MILES = 25
const MIN_NEAR_ME_RADIUS_MILES = 5
const MAX_NEAR_ME_RADIUS_MILES = 100
const NEAR_ME_RADIUS_STEP_MILES = 5

const clampNearMeRadiusMiles = (value) => {
  const radius = Number(value)
  if (!Number.isFinite(radius)) return DEFAULT_NEAR_ME_RADIUS_MILES
  return Math.min(
    MAX_NEAR_ME_RADIUS_MILES,
    Math.max(
      MIN_NEAR_ME_RADIUS_MILES,
      Math.round(radius / NEAR_ME_RADIUS_STEP_MILES) * NEAR_ME_RADIUS_STEP_MILES,
    ),
  )
}

const getStoredNativePushToken = () => {
  if (typeof window === 'undefined') return ''
  try {
    return String(window.localStorage.getItem(NATIVE_PUSH_TOKEN_STORAGE_KEY) || '').trim()
  } catch {
    return ''
  }
}

const getStoredNearMeRadiusMiles = () => {
  if (typeof window === 'undefined') return DEFAULT_NEAR_ME_RADIUS_MILES
  try {
    const stored = window.localStorage.getItem(NEAR_ME_RADIUS_STORAGE_KEY)
    return stored ? clampNearMeRadiusMiles(stored) : DEFAULT_NEAR_ME_RADIUS_MILES
  } catch {
    return DEFAULT_NEAR_ME_RADIUS_MILES
  }
}

const CITY_SLUG_OVERRIDES = {
  'new-york': 'New York',
  'los-angeles': 'Los Angeles',
  'fort-worth': 'Fort Worth',
  boardman: 'Boardman',
  prineville: 'Prineville',
  union: 'Union',
  'forest-city': 'Forest City',
  lulea: 'Lulea',
}

const titleFromCitySlug = (slug) => {
  const clean = String(slug || '')
    .trim()
    .toLowerCase()
  if (!clean) return ''
  if (CITY_SLUG_OVERRIDES[clean]) return CITY_SLUG_OVERRIDES[clean]
  const parts = clean.split('-').filter(Boolean)
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]
    if (/^[a-z]{2}$/i.test(last)) {
      const state = last.toUpperCase()
      const city = parts
        .slice(0, -1)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
      if (city) return `${city}, ${state}`
    }
  }
  return parts.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

const applySeoForNearMePage = () => {
  if (typeof document === 'undefined') return
  document.title = 'Find Car Meets Near Me — Meet Map'
  const desc =
    'Find car meets, car shows, cruises, and track days near you. Browse upcoming events and post your own.'

  const descTag = document.querySelector('meta[name="description"]')
  if (descTag) descTag.setAttribute('content', desc)

  const canonicalHref = `${window.location.origin}${window.location.pathname}`
  const canonical = document.querySelector('link[rel="canonical"]')
  if (canonical) canonical.setAttribute('href', canonicalHref)
  const ogUrl = document.querySelector('meta[property="og:url"]')
  if (ogUrl) ogUrl.setAttribute('content', canonicalHref)
}

const applySeoForCityPage = (cityLabel) => {
  if (typeof document === 'undefined') return
  const base = 'Meet Map — Local Car Events'
  const title = cityLabel ? `Car Meets in ${cityLabel} — Meet Map` : base
  document.title = title
  const desc = cityLabel
    ? `Find car meets, car shows, cruises, and track days in ${cityLabel}. Browse upcoming events and post your own.`
    : 'Find and post local car meets, shows, and track days near you.'

  const descTag = document.querySelector('meta[name="description"]')
  if (descTag) descTag.setAttribute('content', desc)

  const canonicalHref = `${window.location.origin}${window.location.pathname}`
  const canonical = document.querySelector('link[rel="canonical"]')
  if (canonical) canonical.setAttribute('href', canonicalHref)
  const ogUrl = document.querySelector('meta[property="og:url"]')
  if (ogUrl) ogUrl.setAttribute('content', canonicalHref)
}

const eventStartMs = (event) => {
  if (!event?.date) return null
  const timePart = event.time && /^\d{2}:\d{2}/.test(event.time) ? event.time : '00:00'
  const dt = new Date(`${event.date}T${timePart}`)
  const ms = dt.getTime()
  return Number.isFinite(ms) ? ms : null
}

const toDateKeyLocal = (d) => {
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const weekRangeKeysLocal = (now = new Date()) => {
  const base = new Date(now)
  if (!Number.isFinite(base.getTime())) return { startKey: '', endKey: '' }
  base.setHours(12, 0, 0, 0)
  // Week is Monday..Sunday in local time.
  const day = base.getDay() // 0=Sun,1=Mon,...6=Sat
  const mondayOffset = day === 0 ? -6 : 1 - day
  const start = new Date(base)
  start.setDate(base.getDate() + mondayOffset)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { startKey: toDateKeyLocal(start), endKey: toDateKeyLocal(end) }
}

const WEEKDAY_OPTIONS = [
  { value: 'all', label: 'All Week' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
]

const EVENT_TYPE_OPTIONS = [
  { value: 'all', label: 'All Events' },
  { value: 'meet', label: 'Meet' },
  { value: 'car show', label: 'Car Show' },
  { value: 'track day', label: 'Track Day' },
  { value: 'cruise', label: 'Cruise' },
]

const DATE_SORT_OPTIONS = [
  { value: 'soonest', label: 'Soonest First' },
  { value: 'latest', label: 'Latest First' },
]

const weekdayValueForDateKey = (dateKey) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return ''
  const d = new Date(`${dateKey}T12:00:00`)
  if (!Number.isFinite(d.getTime())) return ''
  return String(d.getDay())
}

function AppInner() {
  const { user, loading: authLoading, passwordRecovery, clearPasswordRecovery } = useAuth()
  const { toggleTheme, isLight } = useTheme()
  const filterChipBg = isLight ? '#F2F2F2' : '#1A1A1A'
  const filterChipBorder = isLight ? '#E5E5E5' : '#2A2A2A'
  const filterChipText = isLight ? '#4A4A4A' : '#A8A8A8'
  const canAccessImports = isImportAdminUser(user)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadErrorMessage, setLoadErrorMessage] = useState('')
  const [view, setView] = useState('list')

  // Support SEO-friendly city landing pages: /car-meets-in-<slug>/
  useEffect(() => {
    const path = String(window.location.pathname || '')
    if (/^\/find-car-meets-near-me\/?$/i.test(path)) {
      applySeoForNearMePage()
      return
    }
    const match = path.match(/^\/car-meets-in-([^/]+)\/?$/i)
    if (!match) {
      applySeoForCityPage('')
      return
    }
    const slug = match[1]
    const label = titleFromCitySlug(slug)
    if (!label) return
    setSearchQuery(label)
    applySeoForCityPage(label)
  }, [])

  const [filterType, setFilterType] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [selectedEvent, setSelectedEvent] = useState(null)
  const selectedEventOpenRef = useRef(false)
  const eventCardHistoryPushedRef = useRef(false)
  const ignoreNextPopstateRef = useRef(false)
  const openEventByIdRef = useRef(null)
  const pendingSharedEventIdRef = useRef(
    (() => {
      try {
        return String(new URLSearchParams(window.location.search).get('event') || '').trim()
      } catch {
        return ''
      }
    })(),
  )
  const [queuedEventId, setQueuedEventId] = useState(() => pendingSharedEventIdRef.current)
  const [showAuth, setShowAuth] = useState(false)
  const [authInitialMode, setAuthInitialMode] = useState('login')
  const openAuth = useCallback((mode = 'login') => {
    setAuthInitialMode(mode)
    setShowAuth(true)
  }, [])
  const closeAuth = useCallback(() => {
    setShowAuth(false)
    setAuthInitialMode('login')
    clearPasswordRecovery()
  }, [clearPasswordRecovery])
  useEffect(() => {
    if (!passwordRecovery) return
    openAuth('new-password')
  }, [passwordRecovery, openAuth])
  const [showPost, setShowPost] = useState(false)
  const [mapSelected, setMapSelected] = useState(null)
  const [showPast, setShowPast] = useState(false)
  const [showSavedOnly, setShowSavedOnly] = useState(false)
  const [savedEventIds, setSavedEventIds] = useState([])
  const [savedSyncAvailable, setSavedSyncAvailable] = useState(true)
  const [notificationPermission, setNotificationPermission] = useState(
    getWebNotificationPermission(),
  )
  const [pushToken, setPushToken] = useState(getStoredNativePushToken)
  const [showNotificationSettings, setShowNotificationSettings] = useState(false)
  const [showAppSettings, setShowAppSettings] = useState(false)
  const [notificationPrefs, setNotificationPrefs] = useState(() => ({
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  }))
  const [notificationPrefsSaving, setNotificationPrefsSaving] = useState(false)

  const [showImportQueue, setShowImportQueue] = useState(false)
  const [imports, setImports] = useState([])
  const [importsLoading, setImportsLoading] = useState(false)
  const [showModerationQueue, setShowModerationQueue] = useState(false)
  const [moderationReports, setModerationReports] = useState([])
  const [moderationLoading, setModerationLoading] = useState(false)
  const [moderationResolvingReportId, setModerationResolvingReportId] = useState(null)
  const [approvingImportId, setApprovingImportId] = useState(null)
  const [importProcessing, setImportProcessing] = useState(false)
  const [importParams, setImportParams] = useState(null) // { sourceUrl, imageUrl }
  const [importError, setImportError] = useState(null)
  const [importUploading, setImportUploading] = useState(false)

  const [nearMeOnly, setNearMeOnly] = useState(false)
  const [nearMeCoords, setNearMeCoords] = useState(null)
  const [nearMeError, setNearMeError] = useState('')
  const [nearMeLoading, setNearMeLoading] = useState(false)
  const [nearMeRadiusMiles, setNearMeRadiusMiles] = useState(getStoredNearMeRadiusMiles)
  const [nearMeRadiusOpen, setNearMeRadiusOpen] = useState(false)
  const [mapFocusCoords, setMapFocusCoords] = useState(null)
  const [thisWeekOnly, setThisWeekOnly] = useState(false)
  const [thisWeekDay, setThisWeekDay] = useState('all')
  const [dateSort, setDateSort] = useState('soonest')
  const [filterMenuOpen, setFilterMenuOpen] = useState(null)
  const BOTTOM_NAV_HEIGHT = 110 // Reserve space so fixed bottom nav doesn't cover map/list.
  const PLAY_STORE_PROMO_RESERVE = 132 // Extra scroll space when the Play Store promo strip is open above the nav.
  const [playStorePromoOpen, setPlayStorePromoOpen] = useState(false)
  const headerRef = useRef(null)
  const [headerHeight, setHeaderHeight] = useState(175)
  const [isPhoneViewport, setIsPhoneViewport] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia('(max-width: 480px)').matches,
  )
  const handlePlayStoreBannerVisibility = useCallback((open, meta) => {
    setPlayStorePromoOpen(Boolean(open && meta?.placement !== 'top'))
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 480px)')
    const syncPhoneViewport = () => setIsPhoneViewport(media.matches)
    syncPhoneViewport()
    media.addEventListener?.('change', syncPhoneViewport)
    return () => media.removeEventListener?.('change', syncPhoneViewport)
  }, [])

  useEffect(() => {
    if (!headerRef.current || typeof ResizeObserver === 'undefined') return undefined
    const header = headerRef.current
    const syncHeaderHeight = () => {
      const nextHeight = Math.ceil(header.getBoundingClientRect().height)
      if (nextHeight > 0) setHeaderHeight(nextHeight)
    }
    syncHeaderHeight()
    const observer = new ResizeObserver(syncHeaderHeight)
    observer.observe(header)
    window.addEventListener('resize', syncHeaderHeight)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', syncHeaderHeight)
    }
  }, [])

  // Allow map overlay button to open the Post modal without prop drilling.
  useEffect(() => {
    const onOpen = () => {
      if (user) setShowPost(true)
      else openAuth()
    }
    window.addEventListener('meetmap:open-post', onOpen)
    return () => window.removeEventListener('meetmap:open-post', onOpen)
  }, [user])

  // Prevent triggering Supabase queries on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 400)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Allow shareable search URLs like /?q=Los%20Angeles,%20CA
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const q = String(params.get('q') || '').trim()
      if (q) setSearchQuery(q)
    } catch {}
  }, [])

  const closeSelectedEvent = useCallback(
    (opts = {}) => {
      const fromPopstate = Boolean(opts.fromPopstate)
      // Clear UI state immediately.
      setSelectedEvent(null)
      setMapSelected(null)

      // If we inserted a synthetic history entry for the open card, remove it
      // when closing via UI (X button, auth flow, delete, etc).
      if (eventCardHistoryPushedRef.current && !fromPopstate) {
        try {
          ignoreNextPopstateRef.current = true
          window.history.back()
        } catch {
          // If history.back() fails for any reason, just mark it as cleaned.
          ignoreNextPopstateRef.current = false
          eventCardHistoryPushedRef.current = false
        }
      } else if (fromPopstate) {
        // Back gesture already popped the synthetic entry.
        eventCardHistoryPushedRef.current = false
      }
    },
    [setSelectedEvent, setMapSelected],
  )

  useEffect(() => {
    selectedEventOpenRef.current = Boolean(selectedEvent)
  }, [selectedEvent])

  // Android physical back button / browser back should close the event card first.
  // We do this by inserting a synthetic history entry when the card opens.
  useEffect(() => {
    if (typeof window === 'undefined') return

    if (selectedEvent && !eventCardHistoryPushedRef.current) {
      try {
        window.history.pushState({ eventCardOpen: true }, '')
        eventCardHistoryPushedRef.current = true
      } catch {
        eventCardHistoryPushedRef.current = false
      }
    }
  }, [selectedEvent])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const onPopstate = () => {
      if (ignoreNextPopstateRef.current) {
        ignoreNextPopstateRef.current = false
        eventCardHistoryPushedRef.current = false
        return
      }

      if (selectedEventOpenRef.current) {
        // Back gesture while card is open: close it (do not navigate away).
        closeSelectedEvent({ fromPopstate: true })
      } else {
        // Not open — keep our bookkeeping in sync.
        eventCardHistoryPushedRef.current = false
      }
    }

    window.addEventListener('popstate', onPopstate)
    return () => window.removeEventListener('popstate', onPopstate)
  }, [closeSelectedEvent])

  // Capacitor Android: hardware back does not reliably fire popstate; handle it explicitly.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let listenerHandle
    let cancelled = false

    CapacitorApp.addListener('backButton', () => {
      if (selectedEventOpenRef.current) {
        closeSelectedEvent()
        return
      }
      CapacitorApp.exitApp()
    }).then((handle) => {
      if (cancelled) {
        handle.remove()
        return
      }
      listenerHandle = handle
    })

    return () => {
      cancelled = true
      listenerHandle?.remove()
    }
  }, [closeSelectedEvent])

  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchEvents({ type: filterType, search: debouncedSearchQuery, showPast })
      setEvents(data || [])
    } catch (e) {
      console.error('Failed to load events:', e)
      setLoadError(true)
      setLoadErrorMessage(e?.message || String(e || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }, [filterType, debouncedSearchQuery, showPast])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  const openEventById = useCallback(
    async (rawEventId) => {
      const eventId = String(rawEventId || '').trim()
      if (!eventId) return
      const inList = events.find((e) => e.id === eventId)
      if (inList) {
        setSelectedEvent(inList)
        return
      }
      try {
        const event = await fetchEventById(eventId)
        if (!event) return
        setEvents((prev) => (prev.some((e) => e.id === event.id) ? prev : [event, ...prev]))
        setSelectedEvent(event)
      } catch (e) {
        console.error('Failed to open event:', e)
      }
    },
    [events],
  )

  openEventByIdRef.current = openEventById

  // Shared links and notification deep links (?event=uuid)
  useEffect(() => {
    const eventId = String(queuedEventId || '').trim()
    if (!eventId) return
    setQueuedEventId('')
    pendingSharedEventIdRef.current = ''
    void openEventById(eventId)
    try {
      const next = new URL(window.location.href)
      next.searchParams.delete('event')
      window.history.replaceState({}, '', `${next.pathname}${next.search}`)
    } catch {}
  }, [openEventById, queuedEventId])

  // Ensure notification taps deep-link even if the user never re-opens Alerts settings.
  useEffect(() => {
    if (!isNativePushSupported() || !NATIVE_PUSH_ENABLED) return
    const handle = addNativePushTapListener((action) => {
      void openNotificationLink(action, (id) => setQueuedEventId(String(id || '').trim()))
    })
    return () => {
      try {
        handle?.remove?.()
      } catch {}
    }
  }, [])

  const handlePosted = (newEvent) => {
    if (!newEvent) return
    setEvents((prev) => [newEvent, ...prev.filter((e) => e.id !== newEvent.id)])
    // Client-side filters (ex: This Week) can hide a freshly posted event on another device/build.
    setThisWeekOnly(false)
    setNearMeOnly(false)
    setShowSavedOnly(false)
    setSelectedEvent(newEvent)
    const lat = Number(newEvent.lat)
    const lng = Number(newEvent.lng)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setMapFocusCoords({ lat, lng })
      setView('map')
    }
  }

  const handleUpdated = (updatedEvent) => {
    if (!updatedEvent) return
    setEvents((prev) => prev.map((e) => (e.id === updatedEvent.id ? updatedEvent : e)))
    setSelectedEvent(updatedEvent)
  }

  const handleAuthNeeded = () => {
    closeSelectedEvent()
    openAuth()
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
    try {
      window.localStorage.setItem(NEAR_ME_RADIUS_STORAGE_KEY, String(nearMeRadiusMiles))
    } catch {}
  }, [nearMeRadiusMiles])

  useEffect(() => {
    const nativeSupported = isNativePushSupported()
    if (!nativeSupported) {
      setNotificationPermission(getWebNotificationPermission())
      return
    }
    if (!NATIVE_PUSH_ENABLED) {
      setNotificationPermission('denied')
      return
    }

    let mounted = true
    // Important: do NOT request/register push on startup (Android can crash here if FCM isn't configured).
    // Only read permission state. The user must explicitly enable Alerts.
    getNativePushPermission()
      .then((perm) => {
        if (!mounted) return
        setNotificationPermission(perm === 'granted' ? 'granted' : 'denied')
      })
      .catch(() => {
        if (!mounted) return
        setNotificationPermission('denied')
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (pushToken) window.localStorage.setItem(NATIVE_PUSH_TOKEN_STORAGE_KEY, pushToken)
      else window.localStorage.removeItem(NATIVE_PUSH_TOKEN_STORAGE_KEY)
    } catch {}
  }, [pushToken])

  useEffect(() => {
    if (!user?.id) return
    if (!pushToken) return
    upsertDevicePushToken({
      userId: user.id,
      token: pushToken,
      platform: getNativePushPlatform() || 'android',
    }).catch((error) => {
      console.error('Failed to save push token:', error)
    })
  }, [user, pushToken])

  useEffect(() => {
    if (!user?.id) {
      setNotificationPrefs({ ...DEFAULT_NOTIFICATION_PREFERENCES })
      return
    }
    const deviceReady = Boolean(pushToken) || notificationPermission === 'granted'
    if (!deviceReady) return

    let cancelled = false
    fetchNotificationPreferences(user.id)
      .then((row) => {
        if (cancelled) return
        if (row) {
          setNotificationPrefs(normalizeNotificationPreferences(row))
          return
        }
        return upsertNotificationPreferences(user.id, {}).then((created) => {
          if (!cancelled && created) {
            setNotificationPrefs(normalizeNotificationPreferences(created))
          }
        })
      })
      .catch((error) => {
        console.error('Failed to load notification preferences:', error)
      })
    return () => {
      cancelled = true
    }
  }, [user, pushToken, notificationPermission])

  const toRad = (deg) => (deg * Math.PI) / 180
  const distanceMiles = (lat1, lon1, lat2, lon2) => {
    const R = 3958.8 // Earth radius in miles
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  const handleToggleSaved = async (eventId) => {
    if (!eventId) return
    let shouldSave = false
    setSavedEventIds((prev) => {
      const exists = prev.includes(eventId)
      shouldSave = !exists
      return exists ? prev.filter((id) => id !== eventId) : [eventId, ...prev]
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
    if (isNativePushSupported()) {
      const nativePlatform = getNativePushPlatform()
      if (!NATIVE_PUSH_ENABLED) {
        setNotificationPermission('denied')
        await appAlert(
          'Alerts are disabled in this build. Remove VITE_ENABLE_NATIVE_PUSH=false or VITE_DISABLE_NATIVE_PUSH from .env, then run npm run cap:sync and reinstall the app.',
        )
        return
      }
      try {
        const result = await initializeNativePush({
          onToken: async (token) => {
            if (token) setPushToken(token)
          },
          onNotificationTap: (action) => {
            void openNotificationLink(action, (id) => openEventByIdRef.current?.(id))
          },
          onRegistrationError: (error) => {
            console.error('Native push registration failed:', error)
            void appAlert(
              nativePlatform === 'ios'
                ? 'Could not register for alerts on this iPhone/iPad. In Xcode, confirm Push Notifications is enabled for the App target, then rebuild and try again on a physical device.'
                : 'Firebase could not register this device for push. Use an Android emulator image with Google Play (not “Google APIs” only), or a physical device. Also confirm google-services.json matches the app id.',
            )
          },
        })
        setNotificationPermission(result?.enabled ? 'granted' : 'denied')
        if (result?.token) setPushToken(result.token)
        if (result?.enabled && user?.id) {
          await upsertNotificationPreferences(user.id, {})
          setShowNotificationSettings(true)
        } else if (result?.enabled) {
          setShowNotificationSettings(true)
        } else if (!result?.enabled) {
          const r = result?.reason
          if (r === 'permission-denied') {
            await appAlert(
              nativePlatform === 'ios'
                ? 'Notifications are off for Meet Map. Turn them on in Settings → Meet Map → Notifications.'
                : 'Notifications are off for Meet Map. Turn them on in Android Settings → Apps → Meet Map → Notifications.',
            )
          } else if (r === 'register-failed') {
            await appAlert(
              nativePlatform === 'ios'
                ? 'Could not register for alerts on iOS. Confirm Push Notifications is enabled in Xcode and rebuild the app.'
                : 'Could not register for alerts (Firebase/FCM). Use a Play-enabled emulator or device, and verify google-services.json in android/app/.',
            )
          } else if (r === 'timed-out') {
            await appAlert(
              result?.message ||
                (nativePlatform === 'ios'
                  ? 'Push setup timed out on iOS. Use a physical device with Push Notifications enabled in Xcode.'
                  : 'Push setup timed out. Use an emulator with Google Play, sign in to Google, and try again.'),
            )
          } else if (r === 'not-native') {
            await appAlert(
              'Meet Map does not detect the native app shell. Reinstall from Xcode or Android Studio — not a browser tab.',
            )
          } else {
            await appAlert(
              nativePlatform === 'ios'
                ? 'Could not enable alerts on iOS. Try again on a physical device after rebuilding from Xcode.'
                : 'Could not enable alerts. If you are on an emulator, create an AVD that includes the Play Store / Google Play.',
            )
          }
        }
      } catch (e) {
        setNotificationPermission('denied')
        console.error('Native push permission request failed:', e)
        await appAlert(
          `Could not enable alerts: ${e?.message || String(e)}. Try again or update the app.`,
        )
      }
      return
    }

    if (typeof window === 'undefined' || !('Notification' in window)) {
      await appAlert(getWebAlertsUnavailableMessage())
      return
    }
    try {
      const permission = await requestWebNotificationPermission()
      setNotificationPermission(permission)
      if (permission === 'granted') {
        if (user?.id) await upsertNotificationPreferences(user.id, {})
        setShowNotificationSettings(true)
      }
    } catch (e) {
      console.error('Notification permission request failed:', e)
    }
  }

  const handleNotificationPrefChange = async (patch) => {
    const next = { ...notificationPrefs, ...patch }
    setNotificationPrefs(next)
    if (!user?.id) return
    setNotificationPrefsSaving(true)
    try {
      const saved = await upsertNotificationPreferences(user.id, next)
      if (saved) setNotificationPrefs(normalizeNotificationPreferences(saved))
    } catch (error) {
      console.error('Failed to save notification preferences:', error)
      try {
        const row = await fetchNotificationPreferences(user.id)
        if (row) setNotificationPrefs(normalizeNotificationPreferences(row))
      } catch {}
    } finally {
      setNotificationPrefsSaving(false)
    }
  }

  const handleAlertsClick = async () => {
    if (!alertsEnabled) {
      await handleEnableNotifications()
      return
    }
    setShowNotificationSettings(true)
  }

  const nativePushTemporarilyDisabled = isNativePushSupported() && !NATIVE_PUSH_ENABLED
  const alertsEnabled = isNativePushSupported()
    ? Boolean(pushToken) && !nativePushTemporarilyDisabled
    : notificationPermission === 'granted'

  const baseEvents = showSavedOnly ? events.filter((e) => savedEventIds.includes(e.id)) : events

  // Local day boundary: avoids "missing" events when UTC has rolled over.
  const todayKey = toDateKeyLocal(new Date())
  // When toggled, show ONLY past events (not "include past").
  const pastFilteredEvents = showPast
    ? baseEvents.filter((e) => String(e?.date || '') < todayKey)
    : baseEvents

  const filteredDedupedEvents = dedupeEventsByLikelyDuplicate(pastFilteredEvents)

  const { startKey: thisWeekStartKey, endKey: thisWeekEndKey } = weekRangeKeysLocal()

  const eventsForDisplay =
    nearMeOnly && nearMeCoords
      ? filteredDedupedEvents
          .filter(
            (e) =>
              Number.isFinite(e.lat) &&
              Number.isFinite(e.lng) &&
              distanceMiles(nearMeCoords.lat, nearMeCoords.lng, e.lat, e.lng) <= nearMeRadiusMiles,
          )
          .sort((a, b) => {
            const aStart = eventStartMs(a) ?? Number.POSITIVE_INFINITY
            const bStart = eventStartMs(b) ?? Number.POSITIVE_INFINITY
            if (aStart !== bStart) return aStart - bStart
            // Tie-breaker: keep closer events first when start time matches.
            return (
              distanceMiles(nearMeCoords.lat, nearMeCoords.lng, a.lat, a.lng) -
              distanceMiles(nearMeCoords.lat, nearMeCoords.lng, b.lat, b.lng)
            )
          })
      : filteredDedupedEvents

  const eventsFilteredForWeek = thisWeekOnly
    ? [...eventsForDisplay]
        .filter((e) => {
          const k = String(e?.date || '')
          if (!k || !thisWeekStartKey || !thisWeekEndKey) return false
          if (k < thisWeekStartKey || k > thisWeekEndKey) return false
          return thisWeekDay === 'all' || weekdayValueForDateKey(k) === thisWeekDay
        })
        .sort((a, b) => {
          const aStart = eventStartMs(a) ?? Number.POSITIVE_INFINITY
          const bStart = eventStartMs(b) ?? Number.POSITIVE_INFINITY
          return aStart - bStart
        })
    : eventsForDisplay

  const eventsForCurrentView =
    view === 'mine' && user
      ? [...eventsFilteredForWeek]
          .filter((e) => e?.user_id === user.id)
          .sort((a, b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')))
      : eventsFilteredForWeek

  const sortedEventsForCurrentView =
    view === 'mine' && user
      ? eventsForCurrentView
      : [...eventsForCurrentView].sort((a, b) => {
          const aStart = eventStartMs(a) ?? Number.POSITIVE_INFINITY
          const bStart = eventStartMs(b) ?? Number.POSITIVE_INFINITY
          return dateSort === 'latest' ? bStart - aStart : aStart - bStart
        })

  const eventsBeforeClientFilters =
    view === 'mine' && user
      ? filteredDedupedEvents.filter((e) => e?.user_id === user.id)
      : filteredDedupedEvents
  const eventsHiddenByClientFilters = Math.max(
    0,
    eventsBeforeClientFilters.length - sortedEventsForCurrentView.length,
  )

  const upcomingCount = sortedEventsForCurrentView.filter((e) => e.date >= todayKey).length

  const selectedEventIndex = selectedEvent
    ? sortedEventsForCurrentView.findIndex((e) => e.id === selectedEvent.id)
    : -1
  const canShowPreviousEvent = selectedEventIndex > 0
  const canShowNextEvent =
    selectedEventIndex >= 0 && selectedEventIndex < sortedEventsForCurrentView.length - 1
  const openEventAtOffset = useCallback(
    (offset) => {
      if (selectedEventIndex < 0) return
      const next = sortedEventsForCurrentView[selectedEventIndex + offset]
      if (next) {
        setSelectedEvent(next)
      }
    },
    [selectedEventIndex, sortedEventsForCurrentView],
  )

  const searchScopeLabel = (() => {
    if (nearMeOnly) return 'Near you'
    const q = String(searchQuery || '').trim()
    if (q) return `Near ${q}`
    return 'All upcoming events'
  })()

  useEffect(() => {
    if (isNativePushSupported()) return
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (notificationPermission !== 'granted') return
    if (!notificationPrefs.reminders_enabled) return
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
    const candidateEvents = events.filter((e) => savedSet.has(e.id))

    for (const event of candidateEvents) {
      const startMs = eventStartMs(event)
      if (!startMs || startMs <= now) continue
      const eventLog = reminderLog[event.id] || {}

      for (const w of REMINDER_WINDOWS) {
        if (!isReminderWindowEnabled(notificationPrefs, w.id)) continue
        if (eventLog[w.id]) continue
        const reminderMs = startMs - w.leadMs
        if (now >= reminderMs && now <= reminderMs + w.windowMs) {
          try {
            const when = new Date(startMs).toLocaleString([], {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
            const place =
              event.address ||
              `${event.location || ''}${event.city ? `, ${event.city}` : ''}`.trim()
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
  }, [notificationPermission, notificationPrefs, savedEventIds, events, user])

  useEffect(() => {
    if (isNativePushSupported()) return
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (notificationPermission !== 'granted') return
    if (!notificationPrefs.event_updates_enabled) return
    if (!savedEventIds.length) return

    const snapshotKey = getUpdateSnapshotStorageKey(user)
    const notifiedKey = getUpdateNotifiedStorageKey(user)

    const checkUpdateChanges = async () => {
      try {
        const [updateMap, scheduleMap] = await Promise.all([
          fetchLatestEventUpdates(savedEventIds),
          fetchEventScheduleByIds(savedEventIds),
        ])
        let snapshot = {}
        let notified = {}
        try {
          snapshot = JSON.parse(window.localStorage.getItem(snapshotKey) || '{}') || {}
          notified = JSON.parse(window.localStorage.getItem(notifiedKey) || '{}') || {}
        } catch {
          snapshot = {}
          notified = {}
        }

        const nextSnapshot = {}
        const nextNotified = { ...notified }
        const hasBaseline = Object.keys(snapshot).length > 0

        for (const eventId of savedEventIds) {
          const row = updateMap[eventId]
          const signature = row
            ? `${row.latest_update_id || ''}|${row.latest_update_message || ''}|${row.latest_update_created_at || ''}`
            : ''
          const previous = snapshot[eventId] || ''
          const schedule = scheduleMap[eventId]
          const upcoming = schedule && isEventUpcoming(schedule)

          if (
            upcoming &&
            hasBaseline &&
            signature &&
            previous !== signature &&
            nextNotified[eventId] !== signature
          ) {
            const eventTitle =
              events.find((e) => e.id === eventId)?.title || schedule?.title || 'Saved event'
            new window.Notification(`New host update: ${eventTitle}`, {
              body: row.latest_update_message || 'The host posted a new update.',
              icon: '/og-image.svg',
            })
            nextNotified[eventId] = signature
          }

          nextSnapshot[eventId] = signature
        }

        window.localStorage.setItem(snapshotKey, JSON.stringify(nextSnapshot))
        window.localStorage.setItem(notifiedKey, JSON.stringify(nextNotified))
      } catch (e) {
        console.error('Host update notification check failed:', e)
      }
    }

    checkUpdateChanges()
    const interval = window.setInterval(checkUpdateChanges, 90 * 1000)
    return () => window.clearInterval(interval)
  }, [notificationPermission, notificationPrefs, savedEventIds, events, user])

  useEffect(() => {
    if (isNativePushSupported()) return
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (notificationPermission !== 'granted') return
    if (!notificationPrefs.event_updates_enabled) return
    if (!savedEventIds.length) return

    const snapshotKey = getStatusSnapshotStorageKey(user)
    const notifiedKey = getStatusNotifiedStorageKey(user)

    const checkStatusChanges = async () => {
      try {
        const [statusMap, scheduleMap] = await Promise.all([
          fetchEventStatuses(savedEventIds),
          fetchEventScheduleByIds(savedEventIds),
        ])
        let snapshot = {}
        let notified = {}
        try {
          snapshot = JSON.parse(window.localStorage.getItem(snapshotKey) || '{}') || {}
          notified = JSON.parse(window.localStorage.getItem(notifiedKey) || '{}') || {}
        } catch {
          snapshot = {}
          notified = {}
        }

        const nextSnapshot = {}
        const nextNotified = { ...notified }
        const hasBaseline = Object.keys(snapshot).length > 0

        for (const eventId of savedEventIds) {
          const row = statusMap[eventId] || { status: 'active', status_note: '', updated_at: '' }
          const status = String(row.status || 'active').toLowerCase()
          const note = row.status_note || ''
          const updatedAt = row.updated_at || ''
          const signature = `${status}|${note}|${updatedAt}`
          const previous = snapshot[eventId]
          const schedule = scheduleMap[eventId]
          const upcoming = schedule && isEventUpcoming(schedule)

          if (
            upcoming &&
            hasBaseline &&
            previous &&
            previous.signature !== signature &&
            nextNotified[eventId] !== signature
          ) {
            const eventTitle =
              events.find((e) => e.id === eventId)?.title || schedule?.title || 'Saved event'
            const label =
              status === 'canceled'
                ? 'Canceled'
                : status === 'moved'
                  ? 'Moved'
                  : status === 'delayed'
                    ? 'Delayed'
                    : 'Updated'
            new window.Notification(`Status changed: ${eventTitle}`, {
              body: note ? `${label} • ${note}` : label,
              icon: '/og-image.svg',
            })
            nextNotified[eventId] = signature
          }

          nextSnapshot[eventId] = { signature }
        }

        window.localStorage.setItem(snapshotKey, JSON.stringify(nextSnapshot))
        window.localStorage.setItem(notifiedKey, JSON.stringify(nextNotified))
      } catch (e) {
        console.error('Status change notification check failed:', e)
      }
    }

    checkStatusChanges()
    const interval = window.setInterval(checkStatusChanges, 90 * 1000)
    return () => window.clearInterval(interval)
  }, [notificationPermission, notificationPrefs, savedEventIds, events, user])

  const requestNearMe = async () => {
    setNearMeError('')
    setNearMeLoading(true)
    try {
      const coords = await getCurrentCoords()
      setNearMeCoords(coords)
      setNearMeOnly(true)
      setNearMeRadiusOpen(true)
    } catch (err) {
      setNearMeError(err?.message || 'Could not get location')
      setNearMeOnly(false)
      setNearMeRadiusOpen(false)
    } finally {
      setNearMeLoading(false)
    }
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

  const loadPendingModerationReports = useCallback(async () => {
    if (!user || !canAccessImports) return
    setModerationLoading(true)
    try {
      const data = await fetchEventReports('pending')
      setModerationReports(data || [])
    } catch (e) {
      console.error('Failed to load moderation queue:', e)
    } finally {
      setModerationLoading(false)
    }
  }, [user, canAccessImports])

  const handleModerateReport = async (reportId, nextStatus) => {
    if (!user) return
    setModerationResolvingReportId(reportId)
    try {
      await resolveEventReport(reportId, user.id, nextStatus)
      setModerationReports((prev) => prev.filter((r) => r.id !== reportId))
    } catch (e) {
      console.error('Moderation update failed:', e)
    } finally {
      setModerationResolvingReportId(null)
    }
  }

  useEffect(() => {
    if (!showImportQueue) return
    if (!user) return
    loadPendingImports()
  }, [showImportQueue, user, loadPendingImports])

  useEffect(() => {
    if (!showModerationQueue) return
    if (!user) return
    loadPendingModerationReports()
  }, [showModerationQueue, user, loadPendingModerationReports])

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
      openAuth()
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

        const importCorrelationId = makeClientUuid()
        const resp = await fetch(apiUrl('/api/extract-flyer'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: importParams.imageUrl,
            sourceUrl: importParams.sourceUrl,
            correlationId: importCorrelationId,
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
      const uploadImportCorrelationId = makeClientUuid()

      const resp = await fetch(apiUrl('/api/extract-flyer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: importParams.sourceUrl,
          imageUrl: importParams.imageUrl || '',
          imageBase64,
          mediaType,
          correlationId: uploadImportCorrelationId,
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
        openAuth()
        return
      }

      const storedImageUrl = await uploadFlyerImportImage(file, user.id, {
        correlationId: uploadImportCorrelationId,
      })

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
      const required = ['title', 'type', 'date', 'city']
      const ready = required.every((k) =>
        typeof imp?.[k] === 'string' ? imp[k].trim().length > 0 : !!imp?.[k],
      )
      if (!ready) return

      let coords = null
      const query = buildEventLocationQuery(imp)
      if (query) coords = await geocodeAddress(query).catch(() => null)

      const tags = Array.isArray(imp.tags) ? imp.tags : []
      const safeLocation = String(imp.location || '').trim() || String(imp.city || '').trim()

      const created = await createEvent(
        {
          title: imp.title,
          type: imp.type,
          date: imp.date,
          time: imp.time || null,
          location: safeLocation,
          city: imp.city,
          address: imp.address || null,
          description: imp.description || null,
          tags,
          host: imp.host || null,
          lat: coords?.lat || null,
          lng: coords?.lng || null,
          photo_url: imp.image_url || null,
        },
        user.id,
      )

      await updateFlyerImportStatus(imp.id, 'approved')
      // Add into the local feed immediately for better UX.
      setEvents((prev) => [created, ...prev])
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

  const handleUpdateImport = async (importId, nextDraft, previousExtracted) => {
    if (!canAccessImports || !user || !importId || !nextDraft) return
    const tags = (nextDraft.tagsText || '')
      .split(',')
      .map((t) => t.trim())
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
        ...(previousExtracted && typeof previousExtracted === 'object' ? previousExtracted : {}),
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
    <div
      className="meetmap-app-shell"
      style={{
        fontFamily: "'Bebas Neue', 'Impact', sans-serif",
        background: isLight ? '#F6F6F6' : '#0A0A0A',
        minHeight: '100dvh',
        color: isLight ? '#111111' : '#F0F0F0',
        width: '100%',
        margin: 0,
        overflowX: 'hidden',
        position: 'relative',
        paddingTop: 'var(--meetmap-play-promo-top, 0px)',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { width: 100%; min-height: 100%; }
        body { margin: 0; overflow-x: hidden; background: ${isLight ? '#F6F6F6' : '#0A0A0A'}; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #FF6B35; border-radius: 2px; }
        input, textarea, select { outline: none !important; }
        input::placeholder, textarea::placeholder { color: #3A3A3A; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        .fade-up { animation: fadeUp 0.3s ease forwards; }
        .live-dot { animation: pulse 2s infinite; }
        .meetmap-header-actions > *, .meetmap-filter-row > * { flex: 0 0 auto; }
        .meetmap-header-actions, .meetmap-filter-row { scrollbar-width: none; }
        .meetmap-header-actions::-webkit-scrollbar, .meetmap-filter-row::-webkit-scrollbar { display: none; }
        @media (max-width: 480px) {
          .meetmap-header-actions,
          .meetmap-filter-row {
            flex-wrap: wrap !important;
            overflow: visible !important;
          }
          .meetmap-header-actions > *,
          .meetmap-filter-row > * {
            flex: 0 1 auto !important;
          }
          .meetmap-filter-row > button,
          .meetmap-filter-row > div > button,
          .meetmap-filter-row > select {
            font-size: 11px !important;
            padding: 5px 9px !important;
          }
          .meetmap-filter-row > select {
            max-width: 150px;
          }
        }
      `}</style>

      {/* ── HEADER ── */}
      <div
        ref={headerRef}
        style={{
          background: isLight ? '#F6F6F6' : '#0A0A0A',
          borderBottom: `1px solid ${isLight ? '#E5E5E5' : '#171717'}`,
          padding: isPhoneViewport
            ? 'calc(env(safe-area-inset-top) + 12px) 14px 8px'
            : 'calc(env(safe-area-inset-top) + 14px) 18px 10px',
          position: 'sticky',
          top: 0,
          zIndex: 400,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: isPhoneViewport ? 'stretch' : 'center',
            justifyContent: 'space-between',
            marginBottom: isPhoneViewport ? 8 : 10,
            flexDirection: isPhoneViewport ? 'column' : 'row',
            flexWrap: isPhoneViewport ? 'nowrap' : 'wrap',
            rowGap: isPhoneViewport ? 7 : 8,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 20 }}>🚗</span>
              <span style={{ fontSize: 26, letterSpacing: 4, color: '#FF6B35' }}>MEET</span>
              <span style={{ fontSize: 26, letterSpacing: 4 }}>MAP</span>
            </div>
            <div
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 10,
                color: '#444',
                letterSpacing: 1,
                marginTop: -1,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span
                className="live-dot"
                style={{
                  display: 'inline-block',
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: '#FF6B35',
                  marginRight: 5,
                }}
              />
              {upcomingCount} UPCOMING EVENTS
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 0.6,
                  color: filterChipText,
                  background: filterChipBg,
                  border: `1px solid ${filterChipBorder}`,
                  borderRadius: 999,
                  padding: '2px 8px',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
                title="Current search scope"
              >
                {searchScopeLabel}
              </span>
            </div>
          </div>

          <div
            className="meetmap-header-actions"
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              flexWrap: 'wrap',
              justifyContent: isPhoneViewport ? 'flex-start' : 'flex-end',
              marginLeft: isPhoneViewport ? 0 : 'auto',
              overflowX: 'visible',
              paddingBottom: isPhoneViewport ? 2 : 0,
              WebkitOverflowScrolling: isPhoneViewport ? 'touch' : undefined,
            }}
          >
            {user ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#555' }}>
                  👤 {user.user_metadata?.username || user.email?.split('@')[0]}
                </div>
                <button
                  onClick={signOut}
                  style={{
                    background: 'none',
                    border: '1px solid #222',
                    borderRadius: 6,
                    padding: '5px 8px',
                    color: '#555',
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => openAuth()}
                style={{
                  background: 'none',
                  border: '1px solid #FF6B3555',
                  borderRadius: 8,
                  padding: '7px 10px',
                  color: '#FF6B35',
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 14,
                  letterSpacing: 1.2,
                  cursor: 'pointer',
                }}
              >
                LOG IN
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAppSettings(true)}
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
              title="App settings"
            >
              Settings
            </button>
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
              type="button"
              onClick={handleAlertsClick}
              style={{
                background: 'none',
                border: `1px solid ${alertsEnabled ? '#FF6B35' : isLight ? '#E5E5E5' : '#222'}`,
                borderRadius: 8,
                padding: '7px 9px',
                color: alertsEnabled ? '#FF8A5C' : isLight ? '#444' : '#555',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11,
                cursor: 'pointer',
                opacity: nativePushTemporarilyDisabled ? 0.65 : 1,
                fontWeight: 700,
              }}
              title={
                nativePushTemporarilyDisabled
                  ? 'Alerts unavailable in this build (env flag). Tap for details.'
                  : alertsEnabled
                    ? 'Customize alert settings'
                    : 'Enable reminders for saved events'
              }
            >
              {alertsEnabled ? 'Alerts On' : 'Alerts'}
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
            {canAccessImports && (
              <button
                onClick={() => setShowModerationQueue(true)}
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
                Moderation
              </button>
            )}
            <button
              onClick={() => (user ? setShowPost(true) : openAuth())}
              style={{
                background: '#FF6B35',
                color: '#0A0A0A',
                border: 'none',
                borderRadius: 8,
                padding: '8px 10px',
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 14,
                letterSpacing: 1.2,
                cursor: 'pointer',
              }}
            >
              + POST
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 9 }}>
          <span
            style={{
              position: 'absolute',
              left: 11,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 13,
              pointerEvents: 'none',
            }}
          >
            🔍
          </span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, city, address, venue, tags..."
            style={{
              width: '100%',
              background: isLight ? '#FFFFFF' : '#111',
              border: `1px solid ${isLight ? '#E5E5E5' : '#1A1A1A'}`,
              borderRadius: 8,
              padding: '9px 12px 9px 33px',
              color: isLight ? '#222' : '#F0F0F0',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
            }}
          />
        </div>

        {/* Filter chips + past toggle */}
        <div
          className="meetmap-filter-row"
          style={{
            display: 'flex',
            gap: 7,
            flexWrap: 'wrap',
            overflowX: 'visible',
            paddingBottom: isPhoneViewport ? 4 : 2,
            alignItems: 'center',
            WebkitOverflowScrolling: isPhoneViewport ? 'touch' : undefined,
          }}
        >
          {/* All Events */}
          <button
            onClick={() => {
              setFilterType('all')
              setNearMeOnly(false)
              setNearMeRadiusOpen(false)
              setThisWeekOnly(false)
              setThisWeekDay('all')
              setFilterMenuOpen(null)
            }}
            style={{
              background: filterType === 'all' ? '#FF6B35' : filterChipBg,
              color: filterType === 'all' ? '#0A0A0A' : filterChipText,
              border: '1px solid',
              borderColor: filterType === 'all' ? '#FF6B35' : filterChipBorder,
              borderRadius: 20,
              padding: '5px 13px',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            All Events
          </button>

          {/* Near Me (next to All Events) */}
          <div style={{ position: 'relative', flex: '0 0 auto', zIndex: nearMeOnly ? 650 : 1 }}>
            <button
              onClick={() => {
                if (nearMeLoading) return
                if (nearMeOnly) {
                  setNearMeRadiusOpen((open) => !open)
                } else {
                  setMapFocusCoords(null)
                  requestNearMe()
                }
              }}
              disabled={nearMeLoading}
              style={{
                background: nearMeOnly ? (isLight ? '#FFF3ED' : '#222') : filterChipBg,
                color: nearMeOnly ? (isLight ? '#D1491A' : '#aaa') : filterChipText,
                border: '1px solid',
                borderColor: nearMeOnly ? '#FF6B35' : filterChipBorder,
                borderRadius: 20,
                padding: '5px 13px',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                fontWeight: 600,
                cursor: nearMeLoading ? 'wait' : 'pointer',
                opacity: nearMeLoading ? 0.7 : 1,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                whiteSpace: 'nowrap',
              }}
            >
              {nearMeLoading ? 'Locating…' : nearMeOnly ? `✓ Near Me` : `Near Me`}
            </button>
          </div>

          {/* This Week */}
          <div style={{ position: 'relative', flex: '0 0 auto' }}>
            <button
              onClick={() => {
                setFilterMenuOpen((v) => (v === 'week' ? null : 'week'))
              }}
              style={{
                background: thisWeekOnly ? (isLight ? '#FFF3ED' : '#222') : filterChipBg,
                color: thisWeekOnly ? (isLight ? '#D1491A' : '#aaa') : filterChipText,
                border: '1px solid',
                borderColor: thisWeekOnly ? '#FF6B35' : filterChipBorder,
                borderRadius: 20,
                padding: '5px 13px',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                whiteSpace: 'nowrap',
              }}
              title={
                thisWeekOnly && thisWeekStartKey && thisWeekEndKey
                  ? `Showing events ${thisWeekStartKey} to ${thisWeekEndKey}`
                  : 'Choose a day this week'
              }
            >
              {thisWeekOnly
                ? `✓ ${WEEKDAY_OPTIONS.find((d) => d.value === thisWeekDay)?.label || 'This Week'}`
                : `This Week ▾`}
            </button>
            {filterMenuOpen === 'week' && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: 0,
                  zIndex: 600,
                  minWidth: 150,
                  background: isLight ? '#FFFFFF' : '#111',
                  border: `1px solid ${filterChipBorder}`,
                  borderRadius: 12,
                  padding: 6,
                  boxShadow: `0 12px 32px ${isLight ? '#00000018' : '#00000066'}`,
                }}
              >
                {WEEKDAY_OPTIONS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => {
                      setThisWeekOnly(true)
                      setThisWeekDay(day.value)
                      setFilterMenuOpen(null)
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderRadius: 8,
                      padding: '8px 10px',
                      background:
                        thisWeekOnly && thisWeekDay === day.value
                          ? isLight
                            ? '#FFF3ED'
                            : '#24140E'
                          : 'transparent',
                      color: isLight ? '#222' : '#EDEDED',
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12,
                      fontWeight: thisWeekOnly && thisWeekDay === day.value ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {day.label}
                  </button>
                ))}
                {thisWeekOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      setThisWeekOnly(false)
                      setThisWeekDay('all')
                      setFilterMenuOpen(null)
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderTop: `1px solid ${filterChipBorder}`,
                      marginTop: 4,
                      padding: '8px 10px',
                      background: 'transparent',
                      color: isLight ? '#777' : '#888',
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Clear week filter
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ position: 'relative', flex: '0 0 auto' }}>
            <button
              type="button"
              onClick={() => {
                setFilterMenuOpen((v) => (v === 'type' ? null : 'type'))
              }}
              style={{
                background: filterType !== 'all' ? '#FF6B35' : filterChipBg,
                color: filterType !== 'all' ? '#0A0A0A' : filterChipText,
                border: '1px solid',
                borderColor: filterType !== 'all' ? '#FF6B35' : filterChipBorder,
                borderRadius: 20,
                padding: '5px 13px',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
                whiteSpace: 'nowrap',
              }}
            >
              {EVENT_TYPE_OPTIONS.find((type) => type.value === filterType)?.label || 'Event Type'}{' '}
              ▾
            </button>
            {filterMenuOpen === 'type' && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: 0,
                  zIndex: 600,
                  minWidth: 150,
                  background: isLight ? '#FFFFFF' : '#111',
                  border: `1px solid ${filterChipBorder}`,
                  borderRadius: 12,
                  padding: 6,
                  boxShadow: `0 12px 32px ${isLight ? '#00000018' : '#00000066'}`,
                }}
              >
                {EVENT_TYPE_OPTIONS.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => {
                      setFilterType(type.value)
                      setFilterMenuOpen(null)
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderRadius: 8,
                      padding: '8px 10px',
                      background:
                        filterType === type.value
                          ? isLight
                            ? '#FFF3ED'
                            : '#24140E'
                          : 'transparent',
                      color: isLight ? '#222' : '#EDEDED',
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12,
                      fontWeight: filterType === type.value ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <select
            value={dateSort}
            onChange={(e) => setDateSort(e.target.value)}
            aria-label="Sort events by date"
            title="Sort events by date"
            style={{
              background: filterChipBg,
              color: filterChipText,
              border: `1px solid ${filterChipBorder}`,
              borderRadius: 20,
              padding: '5px 28px 5px 11px',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {DATE_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {/* Past events toggle */}
          <button
            onClick={() => setShowPast((p) => !p)}
            style={{
              background: showPast ? '#333' : filterChipBg,
              color: showPast ? '#aaa' : '#444',
              border: '1px solid',
              borderColor: showPast ? '#444' : filterChipBorder,
              borderRadius: 20,
              padding: '5px 13px',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {showPast ? '✓ Past Events' : 'Past Events'}
          </button>
          <button
            onClick={() => setShowSavedOnly((p) => !p)}
            style={{
              background: showSavedOnly ? '#26140E' : filterChipBg,
              color: showSavedOnly ? '#FF8A5C' : '#444',
              border: '1px solid',
              borderColor: showSavedOnly ? '#FF6B35' : filterChipBorder,
              borderRadius: 20,
              padding: '5px 13px',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {showSavedOnly ? `★ Saved (${savedEventIds.length})` : 'Saved'}
          </button>
        </div>

        {nearMeOnly && nearMeRadiusOpen && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 9,
              width: 'min(232px, calc(100% - 92px))',
              marginTop: 8,
              marginLeft: 92,
              padding: '8px 11px',
              borderRadius: 16,
              border: '1px solid #FF6B35',
              background: isLight ? '#FFF3ED' : '#20140F',
              color: isLight ? '#D1491A' : '#FF8A5C',
              boxShadow: `0 8px 22px ${isLight ? '#00000012' : '#00000055'}`,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.5,
            }}
          >
            <span style={{ minWidth: 42, whiteSpace: 'nowrap' }}>{nearMeRadiusMiles} mi</span>
            <input
              type="range"
              min={MIN_NEAR_ME_RADIUS_MILES}
              max={MAX_NEAR_ME_RADIUS_MILES}
              step={NEAR_ME_RADIUS_STEP_MILES}
              value={nearMeRadiusMiles}
              onInput={(e) => setNearMeRadiusMiles(clampNearMeRadiusMiles(e.target.value))}
              onChange={(e) => setNearMeRadiusMiles(clampNearMeRadiusMiles(e.target.value))}
              aria-label="Near Me radius"
              title="Adjust the Near Me search radius"
              style={{
                flex: 1,
                minWidth: 0,
                accentColor: '#FF6B35',
                cursor: 'pointer',
              }}
            />
            <button
              type="button"
              onClick={() => setNearMeRadiusOpen(false)}
              aria-label="Close Near Me radius slider"
              title="Close radius slider"
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: `1px solid ${isLight ? '#F0C3B3' : '#3A241C'}`,
                background: isLight ? '#FFFFFF' : '#24140E',
                color: isLight ? '#D1491A' : '#FF8A5C',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                fontWeight: 900,
                lineHeight: 1,
                cursor: 'pointer',
                flex: '0 0 auto',
              }}
            >
              ×
            </button>
          </div>
        )}

        {nearMeError && (
          <div
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              color: '#FF9944',
              marginTop: 6,
            }}
          >
            {nearMeError}
          </div>
        )}
      </div>

      {/* ── MAP VIEW ── */}
      {view === 'map' && (
        <div className="fade-up">
          <MapView
            events={sortedEventsForCurrentView}
            loading={loading}
            onSelectEvent={(e) => {
              setMapSelected(e)
              setSelectedEvent(e)
            }}
            centerOn={mapFocusCoords || (nearMeOnly ? nearMeCoords : null)}
            bottomNavHeight={
              BOTTOM_NAV_HEIGHT + (playStorePromoOpen ? PLAY_STORE_PROMO_RESERVE : 0)
            }
            headerHeight={headerHeight}
          />
          <FirstEventNudge
            bottomOffsetPx={BOTTOM_NAV_HEIGHT + (playStorePromoOpen ? PLAY_STORE_PROMO_RESERVE : 0)}
            onPost={() => (user ? setShowPost(true) : openAuth())}
          />
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {(view === 'list' || view === 'mine') && (
        <div
          className="fade-up"
          style={{
            paddingLeft: 16,
            paddingRight: 16,
            paddingTop: 12,
            paddingBottom: `calc(${BOTTOM_NAV_HEIGHT + (playStorePromoOpen ? PLAY_STORE_PROMO_RESERVE : 0)}px + env(safe-area-inset-bottom))`,
          }}
        >
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#333' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>⚙️</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                Loading events...
              </div>
            </div>
          ) : loadError ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
              <div
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 22,
                  color: '#FF6B35',
                  letterSpacing: 1,
                  marginBottom: 8,
                }}
              >
                CONNECTION ERROR
              </div>
              <div
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13,
                  color: '#555',
                  marginBottom: 12,
                }}
              >
                Could not load events.
              </div>
              {loadErrorMessage && (
                <div
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 12,
                    color: '#B00020',
                    marginBottom: 16,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {loadErrorMessage}
                </div>
              )}
              <button
                onClick={() => {
                  setLoadError(false)
                  setLoadErrorMessage('')
                  loadEvents()
                }}
                style={{
                  background: '#FF6B35',
                  color: '#0A0A0A',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 24px',
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 16,
                  letterSpacing: 1,
                  cursor: 'pointer',
                }}
              >
                RETRY
              </button>
            </div>
          ) : sortedEventsForCurrentView.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#333' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🚗</div>
              <div style={{ fontSize: 22, letterSpacing: 1, marginBottom: 6 }}>
                {eventsHiddenByClientFilters > 0
                  ? 'NO MATCHING EVENTS'
                  : view === 'mine'
                    ? 'NO POSTS YET'
                    : 'NO EVENTS YET'}
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#444' }}>
                {eventsHiddenByClientFilters > 0 ? (
                  <>
                    {eventsHiddenByClientFilters} event
                    {eventsHiddenByClientFilters === 1 ? '' : 's'} matched your search but{' '}
                    {eventsHiddenByClientFilters === 1 ? 'is' : 'are'} hidden by active filters.
                    {thisWeekOnly ? ' Turn off This Week' : ''}
                    {thisWeekOnly && nearMeOnly ? ' and' : ''}
                    {nearMeOnly ? ' Near Me' : ''}
                    {(thisWeekOnly || nearMeOnly) && showSavedOnly ? ' and' : ''}
                    {showSavedOnly ? ' Saved' : ''}
                    {thisWeekOnly || nearMeOnly || showSavedOnly ? ' to see them.' : '.'}
                  </>
                ) : view === 'mine' ? (
                  'Your posted meets will show up here.'
                ) : (
                  'Be the first to post a meet in your area!'
                )}
              </div>
            </div>
          ) : (
            <>
              {!debouncedSearchQuery &&
                filterType === 'all' &&
                view !== 'mine' &&
                sortedEventsForCurrentView.some((e) => e.featured) && (
                  <div style={{ marginBottom: 4 }}>
                    <div
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 11,
                        color: '#FF6B35',
                        letterSpacing: 2,
                        marginBottom: 8,
                      }}
                    >
                      ⭐ FEATURED
                    </div>
                    {sortedEventsForCurrentView
                      .filter((e) => e.featured)
                      .map((e) => (
                        <EventCard
                          key={e.id}
                          event={e}
                          saved={savedEventIds.includes(e.id)}
                          onToggleSaved={handleToggleSaved}
                          onClick={() => setSelectedEvent(e)}
                        />
                      ))}
                    <div
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 11,
                        color: '#444',
                        letterSpacing: 2,
                        marginBottom: 8,
                        marginTop: 14,
                      }}
                    >
                      ALL EVENTS
                    </div>
                  </div>
                )}
              {sortedEventsForCurrentView
                .filter((e) =>
                  debouncedSearchQuery || filterType !== 'all' || view === 'mine'
                    ? true
                    : !e.featured,
                )
                .map((e) => (
                  <EventCard
                    key={e.id}
                    event={e}
                    saved={savedEventIds.includes(e.id)}
                    onToggleSaved={handleToggleSaved}
                    onClick={() => setSelectedEvent(e)}
                  />
                ))}
            </>
          )}
        </div>
      )}

      {/* ── BOTTOM NAV ── */}
      <div
        className="meetmap-bottom-nav"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          transform: 'none',
          width: '100%',
          maxWidth: 'none',
          background: isLight ? '#F6F6F6' : '#0A0A0A',
          borderTop: `1px solid ${isLight ? '#E5E5E5' : '#171717'}`,
          display: 'flex',
          justifyContent: 'space-around',
          padding:
            '10px max(0px, env(safe-area-inset-right)) calc(20px + env(safe-area-inset-bottom)) max(0px, env(safe-area-inset-left))',
          zIndex: 200,
        }}
      >
        {[
          { id: 'list', icon: '☰', label: 'LIST' },
          { id: 'map', icon: '🗺', label: 'MAP' },
          ...(user ? [{ id: 'mine', icon: '👤', label: 'MY POSTS' }] : []),
        ].map((nav) => (
          <button
            key={nav.id}
            onClick={() => setView(nav.id)}
            style={{
              background: 'none',
              border: 'none',
              color: view === nav.id ? '#FF6B35' : '#3A3A3A',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <span style={{ fontSize: 22 }}>{nav.icon}</span>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 1,
              }}
            >
              {nav.label}
            </span>
          </button>
        ))}
      </div>

      {/* ── MODALS ── */}
      {showAuth && <AuthModal initialMode={authInitialMode} onClose={closeAuth} />}
      {showAppSettings && <AppSettingsModal onClose={() => setShowAppSettings(false)} />}

      {showNotificationSettings && (
        <NotificationSettingsModal
          onClose={() => setShowNotificationSettings(false)}
          alertsEnabled={alertsEnabled}
          prefs={notificationPrefs}
          saving={notificationPrefsSaving}
          canSyncPrefs={Boolean(user?.id)}
          onPrefChange={handleNotificationPrefChange}
          onRequestEnable={handleEnableNotifications}
          onRequestLogin={() => {
            setShowNotificationSettings(false)
            openAuth()
          }}
        />
      )}
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
          showUpload={
            !!importParams &&
            !!importError &&
            (String(importError).includes('robots.txt') ||
              String(importError).includes('Could not fetch image'))
          }
          uploading={importUploading}
          onPickUpload={handleUploadFlyer}
          onClose={() => setShowImportQueue(false)}
        />
      )}
      {showModerationQueue && canAccessImports && (
        <ModerationQueueModal
          reports={moderationReports}
          loading={moderationLoading}
          resolvingReportId={moderationResolvingReportId}
          onResolve={(reportId, status) => handleModerateReport(reportId, status || 'resolved')}
          onIgnore={(reportId, status) => handleModerateReport(reportId, status || 'ignored')}
          onClose={() => setShowModerationQueue(false)}
        />
      )}
      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          saved={savedEventIds.includes(selectedEvent.id)}
          onToggleSaved={() => handleToggleSaved(selectedEvent.id)}
          onClose={() => closeSelectedEvent()}
          onAuthNeeded={handleAuthNeeded}
          onUpdated={handleUpdated}
          onPrevious={canShowPreviousEvent ? () => openEventAtOffset(-1) : null}
          onNext={canShowNextEvent ? () => openEventAtOffset(1) : null}
          eventPosition={
            selectedEventIndex >= 0
              ? { current: selectedEventIndex + 1, total: sortedEventsForCurrentView.length }
              : null
          }
          onDeleted={(id) => {
            setEvents((prev) => prev.filter((e) => e.id !== id))
            closeSelectedEvent()
          }}
        />
      )}

      <PlayStoreBanner
        bottomOffsetPx={BOTTOM_NAV_HEIGHT}
        onVisibilityChange={handlePlayStoreBannerVisibility}
      />
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
