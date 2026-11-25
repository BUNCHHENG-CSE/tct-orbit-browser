import { create } from 'zustand'
import type { Space, Tab, TabGroup, Settings, AppInfo } from '@/types/api'
import { soundscape, type SoundscapeType } from '@/lib/soundscapes'

interface BrowserState {
  appInfo: AppInfo
  spaces: Space[]
  activeSpaceId: string | null
  tabsBySpace: Record<string, Tab[]>
  /** Nested tab groups per space */
  groupsBySpace: Record<string, TabGroup[]>
  activeTabId: string | null
  settings: Settings | null
  commandBarOpen: boolean
  commandBarInitialQuery: string
  commandBarMode: 'new-tab' | 'navigate'
  recentlyClosedTabs: { tab: Tab; spaceId: string }[]
  canGoBack: boolean
  canGoForward: boolean
  /** Tabs whose page is loading */
  loadingTabs: Record<string, boolean>
  /** Tab showing a video (or anything else) in full screen */
  htmlFullscreenTabId: string | null
  devtoolsOpen: boolean
  devtoolsDetached: boolean
  devtoolsWidth: number
  qrModal: { isOpen: boolean; url: string; title: string }

  // History Dialog State
  historyDialogOpen: boolean

  // Notes Drawer State
  notesDrawerOpen: boolean

  // Downloads Dialog State
  downloadsDialogOpen: boolean

  // Find Bar State
  findBarOpen: boolean

  // Bookmarks Dialog State
  bookmarksDialogOpen: boolean

  // Zen / Pure Focus Mode State
  zenMode: boolean
  zenSoundscape: SoundscapeType

  // Orbit Task Manager & RAM Monitor State
  taskManagerOpen: boolean

  // Split View State
  splitTabId: string | null
  /**
   * The two tabs shown side by side, remembered while another tab is shown alone.
   * Selecting either tab of the pair shows the split again (left = primary pane).
   */
  splitPair: { left: string; right: string } | null
  splitRatio: number
  splitActivePane: 'primary' | 'secondary'

  // Reader Mode State
  readerMode: {
    isOpen: boolean
    tabId: string | null
    url: string
    title: string
    byline: string
    contentHtml: string
    readingTime: string
    fontSize: number
    fontTheme: 'sans' | 'serif' | 'mono'
    colorTheme: 'paper' | 'sepia' | 'dark' | 'black'
  }

  // Store actions
  setAppInfo: (appInfo: AppInfo) => void
  setSpaces: (spaces: Space[]) => void
  setActiveSpaceId: (id: string | null) => void
  setTabsForSpace: (spaceId: string, tabs: Tab[]) => void
  setActiveTabId: (id: string | null) => void
  setSettings: (settings: Settings | null) => void
  setCommandBarOpen: (open: boolean, initialQuery?: string, mode?: 'new-tab' | 'navigate') => void
  setHistoryDialogOpen: (open: boolean) => void
  setNotesDrawerOpen: (open: boolean) => void
  setDownloadsDialogOpen: (open: boolean) => void
  setFindBarOpen: (open: boolean) => void
  setBookmarksDialogOpen: (open: boolean) => void
  setZenMode: (enabled: boolean | ((prev: boolean) => boolean)) => void
  setZenSoundscape: (soundscape: SoundscapeType) => void
  setTaskManagerOpen: (open: boolean) => void
  setTabAudible: (tabId: string, isAudible: boolean) => void
  setTabMuted: (tabId: string, isMuted: boolean) => void
  setTabSleeping: (tabId: string, isSleeping: boolean) => void
  pushRecentlyClosedTab: (tab: Tab, spaceId: string) => void
  popRecentlyClosedTab: () => { tab: Tab; spaceId: string } | undefined
  setNavState: (canGoBack: boolean, canGoForward: boolean) => void
  setTabLoading: (tabId: string, loading: boolean) => void
  setHtmlFullscreen: (tabId: string | null) => void
  setDevToolsOpen: (open: boolean) => void
  setDevToolsDetached: (detached: boolean) => void
  setDevToolsWidth: (width: number) => void
  setQrModal: (modal: { isOpen: boolean; url: string; title: string }) => void

  // Split View Actions
  setSplitTabId: (id: string | null) => void
  setSplitRatio: (ratio: number) => void
  setSplitActivePane: (pane: 'primary' | 'secondary') => void
  closeSplitView: () => void
  /** Swap the left and right panes */
  swapSplit: () => void

