import type { IpcMain } from 'electron'
import type { CreateSpaceData, UpdateSpaceData } from '../../src/types/api'
import { localStorageService } from '../storage/localStorage'
import { secureHandle, Schemas } from '../security'
import { privacyEngine } from '../privacy/privacyEngine'
import { clearProfileSession, ensureProfileSession, profilePartitionFor } from '../sessions'

export function register(ipcMain: IpcMain): void {
  // List spaces with their tabs
  secureHandle(ipcMain, 'spaces:list', null, async () => {
    return localStorageService.listSpaces()
  })

  // Create space
  secureHandle(ipcMain, 'spaces:create', Schemas.spaceCreate, async (_, data: CreateSpaceData) => {
    if (!data.name) throw new Error('Space name is required')
    return localStorageService.createSpace(data)
  })

  // Update space
  secureHandle(ipcMain, 'spaces:update', Schemas.spaceUpdate, async (_, id: string, data: UpdateSpaceData) => {
    const updated = localStorageService.updateSpace(id, data)
    // Prepare the profile session before the UI remounts the space's webviews on it
    if (data.isolated) ensureProfileSession(profilePartitionFor(id))
    return updated
  })

  // Remove space
  secureHandle(ipcMain, 'spaces:remove', Schemas.spaceId, async (_, id: string) => {
    const hadPrivate = localStorageService.hasPrivateTabs()
    const hadProfile = localStorageService.isSpaceIsolated(id)
    const result = localStorageService.removeSpace(id)
    // The space's own profile (cookies, logins, storage) goes with it
    if (hadProfile) void clearProfileSession(id)
    // The space held the last private tab(s): wipe the private session like tabs:remove does
    if (hadPrivate && !localStorageService.hasPrivateTabs()) {
      void privacyEngine.clearPrivateSession()
    }
    return result
  })

  // Set active space
  secureHandle(ipcMain, 'spaces:setActive', Schemas.spaceId, async (_, id: string) => {
    return localStorageService.setActiveSpace(id)
  })
}
