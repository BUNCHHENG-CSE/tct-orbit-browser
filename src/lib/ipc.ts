import type { ElectronAPI, AppInfo } from '@/types/api'
import { isPrivateWindow, PRIVATE_SPACE, PRIVATE_WINDOW_SPACE_ID } from '@/lib/privateWindow'
import { isExtraWindow, EXTRA_BASE_SPACE_ID, EXTRA_SPACE, EXTRA_SPACE_ID } from '@/lib/extraWindow'

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
      return getApi().appInfo || { name: 'TCT Orbit', version: '0.1.2', channel: 'stable' }
    } catch {
      return { name: 'TCT Orbit', version: '0.1.2', channel: 'stable' }
    }
  },
  get tabs() {
    const tabs = getApi().tabs
    if (isExtraWindow) {
      // Extra window: every tab lives in the window's own space
      return {
        ...tabs,
        create: (data: Parameters<typeof tabs.create>[0]) => tabs.create({ ...data, spaceId: EXTRA_SPACE_ID, isPrivate: false })
      }
    }
    if (!isPrivateWindow) return tabs
    // Private window: every tab is private and lives in the private window's own space
    return {
      ...tabs,
      create: (data: Parameters<typeof tabs.create>[0]) =>
        tabs.create({ ...data, spaceId: PRIVATE_WINDOW_SPACE_ID, isPrivate: true, isPinned: false, groupId: null }),
      update: (id: string, data: Parameters<typeof tabs.update>[1]) =>
        tabs.update(id, { ...data, ...(data.spaceId ? { spaceId: PRIVATE_WINDOW_SPACE_ID } : {}) })
    }
  },
  get spaces() {
    const spaces = getApi().spaces
    if (isExtraWindow) {
      return {
        ...spaces,
        list: async () => [{ ...EXTRA_SPACE }],
        setActive: async () => ({ ...EXTRA_SPACE }),
        update: async () => ({ ...EXTRA_SPACE }),
        create: async () => {
          throw new Error('Spaces are managed in the main window')
        },
        remove: async () => false
      }
    }
    if (!isPrivateWindow) return spaces
    // Private window: one virtual "Private" space; spaces can't be created or switched here
    return {
      ...spaces,
      list: async () => [{ ...PRIVATE_SPACE }],
      setActive: async () => ({ ...PRIVATE_SPACE }),
      update: async () => ({ ...PRIVATE_SPACE }),
      create: async () => {
        throw new Error('Spaces are not available in a private window')
      },
      remove: async () => false
    }
  },
  get passwords() {
    return getApi().passwords
  },
  get search() {
    return getApi().search
  },
  get defaultBrowser() {
    return getApi().defaultBrowser
  },
  get extensions() {
    return getApi().extensions
  },
  get groups() {
    return getApi().groups
  },
  get splits() {
    return getApi().splits
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
  get history() {
    return getApi().history
  },
  get notes() {
    const notes = getApi().notes
    const base = EXTRA_BASE_SPACE_ID
    if (!isExtraWindow || !base) return notes
    // Extra windows share the notes of the space they were opened from
    return {
      ...notes,
      get: () => notes.get(base),
      save: (_spaceId: string, content: string) => notes.save(base, content)
    }
  },
  get essentials() {
    return getApi().essentials
  },
  get bookmarks() {
    return getApi().bookmarks
  },
  get site() {
    return getApi().site
  },
  get system() {
    return getApi().system
  },
  get permissions() {
    return getApi().permissions
  },
  get siteSettings() {
    return getApi().siteSettings
  },
  get session() {
    return getApi().session
  },
  get focus() {
    return getApi().focus
  },
  get sync() {
    return getApi().sync
  },
  get thumbnails() {
    return getApi().thumbnails
  },
  get smart() {
    return getApi().smart
  },
  get browserImport() {
    return getApi().browserImport
  },
  onOpenUrl(callback: (payload: { url: string; active: boolean; sourceWebContentsId?: number; isPrivate?: boolean }) => void) {
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
