/**
 * Base URL for same-origin API routes (`/api/...`).
 * - Web (Vercel, etc.): leave `VITE_APP_ORIGIN` unset → relative `/api/...` works.
 * - Capacitor / native: set `VITE_APP_ORIGIN=https://your-production-domain.com` at build time
 *   so flyer/AI endpoints hit your deployed backend.
 */
export function getAppOrigin() {
  const raw = import.meta.env.VITE_APP_ORIGIN
  if (raw == null || String(raw).trim() === '') {
    // Capacitor builds can occasionally miss injected env values; keep API calls
    // pointed at the deployed backend instead of falling back to local app HTML.
    return 'https://meetmap-gilt.vercel.app'
  }
  return String(raw).replace(/\/$/, '')
}

/** @param {string} path e.g. `/api/extract-flyer` */
export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  const origin = getAppOrigin()
  return origin ? `${origin}${p}` : p
}
