import { app, dialog, shell, session, BrowserWindow, type IpcMain, type DownloadItem, type WebContents } from 'electron'
import path from 'path'
import fs from 'fs'
import { secureHandle, Schemas } from '../security'
import { SHARED_TAB_PARTITION, onTabSessionCreated } from '../sessions'
import { promptWindowFor } from '../essentials/windowOf'
import { PRIVATE_PARTITION } from '../privacy/types'
import { localStorageService } from '../storage/localStorage'
import { downloadsService } from '../storage/downloadsService'

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

/** Files that run code when opened: the user confirms first (a page can start a download by itself) */
const RUNS_CODE =
  /\.(exe|msi|msix|msixbundle|appx|appxbundle|appinstaller|com|scr|pif|bat|cmd|ps1|psm1|psd1|vbs|vbe|js|jse|ws|wsf|wsh|hta|cpl|msc|msp|mst|jar|jnlp|reg|lnk|url|scf|inf|chm|hlp|gadget|application|settingcontent-ms|diagcab|library-ms|search-ms|iso|img|vhd|vhdx|dll|xll|docm|xlsm|pptm|sh|bash|run|bin|appimage|deb|rpm|desktop|app|command|tool|workflow|pkg|dmg|py|pyw|rb|pl)$/i

const isDirectory = (p: string): boolean => {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

const samePath = (a: string, b: string): boolean => {
  const x = path.resolve(a)
  const y = path.resolve(b)
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y
}

/** Only files this browser downloaded can be opened or shown, never a path the caller made up */
function downloadedPath(filePath: string): string | null {
  const record = downloadsService.list().find((r) => r.savePath && samePath(r.savePath, filePath))
  return record ? path.resolve(record.savePath) : null
}

/** Files the user saved through a system dialog this run (Save as PDF ...): may be shown in the folder */
const exported = new Set<string>()
export function rememberExportedFile(filePath: string): void {
  exported.add(path.resolve(filePath))
}
function exportedPath(filePath: string): string | null {
  return [...exported].find((p) => samePath(p, filePath)) ?? null
}

let isDownloadManagerSetup = false
/** Live download handles (for pause / resume / cancel), removed when done */
const activeItems = new Map<string, DownloadItem>()

/** After the connection drops: try again on its own, waiting longer each time */
const MAX_AUTO_RESUMES = 6

/** Progress of all running downloads on the taskbar / dock icon */
function showTaskbarProgress(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return
  let total = 0
  let received = 0
  for (const item of activeItems.values()) {
    total += item.getTotalBytes()
    received += item.getReceivedBytes()
  }
  // Above 1 = "busy, size unknown"; below 0 = nothing running
  win.setProgressBar(activeItems.size === 0 ? -1 : total > 0 ? Math.min(1, received / total) : 2)
}

export function setupDownloadManager(getMainWindow: () => BrowserWindow | null): void {
  if (isDownloadManagerSetup) return
  isDownloadManagerSetup = true

  const privateSession = session.fromPartition(PRIVATE_PARTITION)
  const attachListener = (ses: Electron.Session) => {
    ses.on('will-download', (event, item: DownloadItem, _webContents: WebContents) => {
      // The window the download started in (a tab's host window: main or private window)
      // For a popup: the window that opened it
      const ownerWin = promptWindowFor(_webContents)
      const win = ownerWin ?? getMainWindow()
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
      downloadsService.addOrUpdate({
        id: downloadId,
        filename: item.getFilename(),
        totalBytes: item.getTotalBytes(),
        receivedBytes: 0,
        savePath: item.getSavePath(),
        state: 'progressing',
        startTime: new Date().toISOString(),
        url: item.getURL ? item.getURL() : undefined,
        // Private tabs: never written to downloads.json
        ephemeral: ses === privateSession
      })

      if (win && !win.isDestroyed()) {
        win.webContents.send('downloads:started', {
          id: downloadId,
          filename: item.getFilename(),
          totalBytes: item.getTotalBytes(),
          savePath: item.getSavePath()
        })
      }

      activeItems.set(downloadId, item)

      // A tab or popup that was opened only for this download has nothing to show: close it
      const page = _webContents
      if (page && !page.isDestroyed() && ['', 'about:blank'].includes(page.getURL()) && page.navigationHistory.length() <= 1) {
        const isPopup = page.getType() === 'window' && ownerWin?.webContents !== page
        if (page.getType() === 'webview' || isPopup) setTimeout(() => !page.isDestroyed() && page.close(), 300)
      }

      let autoResumes = 0
      let bestReceived = 0
      let resumeTimer: NodeJS.Timeout | null = null

      // Track progress
      item.on('updated', (_updateEvent, state) => {
        if (item.getReceivedBytes() > bestReceived) {
          bestReceived = item.getReceivedBytes()
          if (state === 'progressing') autoResumes = 0
        }
        // The network dropped (the user did not pause): continue where it stopped
        if (state === 'interrupted' && !resumeTimer && autoResumes < MAX_AUTO_RESUMES) {
          const wait = Math.min(30_000, 1000 * 2 ** autoResumes++)
          resumeTimer = setTimeout(() => {
            resumeTimer = null
            if (activeItems.get(downloadId) === item && item.getState() === 'interrupted' && item.canResume()) item.resume()
          }, wait)
        }
        showTaskbarProgress(getMainWindow())
        if (state === 'progressing' || state === 'interrupted') {
          const total = item.getTotalBytes()
          const received = item.getReceivedBytes()
          const progress = total > 0 ? Math.round((received / total) * 100) : 0

          downloadsService.addOrUpdate({
            id: downloadId,
            receivedBytes: received,
            totalBytes: total,
            state: 'progressing',
            savePath: item.getSavePath()
          })

          if (win && !win.isDestroyed()) {
            win.webContents.send('downloads:progress', {
              id: downloadId,
              filename: item.getFilename(),
              receivedBytes: received,
              totalBytes: total,
              progress,
              state: 'progressing',
              savePath: item.getSavePath(),
              // Paused by the user, or interrupted by the network (resumable)
              isPaused: item.isPaused() || state === 'interrupted',
              canResume: item.canResume(),
              bytesPerSecond: item.isPaused() || state === 'interrupted' ? 0 : item.getCurrentBytesPerSecond()
            })
          }
        }
      })

      // Track completion / interruption
      item.once('done', (_doneEvent, state) => {
        activeItems.delete(downloadId)
        if (resumeTimer) clearTimeout(resumeTimer)
        showTaskbarProgress(getMainWindow())
        const finalPath = item.getSavePath()
        const win = ownerWin && !ownerWin.isDestroyed() ? ownerWin : getMainWindow()

        downloadsService.addOrUpdate({
          id: downloadId,
          savePath: finalPath,
          state: state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted',
          receivedBytes: item.getReceivedBytes(),
          totalBytes: item.getTotalBytes(),
          endTime: new Date().toISOString()
        })

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
    const tabSession = session.fromPartition(SHARED_TAB_PARTITION)
    attachListener(tabSession)
  } catch (err) {
    console.warn('[DownloadManager] Error attaching to persist:browser-tabs session:', err)
  }

  // Space profiles (separate logins) download through the same manager
  onTabSessionCreated((ses) => {
    try {
      attachListener(ses)
    } catch (err) {
      console.warn('[DownloadManager] Error attaching to profile session:', err)
    }
  })

  try {
    // Private tabs (in-memory session) download through the same manager
    attachListener(privateSession)
  } catch (err) {
    console.warn('[DownloadManager] Error attaching to private-tabs session:', err)
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
  // (always the configured one: openPath would run a file, so no path is taken from the caller)
  secureHandle(ipcMain, 'downloads:open-folder', Schemas.downloadsOpenFolder, async () => {
    const settings = localStorageService.getSettings()
    const dirToOpen = settings.downloadPath && isDirectory(settings.downloadPath) ? settings.downloadPath : app.getPath('downloads')

    if (!fs.existsSync(dirToOpen)) {
      fs.mkdirSync(dirToOpen, { recursive: true })
    }

    await shell.openPath(dirToOpen)
    return true
  })

  // 4. Highlight specific downloaded file in OS file explorer
  secureHandle(ipcMain, 'downloads:show-in-folder', Schemas.downloadsShowInFolder, async (_, filePath: string) => {
    const file = downloadedPath(filePath) ?? exportedPath(filePath)
    if (!file) return false
    if (fs.existsSync(file)) {
      shell.showItemInFolder(file)
      return true
    }
    // Fall back to opening containing directory
    const parent = path.dirname(file)
    if (isDirectory(parent)) {
      await shell.openPath(parent)
      return true
    }
    return false
  })

  // 5. Open downloaded file directly
  secureHandle(ipcMain, 'downloads:open-file', Schemas.downloadsOpenFile, async (event, filePath: string) => {
    const file = downloadedPath(filePath)
    if (!file || !fs.existsSync(file)) return false
    // Windows ignores trailing dots and spaces: "setup.exe." runs as setup.exe
    if (RUNS_CODE.test(file.replace(/[. ]+$/, '')) || isDirectory(file)) {
      const options: Electron.MessageBoxOptions = {
        type: 'warning',
        buttons: ['Open', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
        message: `Open "${path.basename(file)}"?`,
        detail: 'This type of file can run programs and harm your computer. Open it only if you trust where it came from.'
      }
      const win = BrowserWindow.fromWebContents(event.sender)
      const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
      // Not an error: the user chose not to open it
      if (response !== 0) return true
    }
    await shell.openPath(file)
    return true
  })

  // 6. Delete file from list and optionally disk
  secureHandle(ipcMain, 'downloads:delete-file', Schemas.downloadsDeleteFile, async (_, data: { id: string; deleteDiskFile?: boolean }) => {
    // Removing a running download stops it (the partial file goes too)
    activeItems.get(data.id)?.cancel()
    return downloadsService.delete(data.id, data.deleteDiskFile)
  })

  // 7. List all download records
  secureHandle(ipcMain, 'downloads:list', null, async () => {
    return downloadsService.list()
  })

  // Pause / resume / cancel an in-progress download
  const sendState = (sender: WebContents, id: string, item: DownloadItem) => {
    if (sender.isDestroyed()) return
    sender.send('downloads:progress', {
      id,
      filename: item.getFilename(),
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      progress: item.getTotalBytes() > 0 ? Math.round((item.getReceivedBytes() / item.getTotalBytes()) * 100) : 0,
      state: 'progressing',
      savePath: item.getSavePath(),
      isPaused: item.isPaused(),
      canResume: item.canResume()
    })
  }

  secureHandle(ipcMain, 'downloads:pause', Schemas.downloadsControl, async (event, id: string) => {
    const item = activeItems.get(id)
    if (!item) return false
    item.pause()
    sendState(event.sender, id, item)
    return true
  })

  secureHandle(ipcMain, 'downloads:resume', Schemas.downloadsControl, async (event, id: string) => {
    const item = activeItems.get(id)
    if (!item || !item.canResume()) return false
    item.resume()
    sendState(event.sender, id, item)
    return true
  })

  secureHandle(ipcMain, 'downloads:cancel', Schemas.downloadsControl, async (_, id: string) => {
    const item = activeItems.get(id)
    if (item) item.cancel()
    // Nothing is running behind this entry any more
    else downloadsService.addOrUpdate({ id, state: 'cancelled', endTime: new Date().toISOString() })
    return true
  })

  // 8. Clear download history
  secureHandle(ipcMain, 'downloads:clear', null, async () => {
    return downloadsService.clear()
  })
}
