import { Capacitor } from '@capacitor/core'
import { Dialog } from '@capacitor/dialog'

/** Native-friendly alerts; WebView `window.alert` is unreliable on some Android builds. */
export async function appAlert(message, title = 'Meet Map') {
  try {
    if (Capacitor.isNativePlatform()) {
      await Dialog.alert({ title, message })
      return
    }
  } catch (e) {
    console.warn('Dialog.alert failed, falling back to window.alert:', e)
  }
  if (typeof window !== 'undefined') window.alert(message)
}
