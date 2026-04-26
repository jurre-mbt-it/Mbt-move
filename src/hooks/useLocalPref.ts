'use client'

import { useCallback, useSyncExternalStore } from 'react'

const PREF_PREFIX = 'mbt-pref:'

export const PREF_REST_TIMER_ENABLED = 'rest-timer-enabled'

function readRaw(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(PREF_PREFIX + key)
  } catch {
    return null
  }
}

function parseBool(raw: string | null, defaultValue: boolean): boolean {
  if (raw === '0' || raw === 'false') return false
  if (raw === '1' || raw === 'true') return true
  return defaultValue
}

export function getBoolPref(key: string, defaultValue: boolean): boolean {
  return parseBool(readRaw(key), defaultValue)
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  // Cross-tab updates fire 'storage'. Same-tab updates fire 'mbt-pref' (custom).
  window.addEventListener('storage', callback)
  window.addEventListener('mbt-pref', callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener('mbt-pref', callback)
  }
}

/**
 * Boolean preference backed by localStorage. Uses useSyncExternalStore so
 * hydration is consistent and updates from elsewhere (e.g. another tab, or
 * another mounted instance) propagate automatically.
 */
export function useBoolPref(
  key: string,
  defaultValue: boolean,
): [boolean, (v: boolean) => void] {
  const getSnapshot = useCallback(() => readRaw(key), [key])
  const getServerSnapshot = useCallback(() => null, [])
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const value = parseBool(raw, defaultValue)

  const update = useCallback(
    (v: boolean) => {
      try {
        localStorage.setItem(PREF_PREFIX + key, v ? '1' : '0')
        // Notify same-tab subscribers — 'storage' only fires across tabs.
        window.dispatchEvent(new Event('mbt-pref'))
      } catch {}
    },
    [key],
  )

  return [value, update]
}
