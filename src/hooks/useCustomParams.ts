'use client'

import { useState, useEffect, useCallback } from 'react'
import type { CustomParameter } from '@/components/programs/types'
import { DEFAULT_CUSTOM_PARAMS } from '@/lib/program-constants'

const STORAGE_KEY = 'mbt-custom-params'

function load(): CustomParameter[] {
  if (typeof window === 'undefined') return DEFAULT_CUSTOM_PARAMS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : DEFAULT_CUSTOM_PARAMS
  } catch {
    return DEFAULT_CUSTOM_PARAMS
  }
}

function save(params: CustomParameter[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params))
  } catch {}
}

export function useCustomParams() {
  const [params, setParamsState] = useState<CustomParameter[]>(DEFAULT_CUSTOM_PARAMS)

  useEffect(() => {
    setParamsState(load())
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setParamsState(load())
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const setParams = useCallback((updater: CustomParameter[] | ((prev: CustomParameter[]) => CustomParameter[])) => {
    setParamsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      save(next)
      return next
    })
  }, [])

  return { params, setParams }
}
