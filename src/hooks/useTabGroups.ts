import { useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { useBrowserStore } from '@/store/useBrowserStore'
import { api } from '@/lib/ipc'
import { canMoveGroup, MAX_GROUP_DEPTH } from '@/lib/tabGroups'
import type { TabGroup, UpdateTabGroupData } from '@/types/api'

const EMPTY: TabGroup[] = []

/**
 * Nested tab groups of a space: load, create, rename, recolor, nest, ungroup, close.
 * Only one component (the tab list) should pass autoLoad, so the groups are fetched once.
 */
export function useTabGroups(spaceId: string | null, autoLoad = false) {
  const groups = useBrowserStore((s) => (spaceId ? s.groupsBySpace[spaceId] : undefined)) || EMPTY
  const setGroupsForSpace = useBrowserStore((s) => s.setGroupsForSpace)
  const upsertGroupInStore = useBrowserStore((s) => s.upsertGroupInStore)

  const loadGroups = useCallback(async () => {
    if (!spaceId || !api.groups) return
    try {
      setGroupsForSpace(spaceId, await api.groups.list(spaceId))
    } catch (err) {
      console.error('[useTabGroups] Failed to load groups:', err)
    }
  }, [spaceId, setGroupsForSpace])

  useEffect(() => {
    if (autoLoad) void loadGroups()
  }, [autoLoad, loadGroups])

  const createGroup = useCallback(
    async (opts: { name?: string; parentId?: string | null; tabIds?: string[]; color?: string | null } = {}) => {
      if (!spaceId) return null
      try {
        const { group, tabs } = await api.groups.create({
          spaceId,
          name: opts.name || 'New Group',
          parentId: opts.parentId ?? null,
          tabIds: opts.tabIds,
          ...(opts.color !== undefined ? { color: opts.color } : {})
        })
        upsertGroupInStore(group)
        useBrowserStore.getState().setTabsForSpace(spaceId, tabs)
        return group
      } catch (err: any) {
        toast.error(String(err?.message || '').includes('nested') ? `Groups can be nested ${MAX_GROUP_DEPTH} levels deep` : 'Could not create group')
        return null
      }
    },
    [spaceId, upsertGroupInStore]
  )

  const updateGroup = useCallback(
    async (id: string, data: UpdateTabGroupData) => {
      const current = groups.find((g) => g.id === id)
      if (current) upsertGroupInStore({ ...current, ...data } as TabGroup) // optimistic
      try {
        upsertGroupInStore(await api.groups.update(id, data))
      } catch (err) {
        console.error('[useTabGroups] Update failed:', err)
        void loadGroups()
      }
    },
    [groups, upsertGroupInStore, loadGroups]
  )

  /** Nest a group inside another (null = move to top level) */
  const moveGroup = useCallback(
    async (id: string, newParentId: string | null) => {
      if (!canMoveGroup(id, newParentId, groups)) {
        toast.error(`Can't nest there: groups go at most ${MAX_GROUP_DEPTH} levels deep and can't contain themselves`)
        return
      }
      await updateGroup(id, { parentId: newParentId })
    },
    [groups, updateGroup]
  )

  const removeGroup = useCallback(
    async (id: string, closeTabs = false) => {
      if (!spaceId) return
      try {
        const result = await api.groups.remove(id, closeTabs)
        const store = useBrowserStore.getState()
        if (closeTabs) {
          // Keep "reopen closed tab" working for the closed tabs
          const remaining = new Set(result.tabs.map((t) => t.id))
          for (const t of store.tabsBySpace[spaceId] || []) {
            if (!remaining.has(t.id)) store.pushRecentlyClosedTab(t, spaceId)
          }
        }
        setGroupsForSpace(spaceId, result.groups)
        store.setTabsForSpace(spaceId, result.tabs)
        if (store.splitTabId && !result.tabs.some((t) => t.id === store.splitTabId)) store.closeSplitView()
      } catch (err) {
        console.error('[useTabGroups] Remove failed:', err)
        toast.error('Could not remove group')
      }
    },
    [spaceId, setGroupsForSpace]
  )

  /** Put a tab into a group (null = ungroup) */
  const moveTabToGroup = useCallback(async (tabId: string, groupId: string | null) => {
    const store = useBrowserStore.getState()
    store.updateTabInStore(tabId, { groupId })
    try {
      await api.tabs.update(tabId, { groupId })
    } catch (err) {
      console.error('[useTabGroups] Move tab failed:', err)
    }
  }, [])

  return { groups, loadGroups, createGroup, updateGroup, moveGroup, removeGroup, moveTabToGroup }
}
