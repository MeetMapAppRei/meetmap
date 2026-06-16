import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'

const PUSH_STEP_TIMEOUT_MS = 25000

const readWindowCapacitor = () => {
  try {
    return typeof window !== 'undefined' ? window.Capacitor : null
  } catch {
    return null
  }
}

const hasIosCapacitorBridge = () => {
  try {
    return Boolean(window?.webkit?.messageHandlers?.bridge)
  } catch {
    return false
  }
}

const hasAndroidCapacitorBridge = () => {
  try {
    return Boolean(window?.androidBridge)
  } catch {
    return false
  }
}

/** True when running inside the Capacitor shell (not Safari / mobile browser). */
export const isNativeAppShell = () => {
  try {
    const cap = readWindowCapacitor()
    if (cap?.isNativePlatform?.()) return true
    const platform = cap?.getPlatform?.()
    if (platform === 'ios' || platform === 'android') return true
  } catch {}
  if (hasIosCapacitorBridge() || hasAndroidCapacitorBridge()) return true
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

const nativePushPlatform = () => {
  try {
    const cap = readWindowCapacitor()
    if (cap?.isNativePlatform?.()) {
      const platform = cap.getPlatform?.()
      if (platform === 'android' || platform === 'ios') return platform
    }
    if (hasIosCapacitorBridge()) return 'ios'
    if (hasAndroidCapacitorBridge()) return 'android'
  } catch {}
  if (!Capacitor.isNativePlatform()) return null
  const platform = Capacitor.getPlatform()
  return platform === 'android' || platform === 'ios' ? platform : null
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

/** Native push works on Android and iOS Capacitor shells. */
export const isNativePushSupported = () => Boolean(nativePushPlatform())

/** @deprecated Use isNativePushSupported */
export const isNativeAndroidPushSupported = () => isNativePushSupported()

export const getNativePushPlatform = () => nativePushPlatform()

export const getWebNotificationPermission = () => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return window.Notification.permission
}

const isIosLikeDevice = () => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** User-facing copy when web Notification API is unavailable (common on iOS Safari). */
export const getWebAlertsUnavailableMessage = () => {
  if (isNativeAppShell()) {
    return 'Meet Map could not start native alerts on this device. Force-quit the app, reopen it, and tap Alerts again. If it keeps failing, delete and reinstall from the App Store.'
  }
  if (isIosLikeDevice()) {
    return 'Safari on iPhone and iPad cannot show Meet Map alerts. Install the Meet Map app from the App Store (or TestFlight) to get reminders for saved events.'
  }
  if (/Android/i.test(typeof navigator !== 'undefined' ? navigator.userAgent || '' : '')) {
    return 'This browser cannot show Meet Map alerts. Install the Meet Map app from Google Play for reminders on saved events.'
  }
  return 'This browser does not support notifications. Install the Meet Map mobile app for alerts on saved events.'
}

export const requestWebNotificationPermission = async () => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return window.Notification.requestPermission()
}

/**
 * Read native push permission without prompting or registering.
 * Safe to call on app startup.
 */
export const getNativePushPermission = async () => {
  if (!isNativePushSupported()) return 'unsupported'
  try {
    const permission = await PushNotifications.checkPermissions()
    const receive = permission?.receive || 'prompt'
    return receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt'
  } catch {
    return 'denied'
  }
}

/**
 * Register a tap handler for push notifications without prompting for permissions.
 * Useful on app startup so tapping a notification can deep-link into the app.
 */
export const addNativePushTapListener = (onNotificationTap) => {
  if (!isNativePushSupported()) return null
  if (typeof onNotificationTap !== 'function') return null
  try {
    return PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      try {
        onNotificationTap(action)
      } catch (e) {
        console.warn('Native push tap handler failed:', e)
      }
    })
  } catch (e) {
    console.warn('Failed to add native push tap listener:', e)
    return null
  }
}

export const initializeNativePush = async ({
  onToken,
  onRegistrationError,
  onNotificationTap,
} = {}) => {
  const platform = nativePushPlatform()
  if (!platform) {
    return { enabled: false, reason: 'not-native' }
  }

  try {
    await PushNotifications.removeAllListeners()
  } catch {}

  let resolveRegistration
  let rejectRegistration
  const registrationResult = new Promise((resolve, reject) => {
    resolveRegistration = resolve
    rejectRegistration = reject
  })

  PushNotifications.addListener('registration', (token) => {
    const tokenValue = token?.value || ''
    if (typeof onToken === 'function') onToken(tokenValue)
    resolveRegistration(tokenValue)
  })

  PushNotifications.addListener('registrationError', (err) => {
    if (typeof onRegistrationError === 'function') onRegistrationError(err)
    rejectRegistration(err instanceof Error ? err : new Error(String(err)))
  })

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    if (typeof onNotificationTap === 'function') onNotificationTap(action)
  })

  let request
  try {
    request = await withTimeout(
      PushNotifications.requestPermissions(),
      PUSH_STEP_TIMEOUT_MS,
      'Timed out waiting for notification permission.',
    )
  } catch (e) {
    if (typeof onRegistrationError === 'function') onRegistrationError(e)
    const msg = e?.message || String(e)
    if (/timed out/i.test(msg)) {
      return { enabled: false, reason: 'timed-out', message: msg }
    }
    return { enabled: false, reason: 'permission-denied' }
  }
  const receive = request?.receive || 'denied'
  if (receive !== 'granted') {
    return { enabled: false, reason: 'permission-denied' }
  }

  const registerTimeoutMessage =
    platform === 'ios'
      ? 'Timed out waiting for push token. In Xcode, enable Push Notifications for the App target and use a physical device.'
      : 'Timed out waiting for push token (check Google Play services / Firebase on this device).'

  try {
    await PushNotifications.register()
    const token = await withTimeout(
      registrationResult,
      PUSH_STEP_TIMEOUT_MS,
      registerTimeoutMessage,
    )
    return { enabled: true, token, platform }
  } catch (e) {
    if (typeof onRegistrationError === 'function') onRegistrationError(e)
    const msg = e?.message || String(e)
    if (/timed out/i.test(msg)) {
      return { enabled: false, reason: 'timed-out', message: msg }
    }
    return { enabled: false, reason: 'register-failed' }
  }
}
