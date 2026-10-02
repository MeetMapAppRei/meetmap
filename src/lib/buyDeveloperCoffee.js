import { isNativeAppShell } from './pushNotifications'

/** Public Stripe Payment Link. Override with VITE_TIP_PAYMENT_LINK. */
export const BUY_DEVELOPER_COFFEE_URL = String(import.meta.env.VITE_TIP_PAYMENT_LINK || '').trim()

/** Websites only — hidden in the Capacitor iOS/Android shells and when no URL is set. */
export function shouldShowBuyDeveloperCoffee() {
  return Boolean(BUY_DEVELOPER_COFFEE_URL) && !isNativeAppShell()
}
