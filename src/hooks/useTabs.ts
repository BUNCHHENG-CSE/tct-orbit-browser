import { useEffect, useState, useCallback, useMemo } from 'react'
import { placeNewTab } from '@/lib/tabPlacement'
import { useBrowserStore } from '@/store/useBrowserStore'
import { api } from '@/lib/ipc'
import { groupForNewTab } from '@/lib/tabGroups'
import type { CreateTabData, UpdateTabData, Tab } from '@/types/api'

const EMPTY_TABS: Tab[] = []

/**
 * One tabs:list per space at a time. useTabs is mounted by ~8 components; without this, every
 * space switch made 8 identical IPC round trips and 8 store writes (each re-rendering the UI).
 */
const inflightLoads = new Map<string, Promise<void>>()
const lastLoadedAt = new Map<string, number>()

function loadSpaceTabs(spaceId: string, force = false): Promise<void> {
  const pending = inflightLoads.get(spaceId)
  if (pending) return pending
  // Several hooks mount in the same tick: a load that just finished counts for all of them
  if (!force && Date.now() - (lastLoadedAt.get(spaceId) || 0) < 1000) return Promise.resolve()
  const p = api.tabs
    .list(spaceId)
    .then((list) => {
      useBrowserStore.getState().setTabsForSpace(spaceId, list)
      lastLoadedAt.set(spaceId, Date.now())
    })
    .finally(() => inflightLoads.delete(spaceId))
  inflightLoads.set(spaceId, p)
  return p
}

const tabsOf = (spaceId: string | null): Tab[] =>
  spaceId ? useBrowserStore.getState().tabsBySpace[spaceId] || EMPTY_TABS : EMPTY_TABS

/**
 * Tab operations for a space, WITHOUT subscribing to tab data. Every function is stable across
 * renders (reads current tabs from the store when called), so components and memoized children
 * using these never re-render just because some tab's title or favicon changed.
 */
