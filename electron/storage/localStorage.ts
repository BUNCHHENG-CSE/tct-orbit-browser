import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { getAppPaths } from './paths'
import { safeStorageVault } from '../security'
import type {
  Space,
  Tab,
  Settings,
  CreateSpaceData,
  UpdateSpaceData,
  CreateTabData,
  UpdateTabData,
  UpdateSettingsData,
  TabGroup,
  CreateTabGroupData,
  UpdateTabGroupData,
  SavedSplit,
  SaveSplitData
} from '../../src/types/api'

/** Root group = depth 1. Matches Dia's limit of eight nested levels. */
export const MAX_GROUP_DEPTH = 8
const MAX_SAVED_SPLITS = 50

interface LocalBrowserData {
  user: {
    id: string
    createdAt: string
  }
  settings: Settings
  spaces: Space[]
  tabs: Tab[]
  /** Nested tab groups (optional: files written by older versions have none) */
  groups?: TabGroup[]
  /** Saved split-view layouts */
  savedSplits?: SavedSplit[]
  encryptedVault?: Record<string, string>
}

/** A space read from another browser (Arc), ready to be added */
export interface ImportedSpace {
  name: string
  color: string
  tabs: Array<{ url: string; title: string; isPinned: boolean; groupPath: string[] }>
  groups: Array<{ path: string[]; name: string }>
}

/** Orbit's built-in start page (rendered by the UI, see src/lib/startPage.ts) */
const START_PAGE_URL = 'orbit://start'

