/** Matching web addresses against sites the user typed ("github.com", "google.com/calendar") */

export interface SpaceRoute {
  id: string
  /** Host, optionally with a path: "github.com", "google.com/calendar" */
  pattern: string
  spaceId: string
}

/** "https://WWW.GitHub.com/org/" -> "github.com/org"; null when it is not a site */
export function normalizePattern(input: string): string | null {
  let s = input.trim().toLowerCase()
  if (!s || s.length > 300 || /\s/.test(s)) return null
  s = s
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^\*\./, '')
    .replace(/^www\./, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
  const host = s.split('/')[0]
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/.test(host) || host.startsWith('.') || host.endsWith('.')) return null
  if (!host.includes('.') && !/^localhost(:\d+)?$/.test(host)) return null
  return s
}

export function hostOf(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.host.toLowerCase().replace(/^www\./, '') : null
  } catch {
    return null
  }
}

export function matchesPattern(url: string, pattern: string): boolean {
  const host = hostOf(url)
  if (!host) return false
  const slash = pattern.indexOf('/')
  const pHost = slash === -1 ? pattern : pattern.slice(0, slash)
  if (host !== pHost && !host.endsWith(`.${pHost}`)) return false
  if (slash === -1) return true
  const path = new URL(url).pathname.toLowerCase()
  const pPath = pattern.slice(slash)
  return path === pPath || path.startsWith(`${pPath}/`)
}

/** Space a link should open in: the most specific rule wins. Null = no rule. */
export function routeFor(url: string, routes: SpaceRoute[]): string | null {
  let best: SpaceRoute | null = null
  for (const r of routes) {
    if (matchesPattern(url, r.pattern) && (!best || r.pattern.length > best.pattern.length)) best = r
  }
  return best?.spaceId ?? null
}

/** Address a highlight belongs to: the page without its #fragment */
export function pageKey(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    u.hash = ''
    return u.toString()
  } catch {
    return null
  }
}
