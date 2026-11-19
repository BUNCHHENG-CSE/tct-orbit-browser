/**
 * Site-Specific Per-Domain Persistent Zoom & Visual Profiles
 * Remembers preferred zoom percentage individually per hostname/domain.
 */

const STORAGE_KEY = 'tct_orbit_domain_zoom'

export const ZOOM_STEPS = [
  25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 133, 150, 175, 200, 250, 300, 400, 500
]

export function extractDomain(url?: string): string {
  if (!url || typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (trimmed.startsWith('about:') || trimmed.startsWith('chrome:') || trimmed.startsWith('view-source:')) {
    return ''
  }
  try {
    const parsed = new URL(trimmed)
    return parsed.hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function getDomainZoom(url?: string, fallbackDefault = 100): number {
  const domain = extractDomain(url)
  if (!domain) return fallbackDefault

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallbackDefault
    const map = JSON.parse(raw)
    const val = map[domain]
    return typeof val === 'number' && val >= 25 && val <= 500 ? val : fallbackDefault
  } catch {
    return fallbackDefault
  }
}

export function setDomainZoom(url: string | undefined, zoomPercent: number): void {
  const domain = extractDomain(url)
  if (!domain) return

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const map = raw ? JSON.parse(raw) : {}
    if (zoomPercent === 100) {
      delete map[domain]
    } else {
      map[domain] = zoomPercent
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))

    window.dispatchEvent(
      new CustomEvent('tct:domain-zoom-changed', {
        detail: { domain, zoom: zoomPercent, url }
      })
    )
  } catch {}
}

export function getNextZoomIn(current: number): number {
  const next = ZOOM_STEPS.find((step) => step > current)
  return next !== undefined ? next : 500
}

export function getNextZoomOut(current: number): number {
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < current) {
      return ZOOM_STEPS[i]
    }
  }
  return 25
}
