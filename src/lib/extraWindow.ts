import { EXTRA_WINDOW_QUERY, isExtraSpaceId } from '@shared/extraWindow'
import { isPrivateWindow } from '@/lib/privateWindow'
import type { Space, Tab } from '@/types/api'

const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
const spaceParam = params.get('space')

/** This window is an extra window (Ctrl+N): one virtual space, normal session */
export const isExtraWindow = params.get('window') === EXTRA_WINDOW_QUERY && isExtraSpaceId(spaceParam)

export const EXTRA_SPACE_ID: string = isExtraWindow ? spaceParam! : ''

/** Space of the main window whose notes this window shows */
export const EXTRA_BASE_SPACE_ID: string | null = isExtraWindow ? params.get('base') : null

/** The main window: the only one that owns Spaces, snoozes, launch links ... */
export const isMainWindow = !isPrivateWindow && !isExtraWindow

export const EXTRA_SPACE: Space = {
  id: EXTRA_SPACE_ID,
  userId: 'local',
  name: 'Window',
  color: '#6366f1',
  icon: 'Layers',
  order: 0,
  isActive: true,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
}

export function canMoveToNewWindow(tab: Tab, isolated: boolean): boolean {
  return !tab.isPrivate && !isolated && !isPrivateWindow
}
