import { toast } from 'sonner'
import { api } from '@/lib/ipc'
import { t } from '@/lib/i18n'
import { isExtraWindow } from '@/lib/extraWindow'
import { webviewRegistry } from '@/lib/webviewRegistry'
import { useBrowserStore } from '@/store/useBrowserStore'

/** webContents id of a tab's page (null while asleep or not attached yet) */
export function webContentsIdOf(tabId: string | null | undefined): number | null {
  const el = webviewRegistry.get(tabId)
  try {
    return el ? (el.getWebContentsId() as number) : null
  } catch {
    return null
  }
}

/** "Close anyway?" when the page has unsaved changes. False = the user wants to keep the tab. */
export async function mayCloseTab(tabId: string): Promise<boolean> {
  const wcId = webContentsIdOf(tabId)
  if (wcId === null) return true
  try {
    return await api.essentials.pages.confirmClose(wcId)
  } catch {
    return true
  }
}

/** Close several tabs; ones with unsaved changes ask first */
export async function closeTabs(tabIds: string[]): Promise<void> {
  const allowed = await Promise.all(tabIds.map(async (id) => ((await mayCloseTab(id)) ? id : null)))
  for (const id of allowed) {
    if (!id) continue
    useBrowserStore.getState().removeTabFromStore(id)
    api.tabs.remove(id).catch(() => {})
  }
}

/** Take a tab out of this window's list without closing it (it moved to another window) */
function detachFromStore(tabId: string): void {
  useBrowserStore.getState().removeTabFromStore(tabId)
  // Moved, not closed: "Reopen closed tab" must not bring back a copy
  useBrowserStore.setState((s) => ({ recentlyClosedTabs: s.recentlyClosedTabs.filter((r) => r.tab.id !== tabId) }))
}

/** "Move to new window" (from an extra window: "Move to main window"). The page reloads there. */
export async function moveTabToOtherWindow(tabId: string): Promise<void> {
  if (!(await mayCloseTab(tabId))) return
  const moved = await (isExtraWindow ? api.essentials.windows.moveTabToMain(tabId) : api.essentials.windows.moveTab(tabId)).catch(() => false)
  if (moved) detachFromStore(tabId)
  else toast.error(t('This tab can not be moved to another window'))
}
