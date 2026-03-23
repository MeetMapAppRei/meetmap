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

/**
 * Ordered URLs to try for serverless APIs (presign, relay upload, etc.).
 * Android WebView + custom domain can hit a host that is missing a route; fall back to known deploys.
 * @param {string} path e.g. `/api/storage-presign`
 * @returns {string[]}
 */
export function apiUrlCandidates(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  const primary = apiUrl(p)
  const bases = [
    primary.startsWith('http') ? primary : null,
    typeof window !== 'undefined' && primary.startsWith('/') ? `${window.location.origin}${primary}` : null,
    'https://findcarmeets.com',
    'https://www.findcarmeets.com',
    'https://meetmap-gilt.vercel.app',
  ].filter(Boolean)
  return [...new Set(bases)]
}
