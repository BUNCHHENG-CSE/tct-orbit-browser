import { contextBridge, ipcRenderer } from 'electron'
import type {
  ElectronAPI,
  CreateTabData,
  UpdateTabData,
  CreateSpaceData,
  UpdateSpaceData,
  UpdateSettingsData,
  SetThemeData,
  ThemeState,
  AppInfo,
  PrivacyShieldPrefs,
  PrivacyStats,
  MasterShieldStatus,
  ExportBackupOptions,
  ImportBackupOptions,
  RecordVisitData,
  HistoryFilterOptions,
  HistoryClearRange
} from '../src/types/api'

/** Subscribe to a main-process event; returns an unsubscribe function (event object never exposed) */
function listen<T>(channel: string, callback: (data: T) => void): () => void {
  const handler = (_: unknown, data: T) => callback(data)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

// Initialize app info synchronously on startup
let initialAppInfo: AppInfo = {
  name: 'TCT Orbit',
  version: '0.1.2',
  channel: 'stable'
}

try {
  const syncInfo = ipcRenderer.sendSync('app:getInfoSync')
  if (syncInfo && typeof syncInfo === 'object' && syncInfo.name) {
    initialAppInfo = syncInfo
  }
} catch {
  // Graceful fallback
}

/**
 * Hardened, strictly-typed Electron API bridge.
 * Security rules:
 * 1. Raw `ipcRenderer` is NEVER exposed to the window / renderer object.
 * 2. IPC events (`event.sender`, `event.ports`) are discarded and never passed to callbacks.
 * 3. Channel names are fixed string literals, preventing arbitrary channel messaging.
 * 4. Only whitelisted, single-purpose methods are accessible.
 */
const hardenedApi: ElectronAPI = {
  app: {
    getInfo: () => ipcRenderer.invoke('app:getInfo'),
    getInfoSync: () => initialAppInfo,
    getVersion: () => initialAppInfo.version,
    getName: () => initialAppInfo.name,
    getChannel: () => initialAppInfo.channel
  },
  appInfo: initialAppInfo,

  tabs: {
    list: (spaceId: string) => ipcRenderer.invoke('tabs:list', spaceId),
    create: (data: CreateTabData) => ipcRenderer.invoke('tabs:create', data),
    update: (id: string, data: UpdateTabData) => ipcRenderer.invoke('tabs:update', id, data),
    remove: (id: string) => ipcRenderer.invoke('tabs:remove', id),
    reorder: (spaceId: string, orderedIds: string[]) => ipcRenderer.invoke('tabs:reorder', spaceId, orderedIds)
  },

  spaces: {
    list: () => ipcRenderer.invoke('spaces:list'),
    create: (data: CreateSpaceData) => ipcRenderer.invoke('spaces:create', data),
    update: (id: string, data: UpdateSpaceData) => ipcRenderer.invoke('spaces:update', id, data),
    remove: (id: string) => ipcRenderer.invoke('spaces:remove', id),
    setActive: (id: string) => ipcRenderer.invoke('spaces:setActive', id)
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (data: UpdateSettingsData) => ipcRenderer.invoke('settings:update', data)
  },

  theme: {
    get: () => ipcRenderer.invoke('theme:get'),
    set: (data: SetThemeData) => ipcRenderer.invoke('theme:set', data),
    onChanged: (callback: (state: ThemeState) => void) => {
      const handler = (_: unknown, state: ThemeState) => callback(state)
      ipcRenderer.on('theme:changed', handler)
      return () => {
        ipcRenderer.removeListener('theme:changed', handler)
      }
    }
  },

  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    setTitle: (title: string) => ipcRenderer.invoke('window:setTitle', title),
    toggleFullScreen: () => ipcRenderer.invoke('window:toggleFullScreen'),
    isFullScreen: () => ipcRenderer.invoke('window:isFullScreen'),
    setFullScreen: (flag: boolean) => ipcRenderer.invoke('window:setFullScreen', flag)
  },

  navigation: {
    openExternal: (url: string) => ipcRenderer.invoke('navigation:openExternal', url)
  },

  devtools: {
    open: (webContentsId?: number, bounds?: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke('devtools:open', { webContentsId, bounds }),
    inspect: (webContentsId: number, x: number, y: number, bounds?: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke('devtools:inspect', { webContentsId, x, y, bounds }),
    updateBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke('devtools:update-bounds', bounds),
    detach: () => ipcRenderer.invoke('devtools:detach'),
    close: () => ipcRenderer.invoke('devtools:close'),
    getState: () => ipcRenderer.invoke('devtools:getState'),
    syncActiveTab: (webContentsId: number) =>
      ipcRenderer.invoke('devtools:sync-active-tab', { webContentsId }),
    onStateChanged: (callback: (state: any) => void) => {
      const handler = (_: unknown, state: any) => callback(state)
      ipcRenderer.on('devtools:state-changed', handler)
      return () => {
        ipcRenderer.removeListener('devtools:state-changed', handler)
      }
    }
  },

  webview: {
    call: (webContentsId: number, method: string, ...args: any[]) =>
      ipcRenderer.invoke('webview:call', { webContentsId, method, args }),
    saveAs: (webContentsId: number) => ipcRenderer.invoke('page:save-as', { webContentsId }),
    saveAsPdf: (webContentsId: number) => ipcRenderer.invoke('page:save-pdf', { webContentsId }),
    print: (webContentsId: number) =>
      ipcRenderer.invoke('webview:call', { webContentsId, method: 'print', args: [{ silent: false, printBackground: true }] }),
    captureScreenshot: (webContentsId: number) =>
      ipcRenderer.invoke('page:capture-screenshot', { webContentsId })
  },

  contextMenu: {
    onOpen: (callback: (data: any) => void) => {
      const handler = (_: unknown, data: any) => callback(data)
      ipcRenderer.on('context-menu:open', handler)
      return () => {
        ipcRenderer.removeListener('context-menu:open', handler)
      }
    },
    onClose: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('context-menu:close', handler)
      return () => {
        ipcRenderer.removeListener('context-menu:close', handler)
      }
    }
  },

  omnibox: {
    onClose: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('omnibox:close', handler)
      return () => {
        ipcRenderer.removeListener('omnibox:close', handler)
      }
    }
  },

  shortcuts: {
    onTrigger: (callback: (action: string) => void) => {
      const handler = (_: unknown, action: string) => callback(action)
      ipcRenderer.on('keyboard-shortcut:trigger', handler)
      return () => {
        ipcRenderer.removeListener('keyboard-shortcut:trigger', handler)
      }
    }
  },

  privacy: {
    getState: () => ipcRenderer.invoke('privacy:get-state'),
    updatePrefs: (updates: Partial<PrivacyShieldPrefs>) => ipcRenderer.invoke('privacy:update-prefs', updates),
    getSiteStatus: (url: string) => ipcRenderer.invoke('privacy:get-site-status', url),
    toggleSiteShield: (origin: string) => ipcRenderer.invoke('privacy:toggle-site-shield', origin),
    getStats: () => ipcRenderer.invoke('privacy:get-stats'),
    clearBrowsingData: () => ipcRenderer.invoke('privacy:clear-browsing-data'),
    testProxy: () => ipcRenderer.invoke('privacy:test-proxy'),
    getReport: (days?: number) => ipcRenderer.invoke('privacy:get-report', days),
    resetReport: () => ipcRenderer.invoke('privacy:reset-report'),
    onHttpsFallback: (callback: (info: { host: string; url: string; webContentsId?: number }) => void) =>
      listen('privacy:https-fallback', callback),
    onStateChanged: (callback: (state: { prefs: PrivacyShieldPrefs; masterStatus: MasterShieldStatus; stats: PrivacyStats }) => void) => {
      const handler = (_: unknown, state: { prefs: PrivacyShieldPrefs; masterStatus: MasterShieldStatus; stats: PrivacyStats }) => callback(state)
      ipcRenderer.on('privacy:state-changed', handler)
      return () => {
        ipcRenderer.removeListener('privacy:state-changed', handler)
      }
    }
  },

  downloads: {
    selectDirectory: () => ipcRenderer.invoke('downloads:select-directory'),
    getDefaultPath: () => ipcRenderer.invoke('downloads:get-default-path'),
    openFolder: (dirPath?: string) => ipcRenderer.invoke('downloads:open-folder', dirPath),
    showInFolder: (filePath: string) => ipcRenderer.invoke('downloads:show-in-folder', filePath),
    openFile: (filePath: string) => ipcRenderer.invoke('downloads:open-file', filePath),
    deleteFile: (id: string, filePath?: string) => ipcRenderer.invoke('downloads:delete-file', { id, deleteDiskFile: Boolean(filePath) }),
    list: () => ipcRenderer.invoke('downloads:list'),
    clear: () => ipcRenderer.invoke('downloads:clear'),
    pause: (id: string) => ipcRenderer.invoke('downloads:pause', id),
    resume: (id: string) => ipcRenderer.invoke('downloads:resume', id),
    cancel: (id: string) => ipcRenderer.invoke('downloads:cancel', id),
    onStarted: (callback: (data: any) => void) => {
      const handler = (_: unknown, data: any) => callback(data)
      ipcRenderer.on('downloads:started', handler)
      return () => {
        ipcRenderer.removeListener('downloads:started', handler)
      }
    },
    onProgress: (callback: (data: any) => void) => {
      const handler = (_: unknown, data: any) => callback(data)
      ipcRenderer.on('downloads:progress', handler)
      return () => {
        ipcRenderer.removeListener('downloads:progress', handler)
      }
    },
    onCompleted: (callback: (data: any) => void) => {
      const handler = (_: unknown, data: any) => callback(data)
      ipcRenderer.on('downloads:completed', handler)
      return () => {
        ipcRenderer.removeListener('downloads:completed', handler)
      }
    },
    onFailed: (callback: (data: any) => void) => {
      const handler = (_: unknown, data: any) => callback(data)
      ipcRenderer.on('downloads:failed', handler)
      return () => {
        ipcRenderer.removeListener('downloads:failed', handler)
      }
    }
  },

  backup: {
    exportData: (options: ExportBackupOptions) => ipcRenderer.invoke('backup:export', options),
    selectAndInspectFile: () => ipcRenderer.invoke('backup:select-file'),
    inspectJsonString: (content: string) => ipcRenderer.invoke('backup:inspect-json', content),
    importData: (options: ImportBackupOptions) => ipcRenderer.invoke('backup:import', options)
  },

  history: {
    recordVisit: (data: RecordVisitData) => ipcRenderer.invoke('history:record', data),
    getHistory: (options?: HistoryFilterOptions) => ipcRenderer.invoke('history:get', options),
    searchHistory: (query: string, limit?: number) => ipcRenderer.invoke('history:search', { query, limit }),
    deleteItem: (id: string) => ipcRenderer.invoke('history:delete', id),
    deleteByUrl: (url: string) => ipcRenderer.invoke('history:deleteByUrl', url),
    clearHistory: (range?: HistoryClearRange) => ipcRenderer.invoke('history:clear', range)
  },

  notes: {
    get: (spaceId: string) => ipcRenderer.invoke('notes:get', spaceId),
    save: (spaceId: string, content: string) => ipcRenderer.invoke('notes:save', { spaceId, content })
  },

  bookmarks: {
    list: () => ipcRenderer.invoke('bookmarks:list'),
    add: (data: any) => ipcRenderer.invoke('bookmarks:add', data),
    delete: (id: string) => ipcRenderer.invoke('bookmarks:delete', id),
    deleteByUrl: (url: string) => ipcRenderer.invoke('bookmarks:delete-by-url', url),
    toggleRead: (id: string) => ipcRenderer.invoke('bookmarks:toggle-read', id),
    isBookmarked: (url: string) => ipcRenderer.invoke('bookmarks:is-bookmarked', url)
  },

  site: {
    getInfo: (url: string) => ipcRenderer.invoke('site:get-info', url),
    clearData: (origin: string) => ipcRenderer.invoke('site:clear-data', origin)
  },

  system: {
    getProcessMetrics: () => ipcRenderer.invoke('system:get-process-metrics'),
    killProcess: (data: { pid?: number; webContentsId?: number }) => ipcRenderer.invoke('system:kill-process', data),
    trimMemory: () => ipcRenderer.invoke('system:trim-memory')
  },

  permissions: {
    respond: (id: string, allow: boolean, remember: boolean) => ipcRenderer.invoke('permissions:respond', { id, allow, remember }),
    onRequest: (callback: (req: any) => void) => listen('permissions:request', callback),
    onDismiss: (callback: (id: string) => void) => listen('permissions:dismiss', callback)
  },

  siteSettings: {
    list: () => ipcRenderer.invoke('site-settings:list'),
    setPermission: (origin: string, permission: string, decision: 'allow' | 'block' | null) =>
      ipcRenderer.invoke('site-settings:set-permission', { origin, permission, decision }),
    resetPermissions: (origin: string) => ipcRenderer.invoke('site-settings:reset-permissions', origin)
  },

  session: {
    getRestoreInfo: () => ipcRenderer.invoke('session:get-restore-info'),
    restore: () => ipcRenderer.invoke('session:restore'),
    dismiss: () => ipcRenderer.invoke('session:dismiss')
  },

  focus: {
    setBlock: (domains: string[] | null) => ipcRenderer.invoke('focus:set-block', domains),
    onBlocked: (callback: (info: { url: string; host: string; webContentsId?: number }) => void) => listen('focus:blocked', callback)
  },

  sync: {
    getConfig: () => ipcRenderer.invoke('sync:get-config'),
    configure: (opts: { enabled?: boolean; filePath?: string; passphrase?: string }) => ipcRenderer.invoke('sync:configure', opts),
    chooseFile: () => ipcRenderer.invoke('sync:choose-file'),
    syncNow: () => ipcRenderer.invoke('sync:now'),
    readFile: () => ipcRenderer.invoke('sync:read-file'),
    exportEncrypted: (passphrase: string) => ipcRenderer.invoke('sync:export-encrypted', passphrase),
    decrypt: (content: string, passphrase: string) => ipcRenderer.invoke('sync:decrypt', { content, passphrase })
  },

  thumbnails: {
    capture: (webContentsId: number) => ipcRenderer.invoke('webview:thumbnail', webContentsId)
  },

  browserImport: {
    detect: () => ipcRenderer.invoke('import:detect'),
    run: (sourceId: string, bookmarks: boolean, history: boolean) => ipcRenderer.invoke('import:run', { sourceId, bookmarks, history }),
    bookmarksHtml: () => ipcRenderer.invoke('import:bookmarks-html')
  },

  onOpenUrl: (callback: (payload: { url: string; active: boolean; sourceWebContentsId?: number; isPrivate?: boolean }) => void) => {
    const handler = (_: unknown, payload: { url: string; active: boolean; sourceWebContentsId?: number; isPrivate?: boolean } | string) => {
      if (typeof payload === 'string') {
        callback({ url: payload, active: true })
      } else {
        callback(payload)
      }
    }
    ipcRenderer.on('tabs:open-url', handler)
    return () => {
      ipcRenderer.removeListener('tabs:open-url', handler)
    }
  },

  onExternalUrl: (callback: (url: string) => void) => {
    const handler = (_: unknown, url: string) => callback(url)
    ipcRenderer.on('tab:create-from-external', handler)
    return () => {
      ipcRenderer.removeListener('tab:create-from-external', handler)
    }
  }
}

// Expose strictly the frozen hardenedApi into the main world
try {
  contextBridge.exposeInMainWorld('api', Object.freeze(hardenedApi))
} catch (error) {
  console.error('[Preload] Failed to expose window.api via contextBridge:', error)
}
