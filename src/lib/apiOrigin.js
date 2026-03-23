/**
 * Base URL for same-origin API routes (`/api/...`).
 * - Web (Vercel, etc.): leave `VITE_APP_ORIGIN` unset → relative `/api/...` works.
 * - Capacitor / native: set `VITE_APP_ORIGIN=https://your-production-domain.com` at build time
 *   so flyer/AI endpoints hit your deployed backend.
 */
export function getAppOrigin() {
  const raw = import.meta.env.VITE_APP_ORIGIN
  if (raw == null || String(raw).trim() === '') {
    // Web should use same-origin API routes.
    // Capacitor can miss injected env values, so keep a safe production fallback there.
    if (typeof window !== 'undefined' && window?.Capacitor) {
      return 'https://findcarmeets.com'
    }
    return ''
  }
  return String(raw).replace(/\/$/, '')
}

/** @param {string} path e.g. `/api/extract-flyer` */
export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  const origin = getAppOrigin()
  return origin ? `${origin}${p}` : p
}
