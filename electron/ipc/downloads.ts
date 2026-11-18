import { app, dialog, shell, session, type BrowserWindow, type IpcMain, type DownloadItem, type WebContents } from 'electron'
import path from 'path'
import fs from 'fs'
import { secureHandle, Schemas } from '../security'
import { localStorageService } from '../storage/localStorage'

/**
 * Generates a unique, non-colliding file path if a file with the same name exists.
 * E.g., document.pdf -> document (1).pdf -> document (2).pdf
 */
function getUniqueFilePath(directory: string, filename: string): string {
  const ext = path.extname(filename)
  const base = path.basename(filename, ext)
  let candidate = path.join(directory, filename)
  let counter = 1

  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${base} (${counter})${ext}`)
    counter++
  }

  return candidate
}

let isDownloadManagerSetup = false

export function setupDownloadManager(getMainWindow: () => BrowserWindow | null): void {
  if (isDownloadManagerSetup) return
  isDownloadManagerSetup = true

  const attachListener = (ses: Electron.Session) => {
    ses.on('will-download', (event, item: DownloadItem, _webContents: WebContents) => {
      const win = getMainWindow()
      const settings = localStorageService.getSettings()

      const fallbackDownloadsDir = app.getPath('downloads')
      const targetDir =
        settings.downloadPath && fs.existsSync(settings.downloadPath)
          ? settings.downloadPath
          : fallbackDownloadsDir

      const filename = item.getFilename()
      const downloadId = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

      // 1. Ask where to save if configured
      if (settings.askWhereToSave && win && !win.isDestroyed()) {
        item.setSaveDialogOptions({
          defaultPath: path.join(targetDir, filename)
        })
      } else {
        // Auto-save to target directory with collision protection
        try {
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true })
          }
          const safePath = getUniqueFilePath(targetDir, filename)
          item.setSavePath(safePath)
        } catch (err) {
          console.error('[DownloadManager] Failed to set auto save path:', err)
        }
      }

      // Notify renderer that a download has initiated
      if (win && !win.isDestroyed()) {
        win.webContents.send('downloads:started', {
          id: downloadId,
          filename: item.getFilename(),
          totalBytes: item.getTotalBytes(),
          savePath: item.getSavePath()
        })
      }

      // Track progress
      item.on('updated', (_updateEvent, state) => {
        if (state === 'progressing' && win && !win.isDestroyed()) {
          const total = item.getTotalBytes()
          const received = item.getReceivedBytes()
          const progress = total > 0 ? Math.round((received / total) * 100) : 0

          win.webContents.send('downloads:progress', {
            id: downloadId,
            filename: item.getFilename(),
            receivedBytes: received,
            totalBytes: total,
            progress,
            state: 'progressing',
            savePath: item.getSavePath()
          })
        }
      })

      // Track completion / interruption
      item.once('done', (_doneEvent, state) => {
        const finalPath = item.getSavePath()
        const win = getMainWindow()

        if (state === 'completed') {
          console.log(`[DownloadManager] Download completed: ${finalPath}`)

          if (win && !win.isDestroyed()) {
            win.webContents.send('downloads:completed', {
              id: downloadId,
              filename: item.getFilename(),
              savePath: finalPath,
              totalBytes: item.getTotalBytes()
            })
          }

          // Automatically open or show file in folder if setting enabled
          if (settings.openFolderOnDownload && finalPath && fs.existsSync(finalPath)) {
            shell.showItemInFolder(finalPath)
          }
        } else {
          console.warn(`[DownloadManager] Download ended with state "${state}": ${filename}`)
          if (win && !win.isDestroyed()) {
            win.webContents.send('downloads:failed', {
              id: downloadId,
              filename: item.getFilename(),
              reason: state === 'cancelled' ? 'Cancelled' : 'Interrupted'
            })
          }
        }
      })
    })
  }

  // Attach to both isolated tab session and defaultSession
  try {
    const tabSession = session.fromPartition('persist:browser-tabs')
    attachListener(tabSession)
  } catch (err) {
    console.warn('[DownloadManager] Error attaching to persist:browser-tabs session:', err)
  }

  try {
    if (session.defaultSession) {
      attachListener(session.defaultSession)
    }
  } catch (err) {
    console.warn('[DownloadManager] Error attaching to defaultSession:', err)
  }
}

export function register(ipcMain: IpcMain, getMainWindow: () => BrowserWindow | null): void {
  // Setup download interceptors
  setupDownloadManager(getMainWindow)

  // 1. Select directory via native folder picker
  secureHandle(ipcMain, 'downloads:select-directory', null, async () => {
    const win = getMainWindow()
    const settings = localStorageService.getSettings()
    const defaultDir =
      settings.downloadPath && fs.existsSync(settings.downloadPath)
        ? settings.downloadPath
        : app.getPath('downloads')

    const result = await dialog.showOpenDialog(win || undefined as any, {
      title: 'Select Download Folder',
      defaultPath: defaultDir,
      properties: ['openDirectory', 'createDirectory']
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const selected = result.filePaths[0]
      // Automatically persist to settings
      localStorageService.updateSettings({ downloadPath: selected })
      return selected
    }

    return null
  })

  // 2. Get default OS downloads directory path
  secureHandle(ipcMain, 'downloads:get-default-path', null, async () => {
    return app.getPath('downloads')
  })

  // 3. Open downloads folder in OS file explorer
  secureHandle(ipcMain, 'downloads:open-folder', Schemas.downloadsOpenFolder, async (_, targetPath?: string) => {
    const settings = localStorageService.getSettings()
    const dirToOpen =
      targetPath && fs.existsSync(targetPath)
        ? targetPath
        : settings.downloadPath && fs.existsSync(settings.downloadPath)
        ? settings.downloadPath
        : app.getPath('downloads')

    if (!fs.existsSync(dirToOpen)) {
      fs.mkdirSync(dirToOpen, { recursive: true })
    }

    await shell.openPath(dirToOpen)
    return true
  })

  // 4. Highlight specific downloaded file in OS file explorer
  secureHandle(ipcMain, 'downloads:show-in-folder', Schemas.downloadsShowInFolder, async (_, filePath: string) => {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath)
      return true
    }
    // Fall back to opening containing directory
    if (filePath) {
      const parent = path.dirname(filePath)
      if (fs.existsSync(parent)) {
        await shell.openPath(parent)
        return true
      }
    }
    return false
  })
}