export function useTabActions(spaceId: string | null) {
  const loadTabs = useCallback(async () => {
    if (!spaceId) return
    try {
      await loadSpaceTabs(spaceId, true)
    } catch (err) {
      console.error(`[useTabs] Error loading tabs for space ${spaceId}:`, err)
    }
  }, [spaceId])

  const createTab = useCallback(
    async (data: Omit<CreateTabData, 'spaceId'> & { spaceId?: string }): Promise<Tab> => {
      const targetSpaceId = data.spaceId || spaceId
      if (!targetSpaceId) throw new Error('No spaceId specified for new tab')
      try {
        const newTab = await api.tabs.create({ ...data, spaceId: targetSpaceId })
        placeNewTab(targetSpaceId, newTab)
        return newTab
      } catch (err) {
        console.error('[useTabs] Error creating tab:', err)
        throw err
      }
    },
    [spaceId]
  )

  const updateTab = useCallback(async (id: string, data: UpdateTabData): Promise<Tab> => {
    const { updateTabInStore } = useBrowserStore.getState()
    try {
      updateTabInStore(id, data)
      const updated = await api.tabs.update(id, data)
      // Apply back only the fields this update touched (the main process may normalize them).
      // Copying the whole stored tab would overwrite live state (URL, lastVisited) with disk state
      // and re-render every tab list for nothing.
      const confirmed: Partial<Tab> = {}
      for (const key of Object.keys(data) as Array<keyof UpdateTabData>) {
        if (key === 'url') continue
        if (key in updated) (confirmed as Record<string, unknown>)[key] = (updated as unknown as Record<string, unknown>)[key]
      }
      updateTabInStore(id, confirmed)
      return updated
    } catch (err) {
      console.error('[useTabs] Error updating tab:', err)
      throw err
    }
  }, [])

  const removeTab = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        useBrowserStore.getState().removeTabFromStore(id)
        await api.tabs.remove(id)
        return true
      } catch (err) {
        console.error('[useTabs] Error removing tab:', err)
        if (spaceId) void loadTabs()
        throw err
      }
    },
    [spaceId, loadTabs]
  )

  const reorderTabs = useCallback(
    async (orderedIds: string[]): Promise<Tab[]> => {
      if (!spaceId) return []
      const { setTabsForSpace } = useBrowserStore.getState()
      try {
        const tabs = tabsOf(spaceId)
        const reordered = orderedIds.map((id) => tabs.find((t) => t.id === id)).filter((t): t is Tab => t !== undefined)
        setTabsForSpace(spaceId, reordered)
        const updated = await api.tabs.reorder(spaceId, orderedIds)
        setTabsForSpace(spaceId, updated)
        return updated
      } catch (err) {
        console.error('[useTabs] Error reordering tabs:', err)
        void loadTabs()
        throw err
      }
    },
    [spaceId, loadTabs]
  )

  const setActiveTab = useCallback((id: string) => {
    useBrowserStore.getState().setActiveTabId(id)
  }, [])

  const reopenLastClosedTab = useCallback(async (): Promise<Tab | null> => {
    const store = useBrowserStore.getState()
    const lastClosed = store.popRecentlyClosedTab()
    if (!lastClosed) return null
    const targetSpaceId = spaceId || lastClosed.spaceId
    try {
      const restoredTab = await api.tabs.create({
        spaceId: targetSpaceId,
        url: lastClosed.tab.url,
        title: lastClosed.tab.title,
        favicon: lastClosed.tab.favicon,
        isPinned: lastClosed.tab.isPinned,
        // A reopened private tab must stay private (no history, in-memory session)
        isPrivate: !!lastClosed.tab.isPrivate
      })
      const s = useBrowserStore.getState()
      s.addTabToStore(targetSpaceId, restoredTab)
      s.setActiveTabId(restoredTab.id)
      return restoredTab
    } catch (err) {
      console.error('[useTabs] Error reopening tab:', err)
      return null
    }
  }, [spaceId])

  const closeOtherTabs = useCallback(
    async (keepTabId: string) => {
      const { removeTabFromStore } = useBrowserStore.getState()
      for (const t of tabsOf(spaceId).filter((t) => t.id !== keepTabId && !t.isPinned)) {
        removeTabFromStore(t.id)
        api.tabs.remove(t.id).catch(() => {})
      }
    },
    [spaceId]
  )

  const closeTabsToRight = useCallback(
    async (targetTabId: string) => {
      const tabs = tabsOf(spaceId)
      const index = tabs.findIndex((t) => t.id === targetTabId)
      if (index === -1) return
      const { removeTabFromStore } = useBrowserStore.getState()
      for (const t of tabs.slice(index + 1).filter((t) => !t.isPinned)) {
        removeTabFromStore(t.id)
        api.tabs.remove(t.id).catch(() => {})
      }
    },
    [spaceId]
  )

  const createTabNextTo = useCallback(
    async (targetTabId: string, url: string = 'https://duckduckgo.com') => {
      const targetSpaceId = spaceId
      if (!targetSpaceId) return
      const targetTab = tabsOf(targetSpaceId).find((t) => t.id === targetTabId)
      const order = targetTab ? targetTab.order + 1 : undefined
      const newTab = await api.tabs.create({
        spaceId: targetSpaceId,
        url,
        title: 'New Tab',
        order,
        groupId: groupForNewTab(targetTab, useBrowserStore.getState().groupsBySpace[targetSpaceId] || [])
      })
      useBrowserStore.getState().insertTabNextTo(targetSpaceId, newTab, targetTabId, true)
      return newTab
    },
    [spaceId]
  )

  return useMemo(
    () => ({
      createTab,
      updateTab,
      removeTab,
      reorderTabs,
      setActiveTab,
      reopenLastClosedTab,
      closeOtherTabs,
      closeTabsToRight,
      createTabNextTo,
      reloadTabs: loadTabs
    }),
    [createTab, updateTab, removeTab, reorderTabs, setActiveTab, reopenLastClosedTab, closeOtherTabs, closeTabsToRight, createTabNextTo, loadTabs]
  )
}

/** Loads a space's tabs once (shared across every component that asks) */
export function useLoadSpaceTabs(spaceId: string | null): boolean {
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!spaceId) return
    let alive = true
    setLoading(true)
    loadSpaceTabs(spaceId)
      .catch((err) => console.error(`[useTabs] Error loading tabs for space ${spaceId}:`, err))
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [spaceId])
  return loading
}

/**
 * Tabs of one space + the active tab + stable tab operations.
 * Re-renders only when THIS space's tabs (or the active tab id) change.
 */
export function useTabs(spaceId: string | null) {
  const tabs = useBrowserStore((s) => (spaceId ? s.tabsBySpace[spaceId] || EMPTY_TABS : EMPTY_TABS))
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const loading = useLoadSpaceTabs(spaceId)
  const actions = useTabActions(spaceId)

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) || (tabs.length > 0 ? tabs[0] : null), [tabs, activeTabId])

  return {
    tabs,
    activeTab,
    activeTabId,
    loading,
    error: null as Error | null,
    ...actions
  }
}
