import { useBrowserStore } from '@/store/useBrowserStore'
import { api } from '@/lib/ipc'
import type { Tab } from '@/types/api'

/** Settings → Tabs → "Add new tabs to the top" */
export function newTabsOnTop(): boolean {
  return !!useBrowserStore.getState().settings?.newTabsOnTop
}

/**
 * Put a freshly created tab (New Tab, Ctrl+T, links from other apps…) where the user wants it:
 * first after the pinned tabs when "Add new tabs to the top" is on, otherwise next to the active tab.
 * Links opened from a page keep opening next to their opener (they don't use this).
 */
export function placeNewTab(spaceId: string, tab: Tab, makeActive = true): void {
  const store = useBrowserStore.getState()
  if (!newTabsOnTop()) {
    store.insertTabNextTo(spaceId, tab, store.activeTabId, makeActive)
    return
  }

  const others = (store.tabsBySpace[spaceId] || []).filter((t) => t.id !== tab.id)
  const firstUnpinned = others.findIndex((t) => !t.isPinned)
  const at = firstUnpinned === -1 ? others.length : firstUnpinned
  const next = [...others.slice(0, at), tab, ...others.slice(at)].map((t, order) => ({ ...t, order }))

  useBrowserStore.setState((s) => ({
    tabsBySpace: { ...s.tabsBySpace, [spaceId]: next },
    activeTabId: makeActive ? tab.id : s.activeTabId
  }))
  // Keep the order after a restart
  void api.tabs.reorder(spaceId, next.map((t) => t.id)).catch(() => {})
}
