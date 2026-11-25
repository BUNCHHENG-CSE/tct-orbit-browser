import { session } from 'electron'
import { SHARED_TAB_PARTITION } from './sessions'

/**
 * Search-as-you-type suggestions from the user's search engine (the same public endpoints
 * browsers use). Fetched here because the UI's CSP/CORS can't reach them directly. Requests go
 * through the browsing session, so proxy/Tor settings apply. Never called for private tabs.
 */

const ENDPOINTS: Record<string, (q: string) => string> = {
  duckduckgo: (q) => `https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list`,
  google: (q) => `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`,
  // Bing's OpenSearch endpoint returns nothing anymore; qsonhs has its own JSON shape
  bing: (q) => `https://api.bing.com/qsonhs.aspx?q=${encodeURIComponent(q)}`
}

export async function fetchSearchSuggestions(query: string, engine: string): Promise<string[]> {
  const q = query.trim()
  if (!q || q.length > 200) return []
  const endpoint = ENDPOINTS[engine] || ENDPOINTS.duckduckgo
  try {
    const res = await session.fromPartition(SHARED_TAB_PARTITION).fetch(endpoint(q), {
      signal: AbortSignal.timeout(2500),
      credentials: 'omit',
      cache: 'no-store'
    } as RequestInit)
    if (!res.ok) return []
    const data = await res.json()
    // OpenSearch format: [query, [suggestion, ...], ...]; Bing: { AS: { Results: [{ Suggests: [{ Txt }] }] } }
    const list: unknown = Array.isArray(data)
      ? data[1]
      : Array.isArray(data?.AS?.Results)
      ? data.AS.Results.flatMap((r: any) => (Array.isArray(r?.Suggests) ? r.Suggests.map((x: any) => x?.Txt) : []))
      : null
    if (!Array.isArray(list)) return []
    const seen = new Set<string>([q.toLowerCase()])
    const out: string[] = []
    for (const item of list) {
      if (typeof item !== 'string') continue
      const s = item.trim().slice(0, 200)
      if (!s || seen.has(s.toLowerCase())) continue
      seen.add(s.toLowerCase())
      out.push(s)
      if (out.length >= 6) break
    }
    return out
  } catch {
    return []
  }
}
