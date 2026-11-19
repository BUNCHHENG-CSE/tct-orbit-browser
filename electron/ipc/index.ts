import { app, shell, dialog, clipboard, webContents, type IpcMain, type BrowserWindow, type Rectangle } from 'electron'
import { register as registerTabs } from './tabs'
import { register as registerSpaces } from './spaces'
import { register as registerSettings } from './settings'
import { register as registerPrivacy } from './privacy'
import { register as registerDownloads } from './downloads'
import { register as registerBackup } from './backup'
import { getAppPaths } from '../storage/paths'
import { themeManager } from '../theme/themeManager'
import { devtoolsManager } from '../devtools/devtoolsManager'
import { secureHandle, secureOn, Schemas } from '../security'

export function registerAllIpc(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null
): void {
  // Register domain handlers (100% local machine storage)
  registerTabs(ipcMain)
  registerSpaces(ipcMain)
  registerSettings(ipcMain)
  registerPrivacy(ipcMain)
  registerDownloads(ipcMain, getMainWindow)
  registerBackup(ipcMain, getMainWindow)
  themeManager.init(ipcMain, getMainWindow)

  // App channel metadata & versioning
  secureHandle(ipcMain, 'app:getInfo', null, () => {
    const paths = getAppPaths()
    return {
      name: paths.channelMeta.displayName,
      version: app.getVersion(),
      channel: paths.channelMeta.channel
    }
  })

  secureOn(ipcMain, 'app:getInfoSync', null, (event) => {
    const paths = getAppPaths()
    event.returnValue = {
      name: paths.channelMeta.displayName,
      version: app.getVersion(),
      channel: paths.channelMeta.channel
    }
  })

  // Window controls
  secureHandle(ipcMain, 'window:minimize', null, () => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) win.minimize()
  })

  secureHandle(ipcMain, 'window:maximize', null, () => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      if (win.isMaximized()) {
        win.unmaximize()
      } else {
        win.maximize()
      }
    }
  })

  secureHandle(ipcMain, 'window:close', null, () => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) win.close()
  })

  secureHandle(ipcMain, 'window:isMaximized', null, () => {
    const win = getMainWindow()
    return win && !win.isDestroyed() ? win.isMaximized() : false
  })

  secureHandle(ipcMain, 'window:setTitle', Schemas.windowSetTitle, (_, title: string) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed() && typeof title === 'string') {
      win.setTitle(title)
    }
  })

  // External navigation
  secureHandle(ipcMain, 'navigation:openExternal', Schemas.navigationOpenExternal, async (_, url: string) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url)
    }
  })

  // DevTools docked and inspect controls
  secureHandle(ipcMain, 'devtools:open', Schemas.devtoolsOpen, async (_, { webContentsId, bounds }: { webContentsId?: number; bounds?: Rectangle }) => {
    if (webContentsId) {
      const wc = webContents.fromId(webContentsId)
      if (wc && !wc.isDestroyed()) devtoolsManager.openDocked(wc, bounds)
    }
  })

  secureHandle(ipcMain, 'devtools:inspect', Schemas.devtoolsInspect, async (_, { webContentsId, x, y, bounds }: { webContentsId: number; x: number; y: number; bounds?: Rectangle }) => {
    const wc = webContents.fromId(webContentsId)
    if (wc && !wc.isDestroyed()) {
      devtoolsManager.inspectElement(wc, x, y, bounds)
    }
  })

  secureHandle(ipcMain, 'devtools:update-bounds', Schemas.devtoolsBounds, async (_, bounds: Rectangle) => {
    devtoolsManager.updateBounds(bounds)
  })

  secureHandle(ipcMain, 'devtools:detach', null, async () => {
    devtoolsManager.detach()
  })

  secureHandle(ipcMain, 'devtools:close', null, async () => {
    devtoolsManager.closeDocked()
  })

  secureHandle(ipcMain, 'devtools:getState', null, async () => {
    return devtoolsManager.getState()
  })

  secureHandle(ipcMain, 'devtools:sync-active-tab', Schemas.devtoolsSyncTab, async (_, { webContentsId }: { webContentsId: number }) => {
    const wc = webContents.fromId(webContentsId)
    if (wc && !wc.isDestroyed()) {
      devtoolsManager.syncActiveTab(wc)
    }
  })

  // Webview Whitelisted Context-Menu Action Proxy
  secureHandle(
    ipcMain,
    'webview:call',
    Schemas.webviewCall,
    async (_, { webContentsId, method, args = [] }: { webContentsId: number; method: string; args?: any[] }) => {
      const wc = webContents.fromId(webContentsId)
      if (!wc || wc.isDestroyed()) return false

      // Guard: only allow calling on webview contexts, never UI window or external frames
      if (wc.getType() !== 'webview') {
        console.warn(`[Security] Rejected webview:call on non-webview contents id ${webContentsId}`)
        return false
      }

      if (typeof (wc as any)[method] === 'function') {
        try {
          return (wc as any)[method](...args)
        } catch (err) {
          console.error(`[IPC webview:call] Error calling ${method}:`, err)
          return false
        }
      }
      return false
    }
  )

  // Save webpage as HTML complete
  secureHandle(ipcMain, 'page:save-as', Schemas.webContentsTarget, async (_, { webContentsId }: { webContentsId: number }) => {
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
  secureHandle(ipcMain, 'page:capture-screenshot', Schemas.webContentsTarget, async (_, { webContentsId }: { webContentsId: number }) => {
    const wc = webContents.fromId(webContentsId)
    if (wc && !wc.isDestroyed()) {
      try {
        const img = await wc.capturePage()
        const clip = clipboard as any
        if (typeof clip.writeImage === 'function') {
          clip.writeImage(img)
        } else if (typeof clip.write === 'function') {
          const pngBuffer = new Uint8Array(img.toPNG())
          const blob = new Blob([pngBuffer], { type: 'image/png' })
          const ItemClass = clip.ClipboardItem || (globalThis as any).ClipboardItem
          if (ItemClass) {
            await clip.write([new ItemClass({ 'image/png': blob })])
          }
        }
        return true
      } catch (err) {
        console.error('[IPC page:capture-screenshot] Error capturing page:', err)
      }
    }
    return false
  })
}
