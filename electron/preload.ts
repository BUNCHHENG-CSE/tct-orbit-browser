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
  HistoryClearRange,
  CreateTabGroupData,
  UpdateTabGroupData,
  SaveSplitData
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
    getChannel: () => initialAppInfo.channel,
    about: () => ipcRenderer.invoke('app:about'),
    takePendingUrls: () => ipcRenderer.invoke('app:take-pending-urls')
  },

  passwords: {
    list: () => ipcRenderer.invoke('passwords:list'),
    reveal: (id: string) => ipcRenderer.invoke('passwords:reveal', id),
    update: (id: string, data: { username?: string; password?: string }) => ipcRenderer.invoke('passwords:update', id, data),
    remove: (id: string) => ipcRenderer.invoke('passwords:remove', id),
    respond: (token: string, action: 'save' | 'never' | 'dismiss', username?: string) =>
      username === undefined
        ? ipcRenderer.invoke('passwords:respond', token, action)
        : ipcRenderer.invoke('passwords:respond', token, action, username),
    getSettings: () => ipcRenderer.invoke('passwords:settings'),
    setOfferToSave: (enabled: boolean) => ipcRenderer.invoke('passwords:set-offer', enabled),
    removeNeverSave: (origin: string) => ipcRenderer.invoke('passwords:remove-never', origin),
    onOffer: (callback: (offer: any) => void) => listen('passwords:offer', callback)
  },

  search: {
    suggest: (query: string, engine: string) => ipcRenderer.invoke('search:suggest', query, engine)
  },

  defaultBrowser: {
    status: () => ipcRenderer.invoke('default-browser:status'),
    set: () => ipcRenderer.invoke('default-browser:set')
  },

  extensions: {
    list: () => ipcRenderer.invoke('extensions:list'),
    addUnpacked: () => ipcRenderer.invoke('extensions:add-unpacked'),
    setEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke('extensions:set-enabled', id, enabled),
    setAllowInPrivate: (id: string, allow: boolean) => ipcRenderer.invoke('extensions:set-private', id, allow),
    remove: (id: string) => ipcRenderer.invoke('extensions:remove', id),
    prepareFromStore: (input: string) => ipcRenderer.invoke('extensions:prepare-store', input),
    prepareFromFile: () => ipcRenderer.invoke('extensions:prepare-file'),
    commitInstall: (token: string) => ipcRenderer.invoke('extensions:commit', token),
    cancelInstall: (token: string) => ipcRenderer.invoke('extensions:cancel', token),
    openFolder: () => ipcRenderer.invoke('extensions:open-folder'),
    click: (id: string, tabWebContentsId: number) => ipcRenderer.invoke('extensions:click', id, tabWebContentsId),
    restoreBuiltins: () => ipcRenderer.invoke('extensions:restore-builtins'),
    removedBuiltinCount: () => ipcRenderer.invoke('extensions:removed-builtins')
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

  groups: {
    list: (spaceId: string) => ipcRenderer.invoke('groups:list', spaceId),
    create: (data: CreateTabGroupData) => ipcRenderer.invoke('groups:create', data),
    update: (id: string, data: UpdateTabGroupData) => ipcRenderer.invoke('groups:update', id, data),
    remove: (id: string, closeTabs?: boolean) => ipcRenderer.invoke('groups:remove', id, !!closeTabs)
  },

  splits: {
    list: () => ipcRenderer.invoke('splits:list'),
    save: (data: SaveSplitData) => ipcRenderer.invoke('splits:save', data),
    remove: (id: string) => ipcRenderer.invoke('splits:remove', id)
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (data: UpdateSettingsData) => ipcRenderer.invoke('settings:update', data),
    onChanged: (callback) => listen('settings:changed', callback)
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
    openPrivate: (url?: string) => ipcRenderer.invoke('window:open-private', url),
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
    setOverlayRects: (rects: { x: number; y: number; width: number; height: number }[]) =>
      ipcRenderer.invoke('devtools:overlay-rects', rects),
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
    isBookmarked: (url: string) => ipcRenderer.invoke('bookmarks:is-bookmarked', url),
    update: (id: string, data: { title?: string; url?: string; folder?: string }) => ipcRenderer.invoke('bookmarks:update', id, data),
    reorder: (ids: string[]) => ipcRenderer.invoke('bookmarks:reorder', ids),
    renameFolder: (from: string, to: string) => ipcRenderer.invoke('bookmarks:rename-folder', from, to),
    folders: () => ipcRenderer.invoke('bookmarks:folders'),
    createFolder: (folder: string) => ipcRenderer.invoke('bookmarks:create-folder', folder),
    deleteFolder: (folder: string) => ipcRenderer.invoke('bookmarks:delete-folder', folder),
    onChanged: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('bookmarks:changed', handler)
      return () => {
        ipcRenderer.removeListener('bookmarks:changed', handler)
      }
    }
  },

  site: {
    getInfo: (url: string, spaceId?: string) =>
      spaceId ? ipcRenderer.invoke('site:get-info', url, spaceId) : ipcRenderer.invoke('site:get-info', url),
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

  smart: {
    snoozeAdd: (data) => ipcRenderer.invoke('smart:snooze-add', data),
    snoozeList: () => ipcRenderer.invoke('smart:snooze-list'),
    snoozeRemove: (id: string) => ipcRenderer.invoke('smart:snooze-remove', id),
    snoozeTakeDue: (spaceId?: string) => ipcRenderer.invoke('smart:snooze-take-due', spaceId),
    onSnoozeDue: (callback) => listen('smart:snooze-due', callback),
    pageIndex: (data) => ipcRenderer.invoke('smart:page-index', data),
    pageSearch: (query: string, limit?: number) =>
      limit === undefined ? ipcRenderer.invoke('smart:page-search', query) : ipcRenderer.invoke('smart:page-search', query, limit),
    pageIndexStatus: () => ipcRenderer.invoke('smart:page-index-status'),
    pageIndexSetEnabled: (enabled: boolean) => ipcRenderer.invoke('smart:page-index-enabled', enabled),
    pageIndexClear: () => ipcRenderer.invoke('smart:page-index-clear'),
    watchList: () => ipcRenderer.invoke('smart:watch-list'),
    watchAdd: (data) => ipcRenderer.invoke('smart:watch-add', data),
    watchUpdate: (id: string, data) => ipcRenderer.invoke('smart:watch-update', id, data),
    watchRemove: (id: string) => ipcRenderer.invoke('smart:watch-remove', id),
    watchCheckNow: (id: string) => ipcRenderer.invoke('smart:watch-check', id),
    onWatchUpdated: (callback) => {
      const handler = (_: unknown, watch: any, changed: boolean) => callback(watch, !!changed)
      ipcRenderer.on('smart:watch-updated', handler)
      return () => {
        ipcRenderer.removeListener('smart:watch-updated', handler)
      }
    },
    onWatchOpen: (callback) => listen('smart:watch-open', callback),
    focusRulesGet: () => ipcRenderer.invoke('smart:focus-rules-get'),
    focusRulesSet: (rules) => ipcRenderer.invoke('smart:focus-rules-set', rules)
  },

  essentials: {
    updates: {
      state: () => ipcRenderer.invoke('updates:state'),
      check: () => ipcRenderer.invoke('updates:check'),
      install: () => ipcRenderer.invoke('updates:install'),
      onState: (callback) => listen('updates:state', callback)
    },
    pages: {
      confirmClose: (webContentsId: number) => ipcRenderer.invoke('pages:confirm-close', webContentsId)
    },
    screenShare: {
      respond: (id: string, sourceId: string | null, audio: boolean) => ipcRenderer.invoke('screen-share:respond', id, sourceId, audio),
      onRequest: (callback) => listen('screen-share:request', callback),
      onDismiss: (callback) => listen('screen-share:dismiss', callback)
    },
    auth: {
      respond: (id: string, username: string | null, password: string) => ipcRenderer.invoke('auth:respond', id, username, password),
      onRequest: (callback) => listen('auth:request', callback),
      onDismiss: (callback) => listen('auth:dismiss', callback)
    },
    pagePrompts: {
      respond: (id: string, value: string | null, mute: boolean) => ipcRenderer.invoke('page-prompt:respond', id, value, mute),
      onRequest: (callback) => listen('page-prompt:request', callback),
      onDismiss: (callback) => listen('page-prompt:dismiss', callback)
    },
    popups: {
      onBlocked: (callback) => listen('popup:blocked', callback)
    },
    spelling: {
      addWord: (webContentsId: number, word: string) => ipcRenderer.invoke('spelling:add-word', webContentsId, word)
    },
    safeBrowsing: {
      status: () => ipcRenderer.invoke('safe-browsing:status'),
      refresh: () => ipcRenderer.invoke('safe-browsing:refresh'),
      allow: (host: string) => ipcRenderer.invoke('safe-browsing:allow', host),
      onBlocked: (callback) => listen('safe-browsing:blocked', callback)
    },
    addresses: {
      list: () => ipcRenderer.invoke('addresses:list'),
      save: (data) => ipcRenderer.invoke('addresses:save', data),
      remove: (id: string) => ipcRenderer.invoke('addresses:remove', id),
      encrypted: () => ipcRenderer.invoke('addresses:encrypted')
    },
    passwordFiles: {
      importCsv: () => ipcRenderer.invoke('passwords:import-csv'),
      exportCsv: () => ipcRenderer.invoke('passwords:export-csv'),
      deleteImported: (filePath: string) => ipcRenderer.invoke('passwords:delete-imported', filePath)
    },
    routes: {
      list: () => ipcRenderer.invoke('routes:list'),
      save: (pattern: string, spaceId: string) => ipcRenderer.invoke('routes:save', pattern, spaceId),
      remove: (id: string) => ipcRenderer.invoke('routes:remove', id),
      onChanged: (callback) => listen('routes:changed', callback)
    },
    boosts: {
      list: () => ipcRenderer.invoke('boosts:list'),
      save: (data) => ipcRenderer.invoke('boosts:save', data),
      remove: (id: string) => ipcRenderer.invoke('boosts:remove', id)
    },
    highlights: {
      list: (url?: string) => ipcRenderer.invoke('highlights:list', url),
      add: (webContentsId: number, color) => ipcRenderer.invoke('highlights:add', webContentsId, color),
      remove: (id: string) => ipcRenderer.invoke('highlights:remove', id),
      scrollTo: (webContentsId: number, id: string) => ipcRenderer.invoke('highlights:scroll', webContentsId, id)
    },
    capture: {
      fullPage: (webContentsId: number) => ipcRenderer.invoke('capture:full-page', webContentsId),
      visible: (webContentsId: number) => ipcRenderer.invoke('capture:visible', webContentsId),
      save: (dataUrl: string, name: string) => ipcRenderer.invoke('capture:save', dataUrl, name),
      copy: (dataUrl: string) => ipcRenderer.invoke('capture:copy', dataUrl)
    },
    ai: {
      status: () => ipcRenderer.invoke('ai:status'),
      ask: (data) => ipcRenderer.invoke('ai:ask', data),
      cancel: (id: string) => ipcRenderer.invoke('ai:cancel', id),
      onChunk: (callback) => listen('ai:chunk', callback)
    },
    windows: {
      open: (url?: string) => ipcRenderer.invoke('windows:open', url),
      moveTab: (tabId: string) => ipcRenderer.invoke('windows:move-tab', tabId),
      moveTabToMain: (tabId: string) => ipcRenderer.invoke('windows:move-tab-main', tabId),
      onTabsChanged: (callback) => listen('windows:tabs-changed', callback)
    },
    shortcuts: {
      setRecording: (recording: boolean) => ipcRenderer.invoke('shortcuts:recording', recording)
    }
  },

  browserImport: {
    detect: () => ipcRenderer.invoke('import:detect'),
    run: (sourceId: string, bookmarks: boolean, history: boolean) => ipcRenderer.invoke('import:run', { sourceId, bookmarks, history }),
    bookmarksHtml: () => ipcRenderer.invoke('import:bookmarks-html'),
    arcDetect: () => ipcRenderer.invoke('import:arc-detect'),
    arcImport: () => ipcRenderer.invoke('import:arc-run')
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
