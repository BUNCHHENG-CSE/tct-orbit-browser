import type { IpcMain } from 'electron'
import type { CreateTabData, UpdateTabData, CreateTabGroupData, UpdateTabGroupData, SaveSplitData } from '../../src/types/api'
import { localStorageService } from '../storage/localStorage'
import { secureHandle, Schemas } from '../security'
import { privacyEngine } from '../privacy/privacyEngine'

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
      // Private tabs can't be pinned (pinned tabs are restored after restart)
      if (localStorageService.getTab(id)?.isPrivate && data.isPinned) {
        data = { ...data, isPinned: false }
      }
      return localStorageService.updateTab(id, data)
    }
  )

  // Remove tab
  secureHandle(ipcMain, 'tabs:remove', Schemas.tabRemove, async (_, id: string) => {
    if (!id) throw new Error('Tab ID is required')
    const wasPrivate = !!localStorageService.getTab(id)?.isPrivate
    const result = localStorageService.removeTab(id)
    // Last private tab closed: forget all cookies, storage and cache of the private session
    if (wasPrivate && !localStorageService.hasPrivateTabs()) {
      void privacyEngine.clearPrivateSession()
    }
    return result
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

  // --- Tab groups (nestable, up to 8 levels) ---
  secureHandle(ipcMain, 'groups:list', Schemas.groupList, async (_, spaceId: string) => {
    return localStorageService.listGroups(spaceId)
  })

  secureHandle(ipcMain, 'groups:create', Schemas.groupCreate, async (_, data: CreateTabGroupData) => {
    return localStorageService.createGroup(data)
  })

  secureHandle(ipcMain, 'groups:update', Schemas.groupUpdate, async (_, id: string, data: UpdateTabGroupData) => {
    return localStorageService.updateGroup(id, data)
  })

  secureHandle(ipcMain, 'groups:remove', Schemas.groupRemove, async (_, id: string, closeTabs?: boolean) => {
    const hadPrivate = localStorageService.hasPrivateTabs()
    const result = localStorageService.removeGroup(id, !!closeTabs)
    if (hadPrivate && !localStorageService.hasPrivateTabs()) {
      void privacyEngine.clearPrivateSession()
    }
    return result
  })

  // --- Saved split layouts ---
  secureHandle(ipcMain, 'splits:list', null, async () => localStorageService.listSavedSplits())

  secureHandle(ipcMain, 'splits:save', Schemas.splitSave, async (_, data: SaveSplitData) => {
    return localStorageService.saveSplit(data)
  })

  secureHandle(ipcMain, 'splits:remove', Schemas.splitRemove, async (_, id: string) => {
    return localStorageService.removeSavedSplit(id)
  })
}
