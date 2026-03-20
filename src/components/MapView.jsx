import { useEffect, useRef, useState } from 'react'

// 👇 STEP 2: Replace with your Mapbox public token
// Found at: mapbox.com → Account → Access Tokens
// Public token fallback keeps mobile builds working even when .env injection fails.
const MAPBOX_TOKEN = String(
  import.meta.env.VITE_MAPBOX_TOKEN ||
  'pk.eyJ1IjoiY2FybWVldGFwcCIsImEiOiJjbW1vemY0NWwwaWo2MnBvazEwcXN3eGl3In0.VzSvHEV_lIfm67HuFw1Cow'
).trim()
const TYPE_COLORS = {
  meet: '#FF6B35', 'car show': '#FFD700', 'track day': '#00D4FF', cruise: '#7CFF6B',
}

export default function MapView({ events, onSelectEvent, centerOn, bottomNavHeight = 110 }) {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const markersRef = useRef([])
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapboxError, setMapboxError] = useState(false)

  useEffect(() => {
    if (map.current || !mapContainer.current) return
    if (!MAPBOX_TOKEN || MAPBOX_TOKEN === 'YOUR_MAPBOX_PUBLIC_TOKEN') {
      setMapboxError(true)
      return
    }

    // Dynamically load Mapbox GL JS
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css'
    document.head.appendChild(link)

    const script = document.createElement('script')
    script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js'
    script.onload = () => {
      if (!window.mapboxgl) {
        setMapboxError(true)
        return
      }
      window.mapboxgl.accessToken = MAPBOX_TOKEN

      map.current = new window.mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [-117.5, 34.0],
        zoom: 9,
      })

      map.current.on('load', () => setMapLoaded(true))
      map.current.on('error', () => setMapboxError(true))

      // Add navigation controls
      map.current.addControl(new window.mapboxgl.NavigationControl(), 'bottom-right')

      // Default map center; we only fly to the user when the parent requests it.
    }
    script.onerror = () => setMapboxError(true)
    document.head.appendChild(script)
  }, [])

  // Fly to a provided center (ex: "Near Me").
  // We only run this after the map is loaded.
  useEffect(() => {
    if (!map.current || !mapLoaded || !window.mapboxgl) return
    if (!centerOn?.lat || !centerOn?.lng) return
    map.current.flyTo({ center: [centerOn.lng, centerOn.lat], zoom: 11, speed: 1.2 })
  }, [mapLoaded, centerOn])

  // Add markers when events or map change
  useEffect(() => {
    if (!mapLoaded || !window.mapboxgl) return

    // Clear old markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    events.filter(e => e.lat && e.lng).forEach(event => {
      const color = TYPE_COLORS[event.type] || '#FF6B35'

      const el = document.createElement('div')
      el.innerHTML = `
        <div style="
          width:36px;height:36px;
          background:${color};
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 4px 16px ${color}88;
          border:2px solid rgba(255,255,255,0.2);
          cursor:pointer;
          transition:transform 0.15s ease;
        ">
          <span style="transform:rotate(45deg);font-size:16px">${getIcon(event.type)}</span>
        </div>
      `
      el.style.cssText = 'cursor:pointer;'
      el.addEventListener('mouseenter', () => {
        el.querySelector('div').style.transform = 'rotate(-45deg) scale(1.2)'
      })
      el.addEventListener('mouseleave', () => {
        el.querySelector('div').style.transform = 'rotate(-45deg) scale(1)'
      })

      const marker = new window.mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([event.lng, event.lat])
        .addTo(map.current)

      el.addEventListener('click', () => onSelectEvent(event))
      markersRef.current.push(marker)
    })
  }, [events, mapLoaded, onSelectEvent])

  if (mapboxError || !MAPBOX_TOKEN || MAPBOX_TOKEN === 'YOUR_MAPBOX_PUBLIC_TOKEN') {
    return (
      <FallbackMap events={events} onSelectEvent={onSelectEvent} />
    )
  }

  return (
    <div style={{ position: 'relative', height: `calc(100vh - 175px - ${bottomNavHeight}px - env(safe-area-inset-bottom))` }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      {!mapLoaded && (
        <div style={{
          position: 'absolute', inset: 0, background: '#0A0A0A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 12,
        }}>
          <div style={{ fontSize: 36 }}>🗺️</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", color: '#555', fontSize: 13 }}>Loading map...</div>
        </div>
      )}
    </div>
  )
}

function getIcon(type) {
  const icons = { meet: '🌙', 'car show': '🏆', 'track day': '🏁', cruise: '🛣️' }
  return icons[type] || '📍'
}

// Shown if Mapbox token not yet configured
function FallbackMap({ events, onSelectEvent }) {
  const eventsWithCoords = events.filter(e => e.lat && e.lng)

  return (
    <div style={{
      height: `calc(100vh - 175px - 110px - env(safe-area-inset-bottom))`, background: '#0D0D0D',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,107,53,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,107,53,0.05) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      {/* Setup banner */}
      <div style={{
        position: 'absolute', top: 16, left: 16, right: 16,
        background: '#141414', border: '1px solid #FF6B3555',
        borderRadius: 10, padding: '12px 14px', zIndex: 10,
      }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: '#FF6B35', letterSpacing: 1, marginBottom: 4 }}>MAP SETUP NEEDED</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#666', lineHeight: 1.5 }}>
          Add your free Mapbox token in <code style={{ color: '#FF6B35' }}>src/components/MapView.jsx</code> to enable the live map. See SETUP-GUIDE.md.
        </div>
      </div>

      {/* Fake stylized map pins */}
      {eventsWithCoords.map((e, i) => {
        const x = 10 + ((i * 73) % 75)
        const y = 25 + ((i * 47 + 15) % 55)
        const color = TYPE_COLORS[e.type] || '#FF6B35'
        return (
          <div key={e.id} onClick={() => onSelectEvent(e)} style={{
            position: 'absolute', left: `${x}%`, top: `${y}%`,
            transform: 'translate(-50%, -100%)', cursor: 'pointer', zIndex: 5,
          }}>
            <div style={{
              width: 36, height: 36, background: color,
              borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 16px ${color}66`, fontSize: 16,
            }}>
              <span style={{ transform: 'rotate(45deg)' }}>{getIcon(e.type)}</span>
            </div>
          </div>
        )
      })}

      {eventsWithCoords.length === 0 && (
        <div style={{
          position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
          fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#333', textAlign: 'center',
        }}>
          Post events with coordinates to see them here
        </div>
      )}
    </div>
  )
}
