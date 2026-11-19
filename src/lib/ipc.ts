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
      return getApi().appInfo || { name: 'TCT Orbit', version: '0.1.1', channel: 'stable' }
    } catch {
      return { name: 'TCT Orbit', version: '0.1.1', channel: 'stable' }
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
  get devtools() {
    return getApi().devtools
  },
  get webview() {
    return getApi().webview
  },
  get contextMenu() {
    return getApi().contextMenu
  },
  get omnibox() {
    return getApi().omnibox
  },
  get shortcuts() {
    return getApi().shortcuts
  },
  get privacy() {
    return getApi().privacy
  },
  get downloads() {
    return getApi().downloads
  },
  get backup() {
    return getApi().backup
  },
  onOpenUrl(callback: (payload: { url: string; active: boolean; sourceWebContentsId?: number }) => void) {
    if (typeof window !== 'undefined' && window.api?.onOpenUrl) {
      return window.api.onOpenUrl(callback)
    }
    return () => {}
  },
  onExternalUrl(callback: (url: string) => void) {
    if (typeof window !== 'undefined' && window.api?.onExternalUrl) {
      return window.api.onExternalUrl(callback)
    }
    return () => {}
  }
}
