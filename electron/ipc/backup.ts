import { type IpcMain, type BrowserWindow } from 'electron'
import { secureHandle, Schemas } from '../security'
import { backupService } from '../storage/backupService'
import type { ExportBackupOptions, ImportBackupOptions } from '../../src/types/api'

export function register(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null
): void {
  // 1. Export backup to user-chosen JSON file
  secureHandle(ipcMain, 'backup:export', Schemas.backupExport, async (_, options?: ExportBackupOptions) => {
    const win = getMainWindow()
    return backupService.exportBackup(options || {}, win)
  })

  // 2. Select file via OS dialog and inspect safely
  secureHandle(ipcMain, 'backup:select-file', null, async () => {
    const win = getMainWindow()
    return backupService.selectAndInspectFile(win)
  })

  // 3. Inspect raw JSON string (e.g. from drag & drop)
  secureHandle(ipcMain, 'backup:inspect-json', Schemas.backupInspectJson, async (_, rawContent: string) => {
    return backupService.inspectBackup(rawContent)
  })

  // 4. Import backup data (Merge or Replace)
  secureHandle(ipcMain, 'backup:import', Schemas.backupImport, async (_, options: ImportBackupOptions) => {
    const win = getMainWindow()
    const result = await backupService.importBackup(options, win)

    // Notify window to refresh tabs/spaces if successful
    if (result.success && win && !win.isDestroyed()) {
      win.webContents.send('backup:imported', result)
    }

    return result
  })
}
