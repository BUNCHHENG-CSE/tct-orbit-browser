import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/ipc'
import { isUrl } from '@/lib/searchEngines'

const PREF_KEY = 'tct_pref_search_suggestions'

/** "Show search suggestions" (Settings > Search Engine). On by default, like other browsers. */
export function searchSuggestionsEnabled(): boolean {
  try {
    const v = localStorage.getItem(PREF_KEY)
    return v === null ? true : JSON.parse(v) !== false
  } catch {
    return true
  }
}

export function setSearchSuggestionsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(enabled))
  } catch {}
  window.dispatchEvent(new CustomEvent('tct:search-suggestions-pref', { detail: enabled }))
}

/**
 * Live suggestions from the search engine for what the user is typing.
 * Off for private tabs, URLs, and when disabled in Settings. Debounced; stale replies are dropped.
 */
export function useSearchSuggestions(query: string, engine: string, opts: { enabled: boolean; isPrivate?: boolean }): string[] {
  const [items, setItems] = useState<string[]>([])
  const reqRef = useRef(0)
  const q = query.trim()

  useEffect(() => {
    const active = opts.enabled && !opts.isPrivate && searchSuggestionsEnabled() && q.length > 0 && !isUrl(q) && !/^[a-z]+:\/\//i.test(q)
    if (!active || !api.search?.suggest) {
      setItems([])
      return
    }
    const reqId = ++reqRef.current
    const timer = setTimeout(() => {
      api.search
        .suggest(q, engine)
        .then((list) => {
          if (reqId === reqRef.current) setItems(list || [])
        })
        .catch(() => {})
    }, 120)
    return () => clearTimeout(timer)
  }, [q, engine, opts.enabled, opts.isPrivate])

  return items
}
