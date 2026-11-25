import { BrowserWindow, type IpcMain } from 'electron'
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

  secureHandle(ipcMain, 'bookmarks:update', Schemas.bookmarksUpdate, async (_, id: string, data) => {
    return bookmarksService.update(id, data)
  })
  secureHandle(ipcMain, 'bookmarks:reorder', Schemas.bookmarksReorder, async (_, ids: string[]) => {
    return bookmarksService.reorder(ids)
  })
  secureHandle(ipcMain, 'bookmarks:rename-folder', Schemas.bookmarksRenameFolder, async (_, from: string, to: string) => {
    return bookmarksService.renameFolder(from, to)
  })
  secureHandle(ipcMain, 'bookmarks:delete-folder', Schemas.bookmarksFolder, async (_, folder: string) => {
    return bookmarksService.deleteFolder(folder)
  })

  // Tell every window when bookmarks change (favorites bar, star button, manager stay in sync)
  let pending: NodeJS.Timeout | null = null
  bookmarksService.onChange(() => {
    if (pending) clearTimeout(pending)
    pending = setTimeout(() => {
      pending = null
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('bookmarks:changed')
      }
    }, 50)
  })

  // 6. Check if URL is bookmarked
  secureHandle(ipcMain, 'bookmarks:is-bookmarked', Schemas.bookmarksIsBookmarked, async (_, url: string) => {
    return bookmarksService.isBookmarked(url)
  })
}
