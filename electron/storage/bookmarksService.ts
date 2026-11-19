import fs from 'fs'
import path from 'path'
import { getAppPaths } from './paths'
import type { BookmarkItem, AddBookmarkData } from '../../src/types/api'

class BookmarksService {
  private bookmarks: BookmarkItem[] = []
  private filePath: string = ''
  private saveTimeout: NodeJS.Timeout | null = null

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

  public isBookmarked(url: string): boolean {
    if (!url) return false
    return this.bookmarks.some((b) => b.url === url)
  }
}

export const bookmarksService = new BookmarksService()