/** Page a fresh tab opens on: the start page unless the user chose the command bar */
function homeTabFor(settings: Settings | undefined): { url: string; title: string; favicon: string | null } {
  if (settings?.newTabPage !== 'command-bar') return { url: START_PAGE_URL, title: 'Start', favicon: null }
  const engine = settings?.defaultSearchEngine || 'duckduckgo'
  const url = engine === 'google' ? 'https://www.google.com' : engine === 'bing' ? 'https://www.bing.com' : 'https://duckduckgo.com'
  const title = engine === 'google' ? 'Google' : engine === 'bing' ? 'Bing' : 'DuckDuckGo'
  return { url, title, favicon: `${url}/favicon.ico` }
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

const DEFAULT_DATA: LocalBrowserData = {
  user: {
    id: 'local-user',
    createdAt: new Date().toISOString()
  },
  settings: {
    id: 'local-settings',
    userId: 'local-user',
    defaultSearchEngine: 'duckduckgo',
    theme: 'dark',
    sidebarCollapsed: false,
    accentColor: '#6366f1',
    accentPreset: 'orbit-blue',
    webColorScheme: 'match-browser',
    smoothScrolling: true,
    startupBehavior: 'previous-session',
    startupCustomUrls: [],
    downloadPath: '',
    askWhereToSave: false,
    openFolderOnDownload: true,
    defaultZoom: 100,
    autoArchiveDuration: 'off',
    updatedAt: new Date().toISOString()
  },
  spaces: [
    {
      id: 'default-personal-space',
      userId: 'local-user',
      name: 'Personal',
      color: '#6366f1',
      icon: 'Layers',
      order: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tabs: []
    }
  ],
  tabs: [
    {
      id: 'default-start-tab',
      spaceId: 'default-personal-space',
      url: START_PAGE_URL,
      title: 'Start',
      favicon: null,
      isPinned: false,
      order: 0,
      lastVisited: new Date().toISOString(),
      createdAt: new Date().toISOString()
    }
  ]
}

class LocalStorageService {
  private data: LocalBrowserData = DEFAULT_DATA
  private filePath: string = ''
  /** Crash detection: a lock file exists while the browser runs and is removed on clean exit */
  private lockPath = ''
  private crashedLastRun = false
  /** Tabs from the previous session that the startup policy did not reopen (restorable on demand) */
  private restorableTabs: Tab[] = []

  public init(): void {
    try {
      const paths = getAppPaths()
      this.filePath = paths.stateFilePath

      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      this.lockPath = path.join(app.getPath('userData'), 'session.lock')
      try {
        this.crashedLastRun = fs.existsSync(this.lockPath)
        fs.writeFileSync(this.lockPath, String(process.pid), 'utf-8')
      } catch {}

      if (fs.existsSync(this.filePath)) {
        const fileContent = fs.readFileSync(this.filePath, 'utf-8')
        const parsed = JSON.parse(fileContent)
        if (parsed && Array.isArray(parsed.spaces) && Array.isArray(parsed.tabs) && parsed.settings) {
          this.data = parsed
          console.log('[LocalStorage] Loaded local private browser data from:', this.filePath)
          this.applyStartupPolicy()
          return
        }
      }

      // First run or file doesn't exist yet: initialize default data
      this.save()
      console.log('[LocalStorage] Initialized 100% private local storage at:', this.filePath)
    } catch (err) {
      console.error('[LocalStorage] Error initializing local storage:', err)
      this.data = JSON.parse(JSON.stringify(DEFAULT_DATA))
    }
  }

  private saveTimeout: NodeJS.Timeout | null = null

  private save(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }
    this.saveTimeout = setTimeout(() => {
      this.flushSave()
    }, 250)
  }

  public flushSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
      this.saveTimeout = null
    }
    let tmpPath: string | null = null
    try {
      if (!this.filePath) {
        this.filePath = getAppPaths().stateFilePath
      }
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      // Atomic write pattern: write to unique .tmp file, then renameSync
      tmpPath = `${this.filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
      // Private tabs live in memory only: never written to disk
      fs.writeFileSync(tmpPath, JSON.stringify(this.getPersistableState()), 'utf-8')
      fs.renameSync(tmpPath, this.filePath)
    } catch (err) {
      console.error('[LocalStorage] Failed to write browser data atomically to disk:', err)
      if (tmpPath && fs.existsSync(tmpPath)) {
        try {
          fs.unlinkSync(tmpPath)
        } catch {}
      }
    }
  }

  // --- Settings ---
  public getSettings(): Settings {
    return { ...this.data.settings }
  }

  public updateSettings(updates: UpdateSettingsData): Settings {
    this.data.settings = {
      ...this.data.settings,
      ...(updates.defaultSearchEngine !== undefined ? { defaultSearchEngine: updates.defaultSearchEngine } : {}),
      ...(updates.theme !== undefined ? { theme: updates.theme } : {}),
      ...(updates.sidebarCollapsed !== undefined ? { sidebarCollapsed: updates.sidebarCollapsed } : {}),
      ...(updates.accentColor !== undefined ? { accentColor: updates.accentColor } : {}),
      ...(updates.accentPreset !== undefined ? { accentPreset: updates.accentPreset } : {}),
      ...(updates.webColorScheme !== undefined ? { webColorScheme: updates.webColorScheme } : {}),
      ...(updates.smoothScrolling !== undefined ? { smoothScrolling: updates.smoothScrolling } : {}),
      ...(updates.startupBehavior !== undefined ? { startupBehavior: updates.startupBehavior } : {}),
      ...(updates.startupCustomUrls !== undefined ? { startupCustomUrls: updates.startupCustomUrls } : {}),
      ...(updates.downloadPath !== undefined ? { downloadPath: updates.downloadPath } : {}),
      ...(updates.askWhereToSave !== undefined ? { askWhereToSave: updates.askWhereToSave } : {}),
      ...(updates.openFolderOnDownload !== undefined ? { openFolderOnDownload: updates.openFolderOnDownload } : {}),
      ...(updates.defaultZoom !== undefined ? { defaultZoom: updates.defaultZoom } : {}),
      ...(updates.autoArchiveDuration !== undefined ? { autoArchiveDuration: updates.autoArchiveDuration } : {}),
      ...(updates.memorySaverEnabled !== undefined ? { memorySaverEnabled: updates.memorySaverEnabled } : {}),
      ...(updates.sleepTimeoutMinutes !== undefined ? { sleepTimeoutMinutes: updates.sleepTimeoutMinutes } : {}),
      ...(updates.newTabPage !== undefined ? { newTabPage: updates.newTabPage } : {}),
      ...(updates.tabLayout !== undefined ? { tabLayout: updates.tabLayout } : {}),
      ...(updates.newTabsOnTop !== undefined ? { newTabsOnTop: updates.newTabsOnTop } : {}),
      ...(updates.favoritesBar !== undefined ? { favoritesBar: updates.favoritesBar } : {}),
      updatedAt: new Date().toISOString()
    }
    this.save()
    return { ...this.data.settings }
  }

  /**
   * Applies user's startup preferences when launching the browser.
   * - 'previous-session': All tabs (pinned & unpinned) are preserved exactly as left.
   * - 'new-tab': Pinned tabs are ALWAYS kept; unpinned tabs are cleared to a clean new tab.
   * - 'custom-urls': Pinned tabs are kept; custom sites are opened in the active space.
   */
  private applyStartupPolicy(): void {
    const startupBehavior = this.data.settings?.startupBehavior || 'previous-session'
    const customUrls = this.data.settings?.startupCustomUrls || []
    const home = homeTabFor(this.data.settings)
    const defaultUrl = home.url
    const defaultTitle = home.title
    const defaultFavicon = home.favicon

    const activeSpace = this.data.spaces.find((s) => s.isActive) || this.data.spaces[0]
    const spaceId = activeSpace ? activeSpace.id : 'default-personal-space'
    const previousTabs = this.data.tabs.filter((t) => !t.isPrivate)

    if (startupBehavior === 'new-tab') {
      // Pinned tabs always survive across restarts in all spaces
      const survivingTabs = this.data.tabs.filter((t) => t.isPinned)

      // Ensure every space has at least one tab (either its pinned tabs or a fresh new tab)
      for (const space of this.data.spaces) {
        const spacePinned = survivingTabs.filter((t) => t.spaceId === space.id)
        if (spacePinned.length === 0) {
          survivingTabs.push({
            id: `tab-${Date.now()}-${space.id}`,
            spaceId: space.id,
            url: defaultUrl,
            title: defaultTitle,
            favicon: defaultFavicon,
            isPinned: false,
            order: 0,
            lastVisited: new Date().toISOString(),
            createdAt: new Date().toISOString()
          })
        }
      }
      this.data.tabs = survivingTabs
      this.save()
    } else if (startupBehavior === 'custom-urls') {
      // Pinned tabs always survive
      const survivingTabs = this.data.tabs.filter((t) => t.isPinned)
      const targetUrls = customUrls.length > 0 ? customUrls : [defaultUrl]

      targetUrls.forEach((url, i) => {
        let title = 'New Tab'
        try {
          title = new URL(url).hostname
        } catch {}

        survivingTabs.push({
          id: `tab-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          spaceId,
          url,
          title,
          favicon: null,
          isPinned: false,
          order: survivingTabs.length,
          lastVisited: new Date().toISOString(),
          createdAt: new Date().toISOString()
        })
      })
      this.data.tabs = survivingTabs
      this.save()
    } else {
      // 'previous-session' (Default):
      // Restore all tabs from previous session. If empty, ensure at least one tab exists.
      if (this.data.tabs.length === 0) {
        this.data.tabs.push({
          id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          spaceId,
          url: defaultUrl,
          title: defaultTitle,
          favicon: defaultFavicon,
          isPinned: false,
          order: 0,
          lastVisited: new Date().toISOString(),
          createdAt: new Date().toISOString()
        })
        this.save()
      }
    }

    // Auto-Archive Inactive Tabs Policy:
    // If autoArchiveDuration is configured, automatically prune unpinned tabs
    // that haven't been visited within the configured time window.
    const autoArchive = this.data.settings?.autoArchiveDuration || 'off'
    if (autoArchive !== 'off') {
      const durationMs =
        autoArchive === '12h'
          ? 12 * 60 * 60 * 1000
          : autoArchive === '24h'
          ? 24 * 60 * 60 * 1000
          : autoArchive === '3d'
          ? 3 * 24 * 60 * 60 * 1000
          : 7 * 24 * 60 * 60 * 1000

      const cutoffTime = Date.now() - durationMs
      const survivingTabs: Tab[] = []

      for (const space of this.data.spaces) {
        const spaceTabs = this.data.tabs.filter((t) => t.spaceId === space.id)
        const recent = spaceTabs.filter(
          (t) => t.isPinned || new Date(t.lastVisited || t.createdAt).getTime() > cutoffTime
        )
        if (recent.length > 0) {
          survivingTabs.push(...recent)
        } else if (spaceTabs.length > 0) {
          // Preserve at least the most recently visited tab in this space
          const sorted = [...spaceTabs].sort(
            (a, b) =>
              new Date(b.lastVisited || b.createdAt).getTime() -
              new Date(a.lastVisited || a.createdAt).getTime()
          )
          survivingTabs.push(sorted[0])
        }
      }

      if (survivingTabs.length !== this.data.tabs.length) {
        console.log(`[LocalStorage] Auto-archived ${this.data.tabs.length - survivingTabs.length} inactive tab(s).`)
        this.data.tabs = survivingTabs
        this.save()
      }
    }

    // Remember what the policy closed so "Restore previous session" can bring it back
    const keptIds = new Set(this.data.tabs.map((t) => t.id))
    this.restorableTabs = previousTabs.filter((t) => !keptIds.has(t.id))
  }

  // --- Session restore ---

  public getSessionRestoreInfo(): { crashed: boolean; restorableCount: number } {
    return { crashed: this.crashedLastRun, restorableCount: this.restorableTabs.length }
  }

  /** Reopen tabs from the previous session that were not restored at startup */
  public restorePreviousSession(): number {
    if (this.restorableTabs.length === 0) return 0
    const spaceIds = new Set(this.data.spaces.map((s) => s.id))
    const fallbackSpace = (this.data.spaces.find((s) => s.isActive) || this.data.spaces[0])?.id
    const existingUrls = new Set(this.data.tabs.map((t) => `${t.spaceId}|${t.url}`))
    let restored = 0
    for (const tab of this.restorableTabs) {
      const targetSpace = spaceIds.has(tab.spaceId) ? tab.spaceId : fallbackSpace
      if (!targetSpace || existingUrls.has(`${targetSpace}|${tab.url}`)) continue
      const order = this.data.tabs.filter((t) => t.spaceId === targetSpace).length
      this.data.tabs.push({
        ...tab,
        id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        spaceId: targetSpace,
        order,
        isSleeping: true,
        lastVisited: new Date().toISOString()
      })
      existingUrls.add(`${targetSpace}|${tab.url}`)
      restored++
    }
    this.restorableTabs = []
    this.crashedLastRun = false
    if (restored > 0) this.save()
    return restored
  }

  public dismissSessionRestore(): void {
    this.crashedLastRun = false
  }

  /** Clean shutdown: remove the crash-detection lock */
  public markCleanExit(): void {
    try {
      if (this.lockPath && fs.existsSync(this.lockPath)) fs.unlinkSync(this.lockPath)
    } catch {}
  }

  // --- Spaces ---
  public listSpaces(): Space[] {
    return this.data.spaces
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        ...s,
        tabs: this.data.tabs.filter((t) => t.spaceId === s.id).sort((a, b) => a.order - b.order)
      }))
  }

  public createSpace(data: CreateSpaceData): Space {
    const newSpace: Space = {
      id: `space-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: this.data.user.id,
      name: data.name,
      color: data.color || '#6366f1',
      icon: data.icon || 'Layers',
      order: data.order !== undefined ? data.order : this.data.spaces.length,
      isActive: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tabs: [],
      ...(data.isolated ? { isolated: true } : {})
    }

    // Initial tab: the given page, else the start page (or the search engine if the user prefers)
    const home = homeTabFor(this.data.settings)
    const homeUrl = data.initialUrl || home.url
    const homeTitle = data.initialTitle || home.title
    const favicon: string | null = data.initialUrl ? null : home.favicon

    const initialTab: Tab = {
      id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      spaceId: newSpace.id,
      url: homeUrl,
      title: homeTitle,
      favicon: favicon,
      isPinned: false,
      order: 0,
      lastVisited: new Date().toISOString(),
      createdAt: new Date().toISOString()
    }

    newSpace.tabs = [initialTab]
    this.data.spaces.push(newSpace)
    this.data.tabs.push(initialTab)
    this.save()
    return newSpace
  }

  public updateSpace(id: string, updates: UpdateSpaceData): Space {
    const idx = this.data.spaces.findIndex((s) => s.id === id)
    if (idx === -1) throw new Error(`Space not found: ${id}`)

    this.data.spaces[idx] = {
      ...this.data.spaces[idx],
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.color !== undefined ? { color: updates.color } : {}),
      ...(updates.icon !== undefined ? { icon: updates.icon } : {}),
      ...(updates.order !== undefined ? { order: updates.order } : {}),
      ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
      ...(updates.isolated !== undefined ? { isolated: updates.isolated } : {}),
      updatedAt: new Date().toISOString()
    }
    this.save()
    return {
      ...this.data.spaces[idx],
      tabs: this.data.tabs.filter((t) => t.spaceId === id).sort((a, b) => a.order - b.order)
    }
  }

  public removeSpace(id: string): boolean {
    this.data.spaces = this.data.spaces.filter((s) => s.id !== id)
    this.data.tabs = this.data.tabs.filter((t) => t.spaceId !== id)
    if (this.data.groups) this.data.groups = this.data.groups.filter((g) => g.spaceId !== id)
    this.save()
    return true
  }

  public getSpace(id: string): Space | undefined {
    return this.data.spaces.find((s) => s.id === id)
  }

  /** True when the space keeps its own cookies/logins (separate profile session) */
  public isSpaceIsolated(id: string): boolean {
    return !!this.data.spaces.find((s) => s.id === id)?.isolated
  }

  public setActiveSpace(id: string): Space {
    this.data.spaces = this.data.spaces.map((s) => ({
      ...s,
      isActive: s.id === id,
      updatedAt: new Date().toISOString()
    }))
    this.save()
    const active = this.data.spaces.find((s) => s.id === id) || this.data.spaces[0]
    return {
      ...active,
      tabs: this.data.tabs.filter((t) => t.spaceId === active.id).sort((a, b) => a.order - b.order)
    }
  }

  // --- Tabs ---
  public listTabs(spaceId: string): Tab[] {
    return this.data.tabs
      .filter((t) => t.spaceId === spaceId)
      .sort((a, b) => a.order - b.order)
  }

  public createTab(data: CreateTabData): Tab {
    const spaceTabs = this.data.tabs.filter((t) => t.spaceId === data.spaceId).sort((a, b) => a.order - b.order)
    const insertOrder = data.order !== undefined ? data.order : spaceTabs.length

    // If inserting in the middle, shift all subsequent tabs' orders by 1
    if (data.order !== undefined) {
      for (const t of spaceTabs) {
        if (t.order >= insertOrder) {
          t.order += 1
        }
      }
    }

    const newTab: Tab = {
      id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      spaceId: data.spaceId,
      url: data.url,
      title: data.title || 'New Tab',
      favicon: data.favicon || null,
      isPinned: data.isPinned || false,
      order: insertOrder,
      lastVisited: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      ...(data.isPrivate ? { isPrivate: true, isPinned: false } : {}),
      ...(data.groupId && this.groupInSpace(data.groupId, data.spaceId) ? { groupId: data.groupId } : {})
    }
    this.data.tabs.push(newTab)
    this.save()
    return newTab
  }

  public updateTab(id: string, updates: UpdateTabData): Tab {
    const idx = this.data.tabs.findIndex((t) => t.id === id)
    if (idx === -1) throw new Error(`Tab not found: ${id}`)

    const current = this.data.tabs[idx]
    const nextSpaceId = updates.spaceId ?? current.spaceId
    // A group only exists inside one space: moving the tab to another space ungroups it
    let nextGroupId: string | null | undefined = current.groupId
    if (updates.groupId !== undefined) {
      nextGroupId = updates.groupId && this.groupInSpace(updates.groupId, nextSpaceId) ? updates.groupId : null
    } else if (nextSpaceId !== current.spaceId) {
      nextGroupId = null
    }

    this.data.tabs[idx] = {
      ...current,
      groupId: nextGroupId ?? null,
      ...(updates.url !== undefined ? { url: updates.url } : {}),
      ...(updates.title !== undefined ? { title: updates.title } : {}),
      ...(updates.favicon !== undefined ? { favicon: updates.favicon } : {}),
      ...(updates.isPinned !== undefined ? { isPinned: updates.isPinned } : {}),
      ...(updates.order !== undefined ? { order: updates.order } : {}),
      ...(updates.spaceId !== undefined ? { spaceId: updates.spaceId } : {}),
      lastVisited: new Date().toISOString()
    }
    this.save()
    return { ...this.data.tabs[idx] }
  }

  public getTab(id: string): Tab | undefined {
    return this.data.tabs.find((t) => t.id === id)
  }

  public hasPrivateTabs(): boolean {
    return this.data.tabs.some((t) => t.isPrivate)
  }

  /** State without private tabs (for disk writes and backups) */
  private getPersistableState(): LocalBrowserData {
    if (!this.data.tabs.some((t) => t.isPrivate)) return this.data
    return { ...this.data, tabs: this.data.tabs.filter((t) => !t.isPrivate) }
  }

  public removeTab(id: string): boolean {
    this.data.tabs = this.data.tabs.filter((t) => t.id !== id)
    this.save()
    return true
  }

  public reorderTabs(spaceId: string, orderedIds: string[]): Tab[] {
    orderedIds.forEach((tabId, newOrder) => {
      const tab = this.data.tabs.find((t) => t.id === tabId && t.spaceId === spaceId)
      if (tab) {
        tab.order = newOrder
      }
    })
    this.save()
    return this.listTabs(spaceId)
  }

  // --- Tab groups (nestable) ---

  private get groups(): TabGroup[] {
    if (!this.data.groups) this.data.groups = []
    return this.data.groups
  }

  private groupInSpace(groupId: string, spaceId: string): boolean {
    return this.groups.some((g) => g.id === groupId && g.spaceId === spaceId)
  }

  /** Depth of a group (root = 1, null = 0) */
  private groupDepth(groupId: string | null): number {
    let depth = 0
    let cur = groupId ? this.groups.find((g) => g.id === groupId) : undefined
    const seen = new Set<string>()
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      depth++
      const parentId = cur.parentId
      cur = parentId ? this.groups.find((g) => g.id === parentId) : undefined
    }
    return depth
  }

  /** Height of the subtree rooted at groupId (a leaf group = 1) */
  private subtreeHeight(groupId: string, seen = new Set<string>()): number {
    if (seen.has(groupId)) return 0
    seen.add(groupId)
    const children = this.groups.filter((g) => g.parentId === groupId)
    if (children.length === 0) return 1
    return 1 + Math.max(...children.map((c) => this.subtreeHeight(c.id, seen)))
  }

  /** True when `groupId` sits somewhere below `ancestorId` */
  private isDescendant(groupId: string, ancestorId: string): boolean {
    let cur = this.groups.find((g) => g.id === groupId)
    const seen = new Set<string>()
    while (cur && cur.parentId && !seen.has(cur.id)) {
      seen.add(cur.id)
      if (cur.parentId === ancestorId) return true
      const parentId = cur.parentId
      cur = this.groups.find((g) => g.id === parentId)
    }
    return false
  }

  public listGroups(spaceId: string): TabGroup[] {
    return this.groups.filter((g) => g.spaceId === spaceId).sort((a, b) => a.order - b.order)
  }

  public createGroup(data: CreateTabGroupData): { group: TabGroup; tabs: Tab[] } {
    if (!this.data.spaces.some((s) => s.id === data.spaceId)) throw new Error('Space not found')
    const parentId = data.parentId && this.groupInSpace(data.parentId, data.spaceId) ? data.parentId : null
    if (this.groupDepth(parentId) + 1 > MAX_GROUP_DEPTH) {
      throw new Error(`Groups can be nested at most ${MAX_GROUP_DEPTH} levels deep`)
    }
    const siblings = this.groups.filter((g) => g.spaceId === data.spaceId && g.parentId === parentId)
    const group: TabGroup = {
      id: newId('group'),
      spaceId: data.spaceId,
      parentId,
      name: (data.name || 'New Group').slice(0, 80),
      // Nested groups inherit their parent's color unless one is chosen
      color: data.color !== undefined ? data.color : parentId ? null : '#6366f1',
      collapsed: false,
      order: siblings.length,
      openLinksInGroup: false,
      createdAt: new Date().toISOString()
    }
    this.groups.push(group)
    for (const tabId of data.tabIds || []) {
      const tab = this.data.tabs.find((t) => t.id === tabId && t.spaceId === data.spaceId)
      if (tab) tab.groupId = group.id
    }
    this.save()
    return { group, tabs: this.listTabs(data.spaceId) }
  }

  public updateGroup(id: string, updates: UpdateTabGroupData): TabGroup {
    const group = this.groups.find((g) => g.id === id)
    if (!group) throw new Error(`Group not found: ${id}`)

    if (updates.parentId !== undefined && updates.parentId !== group.parentId) {
      const newParent = updates.parentId
      if (newParent !== null) {
        if (newParent === id || this.isDescendant(newParent, id)) {
          throw new Error('A group cannot be moved inside itself')
        }
        if (!this.groupInSpace(newParent, group.spaceId)) throw new Error('Parent group not found')
      }
      if (this.groupDepth(newParent) + this.subtreeHeight(id) > MAX_GROUP_DEPTH) {
        throw new Error(`Groups can be nested at most ${MAX_GROUP_DEPTH} levels deep`)
      }
      group.parentId = newParent
      group.order = this.groups.filter((g) => g.spaceId === group.spaceId && g.parentId === newParent && g.id !== id).length
    }
    if (updates.name !== undefined) group.name = updates.name.trim().slice(0, 80) || group.name
    if (updates.color !== undefined) group.color = updates.color
    if (updates.collapsed !== undefined) group.collapsed = updates.collapsed
    if (updates.order !== undefined) group.order = updates.order
    if (updates.openLinksInGroup !== undefined) group.openLinksInGroup = updates.openLinksInGroup
    this.save()
    return { ...group }
  }

  /**
   * Remove a group. closeTabs=false: its tabs and sub-groups move up to the parent.
   * closeTabs=true: the group, every nested group and all their tabs are removed.
   */
  public removeGroup(id: string, closeTabs = false): { groups: TabGroup[]; tabs: Tab[] } {
    const group = this.groups.find((g) => g.id === id)
    if (!group) return { groups: [], tabs: [] }
    const spaceId = group.spaceId

    if (closeTabs) {
      const doomed = new Set<string>([id])
      let grew = true
      while (grew) {
        grew = false
        for (const g of this.groups) {
          if (g.parentId && doomed.has(g.parentId) && !doomed.has(g.id)) {
            doomed.add(g.id)
            grew = true
          }
        }
      }
      this.data.tabs = this.data.tabs.filter((t) => !(t.groupId && doomed.has(t.groupId)))
      this.data.groups = this.groups.filter((g) => !doomed.has(g.id))
    } else {
      for (const t of this.data.tabs) if (t.groupId === id) t.groupId = group.parentId
      for (const g of this.groups) if (g.parentId === id) g.parentId = group.parentId
      this.data.groups = this.groups.filter((g) => g.id !== id)
    }
    this.save()
    return { groups: this.listGroups(spaceId), tabs: this.listTabs(spaceId) }
  }

  // --- Saved split layouts ---

  public listSavedSplits(): SavedSplit[] {
    return [...(this.data.savedSplits || [])]
  }

  public saveSplit(data: SaveSplitData): SavedSplit {
    if (!this.data.savedSplits) this.data.savedSplits = []
    const split: SavedSplit = {
      id: newId('split'),
      name: data.name.trim().slice(0, 80) || 'Split layout',
      primary: { url: data.primary.url, title: data.primary.title.slice(0, 300) },
      secondary: { url: data.secondary.url, title: data.secondary.title.slice(0, 300) },
      ratio: Math.min(0.8, Math.max(0.2, data.ratio)),
      createdAt: new Date().toISOString()
    }
    this.data.savedSplits.unshift(split)
    this.data.savedSplits = this.data.savedSplits.slice(0, MAX_SAVED_SPLITS)
    this.save()
    return split
  }

  public removeSavedSplit(id: string): boolean {
    if (!this.data.savedSplits) return false
    const before = this.data.savedSplits.length
    this.data.savedSplits = this.data.savedSplits.filter((s) => s.id !== id)
    this.save()
    return this.data.savedSplits.length !== before
  }

  // --- Arc import ---

  /**
   * Add spaces, groups and tabs built by the Arc importer in one save.
   * Imported tabs start asleep so dozens of tabs do not all load at once.
   */
  public importSpaces(spaces: ImportedSpace[]): { spaces: number; tabs: number; groups: number } {
    let tabCount = 0
    let groupCount = 0
    const now = new Date().toISOString()
    for (const imported of spaces) {
      const space: Space = {
        id: newId('space'),
        userId: this.data.user.id,
        name: imported.name.slice(0, 80) || 'Arc Space',
        color: imported.color,
        icon: 'Layers',
        order: this.data.spaces.length,
        isActive: false,
        createdAt: now,
        updatedAt: now
      }
      this.data.spaces.push(space)

      // Parents always come before children (sorted by path length)
      const groupIdByPath = new Map<string, string>()
      const sortedGroups = [...imported.groups].sort((a, b) => a.path.length - b.path.length)
      for (const g of sortedGroups) {
        if (g.path.length > MAX_GROUP_DEPTH) continue
        const parentId = g.path.length > 1 ? groupIdByPath.get(g.path.slice(0, -1).join('/')) ?? null : null
        const group: TabGroup = {
          id: newId('group'),
          spaceId: space.id,
          parentId,
          name: g.name.slice(0, 80) || 'Folder',
          color: parentId ? null : imported.color,
          collapsed: true,
          order: this.groups.filter((x) => x.spaceId === space.id && x.parentId === parentId).length,
          openLinksInGroup: false,
          createdAt: now
        }
        this.groups.push(group)
        groupIdByPath.set(g.path.join('/'), group.id)
        groupCount++
      }

      imported.tabs.forEach((t, i) => {
        // Deepest existing group along the path (folders past the depth limit flatten into it)
        let groupId: string | null = null
        for (let depth = t.groupPath.length; depth > 0 && !groupId; depth--) {
          groupId = groupIdByPath.get(t.groupPath.slice(0, depth).join('/')) ?? null
        }
        this.data.tabs.push({
          id: newId('tab'),
          spaceId: space.id,
          url: t.url,
          title: t.title || t.url,
          favicon: null,
          isPinned: t.isPinned,
          order: i,
          lastVisited: now,
          createdAt: now,
          isSleeping: true,
          groupId
        })
        tabCount++
      })

      // A space must never be empty
      if (imported.tabs.length === 0) {
        this.data.tabs.push({
          id: newId('tab'),
          spaceId: space.id,
          url: 'https://duckduckgo.com',
          title: 'DuckDuckGo',
          favicon: null,
          isPinned: false,
          order: 0,
          lastVisited: now,
          createdAt: now
        })
      }
    }
    this.save()
    return { spaces: spaces.length, tabs: tabCount, groups: groupCount }
  }


  // --- SafeStorage Encrypted Vault (OS-level DPAPI / Keychain) ---
  public setEncryptedSecret(key: string, plainTextValue: string): void {
    if (!this.data.encryptedVault) {
      this.data.encryptedVault = {}
    }
    this.data.encryptedVault[key] = safeStorageVault.encryptString(plainTextValue)
    this.save()
  }

  public getDecryptedSecret(key: string): string | null {
    if (!this.data.encryptedVault || !this.data.encryptedVault[key]) {
      return null
    }
    return safeStorageVault.decryptString(this.data.encryptedVault[key])
  }

  public deleteEncryptedSecret(key: string): boolean {
    if (this.data.encryptedVault && this.data.encryptedVault[key]) {
      delete this.data.encryptedVault[key]
      this.save()
      return true
    }
    return false
  }

  // --- Backup & Restore Accessors ---
  public getFullState(): LocalBrowserData {
    return JSON.parse(JSON.stringify(this.getPersistableState()))
  }

  public setFullState(newData: LocalBrowserData): void {
    this.data = JSON.parse(JSON.stringify(newData))
    this.save()
  }

  public getStateFilePath(): string {
    return this.filePath || getAppPaths().stateFilePath
  }
}

export const localStorageService = new LocalStorageService()
