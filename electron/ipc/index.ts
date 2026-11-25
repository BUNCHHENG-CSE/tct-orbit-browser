import {
  app,
  shell,
  dialog,
  webContents,
  session,
  type IpcMain,
  BrowserWindow,
  type Rectangle
} from 'electron'
import fs from 'fs'
import os from 'os'
import { register as registerTabs } from './tabs'
import { register as registerSpaces } from './spaces'
import { register as registerSettings } from './settings'
import { register as registerPrivacy } from './privacy'
import { register as registerDownloads, rememberExportedFile } from './downloads'
import { register as registerBackup } from './backup'
import { register as registerHistory } from './history'
import { register as registerNotes } from './notes'
import { register as registerBookmarks } from './bookmarks'
import { register as registerSite } from './site'
import { register as registerFeatures } from './features'
import { register as registerBrowserFeatures } from './browserFeatures'
import { register as registerSmart } from './smart'
import { register as registerEssentials } from './essentials'
import { copyPng } from '../essentials/capture'
import { getAppPaths } from '../storage/paths'
import { themeManager } from '../theme/themeManager'
import { devtoolsManager } from '../devtools/devtoolsManager'
import { secureHandle, secureOn, Schemas } from '../security'
import { getPersistentTabSessions } from '../sessions'

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
  registerHistory(ipcMain)
  registerNotes(ipcMain)
  registerBookmarks(ipcMain)
  registerSite(ipcMain)
  registerFeatures(ipcMain, getMainWindow)
  registerBrowserFeatures(ipcMain, getMainWindow)
  registerSmart(ipcMain)
  registerEssentials(ipcMain)
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

  // Window controls act on the window that asked (main or private window)
  const senderWindow = (event: { sender: Electron.WebContents }) => BrowserWindow.fromWebContents(event.sender) ?? getMainWindow()

  secureHandle(ipcMain, 'window:minimize', null, (event) => {
    const win = senderWindow(event)
    if (win && !win.isDestroyed()) win.minimize()
  })

  secureHandle(ipcMain, 'window:maximize', null, (event) => {
    const win = senderWindow(event)
    if (win && !win.isDestroyed()) {
      if (win.isMaximized()) {
        win.unmaximize()
      } else {
        win.maximize()
      }
    }
  })

  secureHandle(ipcMain, 'window:close', null, (event) => {
    const win = senderWindow(event)
    if (win && !win.isDestroyed()) win.close()
  })

  secureHandle(ipcMain, 'window:isMaximized', null, (event) => {
    const win = senderWindow(event)
    return win && !win.isDestroyed() ? win.isMaximized() : false
  })

  secureHandle(ipcMain, 'window:setTitle', Schemas.windowSetTitle, (event, title: string) => {
    const win = senderWindow(event)
    if (win && !win.isDestroyed() && typeof title === 'string') {
      win.setTitle(title)
    }
  })

  secureHandle(ipcMain, 'window:toggleFullScreen', null, (event) => {
    const win = senderWindow(event)
    if (win && !win.isDestroyed()) {
      const isFull = win.isFullScreen()
      win.setFullScreen(!isFull)
      return !isFull
    }
    return false
  })

  secureHandle(ipcMain, 'window:isFullScreen', null, (event) => {
    const win = senderWindow(event)
    return win && !win.isDestroyed() ? win.isFullScreen() : false
  })

  secureHandle(ipcMain, 'window:setFullScreen', Schemas.windowSetFullScreen, (event, flag: boolean) => {
    const win = senderWindow(event)
    if (win && !win.isDestroyed()) {
      win.setFullScreen(flag)
      return flag
    }
    return false
  })

  // System & Task Manager Process Metrics
  secureHandle(ipcMain, 'system:get-process-metrics', null, async () => {
    const rawMetrics = app.getAppMetrics()
    const allWcs = webContents.getAllWebContents()
    const wcByPid = new Map<number, { id: number; title: string; url: string; type: string }>()

    for (const wc of allWcs) {
      if (!wc.isDestroyed()) {
        try {
          const pid = wc.getOSProcessId()
          wcByPid.set(pid, {
            id: wc.id,
            title: wc.getTitle() || 'Untitled Tab',
            url: wc.getURL() || '',
            type: wc.getType()
          })
        } catch {}
      }
    }

    let totalAppMemoryKB = 0

    const processes = rawMetrics.map((metric) => {
      const workingSetKB = metric.memory.workingSetSize || 0
      totalAppMemoryKB += workingSetKB
      const memoryMB = Math.round((workingSetKB / 1024) * 10) / 10
      const cpuPercent = Math.round((metric.cpu.percentCPUUsage || 0) * 10) / 10

      const wcInfo = wcByPid.get(metric.pid)
      // A web page tab = a <webview>. Chromium also reports the browser's own interface as a
      // "Tab" renderer (webContents type 'window'): that is TCT Orbit itself, not a page.
      const isAppUi = wcInfo?.type === 'window'
      const isTab = wcInfo?.type === 'webview'

      return {
        pid: metric.pid,
        type: metric.type,
        cpuPercent,
        memoryMB,
        title: wcInfo?.title,
        url: wcInfo?.url,
        webContentsId: wcInfo?.id,
        isTab: !!isTab,
        isAppUi,
        // Renderer with no page attached: service worker, extension page or Chromium's spare renderer
        isWorker: metric.type === 'Tab' && !wcInfo,
        // Only web page tabs can be ended: ending the GPU / network / main process or the
        // interface just crashes or restarts it and frees nothing
        killable: wcInfo?.type === 'webview'
      }
    })

    const totalMemBytes = os.totalmem()
    const freeMemBytes = os.freemem()

    return {
      processes,
      totalAppMemoryMB: Math.round((totalAppMemoryKB / 1024) * 10) / 10,
      systemFreeMemoryMB: Math.round((freeMemBytes / (1024 * 1024)) * 10) / 10,
      systemTotalMemoryMB: Math.round((totalMemBytes / (1024 * 1024)) * 10) / 10
    }
  })

  secureHandle(ipcMain, 'system:kill-process', Schemas.processKill, async (_, { pid, webContentsId }: { pid?: number; webContentsId?: number }) => {
    // Only web page tabs (<webview> renderers) may be ended. Never process.kill() an arbitrary
    // PID: that could end the GPU / network service, the interface, or another program entirely.
    const isWebPage = (wc: Electron.WebContents | undefined | null): wc is Electron.WebContents =>
      !!wc && !wc.isDestroyed() && wc.getType() === 'webview'
    try {
      if (webContentsId) {
        const wc = webContents.fromId(webContentsId)
        if (!isWebPage(wc)) return false
        wc.forcefullyCrashRenderer()
        return true
      }
      if (pid) {
        const wc = webContents.getAllWebContents().find((w) => isWebPage(w) && w.getOSProcessId() === pid)
        if (!wc) return false
        wc.forcefullyCrashRenderer()
        return true
      }
    } catch (err) {
      console.error('[IPC system:kill-process] Error killing process:', err)
    }
    return false
  })

  // Purge caches and force V8 garbage collection
  secureHandle(ipcMain, 'system:trim-memory', null, async () => {
    try {
      await session.defaultSession.clearCache()
      session.defaultSession.clearHostResolverCache()

      for (const tabSession of getPersistentTabSessions()) {
        await tabSession.clearCache()
        tabSession.clearHostResolverCache()
      }

      const allWcs = webContents.getAllWebContents()
      for (const wc of allWcs) {
        if (!wc.isDestroyed()) {
          try {
            wc.executeJavaScript('if (window.gc) window.gc();', true).catch(() => {})
          } catch {}
        }
      }

      if (typeof (global as any).gc === 'function') {
        try {
          ;(global as any).gc()
        } catch {}
      }

      return true
    } catch (err) {
      console.error('[IPC system:trim-memory] Error trimming memory:', err)
      return false
    }
  })

  // External navigation
  secureHandle(ipcMain, 'navigation:openExternal', Schemas.navigationOpenExternal, async (_, url: string) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url)
    }
  })

  // DevTools docked and inspect controls
  secureHandle(ipcMain, 'devtools:open', Schemas.devtoolsOpen, async (event, { webContentsId, bounds }: { webContentsId?: number; bounds?: Rectangle }) => {
    if (webContentsId) {
      const wc = webContents.fromId(webContentsId)
      const fromWin = BrowserWindow.fromWebContents(event.sender)
      if (wc && !wc.isDestroyed() && fromWin && fromWin !== getMainWindow()) {
        wc.openDevTools({ mode: 'detach' })
        return
      }
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

  secureHandle(ipcMain, 'devtools:overlay-rects', Schemas.devtoolsOverlayRects, async (_, rects: Rectangle[]) => {
    devtoolsManager.setOverlayRects(rects)
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

      if (wc.getType() !== 'webview') {
        console.warn(`[Security] Rejected webview:call on non-webview contents id ${webContentsId}`)
        return false
      }

      // Saving a link or image: web addresses only (data: images are fine, file: is not)
      if (method === 'downloadURL' && !/^(https?:|data:image\/|blob:)/i.test(String(args[0] ?? ''))) return false

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
  secureHandle(ipcMain, 'page:save-as', Schemas.webContentsTarget, async (event, { webContentsId }: { webContentsId: number }) => {
    const wc = webContents.fromId(webContentsId)
    const win = senderWindow(event)
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

  // Save webpage as PDF
  secureHandle(ipcMain, 'page:save-pdf', Schemas.webContentsTarget, async (event, { webContentsId }: { webContentsId: number }) => {
    const wc = webContents.fromId(webContentsId)
    const win = senderWindow(event)
    if (wc && win && !wc.isDestroyed() && !win.isDestroyed()) {
      try {
        const title = (wc.getTitle() || 'document').replace(/[/\\?%*:|"<>]/g, '_')
        const res = await dialog.showSaveDialog(win, {
          title: 'Save Page as PDF',
          defaultPath: `${title}.pdf`,
          filters: [
            { name: 'PDF Document', extensions: ['pdf'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        })
        if (!res.canceled && res.filePath) {
          const pdfBuffer = await wc.printToPDF({
            printBackground: true,
            preferCSSPageSize: true
          })
          await fs.promises.writeFile(res.filePath, pdfBuffer)
          rememberExportedFile(res.filePath)
          return { success: true, filePath: res.filePath }
        }
        return { success: false, canceled: true }
      } catch (err: any) {
        console.error('[IPC page:save-pdf] Error exporting PDF:', err)
        return { success: false, error: err?.message || 'Failed to generate PDF' }
      }
    }
    return { success: false, error: 'WebContents or window unavailable' }
  })

  // Capture screenshot of webContents and write to clipboard
  secureHandle(ipcMain, 'page:capture-screenshot', Schemas.webContentsTarget, async (_, { webContentsId }: { webContentsId: number }) => {
    const wc = webContents.fromId(webContentsId)
    if (wc && !wc.isDestroyed()) {
      try {
        const img = await wc.capturePage()
        return await copyPng(img.toPNG())
      } catch (err) {
        console.error('[IPC page:capture-screenshot] Error capturing page:', err)
      }
    }
    return false
  })
}
