import fs from 'fs'
import path from 'path'
import { getAppPaths } from './paths'
import type { BookmarkItem, AddBookmarkData } from '../../src/types/api'

class BookmarksService {
  private bookmarks: BookmarkItem[] = []
  /** Folders that exist on their own ("Favorites bar / AI"), so they may be empty */
  private folders = new Set<string>()
  private filePath: string = ''
  private saveTimeout: NodeJS.Timeout | null = null
  private listeners = new Set<() => void>()

  /** Called after every change (the IPC layer tells the windows to refresh) */
  public onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public init(): void {
    try {
      const paths = getAppPaths()
      this.filePath = path.join(paths.userProfileDir, 'bookmarks.json')

      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      const folderFile = path.join(dir, 'bookmark-folders.json')
      if (fs.existsSync(folderFile)) {
        const list = JSON.parse(fs.readFileSync(folderFile, 'utf-8'))
        if (Array.isArray(list)) this.folders = new Set(list.filter((f) => typeof f === 'string' && f.length <= 300))
      }

      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8')
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          this.bookmarks = parsed
          console.log(`[BookmarksService] Loaded ${this.bookmarks.length} bookmarks from:`, this.filePath)
        }
      }
    } catch (err) {
      console.warn('[BookmarksService] Failed to load bookmarks, initializing empty:', err)
      this.bookmarks = []
    }
  }

  private scheduleSave(): void {
    for (const l of this.listeners) {
      try {
        l()
      } catch {}
    }
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }
    this.saveTimeout = setTimeout(() => {
      this.persist()
    }, 300)
  }

  private persist(): void {
    if (!this.filePath) return
    try {
      const tmp = `${this.filePath}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(this.bookmarks, null, 2), 'utf-8')
      fs.renameSync(tmp, this.filePath)
      const folderFile = path.join(path.dirname(this.filePath), 'bookmark-folders.json')
      fs.writeFileSync(`${folderFile}.tmp`, JSON.stringify([...this.folders]), 'utf-8')
      fs.renameSync(`${folderFile}.tmp`, folderFile)
    } catch (err) {
      console.error('[BookmarksService] Failed to persist bookmarks:', err)
    }
  }

  /** Bookmarks from a backup. Merge keeps existing ones; replace removes bookmarks the backup doesn't have. */
  public restore(items: BookmarkItem[], mode: 'merge' | 'replace'): number {
    const known = new Set(mode === 'replace' ? [] : this.bookmarks.map((b) => b.url))
    const ids = new Set(mode === 'replace' ? [] : this.bookmarks.map((b) => b.id))
    const added: BookmarkItem[] = []
    for (const b of items) {
      if (known.has(b.url)) continue
      known.add(b.url)
      const id = ids.has(b.id) ? `bm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` : b.id
      ids.add(id)
      added.push({ ...b, id })
    }
    this.bookmarks = mode === 'replace' ? added : [...this.bookmarks, ...added]
    if (added.length > 0) this.scheduleSave()
    return added.length
  }

  public listFolders(): string[] {
    return [...this.folders]
  }

  /** New, possibly empty, folder. False when it already exists. */
  public createFolder(folder: string): boolean {
    const name = folder.trim()
    const taken = this.folders.has(name) || this.bookmarks.some((b) => b.folder === name || b.folder?.startsWith(`${name} / `))
    if (!name || taken || this.folders.size >= 2000) return false
    this.folders.add(name)
    this.scheduleSave()
    return true
  }

  /** A subfolder stays when its last favorite leaves it */
  private keepFolder(folder: string | undefined): void {
    if (folder && folder.includes(' / ')) this.folders.add(folder)
  }

  public list(): BookmarkItem[] {
    return [...this.bookmarks]
  }

  public add(data: AddBookmarkData): BookmarkItem {
    // Check if bookmark with exact same URL already exists
    const existingIndex = this.bookmarks.findIndex((b) => b.url === data.url)
    if (existingIndex !== -1) {
      // Update existing bookmark
      this.bookmarks[existingIndex] = {
        ...this.bookmarks[existingIndex],
        title: data.title || this.bookmarks[existingIndex].title,
        spaceId: data.spaceId !== undefined ? data.spaceId : this.bookmarks[existingIndex].spaceId,
        folder: data.folder || this.bookmarks[existingIndex].folder,
        isReadingList: data.isReadingList !== undefined ? data.isReadingList : this.bookmarks[existingIndex].isReadingList
      }
      this.scheduleSave()
      return this.bookmarks[existingIndex]
    }

    const newItem: BookmarkItem = {
      id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      url: data.url,
      title: data.title || data.url,
      favicon: data.favicon || null,
      spaceId: data.spaceId,
      folder: data.folder || 'Bookmarks',
      isReadingList: !!data.isReadingList,
      isRead: false,
      createdAt: new Date().toISOString()
    }

    this.bookmarks.unshift(newItem)
    this.scheduleSave()
    return newItem
  }

  public delete(id: string): boolean {
    const before = this.bookmarks.length
    this.keepFolder(this.bookmarks.find((b) => b.id === id)?.folder)
    this.bookmarks = this.bookmarks.filter((b) => b.id !== id)
    if (this.bookmarks.length !== before) {
      this.scheduleSave()
      return true
    }
    return false
  }

  public deleteByUrl(url: string): boolean {
    const before = this.bookmarks.length
    for (const b of this.bookmarks) if (b.url === url) this.keepFolder(b.folder)
    this.bookmarks = this.bookmarks.filter((b) => b.url !== url)
    if (this.bookmarks.length !== before) {
      this.scheduleSave()
      return true
    }
    return false
  }

  public toggleRead(id: string): boolean {
    const item = this.bookmarks.find((b) => b.id === id)
    if (item) {
      item.isRead = !item.isRead
      this.scheduleSave()
      return true
    }
    return false
  }

  /** Rename, change the URL, or move to another folder */
  public update(id: string, data: { title?: string; url?: string; folder?: string }): BookmarkItem | null {
    const item = this.bookmarks.find((b) => b.id === id)
    if (!item) return null
    if (data.title !== undefined) item.title = data.title.trim() || item.url
    if (data.url !== undefined && data.url.trim()) item.url = data.url.trim()
    if (data.folder !== undefined && data.folder.trim()) {
      this.keepFolder(item.folder)
      item.folder = data.folder.trim()
    }
    this.scheduleSave()
    return item
  }

  /** Set the display order of the given bookmarks (e.g. favorites bar drag & drop) */
  public reorder(orderedIds: string[]): boolean {
    const index = new Map(orderedIds.map((id, i) => [id, i]))
    let changed = false
    for (const b of this.bookmarks) {
      const order = index.get(b.id)
      if (order !== undefined && b.order !== order) {
        b.order = order
        changed = true
      }
    }
    if (changed) this.scheduleSave()
    return changed
  }

  /** Rename a folder (and its subfolders, "A / B" paths) */
  public renameFolder(from: string, to: string): number {
    const target = to.trim()
    if (!from || !target || from === target) return 0
    let count = 0
    for (const b of this.bookmarks) {
      if (b.folder === from) {
        b.folder = target
        count++
      } else if (b.folder?.startsWith(`${from} / `)) {
        b.folder = target + b.folder.slice(from.length)
        count++
      }
    }
    for (const f of [...this.folders]) {
      if (f !== from && !f.startsWith(`${from} / `)) continue
      this.folders.delete(f)
      this.folders.add(target + f.slice(from.length))
      count++
    }
    if (count) this.scheduleSave()
    return count
  }

  /** Delete every bookmark in a folder (and its subfolders) */
  public deleteFolder(folder: string): number {
    const before = this.bookmarks.length
    this.bookmarks = this.bookmarks.filter((b) => b.folder !== folder && !b.folder?.startsWith(`${folder} / `))
    const removed = before - this.bookmarks.length
    let folders = 0
    for (const f of [...this.folders]) {
      if ((f === folder || f.startsWith(`${folder} / `)) && this.folders.delete(f)) folders++
    }
    if (removed || folders) this.scheduleSave()
    return removed
  }

  public isBookmarked(url: string): boolean {
    if (!url) return false
    return this.bookmarks.some((b) => b.url === url)
  }
}

export const bookmarksService = new BookmarksService()
