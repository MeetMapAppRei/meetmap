/**
 * User-facing copy for post-meet failures (upload + create), with optional short ref id for support.
 */
import { humanizeFetchError } from './geocode'

/** Extract HTTP status from Error.status or message text like "failed (413)". */
export function parseHttpStatus(err) {
  if (err == null) return null
  const n = Number(err.status ?? err.statusCode)
  if (Number.isFinite(n) && n >= 100 && n <= 599) return n
  const msg = String(err.message || '')
  const paren = msg.match(/\((\d{3})\)/)
  if (paren) {
    const s = parseInt(paren[1], 10)
    if (s >= 100 && s <= 599) return s
  }
  return null
}

function refSuffix(correlationId) {
  if (!correlationId) return ''
  const short = String(correlationId).replace(/-/g, '').slice(0, 8)
  return short ? ` Ref: ${short}` : ''
}

/**
 * @param {'uploading_photo' | 'creating_event' | ''} stage
 * @param {unknown} err
 * @param {string} [correlationId]
 */
export function userMessageForPostSubmitError(stage, err, correlationId) {
  const suffix = refSuffix(correlationId)
  const raw = String(err?.message || '')
  const status = parseHttpStatus(err)

  if (raw.includes('An event with the same title, date, and city')) {
    return raw + suffix
  }

  if (stage === 'uploading_photo') {
    if (status === 401 || /sign in to upload/i.test(raw)) {
      return `Sign in again to upload your photo.${suffix}`
    }
    if (status === 403) {
      return `Upload was blocked. Try again or use a different image.${suffix}`
    }
    if (status === 413) {
      return `Photo is too large for upload. Try cropping or a smaller image.${suffix}`
    }
    if (status === 429) {
      return `Too many upload attempts. Wait a moment and try again.${suffix}`
    }
    if (status === 503 || /not configured|R2 storage/i.test(raw)) {
      return `Photo upload is temporarily unavailable. Try again later.${suffix}`
    }
    if (status === 504 || status === 502) {
      return `Upload timed out. Try again with a smaller image or better signal.${suffix}`
    }
  }

  if (stage === 'creating_event') {
    if (status === 401 || /jwt|session expired|invalid login|not authorized/i.test(raw)) {
      return `Sign in again to post your meet.${suffix}`
    }
    if (status === 403) {
      return `Posting was denied. Check your account and try again.${suffix}`
    }
    if (status === 503 || status === 504 || status === 502) {
      return `Could not save your meet. Service may be busy — try again shortly.${suffix}`
    }
  }

  const base = humanizeFetchError(err)
  const genericSignal =
    base === 'Connection problem. Check your signal and try again.' ||
    base === 'Connection timed out. Please try again.'

  if (!genericSignal) {
    return (base || 'Something went wrong. Please try again.') + suffix
  }

  if (stage === 'uploading_photo') {
    return `Couldn't upload your photo. Check your connection and try again.${suffix}`
  }
  if (stage === 'creating_event') {
    return `Couldn't save your meet. Check your connection and try again.${suffix}`
  }
  return `Couldn't post your meet. Check your connection and try again.${suffix}`
}
