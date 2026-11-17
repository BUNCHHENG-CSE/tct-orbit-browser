import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { getAppPaths } from './paths'
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

  private save(): void {
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
      fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), 'utf-8')
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
      updatedAt: new Date().toISOString()
    }
    this.save()
    return { ...this.data.settings }
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
}

export const localStorageService = new LocalStorageService()
