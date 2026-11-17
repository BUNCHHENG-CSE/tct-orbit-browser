import { app, shell, type IpcMain, type BrowserWindow } from 'electron'
import { register as registerTabs } from './tabs'
import { register as registerSpaces } from './spaces'
import { register as registerSettings } from './settings'
import { getAppPaths } from '../storage/paths'
import { themeManager } from '../theme/themeManager'

export function registerAllIpc(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null
): void {
  // Register domain handlers (100% local machine storage)
  registerTabs(ipcMain)
  registerSpaces(ipcMain)
  registerSettings(ipcMain)
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
}
