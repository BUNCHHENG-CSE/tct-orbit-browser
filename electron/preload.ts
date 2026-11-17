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