  // Reader Mode Actions
  openReaderMode: (data: {
    tabId: string
    url: string
    title: string
    byline?: string
    contentHtml: string
    readingTime?: string
  }) => void
  closeReaderMode: () => void
  updateReaderSettings: (settings: {
    fontSize?: number
    fontTheme?: 'sans' | 'serif' | 'mono'
    colorTheme?: 'paper' | 'sepia' | 'dark' | 'black'
  }) => void

  // Tab mutations in store
  addTabToStore: (spaceId: string, tab: Tab, referenceTabId?: string | null, makeActive?: boolean) => void
  insertTabNextTo: (spaceId: string, tab: Tab, referenceTabId?: string | null, makeActive?: boolean) => void
  updateTabInStore: (id: string, updates: Partial<Tab>) => void
  removeTabFromStore: (id: string) => void

  // Tab group mutations in store
  setGroupsForSpace: (spaceId: string, groups: TabGroup[]) => void
  upsertGroupInStore: (group: TabGroup) => void

  // Space mutations in store
  addSpaceToStore: (space: Space) => void
  updateSpaceInStore: (id: string, updates: Partial<Space>) => void
  removeSpaceFromStore: (id: string) => void
}

const pairHas = (pair: { left: string; right: string } | null, id: string) => !!pair && (pair.left === id || pair.right === id)

