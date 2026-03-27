import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'

const isNativeAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

export const isNativeAndroidPushSupported = () => isNativeAndroid()

export const getWebNotificationPermission = () => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return window.Notification.permission
}

export const requestWebNotificationPermission = async () => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return window.Notification.requestPermission()
}

/**
 * Read native Android push permission without prompting or registering.
 * This should be safe to call on app startup.
 */
export const getNativePushPermission = async () => {
  if (!isNativeAndroid()) return 'unsupported'
  try {
    const permission = await PushNotifications.checkPermissions()
    const receive = permission?.receive || 'prompt'
    return receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt'
  } catch {
    return 'denied'
  }
}

export const initializeNativePush = async ({
  onToken,
  onRegistrationError,
  onNotificationTap,
} = {}) => {
  if (!isNativeAndroid()) {
    return { enabled: false, reason: 'not-native-android' }
  }

  try {
    await PushNotifications.removeAllListeners()
  } catch {}

  PushNotifications.addListener('registration', (token) => {
    if (typeof onToken === 'function') onToken(token?.value || '')
  })

  PushNotifications.addListener('registrationError', (err) => {
    if (typeof onRegistrationError === 'function') onRegistrationError(err)
  })

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    if (typeof onNotificationTap === 'function') onNotificationTap(action)
  })

  const request = await PushNotifications.requestPermissions()
  const receive = request?.receive || 'denied'
  if (receive !== 'granted') {
    return { enabled: false, reason: 'permission-denied' }
  }

  try {
    await PushNotifications.register()
    return { enabled: true }
  } catch (e) {
    if (typeof onRegistrationError === 'function') onRegistrationError(e)
    return { enabled: false, reason: 'register-failed' }
  }
}
