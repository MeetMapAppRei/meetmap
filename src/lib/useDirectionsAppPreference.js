import { useSyncExternalStore } from 'react'
import {
  getDirectionsAppPreference,
  subscribeDirectionsAppPreference,
} from './directionsAppPreference'

export function useDirectionsAppPreference() {
  return useSyncExternalStore(
    subscribeDirectionsAppPreference,
    getDirectionsAppPreference,
    getDirectionsAppPreference,
  )
}