export const useBrowserStore = create<BrowserState>((set, get) => ({
  appInfo: typeof window !== 'undefined' && window.api?.appInfo
    ? window.api.appInfo
    : { name: 'TCT Orbit', version: '0.1.2', channel: 'stable' },
  setAppInfo: (appInfo) => set({ appInfo }),
  spaces: [],
  activeSpaceId: null,
  tabsBySpace: {},
  groupsBySpace: {},
  activeTabId: null,
  settings: null,
  commandBarOpen: false,
  commandBarInitialQuery: '',
  commandBarMode: 'new-tab',
  recentlyClosedTabs: [],
  canGoBack: false,
  canGoForward: false,
  loadingTabs: {},
  htmlFullscreenTabId: null,
  devtoolsOpen: false,
  devtoolsDetached: false,
  devtoolsWidth: 440,
  qrModal: { isOpen: false, url: '', title: '' },
  historyDialogOpen: false,
  setHistoryDialogOpen: (historyDialogOpen) => set({ historyDialogOpen }),
  notesDrawerOpen: false,
  setNotesDrawerOpen: (notesDrawerOpen) => set({ notesDrawerOpen }),
  downloadsDialogOpen: false,
  setDownloadsDialogOpen: (downloadsDialogOpen) => set({ downloadsDialogOpen }),
  findBarOpen: false,
  setFindBarOpen: (findBarOpen) => set({ findBarOpen }),
  bookmarksDialogOpen: false,
  setBookmarksDialogOpen: (bookmarksDialogOpen) => set({ bookmarksDialogOpen }),
  zenMode: false,
  zenSoundscape: 'none',
  taskManagerOpen: false,
  setZenMode: (enabled) => {
    const nextVal = typeof enabled === 'function' ? enabled(get().zenMode) : enabled
    if (!nextVal) {
      soundscape.stop()
      set({ zenMode: false, zenSoundscape: 'none' })
    } else {
      set({ zenMode: true })
    }
  },
  setZenSoundscape: (type) => {
    soundscape.setSoundscape(type)
    set({ zenSoundscape: type })
  },
  setTaskManagerOpen: (taskManagerOpen) => set({ taskManagerOpen }),
  setTabAudible: (tabId, isAudible) => {
    get().updateTabInStore(tabId, { isAudible })
  },
  setTabMuted: (tabId, isMuted) => {
    get().updateTabInStore(tabId, { isMuted })
  },
  setTabSleeping: (tabId, isSleeping) => {
    get().updateTabInStore(tabId, { isSleeping })
  },

  // Split View Initial State
  splitTabId: null,
  splitPair: null,
  splitRatio: 0.5,
  splitActivePane: 'primary',

  // Reader Mode Initial State
  readerMode: {
    isOpen: false,
    tabId: null,
    url: '',
    title: '',
    byline: '',
    contentHtml: '',
    readingTime: '',
    fontSize: 18,
    fontTheme: 'serif',
    colorTheme: 'paper'
  },

  setNavState: (canGoBack, canGoForward) =>
    set((state) =>
      state.canGoBack === canGoBack && state.canGoForward === canGoForward
        ? state
        : { canGoBack, canGoForward }
    ),
  setTabLoading: (tabId, loading) =>
    set((state) => {
      if (!!state.loadingTabs[tabId] === loading) return state
      const next = { ...state.loadingTabs }
      if (loading) next[tabId] = true
      else delete next[tabId]
      return { loadingTabs: next }
    }),
  setHtmlFullscreen: (htmlFullscreenTabId) => set({ htmlFullscreenTabId }),
  setDevToolsOpen: (open) => set({ devtoolsOpen: open }),
  setDevToolsDetached: (detached) => set({ devtoolsDetached: detached }),
  setDevToolsWidth: (width) => set({ devtoolsWidth: width }),
  setQrModal: (qrModal) => set({ qrModal }),

  // Split View Actions
  setSplitTabId: (id) =>
    set((state) => ({
      splitTabId: id,
      splitPair: id && state.activeTabId && id !== state.activeTabId ? { left: state.activeTabId, right: id } : null
    })),
  setSplitRatio: (ratio) => set({ splitRatio: Math.min(0.8, Math.max(0.2, ratio)) }),
  setSplitActivePane: (pane) => set({ splitActivePane: pane }),
  closeSplitView: () => set({ splitTabId: null, splitPair: null, splitActivePane: 'primary' }),
  swapSplit: () =>
    set((state) => {
      const pair = state.splitPair
      if (!pair) return state
      // Atomic: the active-tab rule below sees the new left tab as the pair's left
      return {
        splitPair: { left: pair.right, right: pair.left },
        activeTabId: pair.right,
        splitTabId: pair.left,
        splitActivePane: state.splitActivePane === 'primary' ? 'secondary' : 'primary'
      }
    }),

  // Reader Mode Actions
  openReaderMode: (data) =>
    set((state) => ({
      readerMode: {
        ...state.readerMode,
        isOpen: true,
        tabId: data.tabId,
        url: data.url,
        title: data.title,
        byline: data.byline || '',
        contentHtml: data.contentHtml,
        readingTime: data.readingTime || '2 min read'
      }
    })),
  closeReaderMode: () =>
    set((state) => ({
      readerMode: {
        ...state.readerMode,
        isOpen: false,
        tabId: null
      }
    })),
  updateReaderSettings: (settings) =>
    set((state) => ({
      readerMode: {
        ...state.readerMode,
        ...(settings.fontSize !== undefined ? { fontSize: settings.fontSize } : {}),
        ...(settings.fontTheme !== undefined ? { fontTheme: settings.fontTheme } : {}),
        ...(settings.colorTheme !== undefined ? { colorTheme: settings.colorTheme } : {})
      }
    })),

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
      activeTabId: firstTabId,
      splitTabId: null
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

  setActiveTabId: (id) =>
    set((state) =>
      // Clicking the split's left tab focuses the left pane, even when it's already the active tab
      state.splitPair && id === state.splitPair.left ? { activeTabId: id, splitActivePane: 'primary' } : { activeTabId: id }
    ),

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

  addTabToStore: (spaceId, tab, referenceTabId = null, makeActive = true) => {
    set((state) => {
      const currentTabs = [...(state.tabsBySpace[spaceId] || [])]
      const refId = referenceTabId || state.activeTabId
      const refIndex = refId ? currentTabs.findIndex((t) => t.id === refId) : -1

      if (refIndex !== -1) {
        currentTabs.splice(refIndex + 1, 0, tab)
      } else {
        currentTabs.push(tab)
      }

      const reordered = currentTabs.map((t, idx) => ({ ...t, order: idx }))

      return {
        tabsBySpace: {
          ...state.tabsBySpace,
          [spaceId]: reordered
        },
        activeTabId: makeActive ? tab.id : state.activeTabId
      }
    })
  },

  insertTabNextTo: (spaceId, tab, referenceTabId = null, makeActive = true) => {
    set((state) => {
      const currentTabs = [...(state.tabsBySpace[spaceId] || [])]
      const refId = referenceTabId || state.activeTabId
      const refIndex = refId ? currentTabs.findIndex((t) => t.id === refId) : -1

      if (refIndex !== -1) {
        currentTabs.splice(refIndex + 1, 0, tab)
      } else {
        currentTabs.push(tab)
      }

      const reordered = currentTabs.map((t, idx) => ({ ...t, order: idx }))

      return {
        tabsBySpace: {
          ...state.tabsBySpace,
          [spaceId]: reordered
        },
        activeTabId: makeActive ? tab.id : state.activeTabId
      }
    })
  },

  // Hot path: called on every title / favicon / URL / audio change of every tab.
  // Only the space that holds the tab gets a new array, and nothing changes (no re-render at all)
  // when the update carries the values the tab already has.
  updateTabInStore: (id, updates) => {
    set((state) => {
      for (const [spaceId, tabs] of Object.entries(state.tabsBySpace)) {
        const idx = tabs.findIndex((t) => t.id === id)
        if (idx === -1) continue
        const current = tabs[idx]
        let changed = false
        for (const key in updates) {
          const next = (updates as Record<string, unknown>)[key]
          const prev = (current as unknown as Record<string, unknown>)[key]
          // Dates (lastVisited) may arrive as Date or ISO string: compare by value
          if (next !== prev && !(next instanceof Date && typeof prev === 'string' && next.toISOString() === prev)) {
            changed = true
            break
          }
        }
        if (!changed) return state
        const nextTabs = tabs.slice()
        nextTabs[idx] = { ...current, ...updates }
        return { tabsBySpace: { ...state.tabsBySpace, [spaceId]: nextTabs } }
      }
      return state
    })
  },

  removeTabFromStore: (id) => {
    set((state) => {
      // Only the space that holds the tab gets a new array
      const nextTabsBySpace: Record<string, Tab[]> = { ...state.tabsBySpace }
      let removedTab: Tab | null = null
      let removedSpaceId: string | null = null

      for (const [spaceId, tabs] of Object.entries(state.tabsBySpace)) {
        const found = tabs.find((t) => t.id === id)
        if (found) {
          removedTab = found
          removedSpaceId = spaceId
          nextTabsBySpace[spaceId] = tabs.filter((t) => t.id !== id)
          break
        }
      }
      if (!removedSpaceId) return state

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
        // Closing either tab of the split ends the split
        splitTabId: state.splitTabId === id || pairHas(state.splitPair, id) ? null : state.splitTabId,
        splitPair: pairHas(state.splitPair, id) ? null : state.splitPair,
        splitActivePane: pairHas(state.splitPair, id) ? 'primary' : state.splitActivePane,
        recentlyClosedTabs: nextRecentlyClosed
      }
    })
  },

  setGroupsForSpace: (spaceId, groups) =>
    set((state) => ({ groupsBySpace: { ...state.groupsBySpace, [spaceId]: groups } })),

  upsertGroupInStore: (group) =>
    set((state) => {
      const list = state.groupsBySpace[group.spaceId] || []
      const exists = list.some((g) => g.id === group.id)
      return {
        groupsBySpace: {
          ...state.groupsBySpace,
          [group.spaceId]: exists ? list.map((g) => (g.id === group.id ? group : g)) : [...list, group]
        }
      }
    }),

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
      const nextGroupsBySpace = { ...state.groupsBySpace }
      delete nextGroupsBySpace[id]

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
        groupsBySpace: nextGroupsBySpace,
        activeSpaceId: nextActiveSpaceId,
        activeTabId: nextActiveTabId
      }
    })
  }
}))

/**
 * Split view follows the active tab. Runs for EVERY way the active tab changes (sidebar, tab
 * strip, keyboard, new tabs, setState), so no caller can forget it:
 * - the pair's left tab  -> show the split, left pane focused
 * - the pair's right tab -> show the split, right pane focused
 * - any other tab        -> show that tab alone (the pair is remembered for later)
 */
useBrowserStore.subscribe((state, prev) => {
  if (state.activeTabId === prev.activeTabId) return
  const pair = state.splitPair
  if (!pair) return
  const id = state.activeTabId
  if (id === pair.left) {
    // Coming from the right tab = the remap below: keep the right pane focused
    const pane = prev.activeTabId === pair.right ? state.splitActivePane : 'primary'
    if (state.splitTabId !== pair.right || state.splitActivePane !== pane) {
      useBrowserStore.setState({ splitTabId: pair.right, splitActivePane: pane })
    }
  } else if (id === pair.right) {
    useBrowserStore.setState({ activeTabId: pair.left, splitTabId: pair.right, splitActivePane: 'secondary' })
  } else if (state.splitTabId) {
    useBrowserStore.setState({ splitTabId: null })
  }
})
