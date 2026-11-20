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
  UpdateSettingsData
} from '../../src/types/api'

interface LocalBrowserData {
  user: {
    id: string
    createdAt: string
  }
  settings: Settings
  spaces: Space[]
  tabs: Tab[]
  encryptedVault?: Record<string, string>
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
      id: 'default-ddg-tab',
      spaceId: 'default-personal-space',
      url: 'https://duckduckgo.com',
      title: 'DuckDuckGo — Privacy, simplified.',
      favicon: 'https://duckduckgo.com/favicon.ico',
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

  public init(): void {
    try {
      const paths = getAppPaths()
      this.filePath = paths.stateFilePath

      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

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
      fs.writeFileSync(tmpPath, JSON.stringify(this.data), 'utf-8')
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
    const engine = this.data.settings?.defaultSearchEngine || 'duckduckgo'
    const defaultUrl = engine === 'google' ? 'https://www.google.com' : engine === 'bing' ? 'https://www.bing.com' : 'https://duckduckgo.com'
    const defaultTitle = engine === 'google' ? 'Google' : engine === 'bing' ? 'Bing' : 'DuckDuckGo'
    const defaultFavicon = `${defaultUrl}/favicon.ico`

    const activeSpace = this.data.spaces.find((s) => s.isActive) || this.data.spaces[0]
    const spaceId = activeSpace ? activeSpace.id : 'default-personal-space'

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
      tabs: []
    }

    // Automatically create initial default tab based on the active default search engine
    const engine = this.data.settings?.defaultSearchEngine || 'duckduckgo'
    let homeUrl = data.initialUrl || 'https://duckduckgo.com'
    let homeTitle = data.initialTitle || 'DuckDuckGo'
    let favicon: string | null = 'https://duckduckgo.com/favicon.ico'

    if (!data.initialUrl) {
      if (engine === 'google') {
        homeUrl = 'https://www.google.com'
        homeTitle = 'Google'
        favicon = 'https://www.google.com/favicon.ico'
      } else if (engine === 'bing') {
        homeUrl = 'https://www.bing.com'
        homeTitle = 'Bing'
        favicon = 'https://www.bing.com/favicon.ico'
      }
    }

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
    this.save()
    return true
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
      createdAt: new Date().toISOString()
    }
    this.data.tabs.push(newTab)
    this.save()
    return newTab
  }

  public updateTab(id: string, updates: UpdateTabData): Tab {
    const idx = this.data.tabs.findIndex((t) => t.id === id)
    if (idx === -1) throw new Error(`Tab not found: ${id}`)

    this.data.tabs[idx] = {
      ...this.data.tabs[idx],
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
    return JSON.parse(JSON.stringify(this.data))
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
