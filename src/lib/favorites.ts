import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/lib/ipc'
import { useBrowserStore } from '@/store/useBrowserStore'
import { isPrivateWindow, openPrivateWindow } from '@/lib/privateWindow'
import type { BookmarkItem } from '@/types/api'

/** Root folder of the favorites bar. Subfolders use the import path style: "Favorites bar / AI" */
export const FAVORITES_BAR = 'Favorites bar'
/** Default folder for everything else (what the app always called "Bookmarks") */
export const OTHER_FAVORITES = 'Bookmarks'
export const READING_LIST = 'Reading List'
export const FOLDER_SEP = ' / '

export const isInBar = (b: BookmarkItem) =>
  !b.isReadingList && (b.folder === FAVORITES_BAR || !!b.folder?.startsWith(FAVORITES_BAR + FOLDER_SEP))

/** Last path segment, for display */
export const folderName = (path: string) => path.split(FOLDER_SEP).pop() || path

export type FavNode =
  | { kind: 'link'; item: BookmarkItem; key: number }
  | { kind: 'folder'; name: string; path: string; children: FavNode[]; key: number }

const sortKey = (b: BookmarkItem) => (b.order ?? 1e9) * 1e13 + (Date.parse(b.createdAt) || 0)

/** Folder tree under `root` (links + subfolders), ordered like the user arranged them */
export function buildTree(items: BookmarkItem[], root: string, paths: string[] = useFavorites.getState().folders): FavNode[] {
  const nodes: FavNode[] = []
  const folders = new Map<string, BookmarkItem[]>()
  for (const b of items) {
    if (b.folder === root) nodes.push({ kind: 'link', item: b, key: sortKey(b) })
    else if (b.folder?.startsWith(root + FOLDER_SEP)) {
      const rest = b.folder.slice(root.length + FOLDER_SEP.length)
      const name = rest.split(FOLDER_SEP)[0]
      const path = root + FOLDER_SEP + name
      folders.set(path, [...(folders.get(path) || []), b])
    }
  }
  // Folders without any favorite in them come last
  for (const p of paths) {
    if (!p.startsWith(root + FOLDER_SEP)) continue
    const path = root + FOLDER_SEP + p.slice(root.length + FOLDER_SEP.length).split(FOLDER_SEP)[0]
    if (!folders.has(path)) folders.set(path, [])
  }
  for (const [path, inside] of folders) {
    const children = buildTree(inside, path, paths)
    nodes.push({ kind: 'folder', name: folderName(path), path, children, key: inside.length ? Math.min(...inside.map(sortKey)) : Number.MAX_VALUE })
  }
  return nodes.sort((a, b) => a.key - b.key)
}

/** Every link inside a node (folder contents in order) */
export function flattenLinks(nodes: FavNode[]): BookmarkItem[] {
  return nodes.flatMap((n) => (n.kind === 'link' ? [n.item] : flattenLinks(n.children)))
}

/** Favicon to show: saved one, else the site's own /favicon.ico */
export function faviconFor(b: BookmarkItem): string | null {
  if (b.favicon) return b.favicon
  try {
    const u = new URL(b.url)
    return /^https?:$/.test(u.protocol) ? `${u.origin}/favicon.ico` : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ store */

interface FavoritesState {
  items: BookmarkItem[]
  folders: string[]
  loaded: boolean
  refresh: () => Promise<void>
}

export const useFavorites = create<FavoritesState>((set) => ({
  items: [],
  folders: [],
  loaded: false,
  refresh: async () => {
    try {
      const [items, folders] = await Promise.all([api.bookmarks.list(), api.bookmarks.folders()])
      set({ items: items ?? [], folders: folders ?? [], loaded: true })
    } catch {
      set({ loaded: true })
    }
  }
}))

let subscribed = false
/** Load once and keep in sync with changes from anywhere (main process broadcasts them) */
export function ensureFavoritesLoaded(): void {
  if (subscribed) return
  subscribed = true
  void useFavorites.getState().refresh()
  api.bookmarks?.onChanged?.(() => void useFavorites.getState().refresh())
}

/* ------------------------------------------------------------------ actions */

export type OpenMode = 'current' | 'new' | 'private'

/** Open a favorite in the current tab (default), a new tab, or a private tab */
export async function openFavorite(url: string, title: string, mode: OpenMode = 'current'): Promise<void> {
  const store = useBrowserStore.getState()
  const spaceId = store.activeSpaceId || store.spaces[0]?.id
  if (!spaceId) return
  const active = store.activeTabId ? store.tabsBySpace[spaceId]?.find((t) => t.id === store.activeTabId) : null

  if (mode === 'current' && active && !active.isPrivate) {
    if (active.url === url) {
      window.dispatchEvent(new CustomEvent('tct:webview-reload'))
      return
    }
    window.dispatchEvent(new CustomEvent('tct:webview-navigate', { detail: { tabId: active.id, url } }))
    store.updateTabInStore(active.id, { url, title: title || url })
    await api.tabs.update(active.id, { url, title: title || url }).catch(() => {})
    return
  }

  // "Open in private" from the main window goes to the private window
  if (mode === 'private' && !isPrivateWindow) return openPrivateWindow(url)
  const tab = await api.tabs.create({ spaceId, url, title: title || 'Loading...', isPrivate: mode === 'private' })
  // "Open in new tab" / Ctrl+click / middle-click open in the background, like other browsers
  store.insertTabNextTo(spaceId, tab, store.activeTabId, mode !== 'new' || !active)
}

/** Save the active tab to a folder (default: the favorites bar) */
export async function addActiveTabToFavorites(folder = FAVORITES_BAR): Promise<BookmarkItem | null> {
  const store = useBrowserStore.getState()
  const spaceId = store.activeSpaceId
  const tab = spaceId && store.activeTabId ? store.tabsBySpace[spaceId]?.find((t) => t.id === store.activeTabId) : null
  if (!tab || !/^https?:/i.test(tab.url)) return null
  return addFavorite({ url: tab.url, title: tab.title, favicon: tab.favicon }, folder)
}

/** Bar order = one sequence over the whole bar tree (folders sort by their first item) */
export function barOrder(items: BookmarkItem[]): string[] {
  return flattenLinks(buildTree(items.filter(isInBar), FAVORITES_BAR)).map((b) => b.id)
}

/** Add (or move) a page into a folder; new items go to the end of that folder */
export async function addFavorite(
  page: { url: string; title?: string; favicon?: string | null },
  folder = FAVORITES_BAR
): Promise<BookmarkItem | null> {
  const items = useFavorites.getState().items
  const item = await api.bookmarks.add({ url: page.url, title: page.title || page.url, favicon: page.favicon ?? null, folder })
  if (!item) return null
  if (item.folder !== folder) await api.bookmarks.update?.(item.id, { folder })
  if (folder === FAVORITES_BAR || folder.startsWith(FAVORITES_BAR + FOLDER_SEP)) {
    await api.bookmarks.reorder?.([...barOrder(items).filter((id) => id !== item.id), item.id])
  }
  return item
}

/* ------------------------------------------------------------------ toolbar button */

/** Favorites button (☆≡) pinned to the toolbar; unpin from its right-click menu or the ⋯ menu */
export const useFavoritesButton = create<{ show: boolean; setShow: (show: boolean) => void }>()(
  persist((set) => ({ show: true, setShow: (show) => set({ show }) }), { name: 'tct-favorites-button' })
)
