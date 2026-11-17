import { app, shell, dialog, clipboard, webContents, type IpcMain, type BrowserWindow, type Rectangle } from 'electron'
import { register as registerTabs } from './tabs'
import { register as registerSpaces } from './spaces'
import { register as registerSettings } from './settings'
import { register as registerPrivacy } from './privacy'
import { getAppPaths } from '../storage/paths'
import { themeManager } from '../theme/themeManager'
import { devtoolsManager } from '../devtools/devtoolsManager'

export function registerAllIpc(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null
): void {
  // Register domain handlers (100% local machine storage)
  registerTabs(ipcMain)
  registerSpaces(ipcMain)
  registerSettings(ipcMain)
  registerPrivacy(ipcMain)
  themeManager.init(ipcMain, getMainWindow)

  // App channel metadata & versioning
  ipcMain.handle('app:getInfo', () => {
    const paths = getAppPaths()
    return {
      name: paths.channelMeta.displayName,
      version: app.getVersion(),
      channel: paths.channelMeta.channel
    }
  })

  ipcMain.on('app:getInfoSync', (event) => {
    const paths = getAppPaths()
    event.returnValue = {
      name: paths.channelMeta.displayName,
      version: app.getVersion(),
      channel: paths.channelMeta.channel
    }
  })

  // Window controls
  ipcMain.handle('window:minimize', () => {
    const win = getMainWindow()
    if (win) win.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize()
      } else {
        win.maximize()
      }
    }
  })

  ipcMain.handle('window:close', () => {
    const win = getMainWindow()
    if (win) win.close()
  })

  ipcMain.handle('window:isMaximized', () => {
    const win = getMainWindow()
    return win ? win.isMaximized() : false
  })

  ipcMain.handle('window:setTitle', (_, title: string) => {
    const win = getMainWindow()
    if (win && typeof title === 'string') {
      win.setTitle(title)
    }
  })

  // External navigation
  ipcMain.handle('navigation:openExternal', async (_, url: string) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url)
    }
  })

  // DevTools docked and inspect controls
  ipcMain.handle('devtools:open', async (_, { webContentsId, bounds }: { webContentsId?: number; bounds?: Rectangle }) => {
    if (webContentsId) {
      const wc = webContents.fromId(webContentsId)
      if (wc) devtoolsManager.openDocked(wc, bounds)
    }
  })

  ipcMain.handle('devtools:inspect', async (_, { webContentsId, x, y, bounds }: { webContentsId: number; x: number; y: number; bounds?: Rectangle }) => {
    const wc = webContents.fromId(webContentsId)
    if (wc) {
      devtoolsManager.inspectElement(wc, x, y, bounds)
    }
  })

  ipcMain.handle('devtools:update-bounds', async (_, bounds: Rectangle) => {
    devtoolsManager.updateBounds(bounds)
  })

  ipcMain.handle('devtools:detach', async () => {
    devtoolsManager.detach()
  })

  ipcMain.handle('devtools:close', async () => {
    devtoolsManager.closeDocked()
  })

  ipcMain.handle('devtools:getState', async () => {
    return devtoolsManager.getState()
  })

  ipcMain.handle('devtools:sync-active-tab', async (_, { webContentsId }: { webContentsId: number }) => {
    const wc = webContents.fromId(webContentsId)
    if (wc) {
      devtoolsManager.syncActiveTab(wc)
    }
  })

  // Webview Context-Menu Action Proxy
  ipcMain.handle('webview:call', async (_, { webContentsId, method, args = [] }: { webContentsId: number; method: string; args?: any[] }) => {
    const wc = webContents.fromId(webContentsId)
    if (!wc || wc.isDestroyed()) return false
    if (typeof (wc as any)[method] === 'function') {
      try {
        return (wc as any)[method](...args)
      } catch (err) {
        console.error(`[IPC webview:call] Error calling ${method}:`, err)
        return false
      }
    }
    return false
  })

  // Save webpage as HTML complete
  ipcMain.handle('page:save-as', async (_, { webContentsId }: { webContentsId: number }) => {
    const wc = webContents.fromId(webContentsId)
    const win = getMainWindow()
    if (wc && win && !wc.isDestroyed() && !win.isDestroyed()) {
      try {
        const title = (wc.getTitle() || 'webpage').replace(/[/\\?%*:|"<>]/g, '_')
        const res = await dialog.showSaveDialog(win, {
          defaultPath: `${title}.html`,
          filters: [
            { name: 'Webpage, Complete', extensions: ['html', 'htm'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        })
        if (!res.canceled && res.filePath) {
          await wc.savePage(res.filePath, 'HTMLComplete')
          return true
        }
      } catch (err) {
        console.error('[IPC page:save-as] Error saving page:', err)
      }
    }
    return false
  })

  // Capture screenshot of webContents and write to clipboard
  ipcMain.handle('page:capture-screenshot', async (_, { webContentsId }: { webContentsId: number }) => {
    const wc = webContents.fromId(webContentsId)
    if (wc && !wc.isDestroyed()) {
      try {
        const img = await wc.capturePage()
        clipboard.writeImage(img)
        return true
      } catch (err) {
        console.error('[IPC page:capture-screenshot] Error capturing page:', err)
      }
    }
    return false
  })
}
