import type { ElectronAPI, AppInfo } from '@/types/api'

export const getApi = (): ElectronAPI => {
  if (typeof window !== 'undefined' && window.api) {
    return window.api
  }
  throw new Error('Electron API is not available on window. Make sure contextIsolation is enabled and preload is loaded.')
}

export const api = {
  get app() {
    return getApi().app
  },
  get appInfo(): AppInfo {
    try {
      return getApi().appInfo || { name: 'TCT Orbit', version: '0.1.0', channel: 'stable' }
    } catch {
      return { name: 'TCT Orbit', version: '0.1.0', channel: 'stable' }
    }
  },
  get tabs() {
    return getApi().tabs
  },
  get spaces() {
    return getApi().spaces
  },
  get settings() {
    return getApi().settings
  },
  get window() {
    return getApi().window
  },
  get navigation() {
    return getApi().navigation
  },
  onExternalUrl(callback: (url: string) => void) {
    if (typeof window !== 'undefined' && window.api?.onExternalUrl) {
      return window.api.onExternalUrl(callback)
    }
    return () => {}
  }
}
