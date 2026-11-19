import { type IpcMain } from 'electron'
import { secureHandle, Schemas } from '../security'
import { bookmarksService } from '../storage/bookmarksService'
import type { AddBookmarkData } from '../../src/types/api'

export function register(ipcMain: IpcMain): void {
  // 1. List all bookmarks
  secureHandle(ipcMain, 'bookmarks:list', null, async () => {
    return bookmarksService.list()
  })

  // 2. Add or update bookmark
  secureHandle(ipcMain, 'bookmarks:add', Schemas.bookmarksAdd, async (_, data: AddBookmarkData) => {
    return bookmarksService.add(data)
  })

  // 3. Delete bookmark by id
  secureHandle(ipcMain, 'bookmarks:delete', Schemas.bookmarksDelete, async (_, id: string) => {
    return bookmarksService.delete(id)
  })

  // 4. Delete bookmark by URL
  secureHandle(ipcMain, 'bookmarks:delete-by-url', Schemas.bookmarksDeleteByUrl, async (_, url: string) => {
    return bookmarksService.deleteByUrl(url)
  })

  // 5. Toggle read status for Reading List item
  secureHandle(ipcMain, 'bookmarks:toggle-read', Schemas.bookmarksToggleRead, async (_, id: string) => {
    return bookmarksService.toggleRead(id)
  })

  // 6. Check if URL is bookmarked
  secureHandle(ipcMain, 'bookmarks:is-bookmarked', Schemas.bookmarksIsBookmarked, async (_, url: string) => {
    return bookmarksService.isBookmarked(url)
  })
}
