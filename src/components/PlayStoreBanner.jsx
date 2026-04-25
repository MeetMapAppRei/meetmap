import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { useTheme } from '../lib/useTheme'

const STORAGE_KEY = 'meetmap:android-app-promo-snooze-until'
const SNOOZE_MS = 10 * 24 * 60 * 60 * 1000
const DESKTOP_MQ = '(min-width: 768px)'

const defaultPlayUrl = 'https://play.google.com/store/apps/details?id=com.meetmap.app'

/** Hide promo inside the installed Capacitor shell (Play Store / native app). */
function isNativeAppShell() {
  try {
    const p = Capacitor.getPlatform()
    if (p === 'android' || p === 'ios') return true
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

function useDesktopLayout() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(DESKTOP_MQ).matches : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ)
    const apply = () => setIsDesktop(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return isDesktop
}

const bebas = "'Bebas Neue', 'Impact', sans-serif"
const dm = "'DM Sans', sans-serif"

/**
 * @param {object} props
 * @param {number} [props.bottomOffsetPx] — lift above fixed bottom nav (mobile).
 * @param {(visible: boolean, meta?: { placement: 'top' | 'bottom' }) => void} [props.onVisibilityChange]
 */
export default function PlayStoreBanner({ bottomOffsetPx = 0, onVisibilityChange }) {
  const { isLight } = useTheme()
  const [visible, setVisible] = useState(false)
  const isDesktopLayout = useDesktopLayout()
  const barRef = useRef(null)

  const playUrl =
    String(import.meta.env.VITE_PLAY_STORE_URL || defaultPlayUrl).trim() || defaultPlayUrl

  const bottom =
    bottomOffsetPx > 0
      ? `calc(${bottomOffsetPx}px + env(safe-area-inset-bottom, 0px))`
      : `env(safe-area-inset-bottom, 0px)`

  const placement = isDesktopLayout ? 'top' : 'bottom'

  useEffect(() => {
    let cancelled = false
    let timeoutId = 0
    const decide = () => {
      if (cancelled) return
      if (isNativeAppShell()) {
        setVisible(false)
        return
      }
      // Desktop promo should be reliably present; on mobile, allow a snooze so it doesn't
      // cover the bottom nav repeatedly.
      if (isDesktopLayout) {
        setVisible(true)
        return
      }
      const until = readSnoozeUntil()
      if (Date.now() < until) return
      setVisible(true)
    }
    // Defer: on Android the Capacitor bridge sometimes reports "web" for one frame; without this,
    // the Play promo portals above the app (z-index) and steals all taps including "Alerts".
    const raf = requestAnimationFrame(() => {
      decide()
      timeoutId = window.setTimeout(decide, 300)
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  }, [isDesktopLayout])

  useEffect(() => {
    onVisibilityChange?.(visible, { placement })
  }, [visible, placement, onVisibilityChange])

  useLayoutEffect(() => {
    if (typeof document === 'undefined') return undefined
    if (!visible || placement !== 'top') {
      document.documentElement.style.removeProperty('--meetmap-play-promo-top')
      return undefined
    }
    const el = barRef.current
    if (!el) return undefined
    const sync = () => {
      const h = el.getBoundingClientRect().height
      document.documentElement.style.setProperty('--meetmap-play-promo-top', `${Math.ceil(h)}px`)
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    window.addEventListener('resize', sync)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sync)
      document.documentElement.style.removeProperty('--meetmap-play-promo-top')
    }
  }, [visible, placement])

  const snooze = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now() + SNOOZE_MS))
    } catch {}
    setVisible(false)
  }

  if (!visible || typeof document === 'undefined') return null

  const portalRoot = document.getElementById('root') || document.body

  const border = isLight ? '#E5E5E5' : '#2A2A2A'
  const bg = isLight ? '#FFFFFF' : '#141414'
  const text = isLight ? '#222' : '#E8E8E8'
  const muted = isLight ? '#666' : '#9A9A9A'

  const btnPrimary = {
    background: '#FF6B35',
    color: '#0A0A0A',
    fontFamily: bebas,
    fontSize: 14,
    letterSpacing: 1.05,
    textDecoration: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  }

  const btnGhost = {
    background: 'transparent',
    border: `1px solid ${border}`,
    borderRadius: 8,
    padding: '7px 12px',
    fontFamily: dm,
    fontSize: 12,
    fontWeight: 600,
    color: text,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  const dismissBtn = {
    flexShrink: 0,
    background: 'none',
    border: 'none',
    color: muted,
    fontSize: 22,
    lineHeight: 1,
    cursor: 'pointer',
    padding: '0 4px',
  }

  const outer =
    placement === 'top'
      ? {
          position: 'fixed',
          left: 0,
          right: 0,
          top: 'env(safe-area-inset-top, 0px)',
          bottom: 'auto',
          zIndex: 650,
          padding: '10px 16px',
          paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(16px, env(safe-area-inset-right, 0px))',
          background: bg,
          borderBottom: `1px solid ${border}`,
          boxShadow: isLight ? '0 4px 24px rgba(0,0,0,0.08)' : '0 4px 24px rgba(0,0,0,0.5)',
        }
      : {
          position: 'fixed',
          left: 0,
          right: 0,
          bottom,
          top: 'auto',
          zIndex: 650,
          padding: '12px 14px 12px',
          paddingLeft: 'max(14px, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(14px, env(safe-area-inset-right, 0px))',
          background: bg,
          borderTop: `1px solid ${border}`,
          boxShadow: isLight ? '0 -8px 32px rgba(0,0,0,0.08)' : '0 -8px 32px rgba(0,0,0,0.45)',
        }

  const shell = (
    <div
      ref={placement === 'top' ? barRef : undefined}
      role="dialog"
      aria-label="Get the Meet Map Android app"
      style={outer}
    >
      {placement === 'top' ? (
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              minWidth: 0,
              flex: '1 1 220px',
            }}
          >
            <span
              style={{
                fontFamily: bebas,
                fontSize: 16,
                letterSpacing: 1.2,
                color: '#FF6B35',
              }}
            >
              ANDROID APP ON GOOGLE PLAY
            </span>
            <span
              style={{
                fontFamily: dm,
                fontSize: 12,
                color: muted,
                fontWeight: 500,
              }}
            >
              Alerts for saved meets and a faster map.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <a href={playUrl} target="_blank" rel="noopener noreferrer" style={btnPrimary}>
              OPEN PLAY STORE
            </a>
            <button type="button" onClick={snooze} style={btnGhost}>
              Maybe later
            </button>
            <button type="button" onClick={snooze} aria-label="Dismiss" style={dismissBtn}>
              ×
            </button>
          </div>
        </div>
      ) : (
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
                  fontFamily: bebas,
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
                  fontFamily: dm,
                  fontSize: 12,
                  lineHeight: 1.45,
                  color: muted,
                  fontWeight: 500,
                }}
              >
                Faster map, alerts for saved meets, and the same community — now on Google Play.
              </p>
            </div>
            <button type="button" onClick={snooze} aria-label="Dismiss" style={dismissBtn}>
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
                ...btnPrimary,
                flex: '1 1 140px',
                textAlign: 'center',
                fontSize: 15,
                padding: '10px 14px',
              }}
            >
              OPEN PLAY STORE
            </a>
            <button type="button" onClick={snooze} style={{ ...btnGhost, flex: '1 1 120px' }}>
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>
  )

  return createPortal(shell, portalRoot)
}
