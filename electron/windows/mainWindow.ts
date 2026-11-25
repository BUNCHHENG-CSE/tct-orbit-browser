import { app, BrowserWindow, nativeTheme, Menu, type MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { getAppPaths } from '../storage/paths'
import { themeManager } from '../theme/themeManager'
import { getAppNativeIcon, getBrowserLogoPath } from '../resources'
import { setupMainWindowSecurity } from '../security'
import { devServerUrl } from '../appUi'
import { getInitialWindowState, trackWindowState } from './windowState'
import { PRIVATE_WINDOW_QUERY } from '../../shared/privateWindow'
import { EXTRA_WINDOW_QUERY } from '../../shared/extraWindow'

export interface CreateWindowOptions {
  /** Private window: only private tabs, own size, no saved window position */
  private?: boolean
  /** Extra window: id of its virtual space (shared/extraWindow.ts) */
  extraSpaceId?: string
  /** Space whose notes and color an extra window uses */
  baseSpaceId?: string
}

export function createMainWindow(options: CreateWindowOptions = {}): BrowserWindow {
  const isPrivate = !!options.private
  // Private and extra windows: not the main window, so no saved size and position
  const isSecondary = isPrivate || !!options.extraSpaceId
  const isMac = process.platform === 'darwin'
  const paths = getAppPaths()
  const startupTheme = themeManager.getStartupTheme()

  const preloadPath = existsSync(join(__dirname, '../preload/index.js'))
    ? join(__dirname, '../preload/index.js')
    : join(__dirname, '../preload/preload.js')

  const appIcon = getAppNativeIcon()

  // First launch: maximized. Later launches: last size/position/maximized state.
  const initialState = getInitialWindowState()
  const startMaximized = !isSecondary && (initialState.maximize || initialState.fullScreen)
  // Private windows open a bit smaller, centered (like Edge InPrivate)
  const bounds = isSecondary
    ? { width: Math.max(900, Math.round((initialState.bounds.width || 1280) * 0.85)), height: Math.max(640, Math.round((initialState.bounds.height || 800) * 0.85)) }
    : initialState.bounds

  const mainWindow = new BrowserWindow({
    title: isPrivate ? `${paths.channelMeta.displayName} — Private` : paths.channelMeta.displayName,
    icon: appIcon,
    ...bounds,
    ...(isSecondary ? { center: true } : {}),
    minWidth: 480,
    minHeight: 400,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: startupTheme.backgroundColor,
    frame: false,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: isMac ? { x: 16, y: 13 } : undefined,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webviewTag: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      backgroundThrottling: true
    }
  })

  // Explicitly apply native icon to window handle for Windows Taskbar & Alt-Tab
  if (process.platform === 'win32') {
    mainWindow.setIcon(appIcon)
  }

  // Attach strict security controls (WebRTC leak prevention, navigation blockers, anti-tampering)
  setupMainWindowSecurity(mainWindow)

  // Apply initial chrome & titleBarOverlay styling if supported
  themeManager.updateWindowChrome(mainWindow, startupTheme.resolved)

  // Keep window native background synchronized to active theme
  const onThemeUpdated = () => {
    if (!mainWindow.isDestroyed()) {
      const currentResolved = themeManager.resolveTheme(themeManager.getState().mode)
      themeManager.updateWindowChrome(mainWindow, currentResolved)
    }
  }
  nativeTheme.on('updated', onThemeUpdated)
  mainWindow.once('closed', () => nativeTheme.removeListener('updated', onThemeUpdated))

  const showWindow = () => {
    if (mainWindow.isDestroyed() || mainWindow.isVisible()) return
    if (startMaximized) {
      mainWindow.maximize()
    }
    mainWindow.show()
  }

  mainWindow.once('ready-to-show', showWindow)
  // Only the main window remembers its size and position
  if (!isSecondary) trackWindowState(mainWindow)

  // Ensure window always displays even if ready-to-show event is delayed by HMR/compilation
  setTimeout(() => {
    showWindow()
  }, 1000)

  // Cut / Copy / Paste in the browser's own text boxes (address bar, search, notes ...)
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const items: MenuItemConstructorOptions[] = []
    const { editFlags } = params
    if (params.isEditable) {
      items.push(
        { role: 'undo', enabled: editFlags.canUndo },
        { type: 'separator' },
        { role: 'cut', enabled: editFlags.canCut },
        { role: 'copy', enabled: editFlags.canCopy },
        { role: 'paste', enabled: editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll', label: 'Select all', enabled: editFlags.canSelectAll }
      )
    } else if (params.selectionText.trim()) {
      items.push({ role: 'copy' })
    }
    if (!app.isPackaged) {
      items.push({ label: 'Inspect UI Element', click: () => mainWindow.webContents.inspectElement(params.x, params.y) })
    }
    if (items.length > 0) Menu.buildFromTemplate(items).popup({ window: mainWindow })
  })

  // Load renderer via dev server URL (with HMR) or production HTML
  const query: Record<string, string> = {}
  if (isPrivate) query.window = PRIVATE_WINDOW_QUERY
  else if (options.extraSpaceId) {
    query.window = EXTRA_WINDOW_QUERY
    query.space = options.extraSpaceId
    if (options.baseSpaceId) query.base = options.baseSpaceId
  }
  const devUrl = devServerUrl()
  if (devUrl) {
    const url = new URL(devUrl)
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
    mainWindow.loadURL(url.toString())
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'), { query })
  }

  return mainWindow
}
