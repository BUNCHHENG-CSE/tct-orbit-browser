/**
 * Remembers how far you read each page (on this device, never for private tabs), so a long page
 * you come back to offers "Continue reading at 45%".
 */

const KEY = 'tct_reading_progress_v1'
const MAX_ENTRIES = 400
/** Forget positions older than this */
const MAX_AGE_MS = 60 * 86_400_000

interface Entry {
  r: number
  t: number
}

let cache: Record<string, Entry> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

function load(): Record<string, Entry> {
  if (cache) return cache
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}')
    cache = parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    cache = {}
  }
  return cache!
}

function scheduleSave() {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    const data = load()
    const now = Date.now()
    const entries = Object.entries(data)
      .filter(([, e]) => now - e.t < MAX_AGE_MS)
      .sort((a, b) => b[1].t - a[1].t)
      .slice(0, MAX_ENTRIES)
    cache = Object.fromEntries(entries)
    try {
      localStorage.setItem(KEY, JSON.stringify(cache))
    } catch {}
  }, 1500)
}

/** Page identity without #fragment and common tracking params */
export function readingKey(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    u.hash = ''
    for (const p of Array.from(u.searchParams.keys())) {
      if (/^(utm_|fbclid|gclid|ref$|ref_src)/i.test(p)) u.searchParams.delete(p)
    }
    return u.toString()
  } catch {
    return null
  }
}

export function saveReadingPosition(rawUrl: string, ratio: number): void {
  const key = readingKey(rawUrl)
  if (!key || ratio < 0) return
  const data = load()
  // Finished pages don't need a "continue" offer
  if (ratio >= 0.97) {
    if (data[key]) {
      delete data[key]
      scheduleSave()
    }
    return
  }
  data[key] = { r: Math.round(ratio * 1000) / 1000, t: Date.now() }
  scheduleSave()
}

/** Saved position worth offering (between 5% and 97%), else null */
export function getReadingPosition(rawUrl: string): number | null {
  const key = readingKey(rawUrl)
  if (!key) return null
  const e = load()[key]
  if (!e || Date.now() - e.t > MAX_AGE_MS) return null
  return e.r >= 0.05 && e.r < 0.97 ? e.r : null
}
