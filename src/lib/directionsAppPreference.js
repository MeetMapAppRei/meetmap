const STORAGE_KEY = 'meetmap:directions-app'

/** @typedef {'apple' | 'google'} DirectionsApp */

const listeners = new Set()

function notify() {
  for (const fn of listeners) fn()
}

function isIosLike() {
  try {
    const cap = typeof window !== 'undefined' ? window.Capacitor : null
    if (cap?.isNativePlatform?.() && cap.getPlatform?.() === 'ios') return true
  } catch {}
  try {
    return /iphone|ipad|ipod/i.test(String(navigator?.userAgent || ''))
  } catch {
    return false
  }
}

/** Default before the user picks: Apple Maps on iOS, Google Maps elsewhere. */
export function getDefaultDirectionsApp() {
  return isIosLike() ? 'apple' : 'google'
}

/** @returns {DirectionsApp} */
export function getDirectionsAppPreference() {
  try {
    const raw = String(window.localStorage.getItem(STORAGE_KEY) || '').trim().toLowerCase()
    if (raw === 'apple' || raw === 'google') return raw
  } catch {}
  return getDefaultDirectionsApp()
}

/** @param {DirectionsApp} app */
export function setDirectionsAppPreference(app) {
  const next = app === 'apple' ? 'apple' : 'google'
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
  } catch {}
  notify()
}

export function subscribeDirectionsAppPreference(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppleMapsForDirections(app = getDirectionsAppPreference()) {
  return app === 'apple'
}
