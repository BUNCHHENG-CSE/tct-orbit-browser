import type { IpcMain } from 'electron'
import type { CreateTabData, UpdateTabData } from '../../src/types/api'
import { localStorageService } from '../storage/localStorage'

export function register(ipcMain: IpcMain): void {
  // List tabs for a specific space
  ipcMain.handle('tabs:list', async (_, spaceId: string) => {
    if (!spaceId) return []
    return localStorageService.listTabs(spaceId)
  })

  // Create tab
  ipcMain.handle('tabs:create', async (_, data: CreateTabData) => {
    if (!data.spaceId || !data.url) {
      throw new Error('spaceId and url are required')
    }
    return localStorageService.createTab(data)
  })

  // Update tab
  ipcMain.handle('tabs:update', async (_, id: string, data: UpdateTabData) => {
    if (!id) throw new Error('Tab ID is required')
    return localStorageService.updateTab(id, data)
  })

  // Remove tab
  ipcMain.handle('tabs:remove', async (_, id: string) => {
    if (!id) throw new Error('Tab ID is required')
    return localStorageService.removeTab(id)
  })

  // Reorder tabs
  ipcMain.handle('tabs:reorder', async (_, spaceId: string, orderedIds: string[]) => {
    if (!spaceId || !orderedIds) return []
    return localStorageService.reorderTabs(spaceId, orderedIds)
  })
}
