import { app, dialog, type BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { localStorageService } from './localStorage'
import { privacyEngine } from '../privacy/privacyEngine'
import { getAppPaths } from './paths'
import type {
  Space,
  Tab,
  Settings,
  ExportBackupOptions,
  ExportBackupResult,
  BackupInspectionResult,
  ImportBackupOptions,
  ImportBackupResult
} from '../../src/types/api'

export interface BackupV1File {
  $schema?: string
  version: number
  exportedAt: string
  app?: {
    name: string
    version: string
    channel?: string
  }
  metadata?: {
    spacesCount?: number
    tabsCount?: number
    pinnedCount?: number
    categoriesIncluded?: string[]
  }
  data: {
    settings?: Partial<Settings>
    spaces?: Partial<Space>[]
    tabs?: (Partial<Tab> & { spaceName?: string })[]
    privacy?: Record<string, any>
  }
}

export class BackupService {
  /**
   * Exports user data to a formatted, schema-versioned JSON file.
   */
  public async exportBackup(
    options: ExportBackupOptions = {},
    win?: BrowserWindow | null
  ): Promise<ExportBackupResult> {
    try {
      const categories = options.categories || ['settings', 'spaces', 'tabs', 'privacy']
      const includeOpenTabs = options.includeOpenTabs !== false
      const includePinnedTabs = options.includePinnedTabs !== false

      const fullState = localStorageService.getFullState()
      const privacyPrefs = privacyEngine.getPrefs()
      const appPaths = getAppPaths()

      const exportData: BackupV1File['data'] = {}
      const categoriesIncluded: string[] = []

      // 1. Settings (Exclude machine-specific download paths if desired or keep clean)
      if (categories.includes('settings') && fullState.settings) {
        const s = fullState.settings
        exportData.settings = {
          defaultSearchEngine: s.defaultSearchEngine,
          theme: s.theme,
          sidebarCollapsed: s.sidebarCollapsed,
          accentColor: s.accentColor,
          accentPreset: s.accentPreset,
          webColorScheme: s.webColorScheme,
          smoothScrolling: s.smoothScrolling,
          startupBehavior: s.startupBehavior,
          startupCustomUrls: s.startupCustomUrls || [],
          askWhereToSave: s.askWhereToSave,
          openFolderOnDownload: s.openFolderOnDownload,
          defaultZoom: s.defaultZoom,
          autoArchiveDuration: s.autoArchiveDuration
        }
        categoriesIncluded.push('settings')
      }

      // 2. Spaces (Clean metadata, strip local IDs from export if desired, keep order and visual styling)
      const spaceMap = new Map<string, string>()
      if (categories.includes('spaces') && Array.isArray(fullState.spaces)) {
        exportData.spaces = fullState.spaces.map((space) => {
          spaceMap.set(space.id, space.name)
          return {
            id: space.id,
            name: space.name,
            color: space.color,
            icon: space.icon,
            order: space.order,
            isActive: space.isActive
          }
        })
        categoriesIncluded.push('spaces')
      } else if (Array.isArray(fullState.spaces)) {
        fullState.spaces.forEach((s) => spaceMap.set(s.id, s.name))
      }

      // 3. Tabs (Annotated with spaceName for portable cross-machine restoration)
      let exportedTabsCount = 0
      let exportedPinnedCount = 0

      if (categories.includes('tabs') && Array.isArray(fullState.tabs)) {
        const filteredTabs = fullState.tabs.filter((t) => {
          if (t.isPinned && includePinnedTabs) return true
          if (!t.isPinned && includeOpenTabs) return true
          return false
        })

        exportData.tabs = filteredTabs.map((tab) => {
          if (tab.isPinned) exportedPinnedCount++
          exportedTabsCount++

          return {
            url: tab.url,
            title: tab.title,
            favicon: tab.favicon,
            isPinned: Boolean(tab.isPinned),
            order: tab.order,
            spaceName: spaceMap.get(tab.spaceId) || 'Personal'
          }
        })
        categoriesIncluded.push('tabs')
      }

      // 4. Privacy Preferences & Whitelisted Origins (Excludes active session cookies/tokens)
      if (categories.includes('privacy') && privacyPrefs) {
        exportData.privacy = {
          adBlockerEnabled: privacyPrefs.adBlockerEnabled,
          trackerProtection: privacyPrefs.trackerProtection,
          fingerprintResistance: privacyPrefs.fingerprintResistance,
          httpsOnlyMode: privacyPrefs.httpsOnlyMode,
          dnsOverHttps: privacyPrefs.dnsOverHttps,
          dohProvider: privacyPrefs.dohProvider,
          webrtcProtection: privacyPrefs.webrtcProtection,
          globalPrivacyControl: privacyPrefs.globalPrivacyControl,
          stripTrackingParams: privacyPrefs.stripTrackingParams,
          blockThirdPartyCookies: privacyPrefs.blockThirdPartyCookies,
          clearCacheOnExit: privacyPrefs.clearCacheOnExit,
          whitelistedOrigins: privacyPrefs.whitelistedOrigins || []
        }
        categoriesIncluded.push('privacy')
      }

      // Construct file payload
      const backupFile: BackupV1File = {
        $schema: 'https://tctorbit.com/schemas/backup-v1.json',
        version: 1,
        exportedAt: new Date().toISOString(),
        app: {
          name: app.getName(),
          version: app.getVersion(),
          channel: appPaths.channelMeta.channel
        },
        metadata: {
          spacesCount: exportData.spaces?.length || 0,
          tabsCount: exportedTabsCount,
          pinnedCount: exportedPinnedCount,
          categoriesIncluded
        },
        data: exportData
      }

      // Format current date for file name: YYYY-MM-DD
      const dateStr = new Date().toISOString().slice(0, 10)
      const defaultFilename = `tct-orbit-backup-${dateStr}.json`

      const saveResult = await dialog.showSaveDialog(win || undefined as any, {
        title: 'Export TCT Orbit User Data',
        defaultPath: path.join(app.getPath('downloads'), defaultFilename),
        filters: [{ name: 'JSON Backup (*.json)', extensions: ['json'] }]
      })

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, canceled: true }
      }

      const filePath = saveResult.filePath
      fs.writeFileSync(filePath, JSON.stringify(backupFile, null, 2), 'utf-8')

      return {
        success: true,
        filePath,
        itemCounts: {
          spaces: exportData.spaces?.length || 0,
          tabs: exportedTabsCount,
          pinnedTabs: exportedPinnedCount,
          hasSettings: Boolean(exportData.settings),
          hasPrivacy: Boolean(exportData.privacy)
        }
      }
    } catch (err: any) {
      console.error('[BackupService] Export failed:', err)
      return {
        success: false,
        error: err?.message || 'Failed to export backup file'
      }
    }
  }

  /**
   * Safe read-only inspection of a JSON string or file content before importing.
   */
  public inspectBackup(rawContent: string): BackupInspectionResult {
    try {
      if (!rawContent || typeof rawContent !== 'string') {
        return this.createInvalidResult('Backup file content is empty or unreadable.')
      }

      let parsed: any
      try {
        parsed = JSON.parse(rawContent)
      } catch (e: any) {
        return this.createInvalidResult(`Invalid JSON format: ${e?.message || 'Syntax error'}`)
      }

      if (!parsed || typeof parsed !== 'object') {
        return this.createInvalidResult('File does not contain a valid JSON object.')
      }

      // Check schema version (Support v1)
      const version = typeof parsed.version === 'number' ? parsed.version : 1
      if (version > 1) {
        return this.createInvalidResult(
          `Unsupported backup version (v${version}). Please update TCT Orbit to import this file.`
        )
      }

      const data = parsed.data
      if (!data || typeof data !== 'object') {
        return this.createInvalidResult('Backup file is missing required "data" payload.')
      }

      const spaces = Array.isArray(data.spaces) ? data.spaces : []
      const tabs = Array.isArray(data.tabs) ? data.tabs : []
      const pinnedCount = tabs.filter((t: any) => Boolean(t.isPinned)).length
      const hasSettings = Boolean(data.settings && typeof data.settings === 'object')
      const hasPrivacy = Boolean(data.privacy && typeof data.privacy === 'object')

      const categories: string[] = []
      if (hasSettings) categories.push('Settings')
      if (spaces.length > 0) categories.push('Spaces')
      if (tabs.length > 0) categories.push('Tabs & Bookmarks')
      if (hasPrivacy) categories.push('Privacy Shield')

      return {
        valid: true,
        version,
        exportedAt: parsed.exportedAt || new Date().toISOString(),
        appName: parsed.app?.name || 'TCT Orbit',
        appVersion: parsed.app?.version || '0.1.1',
        spacesCount: spaces.length,
        tabsCount: tabs.length,
        pinnedCount,
        hasSettings,
        hasPrivacy,
        categories,
        rawContent
      }
    } catch (err: any) {
      return this.createInvalidResult(err?.message || 'Unknown inspection error')
    }
  }

  /**
   * Prompts the user to select a backup file from disk and inspects it.
   */
  public async selectAndInspectFile(win?: BrowserWindow | null): Promise<BackupInspectionResult | null> {
    const res = await dialog.showOpenDialog(win || undefined as any, {
      title: 'Select TCT Orbit Backup File',
      defaultPath: app.getPath('downloads'),
      filters: [{ name: 'JSON Backup (*.json)', extensions: ['json'] }],
      properties: ['openFile']
    })

    if (res.canceled || !res.filePaths[0]) {
      return null
    }

    const content = fs.readFileSync(res.filePaths[0], 'utf-8')
    return this.inspectBackup(content)
  }

  /**
   * Safely imports backup data with pre-import snapshot rollback.
   */
  public async importBackup(
    options: ImportBackupOptions,
    win?: BrowserWindow | null
  ): Promise<ImportBackupResult> {
    const { rawContent, mode } = options
    const inspection = this.inspectBackup(rawContent)

    if (!inspection.valid) {
      return {
        success: false,
        mode,
        error: inspection.error || 'Invalid backup file structure',
        importedCounts: { spaces: 0, tabs: 0, settingsUpdated: false, privacyUpdated: false }
      }
    }

    const backupFile: BackupV1File = JSON.parse(rawContent)
    const data = backupFile.data

    // 1. Snapshot current state for rollback safety
    const previousFullState = localStorageService.getFullState()
    const previousPrivacyPrefs = privacyEngine.getPrefs()
    const stateFilePath = localStorageService.getStateFilePath()
    const rollbackSnapshotPath = `${stateFilePath}.pre-import-bak`

    try {
      // Write on-disk snapshot
      fs.writeFileSync(rollbackSnapshotPath, JSON.stringify(previousFullState, null, 2), 'utf-8')

      let importedSpacesCount = 0
      let importedTabsCount = 0
      let settingsUpdated = false
      let privacyUpdated = false

      if (mode === 'replace') {
        // --- REPLACE MODE ---
        const newSpaces: Space[] = []
        const newTabs: Tab[] = []
        const spaceNameToIdMap = new Map<string, string>()

        // Replace Spaces
        if (Array.isArray(data.spaces) && data.spaces.length > 0) {
          data.spaces.forEach((s, idx) => {
            const spaceId = s.id || `space-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`
            const spaceName = s.name || `Space ${idx + 1}`
            spaceNameToIdMap.set(spaceName.toLowerCase(), spaceId)

            newSpaces.push({
              id: spaceId,
              userId: previousFullState.user?.id || 'local-user',
              name: spaceName,
              color: s.color || '#6366f1',
              icon: s.icon || 'Layers',
              order: typeof s.order === 'number' ? s.order : idx,
              isActive: idx === 0,
              createdAt: s.createdAt ? String(s.createdAt) : new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              tabs: []
            })
            importedSpacesCount++
          })
        } else {
          // Keep current default personal space if no spaces in backup
          newSpaces.push(...previousFullState.spaces)
        }

        // Ensure at least one space is active
        if (!newSpaces.some((s) => s.isActive) && newSpaces[0]) {
          newSpaces[0].isActive = true
        }

        const fallbackSpaceId = newSpaces[0].id

        // Replace Tabs
        if (Array.isArray(data.tabs) && data.tabs.length > 0) {
          data.tabs.forEach((t, idx) => {
            if (!t.url) return
            const targetSpaceId =
              (t.spaceName && spaceNameToIdMap.get(t.spaceName.toLowerCase())) || fallbackSpaceId

            newTabs.push({
              id: `tab-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
              spaceId: targetSpaceId,
              url: t.url,
              title: t.title || 'Tab',
              favicon: t.favicon || null,
              isPinned: Boolean(t.isPinned),
              order: typeof t.order === 'number' ? t.order : idx,
              lastVisited: new Date().toISOString(),
              createdAt: new Date().toISOString()
            })
            importedTabsCount++
          })
        }

        // Replace Settings if present
        let newSettings = { ...previousFullState.settings }
        if (data.settings && typeof data.settings === 'object') {
          newSettings = {
            ...newSettings,
            ...data.settings,
            updatedAt: new Date().toISOString()
          }
          settingsUpdated = true
        }

        // Atomic commit to state.json
        localStorageService.setFullState({
          user: previousFullState.user,
          settings: newSettings,
          spaces: newSpaces,
          tabs: newTabs,
          encryptedVault: previousFullState.encryptedVault
        })

        // Replace Privacy Prefs if present
        if (data.privacy && typeof data.privacy === 'object') {
          privacyEngine.updatePrefs(data.privacy)
          privacyUpdated = true
        }
      } else {
        // --- MERGE MODE (Non-destructive) ---
        const mergedState = localStorageService.getFullState()
        const existingSpaces = [...mergedState.spaces]
        const existingTabs = [...mergedState.tabs]
        const spaceNameToIdMap = new Map<string, string>()

        existingSpaces.forEach((s) => {
          spaceNameToIdMap.set(s.name.toLowerCase(), s.id)
        })

        // Merge Spaces: Only add spaces whose names do not exist
        if (Array.isArray(data.spaces)) {
          data.spaces.forEach((s) => {
            if (!s.name) return
            const key = s.name.toLowerCase()
            if (!spaceNameToIdMap.has(key)) {
              const newId = `space-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
              spaceNameToIdMap.set(key, newId)

              existingSpaces.push({
                id: newId,
                userId: mergedState.user?.id || 'local-user',
                name: s.name,
                color: s.color || '#6366f1',
                icon: s.icon || 'Layers',
                order: existingSpaces.length,
                isActive: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                tabs: []
              })
              importedSpacesCount++
            }
          })
        }

        const fallbackSpaceId = existingSpaces[0]?.id || 'default-personal-space'

        // Merge Tabs: Skip exact duplicate URLs in the same space, or promote to pinned
        if (Array.isArray(data.tabs)) {
          data.tabs.forEach((t) => {
            if (!t.url) return
            const targetSpaceId =
              (t.spaceName && spaceNameToIdMap.get(t.spaceName.toLowerCase())) || fallbackSpaceId

            const existingTab = existingTabs.find(
              (et) => et.spaceId === targetSpaceId && et.url === t.url
            )

            if (existingTab) {
              // If imported tab is pinned but existing isn't, upgrade to pinned
              if (t.isPinned && !existingTab.isPinned) {
                existingTab.isPinned = true
              }
            } else {
              // Insert new tab
              existingTabs.push({
                id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                spaceId: targetSpaceId,
                url: t.url,
                title: t.title || 'Tab',
                favicon: t.favicon || null,
                isPinned: Boolean(t.isPinned),
                order: existingTabs.filter((et) => et.spaceId === targetSpaceId).length,
                lastVisited: new Date().toISOString(),
                createdAt: new Date().toISOString()
              })
              importedTabsCount++
            }
          })
        }

        // Merge Settings (only overwrite if explicit)
        let mergedSettings = { ...mergedState.settings }
        if (data.settings && typeof data.settings === 'object') {
          mergedSettings = {
            ...mergedSettings,
            ...data.settings,
            updatedAt: new Date().toISOString()
          }
          settingsUpdated = true
        }

        // Commit merged state
        localStorageService.setFullState({
          ...mergedState,
          spaces: existingSpaces,
          tabs: existingTabs,
          settings: mergedSettings
        })

        // Merge Privacy: Union whitelistedOrigins without duplicates
        if (data.privacy && typeof data.privacy === 'object') {
          const currentPrefs = privacyEngine.getPrefs()
          const combinedOrigins = Array.from(
            new Set([
              ...(currentPrefs.whitelistedOrigins || []),
              ...(data.privacy.whitelistedOrigins || [])
            ])
          )

          privacyEngine.updatePrefs({
            ...data.privacy,
            whitelistedOrigins: combinedOrigins
          })
          privacyUpdated = true
        }
      }

      // Cleanup rollback snapshot on complete success
      if (fs.existsSync(rollbackSnapshotPath)) {
        try {
          fs.unlinkSync(rollbackSnapshotPath)
        } catch {}
      }

      return {
        success: true,
        mode,
        importedCounts: {
          spaces: importedSpacesCount,
          tabs: importedTabsCount,
          settingsUpdated,
          privacyUpdated
        }
      }
    } catch (err: any) {
      console.error('[BackupService] Import failed, performing safe rollback:', err)

      // Rollback to snapshot immediately
      try {
        localStorageService.setFullState(previousFullState)
        privacyEngine.updatePrefs(previousPrivacyPrefs)
      } catch (rollbackErr) {
        console.error('[BackupService] Critical: Rollback failed:', rollbackErr)
      }

      return {
        success: false,
        mode,
        error: `Import failed: ${err?.message || 'State was safely rolled back.'}`,
        importedCounts: { spaces: 0, tabs: 0, settingsUpdated: false, privacyUpdated: false }
      }
    }
  }

  private createInvalidResult(errorMsg: string): BackupInspectionResult {
    return {
      valid: false,
      version: 0,
      exportedAt: '',
      spacesCount: 0,
      tabsCount: 0,
      pinnedCount: 0,
      hasSettings: false,
      hasPrivacy: false,
      categories: [],
      rawContent: '',
      error: errorMsg
    }
  }
}

export const backupService = new BackupService()
