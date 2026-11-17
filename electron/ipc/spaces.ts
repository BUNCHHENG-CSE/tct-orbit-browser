import type { IpcMain } from 'electron'
import type { CreateSpaceData, UpdateSpaceData } from '../../src/types/api'
import { localStorageService } from '../storage/localStorage'

export function register(ipcMain: IpcMain): void {
  // List spaces with their tabs
  ipcMain.handle('spaces:list', async () => {
    return localStorageService.listSpaces()
  })

  // Create space
  ipcMain.handle('spaces:create', async (_, data: CreateSpaceData) => {
    if (!data.name) throw new Error('Space name is required')
    return localStorageService.createSpace(data)
  })

  // Update space
  ipcMain.handle('spaces:update', async (_, id: string, data: UpdateSpaceData) => {
    return localStorageService.updateSpace(id, data)
  })

  // Remove space
  ipcMain.handle('spaces:remove', async (_, id: string) => {
    return localStorageService.removeSpace(id)
  })

  // Set active space
  ipcMain.handle('spaces:setActive', async (_, id: string) => {
    return localStorageService.setActiveSpace(id)
  })
}
