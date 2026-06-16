import { Capacitor } from '@capacitor/core'

const DEFAULT_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 5 * 60 * 1000,
}

function locationGranted(status) {
  return status?.location === 'granted' || status?.coarseLocation === 'granted'
}

async function loadNativeGeolocation() {
  // Prevent Vite/Rollup from trying to bundle/resolve this native-only plugin in web builds.
  const modName = '@capacitor/geolocation'
  const mod = await import(/* @vite-ignore */ modName)
  return mod?.Geolocation
}

async function ensureNativeLocationPermission(Geolocation) {
  let status = await Geolocation.checkPermissions()
  if (locationGranted(status)) return

  status = await Geolocation.requestPermissions()
  if (!locationGranted(status)) {
    throw new Error('Location permission denied. Enable it in Settings to use Near Me.')
  }
}

export async function getCurrentCoords(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  if (Capacitor.isNativePlatform()) {
    const Geolocation = await loadNativeGeolocation()
    if (!Geolocation) throw new Error('Native geolocation plugin not available')
    await ensureNativeLocationPermission(Geolocation)
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: opts.enableHighAccuracy,
      timeout: opts.timeout,
      maximumAge: opts.maximumAge,
    })
    return { lat: pos.coords.latitude, lng: pos.coords.longitude }
  }

  if (!navigator.geolocation) {
    throw new Error('Geolocation not supported')
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.message || 'Could not get location')),
      opts,
    )
  })
}
