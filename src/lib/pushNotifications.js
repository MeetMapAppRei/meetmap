import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'

const PUSH_STEP_TIMEOUT_MS = 25000
export const MEETMAP_PUSH_CHANNEL_ID = 'meetmap_alerts'

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

const ANDROID_CHANNEL_FIX_KEY = 'meetmap_push_channel_v2'

async function ensureAndroidPushChannel() {
  if (nativePushPlatform() !== 'android') return
  try {
    // One-time rebuild for installs that still have the broken res/raw/default sound.
    // Do not delete the channel on every launch — some OEMs then suppress the new channel.
    let rebuilt = false
    try {
      rebuilt = window.localStorage.getItem(ANDROID_CHANNEL_FIX_KEY) === '1'
    } catch {}
    if (!rebuilt) {
      try {
        await PushNotifications.deleteChannel({ id: MEETMAP_PUSH_CHANNEL_ID })
      } catch {}
      try {
        window.localStorage.setItem(ANDROID_CHANNEL_FIX_KEY, '1')
      } catch {}
    }
    let exists = false
    try {
      const listed = await PushNotifications.listChannels()
      exists = (listed?.channels || []).some((channel) => channel?.id === MEETMAP_PUSH_CHANNEL_ID)
    } catch {}
    if (exists) return
    // Do not set sound: 'default' — Capacitor treats that as res/raw/default, which
    // does not exist and breaks notification audio (FileNotFoundException in logcat).
    await PushNotifications.createChannel({
      id: MEETMAP_PUSH_CHANNEL_ID,
      name: 'Meet Map Alerts',
      description: 'Reminders and updates for saved events',
      importance: 5,
      visibility: 1,
      vibration: true,
    })
  } catch (e) {
    console.warn('Failed to create Android push channel:', e)
  }
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

/**
 * When the app is open, Android does not show a system tray notification for FCM
 * `notification` payloads. Callers can surface an in-app alert from this listener.
 */
export const addNativePushReceivedListener = (onNotificationReceived) => {
  if (!isNativePushSupported()) return null
  try {
    return PushNotifications.addListener('pushNotificationReceived', (notification) => {
      if (typeof onNotificationReceived === 'function') {
        try {
          onNotificationReceived(notification)
        } catch (e) {
          console.warn('Native push received handler failed:', e)
        }
      }
    })
  } catch (e) {
    console.warn('Failed to add native push received listener:', e)
    return null
  }
}

/**
 * Re-register for a fresh FCM/APNs token when OS permission is already granted.
 * Does not prompt. Needed because localStorage can keep an UNREGISTERED token
 * that FCM rejects with 404 NotRegistered.
 */
export const refreshNativePushRegistration = async ({
  onToken,
  onRegistrationError,
  onNotificationTap,
  onNotificationReceived,
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

  if (typeof onNotificationTap === 'function') {
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      onNotificationTap(action)
    })
  }

  if (typeof onNotificationReceived === 'function') {
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      onNotificationReceived(notification)
    })
  }

  try {
    const permission = await PushNotifications.checkPermissions()
    const receive = permission?.receive || 'denied'
    if (receive !== 'granted') {
      return { enabled: false, reason: 'permission-denied' }
    }

    await ensureAndroidPushChannel()
    await PushNotifications.register()
    const token = await withTimeout(
      registrationResult,
      PUSH_STEP_TIMEOUT_MS,
      'Timed out refreshing push token.',
    )
    return { enabled: true, token, platform }
  } catch (e) {
    if (typeof onRegistrationError === 'function') onRegistrationError(e)
    const msg = e?.message || String(e)
    if (/timed out/i.test(msg)) {
      return { enabled: false, reason: 'timed-out', message: msg }
    }
    return { enabled: false, reason: 'register-failed', message: msg }
  }
}

export const initializeNativePush = async ({
  onToken,
  onRegistrationError,
  onNotificationTap,
  onNotificationReceived,
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

  if (typeof onNotificationReceived === 'function') {
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      onNotificationReceived(notification)
    })
  }

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
    await ensureAndroidPushChannel()
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

/**
 * Delete the current FCM/APNs token and register again.
 * Capacitor's unregister() does not wait for FCM deleteToken(), so we pause first.
 */
export const rotateNativePushRegistration = async (opts = {}) => {
  if (!nativePushPlatform()) {
    return { enabled: false, reason: 'not-native' }
  }
  try {
    await PushNotifications.unregister()
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 2000))
  return refreshNativePushRegistration(opts)
}
