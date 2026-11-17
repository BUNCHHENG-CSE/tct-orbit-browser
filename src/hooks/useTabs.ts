import { useEffect, useState, useCallback } from 'react'
import { useBrowserStore } from '@/store/useBrowserStore'
import { api } from '@/lib/ipc'
import type { CreateTabData, UpdateTabData, Tab } from '@/types/api'

export function useTabs(spaceId: string | null) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const tabsBySpace = useBrowserStore((s) => s.tabsBySpace)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const setTabsForSpace = useBrowserStore((s) => s.setTabsForSpace)
  const setActiveTabId = useBrowserStore((s) => s.setActiveTabId)
  const addTabToStore = useBrowserStore((s) => s.addTabToStore)
  const updateTabInStore = useBrowserStore((s) => s.updateTabInStore)
  const removeTabFromStore = useBrowserStore((s) => s.removeTabFromStore)
  const popRecentlyClosedTab = useBrowserStore((s) => s.popRecentlyClosedTab)

  const tabs = spaceId ? tabsBySpace[spaceId] || [] : []
  const activeTab = tabs.find((t) => t.id === activeTabId) || (tabs.length > 0 ? tabs[0] : null)

  const loadTabs = useCallback(async () => {
    if (!spaceId) return
    try {
      setLoading(true)
      const list = await api.tabs.list(spaceId)
      setTabsForSpace(spaceId, list)
      setError(null)
    } catch (err) {
      console.error(`[useTabs] Error loading tabs for space ${spaceId}:`, err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [spaceId, setTabsForSpace])

  useEffect(() => {
    loadTabs()
  }, [loadTabs])

  const createTab = async (data: Omit<CreateTabData, 'spaceId'> & { spaceId?: string }): Promise<Tab> => {
    const targetSpaceId = data.spaceId || spaceId
    if (!targetSpaceId) throw new Error('No spaceId specified for new tab')

    try {
      const newTab = await api.tabs.create({
        ...data,
        spaceId: targetSpaceId
      })
      addTabToStore(targetSpaceId, newTab)
      setActiveTabId(newTab.id)
      return newTab
    } catch (err) {
      console.error('[useTabs] Error creating tab:', err)
      throw err
    }
  }

  const updateTab = async (id: string, data: UpdateTabData): Promise<Tab> => {
    try {
      updateTabInStore(id, data)
      const updated = await api.tabs.update(id, data)
      updateTabInStore(id, updated)
      return updated
    } catch (err) {
      console.error('[useTabs] Error updating tab:', err)
      throw err
    }
  }

  const removeTab = async (id: string): Promise<boolean> => {
    try {
      removeTabFromStore(id)
      await api.tabs.remove(id)
      return true
    } catch (err) {
      console.error('[useTabs] Error removing tab:', err)
      if (spaceId) loadTabs()
      throw err
    }
  }

  const reorderTabs = async (orderedIds: string[]): Promise<Tab[]> => {
    if (!spaceId) return []
    try {
      // Optimistically reorder in store
      const reordered = orderedIds
        .map((id) => tabs.find((t) => t.id === id))
        .filter((t): t is Tab => t !== undefined)
      setTabsForSpace(spaceId, reordered)

      const updated = await api.tabs.reorder(spaceId, orderedIds)
      setTabsForSpace(spaceId, updated)
      return updated
    } catch (err) {
      console.error('[useTabs] Error reordering tabs:', err)
      loadTabs()
      throw err
    }
  }

  const setActiveTab = (id: string) => {
    setActiveTabId(id)
  }

  const reopenLastClosedTab = async (): Promise<Tab | null> => {
    const lastClosed = popRecentlyClosedTab()
    if (!lastClosed) return null

    const targetSpaceId = spaceId || lastClosed.spaceId
    try {
      const restoredTab = await api.tabs.create({
        spaceId: targetSpaceId,
        url: lastClosed.tab.url,
        title: lastClosed.tab.title,
        favicon: lastClosed.tab.favicon,
        isPinned: lastClosed.tab.isPinned
      })
      addTabToStore(targetSpaceId, restoredTab)
      setActiveTabId(restoredTab.id)
      return restoredTab
    } catch (err) {
      console.error('[useTabs] Error reopening tab:', err)
      return null
    }
  }

  return {
    tabs,
    activeTab,
    activeTabId,
    loading,
    error,
    createTab,
    updateTab,
    removeTab,
    reorderTabs,
    setActiveTab,
    reopenLastClosedTab,
    closeOtherTabs: async (keepTabId: string) => {
      const toRemove = tabs.filter((t) => t.id !== keepTabId && !t.isPinned)
      for (const t of toRemove) {
        removeTabFromStore(t.id)
        api.tabs.remove(t.id).catch(() => {})
      }
    },
    closeTabsToRight: async (targetTabId: string) => {
      const index = tabs.findIndex((t) => t.id === targetTabId)
      if (index === -1) return
      const toRemove = tabs.slice(index + 1).filter((t) => !t.isPinned)
      for (const t of toRemove) {
        removeTabFromStore(t.id)
        api.tabs.remove(t.id).catch(() => {})
      }
    },
    createTabNextTo: async (targetTabId: string, url: string = 'https://duckduckgo.com') => {
      const targetSpaceId = spaceId
      if (!targetSpaceId) return
      const targetTab = tabs.find((t) => t.id === targetTabId)
      const order = targetTab ? targetTab.order + 1 : undefined
      const newTab = await api.tabs.create({
        spaceId: targetSpaceId,
        url,
        title: 'New Tab',
        order
      })
      useBrowserStore.getState().insertTabNextTo(targetSpaceId, newTab, targetTabId, true)
      return newTab
    },
    reloadTabs: loadTabs
  }
}
