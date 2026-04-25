import { useEffect, useMemo, useState } from 'react'
import { useHasPosted } from '../hooks/useHasPosted'

export default function FirstEventNudge({ onPost, variant = 'mobile', bottomOffsetPx = 120 }) {
  const { hasPosted, loading } = useHasPosted()
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem('nudge_dismissed') === 'true')
    } catch {
      setDismissed(false)
    }
  }, [])

  const show = !loading && hasPosted === false && dismissed === false
  const shell = useMemo(() => {
    const base = {
      background: '#111',
      border: '1px solid #FF6B3544',
      borderRadius: 12,
      padding: 12,
      color: '#EEE',
      fontFamily: "'DM Sans', sans-serif",
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
    }
    if (variant === 'desktop') return { ...base, boxShadow: 'none', background: '#121212' }
    return { ...base, maxWidth: 520, margin: '0 auto' }
  }, [variant])

  if (!show) return null
  return (
    <div
      style={
        variant === 'desktop'
          ? { ...shell }
          : {
              position: 'fixed',
              left: 16,
              right: 16,
              bottom: `calc(${bottomOffsetPx}px + env(safe-area-inset-bottom) + 10px)`,
              zIndex: 180,
              pointerEvents: 'none',
            }
      }
    >
      <div style={variant === 'desktop' ? shell : { ...shell, pointerEvents: 'auto' }}>
        <div style={{ flex: 1, fontSize: 13, lineHeight: 1.3 }}>
          You&apos;re on the map. Now put your event on it.
        </div>
        <button
          onClick={onPost}
          style={{
            background: '#FF6B35',
            color: '#0A0A0A',
            border: 'none',
            borderRadius: 10,
            padding: '9px 12px',
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 16,
            letterSpacing: 1,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Post an event →
        </button>
        <button
          onClick={() => {
            try {
              window.localStorage.setItem('nudge_dismissed', 'true')
            } catch {}
            setDismissed(true)
          }}
          aria-label="Dismiss"
          style={{
            background: 'transparent',
            color: '#AAA',
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: '0 4px',
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}
