import { app, BrowserWindow, shell, nativeTheme } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { getAppPaths } from '../storage/paths'
import { themeManager } from '../theme/themeManager'

export function createMainWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const paths = getAppPaths()
  const startupTheme = themeManager.getStartupTheme()

  const preloadPath = existsSync(join(__dirname, '../preload/index.js'))
    ? join(__dirname, '../preload/index.js')
    : join(__dirname, '../preload/preload.js')

  const baseDir = app.isPackaged ? process.resourcesPath : process.cwd()
  const iconPath = process.platform === 'win32'
    ? join(baseDir, 'build/icon.ico')
    : join(baseDir, 'resources/icon.png')

  const resolvedIcon = existsSync(iconPath)
    ? iconPath
    : (existsSync(join(process.cwd(), 'build/icon.ico')) ? join(process.cwd(), 'build/icon.ico') : undefined)

  const mainWindow = new BrowserWindow({
    title: paths.channelMeta.displayName,
    icon: resolvedIcon,
    width: 1280,
    height: 850,
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
      webviewTag: true,
      webSecurity: true,
      spellcheck: true
    }
  })

  // Apply initial chrome & titleBarOverlay styling if supported
  themeManager.updateWindowChrome(mainWindow, startupTheme.resolved)

  // Keep window native background synchronized to active theme
  nativeTheme.on('updated', () => {
    if (!mainWindow.isDestroyed()) {
      const currentResolved = themeManager.resolveTheme(themeManager.getState().mode)
      themeManager.updateWindowChrome(mainWindow, currentResolved)
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Prevent renderer from navigating away or opening unwanted native windows directly
  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const parsed = new URL(details.url)
      if (['http:', 'https:'].includes(parsed.protocol)) {
        shell.openExternal(details.url)
      } else {
        console.warn(`[Security] Blocked opening external URL with protocol: ${parsed.protocol}`)
      }
    } catch {
      // Ignore malformed or invalid URLs
    }
    return { action: 'deny' }
  })

  // Load renderer via dev server URL (with HMR) or production HTML
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}
