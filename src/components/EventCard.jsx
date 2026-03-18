const TYPE_COLORS = {
  meet: '#FF6B35', 'car show': '#FFD700', 'track day': '#00D4FF', cruise: '#7CFF6B',
}

export default function EventCard({ event, onClick }) {
  const color = TYPE_COLORS[event.type] || '#FF6B35'
  const today = new Date().toISOString().split('T')[0]
  const isToday = event.date === today
  const isPast = event.date < today
  const attendeeCount = event.event_attendees?.[0]?.count || event.attendee_count || 0

  return (
    <div
      onClick={onClick}
      style={{
        background: event.featured ? 'linear-gradient(135deg, #141414, #111)' : '#111',
        border: `1px solid ${event.featured ? '#2A1A0A' : '#1A1A1A'}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 12,
        marginBottom: 10,
        overflow: 'hidden',
        cursor: 'pointer',
        opacity: isPast ? 0.55 : 1,
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = `0 8px 32px ${color}18`
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Photo strip */}
      {event.photo_url && (
        <div style={{ height: 120, overflow: 'hidden' }}>
          <img
            src={event.photo_url}
            alt={event.title}
            loading="lazy"
            decoding="async"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      )}

      <div style={{ padding: '13px 16px 14px' }}>
        {/* Badges row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, background: color + '22', color, padding: '2px 9px', borderRadius: 20, textTransform: 'capitalize', letterSpacing: 0.5 }}>
            {event.type}
          </span>
          {isToday && (
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, background: '#FF6B3522', color: '#FF6B35', padding: '2px 9px', borderRadius: 20, letterSpacing: 0.5 }}>
              TODAY
            </span>
          )}
          {event.featured && (
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, background: '#FFD70022', color: '#FFD700', padding: '2px 9px', borderRadius: 20, letterSpacing: 0.5 }}>
              ⭐ FEATURED
            </span>
          )}
        </div>

        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 21, letterSpacing: 1, marginBottom: 4, lineHeight: 1.1 }}>{event.title}</div>

        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#666', marginBottom: 4 }}>
          📍 {event.address || `${event.location} · ${event.city}`}
        </div>

        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#888', marginBottom: event.tags?.length ? 8 : 0 }}>
          <span style={{ color }}> 📅 {event.date}</span>
          {event.time && <span> · {event.time}</span>}
          {event.host && <span style={{ color: '#555' }}> · {event.host}</span>}
        </div>

        {event.tags?.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {event.tags.slice(0, 4).map(tag => (
              <span key={tag} style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, border: `1px solid ${color}33`, color: color + 'cc', background: color + '0A', margin: '2px' }}>{tag}</span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#555' }}>
            👥 <span style={{ color: '#777' }}>{attendeeCount} going</span>
          </div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#444' }}>
            Tap to view →
          </div>
        </div>
      </div>
    </div>
  )
}
