import { create } from 'zustand'
import type { Space, Tab, Settings, AppInfo } from '@/types/api'

interface BrowserState {
  appInfo: AppInfo
  spaces: Space[]
  activeSpaceId: string | null
  tabsBySpace: Record<string, Tab[]>
  activeTabId: string | null
  settings: Settings | null
  commandBarOpen: boolean
  commandBarInitialQuery: string
  commandBarMode: 'new-tab' | 'navigate'
  recentlyClosedTabs: { tab: Tab; spaceId: string }[]
  canGoBack: boolean
  canGoForward: boolean

  // Store actions
  setAppInfo: (appInfo: AppInfo) => void
  setSpaces: (spaces: Space[]) => void
  setActiveSpaceId: (id: string | null) => void
  setTabsForSpace: (spaceId: string, tabs: Tab[]) => void
  setActiveTabId: (id: string | null) => void
  setSettings: (settings: Settings | null) => void
  setCommandBarOpen: (open: boolean, initialQuery?: string, mode?: 'new-tab' | 'navigate') => void
  pushRecentlyClosedTab: (tab: Tab, spaceId: string) => void
  popRecentlyClosedTab: () => { tab: Tab; spaceId: string } | undefined
  setNavState: (canGoBack: boolean, canGoForward: boolean) => void

  // Tab mutations in store
  addTabToStore: (spaceId: string, tab: Tab) => void
  updateTabInStore: (id: string, updates: Partial<Tab>) => void
  removeTabFromStore: (id: string) => void

  // Space mutations in store
  addSpaceToStore: (space: Space) => void
  updateSpaceInStore: (id: string, updates: Partial<Space>) => void
  removeSpaceFromStore: (id: string) => void
}

