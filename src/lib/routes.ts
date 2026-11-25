import { create } from 'zustand'
import { routeFor, type SpaceRoute } from '@shared/siteRules'
import { api } from '@/lib/ipc'
import { isMainWindow } from '@/lib/extraWindow'
import { useBrowserStore } from '@/store/useBrowserStore'

/** Links that always open in one Space (Settings > Tabs & Spaces > Link routing) */
export const useRoutes = create<{ routes: SpaceRoute[] }>(() => ({ routes: [] }))

/**
 * Space a newly opened link belongs to: a matching rule's Space, else `current`.
 * Links from an isolated Space stay there: moving them would switch profiles and sign-ins.
 */
export function spaceForLink(url: string, current: string): string {
  if (!isMainWindow) return current
  const { spaces } = useBrowserStore.getState()
  if (spaces.find((s) => s.id === current)?.isolated) return current
  const target = routeFor(url, useRoutes.getState().routes)
  return target && spaces.some((s) => s.id === target) ? target : current
}

/** Show a tab that was opened in another Space */
export function switchToSpace(spaceId: string): void {
  const store = useBrowserStore.getState()
  if (store.activeSpaceId === spaceId) return
  store.setActiveSpaceId(spaceId)
  for (const s of store.spaces) store.updateSpaceInStore(s.id, { isActive: s.id === spaceId })
  api.spaces.setActive(spaceId).catch(() => {})
}
