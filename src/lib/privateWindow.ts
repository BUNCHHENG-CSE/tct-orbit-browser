import { PRIVATE_WINDOW_QUERY, PRIVATE_WINDOW_SPACE_ID } from '@shared/privateWindow'
import type { Space } from '@/types/api'

export { PRIVATE_WINDOW_SPACE_ID }

const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()

/** This window is the private window (Edge InPrivate style): only private tabs, nothing saved */
export const isPrivateWindow = params.get('window') === PRIVATE_WINDOW_QUERY

/** The private window's only "space" (virtual: never saved, never shown in the main window) */
export const PRIVATE_SPACE: Space = {
  id: PRIVATE_WINDOW_SPACE_ID,
  userId: 'local',
  name: 'Private',
  color: '#8b5cf6',
  icon: 'eye-off',
  order: 0,
  isActive: true,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
}

/** Main window: open (or focus) the private window, optionally with a link */
export function openPrivateWindow(url?: string): void {
  void window.api?.window?.openPrivate?.(url)
}
