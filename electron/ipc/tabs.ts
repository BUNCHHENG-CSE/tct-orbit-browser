import type { IpcMain } from 'electron'
import type { CreateTabData, UpdateTabData } from '../../src/types/api'
import { localStorageService } from '../storage/localStorage'
import { secureHandle, Schemas } from '../security'

export function register(ipcMain: IpcMain): void {
  // List tabs for a specific space
  secureHandle(ipcMain, 'tabs:list', Schemas.tabList, async (_, spaceId: string) => {
    if (!spaceId) return []
    return localStorageService.listTabs(spaceId)
  })

  // Create tab
  secureHandle(ipcMain, 'tabs:create', Schemas.tabCreate, async (_, data: CreateTabData) => {
    if (!data.spaceId || !data.url) {
      throw new Error('spaceId and url are required')
    }
    return localStorageService.createTab(data)
  })

  // Update tab
  secureHandle(
    ipcMain,
    'tabs:update',
    Schemas.tabUpdate,
    async (_, id: string, data: UpdateTabData) => {
      if (!id) throw new Error('Tab ID is required')
      return localStorageService.updateTab(id, data)
    }
  )

  // Remove tab
  secureHandle(ipcMain, 'tabs:remove', Schemas.tabRemove, async (_, id: string) => {
    if (!id) throw new Error('Tab ID is required')
    return localStorageService.removeTab(id)
  })

  // Reorder tabs
  secureHandle(
    ipcMain,
    'tabs:reorder',
    Schemas.tabReorder,
    async (_, spaceId: string, orderedIds: string[]) => {
      if (!spaceId || !orderedIds) return []
      return localStorageService.reorderTabs(spaceId, orderedIds)
    }
  )
}
