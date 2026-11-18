import { app, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { getAppPaths } from '../storage/paths'
import { themeManager } from '../theme/themeManager'
import { getBrowserLogoPath } from '../resources'
import { setupMainWindowSecurity } from '../security'

export function createMainWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const paths = getAppPaths()
  const startupTheme = themeManager.getStartupTheme()

  const preloadPath = existsSync(join(__dirname, '../preload/index.js'))
    ? join(__dirname, '../preload/index.js')
    : join(__dirname, '../preload/preload.js')

  const browserLogoPath = getBrowserLogoPath()
  const winIcon = process.platform === 'win32' && existsSync(join(process.cwd(), 'build/icon.ico'))
    ? join(process.cwd(), 'build/icon.ico')
    : browserLogoPath

  const mainWindow = new BrowserWindow({
    title: paths.channelMeta.displayName,
    icon: winIcon || browserLogoPath,
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
      nodeIntegrationInWorker: false,
      sandbox: true,
      webviewTag: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      backgroundThrottling: true
    }
  })

  // Attach strict security controls (WebRTC leak prevention, navigation blockers, anti-tampering)
  setupMainWindowSecurity(mainWindow)

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

  // In development mode only, provide Inspect UI Element context menu for browser chrome
  if (!app.isPackaged) {
    mainWindow.webContents.on('context-menu', (_event, params) => {
      const { Menu, MenuItem } = require('electron')
      const menu = new Menu()
      menu.append(
        new MenuItem({
          label: 'Inspect UI Element',
          click: () => mainWindow.webContents.inspectElement(params.x, params.y)
        })
      )
      menu.popup()
    })
  }

  // Load renderer via dev server URL (with HMR) or production HTML
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}