export const useBrowserStore = create<BrowserState>((set, get) => ({
  appInfo: typeof window !== 'undefined' && window.api?.appInfo
    ? window.api.appInfo
    : { name: 'TCT Orbit', version: '0.1.0', channel: 'stable' },
  setAppInfo: (appInfo) => set({ appInfo }),
  spaces: [],
  activeSpaceId: null,
  tabsBySpace: {},
  activeTabId: null,
  settings: null,
  commandBarOpen: false,
  commandBarInitialQuery: '',
  commandBarMode: 'new-tab',
  recentlyClosedTabs: [],
  canGoBack: false,
  canGoForward: false,

  setNavState: (canGoBack, canGoForward) => set({ canGoBack, canGoForward }),

  setSpaces: (spaces) => {
    // If no activeSpaceId yet or not in list, find active one or first one
    const currentActiveId = get().activeSpaceId
    const activeSpace = spaces.find((s) => s.isActive) || spaces[0]
    const nextActiveId =
      spaces.some((s) => s.id === currentActiveId)
        ? currentActiveId
        : activeSpace
        ? activeSpace.id
        : null

    // Also populate tabsBySpace from space.tabs if present
    const tabsMap: Record<string, Tab[]> = { ...get().tabsBySpace }
    for (const space of spaces) {
      if (space.tabs) {
        tabsMap[space.id] = space.tabs
      }
    }

    set({
      spaces,
      activeSpaceId: nextActiveId,
      tabsBySpace: tabsMap
    })
  },

  setActiveSpaceId: (id) => {
    const { tabsBySpace } = get()
    const tabs = id ? tabsBySpace[id] || [] : []
    const firstTabId = tabs.length > 0 ? tabs[0].id : null

    set({
      activeSpaceId: id,
      activeTabId: firstTabId
    })
  },

  setTabsForSpace: (spaceId, tabs) => {
    set((state) => {
      const nextTabs = {
        ...state.tabsBySpace,
        [spaceId]: tabs
      }

      // If active tab belongs to this space and was removed, or if no active tab
      let nextActiveTabId = state.activeTabId
      if (state.activeSpaceId === spaceId) {
        if (!tabs.some((t) => t.id === state.activeTabId)) {
          nextActiveTabId = tabs.length > 0 ? tabs[0].id : null
        }
      }

      return {
        tabsBySpace: nextTabs,
        activeTabId: nextActiveTabId
      }
    })
  },

  setActiveTabId: (id) => set({ activeTabId: id }),

  setSettings: (settings) => set({ settings }),

  setCommandBarOpen: (open, initialQuery = '', mode = 'new-tab') =>
    set({
      commandBarOpen: open,
      commandBarInitialQuery: initialQuery,
      commandBarMode: mode
    }),

  pushRecentlyClosedTab: (tab, spaceId) => {
    set((state) => ({
      recentlyClosedTabs: [{ tab, spaceId }, ...state.recentlyClosedTabs.slice(0, 19)]
    }))
  },

  popRecentlyClosedTab: () => {
    const list = get().recentlyClosedTabs
    if (list.length === 0) return undefined
    const [first, ...rest] = list
    set({ recentlyClosedTabs: rest })
    return first
  },

  addTabToStore: (spaceId, tab) => {
    set((state) => {
      const currentTabs = state.tabsBySpace[spaceId] || []
      return {
        tabsBySpace: {
          ...state.tabsBySpace,
          [spaceId]: [...currentTabs, tab]
        },
        activeTabId: tab.id
      }
    })
  },

  updateTabInStore: (id, updates) => {
    set((state) => {
      const nextTabsBySpace: Record<string, Tab[]> = {}
      for (const [spaceId, tabs] of Object.entries(state.tabsBySpace)) {
        nextTabsBySpace[spaceId] = tabs.map((tab) =>
          tab.id === id ? { ...tab, ...updates } : tab
        )
      }
      return { tabsBySpace: nextTabsBySpace }
    })
  },

  removeTabFromStore: (id) => {
    set((state) => {
      const nextTabsBySpace: Record<string, Tab[]> = {}
      let removedTab: Tab | null = null
      let removedSpaceId: string | null = null

      for (const [spaceId, tabs] of Object.entries(state.tabsBySpace)) {
        const found = tabs.find((t) => t.id === id)
        if (found) {
          removedTab = found
          removedSpaceId = spaceId
        }
        nextTabsBySpace[spaceId] = tabs.filter((t) => t.id !== id)
      }

      let nextActiveTabId = state.activeTabId
      if (state.activeTabId === id && removedSpaceId) {
        const remaining = nextTabsBySpace[removedSpaceId] || []
        nextActiveTabId = remaining.length > 0 ? remaining[0].id : null
      }

      const nextRecentlyClosed =
        removedTab && removedSpaceId
          ? [{ tab: removedTab, spaceId: removedSpaceId }, ...state.recentlyClosedTabs.slice(0, 19)]
          : state.recentlyClosedTabs

      return {
        tabsBySpace: nextTabsBySpace,
        activeTabId: nextActiveTabId,
        recentlyClosedTabs: nextRecentlyClosed
      }
    })
  },

  addSpaceToStore: (space) => {
    const spaceTabs = space.tabs || []
    const firstTabId = spaceTabs.length > 0 ? spaceTabs[0].id : null
    set((state) => ({
      spaces: [...state.spaces, space],
      tabsBySpace: {
        ...state.tabsBySpace,
        [space.id]: spaceTabs
      },
      activeSpaceId: space.id,
      activeTabId: firstTabId ?? state.activeTabId
    }))
  },

  updateSpaceInStore: (id, updates) => {
    set((state) => ({
      spaces: state.spaces.map((s) => (s.id === id ? { ...s, ...updates } : s))
    }))
  },

  removeSpaceFromStore: (id) => {
    set((state) => {
      const nextSpaces = state.spaces.filter((s) => s.id !== id)
      const nextTabsBySpace = { ...state.tabsBySpace }
      delete nextTabsBySpace[id]

      let nextActiveSpaceId = state.activeSpaceId
      let nextActiveTabId = state.activeTabId

      if (state.activeSpaceId === id) {
        nextActiveSpaceId = nextSpaces.length > 0 ? nextSpaces[0].id : null
        const spaceTabs = nextActiveSpaceId ? nextTabsBySpace[nextActiveSpaceId] || [] : []
        nextActiveTabId = spaceTabs.length > 0 ? spaceTabs[0].id : null
      }

      return {
        spaces: nextSpaces,
        tabsBySpace: nextTabsBySpace,
        activeSpaceId: nextActiveSpaceId,
        activeTabId: nextActiveTabId
      }
    })
  }
}))
