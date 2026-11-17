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
  AppInfo
} from '../src/types/api'

let initialAppInfo: AppInfo = {
  name: 'TCT Orbit',
  version: '0.1.0',
  channel: 'stable'
}

try {
  const syncInfo = ipcRenderer.sendSync('app:getInfoSync')
  if (syncInfo && syncInfo.name) {
    initialAppInfo = syncInfo
  }
} catch {
  // fallback if sync ipc unavailable
}

const api: ElectronAPI = {
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
      const handler = (_: any, state: ThemeState) => callback(state)
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
    setTitle: (title: string) => ipcRenderer.invoke('window:setTitle', title)
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
      const handler = (_: any, state: any) => callback(state)
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
    captureScreenshot: (webContentsId: number) =>
      ipcRenderer.invoke('page:capture-screenshot', { webContentsId })
  },
  contextMenu: {
    onOpen: (callback: (data: any) => void) => {
      const handler = (_: any, data: any) => callback(data)
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
  privacy: {
    getState: () => ipcRenderer.invoke('privacy:get-state'),
    updatePrefs: (updates: any) => ipcRenderer.invoke('privacy:update-prefs', updates),
    getSiteStatus: (url: string) => ipcRenderer.invoke('privacy:get-site-status', url),
    toggleSiteShield: (origin: string) => ipcRenderer.invoke('privacy:toggle-site-shield', origin),
    getStats: () => ipcRenderer.invoke('privacy:get-stats'),
    clearBrowsingData: () => ipcRenderer.invoke('privacy:clear-browsing-data'),
    onStateChanged: (callback: (state: any) => void) => {
      const handler = (_: any, state: any) => callback(state)
      ipcRenderer.on('privacy:state-changed', handler)
      return () => {
        ipcRenderer.removeListener('privacy:state-changed', handler)
      }
    }
  },
  onOpenUrl: (callback: (payload: { url: string; active: boolean; sourceWebContentsId?: number }) => void) => {
    const handler = (_: any, payload: { url: string; active: boolean; sourceWebContentsId?: number } | string) => {
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
    const handler = (_: any, url: string) => callback(url)
    ipcRenderer.on('tab:create-from-external', handler)
    return () => {
      ipcRenderer.removeListener('tab:create-from-external', handler)
    }
  }
}

try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error('[Preload] Failed to expose window.api via contextBridge:', error)
}
