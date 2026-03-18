import { useState, useEffect, useCallback } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { fetchEvents, signOut } from './lib/supabase'
import AuthModal from './components/AuthModal'
import PostEventForm from './components/PostEventForm'
import EventDetail from './components/EventDetail'
import EventCard from './components/EventCard'
import MapView from './components/MapView'

function AppInner() {
  const { user, loading: authLoading } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [view, setView] = useState('list')
  const [filterType, setFilterType] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const [showPost, setShowPost] = useState(false)
  const [mapSelected, setMapSelected] = useState(null)
  const [showPast, setShowPast] = useState(false)

  const RADIUS_MILES = 25
  const [nearMeOnly, setNearMeOnly] = useState(false)
  const [nearMeCoords, setNearMeCoords] = useState(null)
  const [nearMeError, setNearMeError] = useState('')

  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchEvents({ type: filterType, search: searchQuery, showPast })
      setEvents(data || [])
    } catch (e) {
      console.error('Failed to load events:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [filterType, searchQuery, showPast])

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

  const toRad = (deg) => (deg * Math.PI) / 180
  const distanceMiles = (lat1, lon1, lat2, lon2) => {
    const R = 3958.8 // Earth radius in miles
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  const eventsForDisplay = nearMeOnly && nearMeCoords
    ? events
      .filter(e => Number.isFinite(e.lat) && Number.isFinite(e.lng) && distanceMiles(nearMeCoords.lat, nearMeCoords.lng, e.lat, e.lng) <= RADIUS_MILES)
      .sort((a, b) => (
        distanceMiles(nearMeCoords.lat, nearMeCoords.lng, a.lat, a.lng) -
        distanceMiles(nearMeCoords.lat, nearMeCoords.lng, b.lat, b.lng)
      ))
    : events

  const upcomingCount = eventsForDisplay.filter(e => e.date >= new Date().toISOString().split('T')[0]).length

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

  return (
    <div style={{
      fontFamily: "'Bebas Neue', 'Impact', sans-serif",
      background: '#0A0A0A', minHeight: '100vh', color: '#F0F0F0',
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
        background: '#0A0A0A', borderBottom: '1px solid #171717',
        padding: '14px 18px 10px', position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
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

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {user ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#555' }}>
                  👤 {user.user_metadata?.username || user.email?.split('@')[0]}
                </div>
                <button
                  onClick={signOut}
                  style={{ background: 'none', border: '1px solid #222', borderRadius: 6, padding: '5px 10px', color: '#555', fontFamily: "'DM Sans', sans-serif", fontSize: 11, cursor: 'pointer' }}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                style={{ background: 'none', border: '1px solid #FF6B3555', borderRadius: 8, padding: '7px 14px', color: '#FF6B35', fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: 1.5, cursor: 'pointer' }}
              >
                LOG IN
              </button>
            )}
            <button
              onClick={() => user ? setShowPost(true) : setShowAuth(true)}
              style={{ background: '#FF6B35', color: '#0A0A0A', border: 'none', borderRadius: 8, padding: '8px 14px', fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: 1.5, cursor: 'pointer' }}
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
            style={{ width: '100%', background: '#111', border: '1px solid #1A1A1A', borderRadius: 8, padding: '9px 12px 9px 33px', color: '#F0F0F0', fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}
          />
        </div>

        {/* Filter chips + past toggle */}
        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2, alignItems: 'center' }}>
          {['all', 'meet', 'car show', 'track day', 'cruise'].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              style={{
                flexShrink: 0, background: filterType === type ? '#FF6B35' : '#111',
                color: filterType === type ? '#0A0A0A' : '#666',
                border: '1px solid', borderColor: filterType === type ? '#FF6B35' : '#1A1A1A',
                borderRadius: 20, padding: '5px 13px',
                fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
                cursor: 'pointer', textTransform: 'capitalize',
              }}
            >
              {type === 'all' ? 'All Events' : type}
            </button>
          ))}
          <button
            onClick={() => setShowPast(p => !p)}
            style={{
              flexShrink: 0, background: showPast ? '#333' : '#111',
              color: showPast ? '#aaa' : '#444',
              border: '1px solid', borderColor: showPast ? '#444' : '#1A1A1A',
              borderRadius: 20, padding: '5px 13px',
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {showPast ? '✓ Past Events' : 'Past Events'}
          </button>

          <button
            onClick={() => {
              if (nearMeOnly) setNearMeOnly(false)
              else requestNearMe()
            }}
            style={{
              flexShrink: 0, background: nearMeOnly ? '#333' : '#111',
              color: nearMeOnly ? '#aaa' : '#444',
              border: '1px solid', borderColor: nearMeOnly ? '#FF6B35' : '#1A1A1A',
              borderRadius: 20, padding: '5px 13px',
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {nearMeOnly ? `✓ Near Me` : `Near Me`}
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
              {!searchQuery && filterType === 'all' && eventsForDisplay.some(e => e.featured) && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#FF6B35', letterSpacing: 2, marginBottom: 8 }}>⭐ FEATURED</div>
                  {eventsForDisplay.filter(e => e.featured).map(e => (
                    <EventCard key={e.id} event={e} onClick={() => setSelectedEvent(e)} />
                  ))}
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#444', letterSpacing: 2, marginBottom: 8, marginTop: 14 }}>ALL EVENTS</div>
                </div>
              )}
              {eventsForDisplay
                .filter(e => (searchQuery || filterType !== 'all') ? true : !e.featured)
                .map(e => (
                  <EventCard key={e.id} event={e} onClick={() => setSelectedEvent(e)} />
                ))}
            </>
          )}
        </div>
      )}

      {/* ── BOTTOM NAV ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 480, background: '#0A0A0A',
        borderTop: '1px solid #171717', display: 'flex',
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
      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
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
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
