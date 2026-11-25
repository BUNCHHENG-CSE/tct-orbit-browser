import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/ipc'
import type { SavedSplit } from '@/types/api'

/** Saved split layouts, refreshed whenever one is saved or deleted anywhere in the UI */
export function useSavedSplits(enabled = true) {
  const [splits, setSplits] = useState<SavedSplit[]>([])

  const refresh = useCallback(() => {
    api.splits
      ?.list()
      .then(setSplits)
      .catch(() => setSplits([]))
  }, [])

  useEffect(() => {
    if (!enabled) return
    refresh()
    window.addEventListener('tct:saved-splits-changed', refresh)
    return () => window.removeEventListener('tct:saved-splits-changed', refresh)
  }, [enabled, refresh])

  return { splits, refresh }
}
