'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

interface UseAutosaveOptions<T> {
  value: T
  onSave: (value: T) => Promise<void>
  draftKey?: string
  debounceMs?: number
  enabled?: boolean
}

interface UseAutosaveResult {
  status: AutosaveStatus
  lastSavedAt: Date | null
  error: unknown
  saveNow: () => Promise<void>
  clearDraft: () => void
}

export function loadDraft<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { value: T; savedAt: number }
    return parsed.value ?? null
  } catch {
    return null
  }
}

export function clearStoredDraft(key: string) {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(key) } catch {}
}

/**
 * Lightweight variant of useAutosave: only mirrors `value` to localStorage on
 * change. No server save, no clearing on commit (caller clears explicitly via
 * `clearStoredDraft` when work is done). Use this for flows where the server
 * commit happens once at the end (e.g. session logging) but you still want
 * tab-close / refresh resilience while in progress.
 */
export function useDraftBackup<T>({
  key,
  value,
  enabled = true,
}: {
  key: string
  value: T
  enabled?: boolean
}): void {
  const lastSerializedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    const serialized = JSON.stringify(value)
    if (lastSerializedRef.current === null) {
      lastSerializedRef.current = serialized
      return
    }
    if (serialized === lastSerializedRef.current) return
    lastSerializedRef.current = serialized
    try {
      localStorage.setItem(key, JSON.stringify({ value, savedAt: Date.now() }))
    } catch {}
  }, [value, enabled, key])
}

export function useAutosave<T>({
  value,
  onSave,
  draftKey,
  debounceMs = 1500,
  enabled = true,
}: UseAutosaveOptions<T>): UseAutosaveResult {
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<unknown>(null)

  const onSaveRef = useRef(onSave)
  const valueRef = useRef(value)
  const lastSeenSerializedRef = useRef<string | null>(null)
  const lastSavedSerializedRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const draftKeyRef = useRef(draftKey)
  const debounceMsRef = useRef(debounceMs)
  // Indirection to avoid the linter complaining about flush referencing itself.
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve())

  useEffect(() => { onSaveRef.current = onSave }, [onSave])
  useEffect(() => { valueRef.current = value }, [value])
  useEffect(() => { draftKeyRef.current = draftKey }, [draftKey])
  useEffect(() => { debounceMsRef.current = debounceMs }, [debounceMs])

  // Serialised save: queues behind any in-flight save so saveNow() can be
  // awaited safely (e.g. for explicit "deploy" actions that need the
  // latest state on the server before mutating it further).
  const flush = useCallback((): Promise<void> => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    const next = queueRef.current.then(async () => {
      const snapshot = valueRef.current
      const snapshotSerialized = JSON.stringify(snapshot)
      if (snapshotSerialized === lastSavedSerializedRef.current) {
        // Nothing new since last successful save.
        return
      }
      setStatus('saving')
      try {
        await onSaveRef.current(snapshot)
        lastSavedSerializedRef.current = snapshotSerialized
        setLastSavedAt(new Date())
        setError(null)
        const key = draftKeyRef.current
        if (key) clearStoredDraft(key)
        if (JSON.stringify(valueRef.current) === snapshotSerialized) {
          setStatus('saved')
        } else {
          // Value changed during save → schedule another flush.
          setStatus('pending')
          timerRef.current = setTimeout(() => { void flushRef.current() }, debounceMsRef.current)
        }
      } catch (e) {
        setError(e)
        setStatus('error')
        throw e
      }
    })
    // Swallow errors in the chain so a failed save doesn't poison future ones.
    queueRef.current = next.catch(() => {})
    return next
  }, [])

  // Keep the ref in sync so the recursive re-flush inside the save handler
  // can find the latest stable function identity.
  useEffect(() => { flushRef.current = flush }, [flush])

  // Watch value changes → localStorage backup + debounced server save.
  useEffect(() => {
    if (!enabled) return
    const serialized = JSON.stringify(value)
    if (lastSeenSerializedRef.current === null) {
      // First sighting: this is the baseline (could be initial state or a
      // freshly restored draft). Treat it as the last-saved point too so we
      // don't immediately POST the server's own data back to it.
      lastSeenSerializedRef.current = serialized
      lastSavedSerializedRef.current = serialized
      return
    }
    if (serialized === lastSeenSerializedRef.current) return
    lastSeenSerializedRef.current = serialized

    // Immediate localStorage backup so a tab close / crash doesn't lose work.
    const key = draftKeyRef.current
    if (key && typeof window !== 'undefined') {
      try {
        localStorage.setItem(key, JSON.stringify({ value, savedAt: Date.now() }))
      } catch {}
    }

    // Cascading render is intended: status is derived from external (autosave)
    // state, not from `value`, so it cannot be lifted out of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus('pending')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { void flushRef.current() }, debounceMsRef.current)
  }, [value, enabled])

  // Flush immediately when tab is hidden so tab-switch doesn't leave changes pending.
  useEffect(() => {
    if (!enabled) return
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && timerRef.current) {
        void flushRef.current()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [enabled])

  // Warn before unload if there are unsaved changes.
  useEffect(() => {
    if (!enabled) return
    const dirty = status === 'pending' || status === 'saving'
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [enabled, status])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const clearDraftFn = useCallback(() => {
    const key = draftKeyRef.current
    if (key) clearStoredDraft(key)
  }, [])

  return { status, lastSavedAt, error, saveNow: flush, clearDraft: clearDraftFn }
}
