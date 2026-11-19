import type { IpcMain } from 'electron'
import { notesService } from '../storage/notesService'
import { secureHandle, Schemas } from '../security'

export function register(ipcMain: IpcMain): void {
  // Get notes for space
  secureHandle(ipcMain, 'notes:get', Schemas.notesGet, async (_, spaceId: string) => {
    return notesService.getNote(spaceId)
  })

  // Save notes for space
  secureHandle(ipcMain, 'notes:save', Schemas.notesSave, async (_, data: { spaceId: string; content: string }) => {
    return notesService.saveNote(data.spaceId, data.content)
  })
}
