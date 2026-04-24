import { useTheme } from '../lib/ThemeContext'
import { getEventQuality } from '../lib/eventQuality'
import { formatEventTime } from '../lib/formatEventTime'

const TYPE_COLORS = {
  meet: '#FF6B35',
  'car show': '#FFD700',
  'track day': '#00D4FF',
  cruise: '#7CFF6B',
}
const STATUS_META = {
  moved: { label: 'Moved', fg: '#00D4FF', bg: '#00D4FF22' },
  delayed: { label: 'Delayed', fg: '#FFD700', bg: '#FFD70022' },
  canceled: { label: 'Canceled', fg: '#FF6060', bg: '#FF353522' },
}
const getDirectionsUrl = (event) => {
  const query = (event?.address || `${event?.location || ''}, ${event?.city || ''}`).trim()
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

export default function EventCard({ event, onClick, saved = false, onToggleSaved }) {
  const { isLight } = useTheme()
  const color = TYPE_COLORS[event.type] || '#FF6B35'
  // Local day boundary to match feed filtering (avoid UTC rollover hiding "today" events).
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`
  const isToday = event.date === today
  const isPast = event.date < today
  const posterUsername = event?.profiles?.username
  const posterAvatarUrl = event?.profiles?.avatar_url
  const goingCount =
    event.going_count || event.event_attendees?.[0]?.count || event.attendee_count || 0
  const interestedCount = event.interested_count || 0
  const directionsUrl = getDirectionsUrl(event)
  const statusMeta = STATUS_META[String(event.status || 'active').toLowerCase()]
  const quality = getEventQuality(event)

  return (
    <div
      onClick={onClick}
      style={{
        background: event.featured
          ? isLight
            ? 'linear-gradient(135deg, #FFFFFF, #F6F6F6)'
            : 'linear-gradient(135deg, #141414, #111)'
          : isLight
            ? '#FFFFFF'
            : '#111',
        border: `1px solid ${event.featured ? (isLight ? '#FFE9DD' : '#2A1A0A') : isLight ? '#E5E5E5' : '#1A1A1A'}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 12,
        marginBottom: 10,
        overflow: 'hidden',
        cursor: 'pointer',
        opacity: isPast ? 0.55 : 1,
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = `0 8px 32px ${color}18`
      }}
      onMouseLeave={(e) => {
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 10,
                fontWeight: 700,
                background: color + '22',
                color,
                padding: '2px 9px',
                borderRadius: 20,
                textTransform: 'capitalize',
                letterSpacing: 0.5,
              }}
            >
              {event.type}
            </span>
            {isToday && (
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 10,
                  fontWeight: 700,
                  background: '#FF6B3522',
                  color: '#FF6B35',
                  padding: '2px 9px',
                  borderRadius: 20,
                  letterSpacing: 0.5,
                }}
              >
                TODAY
              </span>
            )}
            {event.featured && (
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 10,
                  fontWeight: 700,
                  background: '#FFD70022',
                  color: '#FFD700',
                  padding: '2px 9px',
                  borderRadius: 20,
                  letterSpacing: 0.5,
                }}
              >
                ⭐ FEATURED
              </span>
            )}
            {statusMeta && (
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 10,
                  fontWeight: 700,
                  background: statusMeta.bg,
                  color: statusMeta.fg,
                  padding: '2px 9px',
                  borderRadius: 20,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
              >
                {statusMeta.label}
              </span>
            )}
            {quality && (
              <span
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 10,
                  fontWeight: 700,
                  background: quality.bg,
                  color: quality.fg,
                  padding: '2px 9px',
                  borderRadius: 20,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
                title={`${quality.label} (${quality.score}/100)`}
              >
                {quality.short}
              </span>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleSaved?.(event.id)
            }}
            style={{
              border: `1px solid ${saved ? '#FF6B35' : isLight ? '#E5E5E5' : '#2A2A2A'}`,
              background: saved ? '#26140E' : 'transparent',
              color: saved ? '#FF8A5C' : isLight ? '#555' : '#888',
              borderRadius: 999,
              padding: '2px 8px',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 10,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {saved ? '★ Saved' : '☆ Save'}
          </button>
        </div>

        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 21,
            letterSpacing: 1,
            marginBottom: posterUsername ? 2 : 4,
            lineHeight: 1.1,
          }}
        >
          {event.title}
        </div>

        {posterUsername && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              color: isLight ? '#777' : '#888',
              marginBottom: 4,
            }}
          >
            {posterAvatarUrl ? (
              <img
                src={posterAvatarUrl}
                alt={posterUsername}
                loading="lazy"
                decoding="async"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  objectFit: 'cover',
                  flex: '0 0 auto',
                }}
              />
            ) : (
              <div
                aria-hidden="true"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  background: isLight ? '#E5E5E5' : '#2A2A2A',
                  color: isLight ? '#555' : '#AAA',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textTransform: 'uppercase',
                  flex: '0 0 auto',
                }}
              >
                {String(posterUsername).trim().slice(0, 1)}
              </div>
            )}
            <span>by {posterUsername}</span>
          </div>
        )}

        <div
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            color: isLight ? '#555' : '#666',
            marginBottom: 4,
          }}
        >
          📍 {event.address || `${event.location} · ${event.city}`}
        </div>

        <div
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            color: isLight ? '#777' : '#888',
            marginBottom: event.tags?.length ? 8 : 0,
          }}
        >
          <span style={{ color: color }}> 📅 {event.date}</span>
          {event.time && <span> · {formatEventTime(event.time)}</span>}
          {event.host && <span style={{ color: isLight ? '#666' : '#555' }}> · {event.host}</span>}
        </div>
        {event.latest_update_message && (
          <div
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              color: isLight ? '#D1491A' : '#FF8A5C',
              marginBottom: 8,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            📣 {event.latest_update_message}
          </div>
        )}

        {event.tags?.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {event.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                style={{
                  display: 'inline-block',
                  padding: '2px 9px',
                  borderRadius: 20,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 11,
                  fontWeight: 600,
                  border: `1px solid ${color}33`,
                  color: color + 'cc',
                  background: color + '0A',
                  margin: '2px',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              color: isLight ? '#666' : '#555',
            }}
          >
            👥{' '}
            <span style={{ color: isLight ? '#777' : '#777' }}>
              {goingCount} going{interestedCount > 0 ? ` · ${interestedCount} interested` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 11,
                color: isLight ? '#D1491A' : '#FF8A5C',
                border: `1px solid ${isLight ? '#F0C3B3' : '#3A241C'}`,
                borderRadius: 999,
                padding: '3px 8px',
                textDecoration: 'none',
              }}
            >
              Directions
            </a>
            <div
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                color: isLight ? '#444' : '#444',
              }}
            >
              Tap to view →
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
