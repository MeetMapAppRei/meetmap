import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { useTheme } from '../lib/ThemeContext'

const STORAGE_KEY = 'meetmap:android-app-promo-snooze-until'
const SNOOZE_MS = 10 * 24 * 60 * 60 * 1000

const defaultPlayUrl = 'https://play.google.com/store/apps/details?id=com.meetmap.app'

/** Hide promo inside the installed Capacitor shell (Play Store / native app). */
function isNativeAppShell() {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

function readSnoozeUntil() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return 0
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

/** When the app has a fixed bottom bar (e.g. tab nav), pass bottomOffsetPx so the promo sits above it. */
export default function PlayStoreBanner({ bottomOffsetPx = 0, onVisibilityChange }) {
  const { isLight } = useTheme()
  const [visible, setVisible] = useState(false)

  const playUrl =
    String(import.meta.env.VITE_PLAY_STORE_URL || defaultPlayUrl).trim() || defaultPlayUrl

  const bottom =
    bottomOffsetPx > 0
      ? `calc(${bottomOffsetPx}px + env(safe-area-inset-bottom, 0px))`
      : `env(safe-area-inset-bottom, 0px)`

  useEffect(() => {
    if (isNativeAppShell()) return
    const until = readSnoozeUntil()
    if (Date.now() < until) return
    setVisible(true)
  }, [])

  useEffect(() => {
    onVisibilityChange?.(visible)
  }, [visible, onVisibilityChange])

  const snooze = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now() + SNOOZE_MS))
    } catch {}
    setVisible(false)
  }

  if (!visible || typeof document === 'undefined') return null

  const border = isLight ? '#E5E5E5' : '#2A2A2A'
  const bg = isLight ? '#FFFFFF' : '#141414'
  const text = isLight ? '#222' : '#E8E8E8'
  const muted = isLight ? '#666' : '#9A9A9A'

  const shell = (
    <div
      role="dialog"
      aria-label="Get the Meet Map Android app"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom,
        zIndex: 99999,
        padding: '12px 14px 12px',
        paddingLeft: 'max(14px, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(14px, env(safe-area-inset-right, 0px))',
        background: bg,
        borderTop: `1px solid ${border}`,
        boxShadow: isLight ? '0 -8px 32px rgba(0,0,0,0.08)' : '0 -8px 32px rgba(0,0,0,0.45)',
      }}
    >
      <div
        style={{
          maxWidth: 720,
          width: '100%',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'Bebas Neue', 'Impact', sans-serif",
                fontSize: 17,
                letterSpacing: 1.2,
                color: '#FF6B35',
                marginBottom: 4,
              }}
            >
              GET THE ANDROID APP
            </div>
            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                lineHeight: 1.45,
                color: muted,
                fontWeight: 500,
              }}
            >
              Faster map, alerts for saved meets, and the same community — now on Google Play.
            </p>
          </div>
          <button
            type="button"
            onClick={snooze}
            aria-label="Dismiss"
            style={{
              flexShrink: 0,
              background: 'none',
              border: 'none',
              color: muted,
              fontSize: 20,
              lineHeight: 1,
              cursor: 'pointer',
              padding: 2,
            }}
          >
            ×
          </button>
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <a
            href={playUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: '1 1 140px',
              textAlign: 'center',
              background: '#FF6B35',
              color: '#0A0A0A',
              fontFamily: "'Bebas Neue', 'Impact', sans-serif",
              fontSize: 15,
              letterSpacing: 1.1,
              textDecoration: 'none',
              borderRadius: 8,
              padding: '10px 14px',
              fontWeight: 600,
            }}
          >
            OPEN PLAY STORE
          </a>
          <button
            type="button"
            onClick={snooze}
            style={{
              flex: '1 1 120px',
              background: 'transparent',
              border: `1px solid ${border}`,
              borderRadius: 8,
              padding: '9px 12px',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              fontWeight: 600,
              color: text,
              cursor: 'pointer',
            }}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(shell, document.body)
}
