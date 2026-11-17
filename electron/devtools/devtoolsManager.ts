import { app, BrowserWindow, WebContentsView, type Rectangle, type WebContents } from 'electron'
import { getBrowserLogoPath } from '../resources'
import { themeManager } from '../theme/themeManager'

const devtoolsScrollbarCss = `
  :root, * {
    scrollbar-width: thin !important;
    scrollbar-color: rgba(128, 128, 144, 0.4) transparent !important;
  }
  ::-webkit-scrollbar {
    width: 5px !important;
    height: 5px !important;
  }
  ::-webkit-scrollbar-track {
    background: transparent !important;
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(128, 128, 144, 0.38) !important;
    border-radius: 9999px !important;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: rgba(128, 128, 144, 0.65) !important;
  }
  ::-webkit-scrollbar-thumb:active {
    background: rgba(128, 128, 144, 0.85) !important;
  }
  ::-webkit-scrollbar-corner {
    background: transparent !important;
  }
  ::-webkit-scrollbar-button {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
  }
`

export class DevToolsManager {
  private mainWindow: BrowserWindow | null = null
  private devToolsView: WebContentsView | null = null
  private detachedWindow: BrowserWindow | null = null
  private isDockedOpen: boolean = false
  private currentTargetWebContents: WebContents | null = null
  private currentBounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 }

  public init(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow
    this.mainWindow.on('resize', () => {
      this.handleWindowResize()
    })
  }

  private handleWindowResize(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed() || !this.devToolsView || !this.isDockedOpen) {
      return
    }
    try {
      const { width: winWidth, height: winHeight } = this.mainWindow.getContentBounds()
      const width = Math.min(Math.round(winWidth * 0.75), Math.max(280, this.currentBounds.width || 480))
      const topY = this.currentBounds.y || 40
      const newBounds: Rectangle = {
        x: winWidth - width,
        y: topY,
        width,
        height: Math.max(0, winHeight - topY)
      }
      this.currentBounds = newBounds
      this.devToolsView.setBounds(newBounds)
    } catch {}
  }

  public applyScrollbar(wc: WebContents): void {
    if (!wc || wc.isDestroyed()) return
    wc.insertCSS(devtoolsScrollbarCss).catch(() => {})
  }

  private ensureDevToolsView(): WebContentsView {
    if (!this.devToolsView) {
      this.devToolsView = new WebContentsView()
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.contentView.addChildView(this.devToolsView)
      }
      this.devToolsView.setVisible(false)

      const apply = () => {
        if (this.devToolsView && !this.devToolsView.webContents.isDestroyed()) {
          this.applyScrollbar(this.devToolsView.webContents)
        }
      }
      this.devToolsView.webContents.on('dom-ready', apply)
      this.devToolsView.webContents.on('did-finish-load', apply)
    }
    return this.devToolsView
  }

  /**
   * Open docked right-side DevTools
   */
  public openDocked(targetWebContents: WebContents, bounds?: Rectangle): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return

    // If already open in a detached window, focus that window
    if (this.detachedWindow && !this.detachedWindow.isDestroyed()) {
      targetWebContents.setDevToolsWebContents(this.detachedWindow.webContents)
      targetWebContents.openDevTools()
      this.detachedWindow.show()
      this.detachedWindow.focus()
      return
    }

    const view = this.ensureDevToolsView()
    this.currentTargetWebContents = targetWebContents

    if (bounds) {
      this.currentBounds = bounds
      view.setBounds(bounds)
    }

    try {
      targetWebContents.setDevToolsWebContents(view.webContents)
      targetWebContents.openDevTools()
      view.setVisible(true)
      this.isDockedOpen = true
      this.applyScrollbar(view.webContents)
      setTimeout(() => this.applyScrollbar(view.webContents), 80)
      setTimeout(() => this.applyScrollbar(view.webContents), 300)
      this.broadcastState()
    } catch (err) {
      console.error('[DevToolsManager] Failed to open docked DevTools:', err)
    }
  }

  /**
   * Inspect element at specific coordinates
   */
  public inspectElement(targetWebContents: WebContents, x: number, y: number, bounds?: Rectangle): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return

    // If detached window is active
    if (this.detachedWindow && !this.detachedWindow.isDestroyed()) {
      this.currentTargetWebContents = targetWebContents
      targetWebContents.setDevToolsWebContents(this.detachedWindow.webContents)
      targetWebContents.openDevTools()
      targetWebContents.inspectElement(x, y)
      this.detachedWindow.show()
      this.detachedWindow.focus()
      this.applyScrollbar(this.detachedWindow.webContents)
      return
    }

    // Otherwise use docked pane
    const view = this.ensureDevToolsView()
    this.currentTargetWebContents = targetWebContents

    if (bounds) {
      this.currentBounds = bounds
      view.setBounds(bounds)
    }

    try {
      targetWebContents.setDevToolsWebContents(view.webContents)
      targetWebContents.openDevTools()
      view.setVisible(true)
      this.isDockedOpen = true

      targetWebContents.inspectElement(x, y)
      view.webContents.focus()
      this.applyScrollbar(view.webContents)
      setTimeout(() => this.applyScrollbar(view.webContents), 80)
      setTimeout(() => this.applyScrollbar(view.webContents), 300)
      this.broadcastState()
    } catch (err) {
      console.error('[DevToolsManager] Error in inspectElement:', err)
    }
  }

  /**
   * Update docked view bounds on window resize or splitter drag
   */
  public updateBounds(bounds: Rectangle): void {
    this.currentBounds = bounds
    if (this.devToolsView && this.isDockedOpen) {
      this.devToolsView.setBounds(bounds)
    }
  }

  /**
   * Detach DevTools to an independent BrowserWindow
   */
  public detach(): void {
    if (!this.currentTargetWebContents || this.currentTargetWebContents.isDestroyed()) {
      return
    }

    // Close docked pane first
    this.closeDocked()

    if (this.detachedWindow && !this.detachedWindow.isDestroyed()) {
      this.detachedWindow.focus()
      return
    }

    const startupTheme = themeManager.getStartupTheme()
    const browserLogoPath = getBrowserLogoPath()

    this.detachedWindow = new BrowserWindow({
      title: 'Developer Tools - TCT Orbit',
      icon: browserLogoPath,
      width: 900,
      height: 700,
      backgroundColor: startupTheme.backgroundColor,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    const applyDetached = () => {
      if (this.detachedWindow && !this.detachedWindow.webContents.isDestroyed()) {
        this.applyScrollbar(this.detachedWindow.webContents)
      }
    }
    this.detachedWindow.webContents.on('dom-ready', applyDetached)
    this.detachedWindow.webContents.on('did-finish-load', applyDetached)

    this.detachedWindow.on('closed', () => {
      this.detachedWindow = null
      this.broadcastState()
    })

    try {
      this.currentTargetWebContents.setDevToolsWebContents(this.detachedWindow.webContents)
      this.currentTargetWebContents.openDevTools()
      this.applyScrollbar(this.detachedWindow.webContents)
      setTimeout(applyDetached, 80)
      setTimeout(applyDetached, 300)
      this.broadcastState()
    } catch (err) {
      console.error('[DevToolsManager] Failed to attach detached DevTools:', err)
    }
  }

  /**
   * Re-sync DevTools target when switching active tab
   */
  public syncActiveTab(targetWebContents: WebContents): void {
    this.currentTargetWebContents = targetWebContents

    if (this.detachedWindow && !this.detachedWindow.isDestroyed()) {
      try {
        targetWebContents.setDevToolsWebContents(this.detachedWindow.webContents)
        targetWebContents.openDevTools()
        this.applyScrollbar(this.detachedWindow.webContents)
      } catch {}
      return
    }

    if (this.isDockedOpen && this.devToolsView) {
      try {
        targetWebContents.setDevToolsWebContents(this.devToolsView.webContents)
        targetWebContents.openDevTools()
        this.applyScrollbar(this.devToolsView.webContents)
      } catch {}
    }
  }

  /**
   * Close docked DevTools
   */
  public closeDocked(): void {
    if (this.devToolsView) {
      this.devToolsView.setVisible(false)
      this.devToolsView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    }
    if (this.currentTargetWebContents && !this.currentTargetWebContents.isDestroyed()) {
      try {
        this.currentTargetWebContents.closeDevTools()
      } catch {}
    }
    this.isDockedOpen = false
    this.broadcastState()
  }

  /**
   * Close all DevTools
   */
  public closeAll(): void {
    this.closeDocked()
    if (this.detachedWindow && !this.detachedWindow.isDestroyed()) {
      this.detachedWindow.close()
      this.detachedWindow = null
    }
  }

  public getState(): { isOpen: boolean; isDetached: boolean; isDocked: boolean } {
    return {
      isOpen: this.isDockedOpen || (this.detachedWindow !== null && !this.detachedWindow.isDestroyed()),
      isDetached: this.detachedWindow !== null && !this.detachedWindow.isDestroyed(),
      isDocked: this.isDockedOpen
    }
  }

  private broadcastState(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('devtools:state-changed', this.getState())
    }
  }
}

export const devtoolsManager = new DevToolsManager()
