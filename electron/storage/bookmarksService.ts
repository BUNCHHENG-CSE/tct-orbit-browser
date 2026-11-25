import fs from 'fs'
import path from 'path'
import { getAppPaths } from './paths'
import type { BookmarkItem, AddBookmarkData } from '../../src/types/api'

class BookmarksService {
  private bookmarks: BookmarkItem[] = []
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
    this.bookmarks = this.bookmarks.filter((b) => b.id !== id)
    if (this.bookmarks.length !== before) {
      this.scheduleSave()
      return true
    }
    return false
  }

  public deleteByUrl(url: string): boolean {
    const before = this.bookmarks.length
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
    if (data.folder !== undefined && data.folder.trim()) item.folder = data.folder.trim()
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
    if (count) this.scheduleSave()
    return count
  }

  /** Delete every bookmark in a folder (and its subfolders) */
  public deleteFolder(folder: string): number {
    const before = this.bookmarks.length
    this.bookmarks = this.bookmarks.filter((b) => b.folder !== folder && !b.folder?.startsWith(`${folder} / `))
    const removed = before - this.bookmarks.length
    if (removed) this.scheduleSave()
    return removed
  }

  public isBookmarked(url: string): boolean {
    if (!url) return false
    return this.bookmarks.some((b) => b.url === url)
  }
}

export const bookmarksService = new BookmarksService()
