import 'dotenv/config'
import { app, BrowserWindow, ipcMain, session, nativeTheme, Menu, clipboard, dialog } from 'electron'
import { createMainWindow } from './windows/mainWindow'
import { registerAllIpc } from './ipc'
import { localStorageService } from './storage/localStorage'
import { applyNativeTheme } from './ipc/settings'
import { themeManager } from './theme/themeManager'
import { initAppPaths, runStartupMigration } from './storage/paths'

// Early channel, userData paths, and database isolation setup
const appPaths = initAppPaths()
runStartupMigration()

// Custom User-Agent configuration
// Strips Electron/<version> and app tokens, appends TCTOrbit/<version> for Google Auth & Cloudflare compatibility
function setupCustomUserAgent(): string {
  const version = app.getVersion() || '0.1.0'
  const fallback = app.userAgentFallback || ''

  let cleaned = fallback
    .replace(/Electron\/[0-9.]+\s?/gi, '')
    .replace(/(tct-orbit|tct-orbit-[a-z]+|arc-browser)\/[0-9.]+\s?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned || !cleaned.includes('Chrome/')) {
    const platformStr = process.platform === 'win32'
      ? 'Windows NT 10.0; Win64; x64'
      : process.platform === 'darwin'
      ? 'Macintosh; Intel Mac OS X 10_15_7'
      : 'X11; Linux x86_64'
    cleaned = `Mozilla/5.0 (${platformStr}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36`
  }

  const token = `TCTOrbit/${version}`
  if (!cleaned.includes(token)) {
    cleaned = `${cleaned} ${token}`
  }

  app.userAgentFallback = cleaned
  return cleaned
}

const customUserAgent = setupCustomUserAgent()

// Cross-platform engine & hardware acceleration switches
app.commandLine.appendSwitch('enable-features', 'OverlayScrollbar')

// Linux optimizations (Ubuntu, Debian, Fedora, Arch, openSUSE)
// Enables native Wayland support with auto-fallback to X11, crisp fractional scaling & GPU acceleration
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto')
  app.commandLine.appendSwitch('enable-features', 'OverlayScrollbar,WaylandWindowDecorations')
  app.commandLine.appendSwitch('enable-gpu-rasterization')
  app.commandLine.appendSwitch('enable-zero-copy')
}

// Windows optimizations (Windows 10, Windows 11, x64, ARM64 Copilot+ PCs)
if (process.platform === 'win32') {
  app.setAppUserModelId(appPaths.channelMeta.appId)
  app.commandLine.appendSwitch('enable-gpu-rasterization')
}

// macOS optimizations (Apple Silicon & Intel)
if (process.platform === 'darwin') {
  // Retain crisp subpixel font rendering
  try {
    const { systemPreferences } = require('electron')
    systemPreferences.setUserDefault?.('AppleFontSmoothing', 'integer', 2)
  } catch {
    // ignore
  }
}

// Register custom protocol client for default browser integration
if (!app.isDefaultProtocolClient(appPaths.channelMeta.userDataDirName)) {
  app.setAsDefaultProtocolClient(appPaths.channelMeta.userDataDirName)
}
if (appPaths.channelMeta.userDataDirName !== 'tct-orbit' && !app.isDefaultProtocolClient('tct-orbit')) {
  app.setAsDefaultProtocolClient('tct-orbit')
}

// Global exception handling for production stability
process.on('uncaughtException', (error) => {
  console.error('[Main Process] Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[Main Process] Unhandled Promise Rejection:', reason)
})

let mainWindow: BrowserWindow | null = null
const activeWebviewContents = new Set<Electron.WebContents>()

const getWebviewThemeScript = (_isDark?: boolean) => `
  (function() {
    try {
      var tvStyle = document.getElementById('tct-tv-theme');
      if (tvStyle && tvStyle.parentNode) tvStyle.parentNode.removeChild(tvStyle);

      var universalStyle = document.getElementById('tct-orbit-universal-theme');
      if (universalStyle && universalStyle.parentNode) universalStyle.parentNode.removeChild(universalStyle);

      if (document.documentElement) {
        document.documentElement.classList.remove('tct-force-dark');
      }
      if (document.body) {
        document.body.classList.remove('tct-force-dark');
      }

      // Clean up legacy injected localStorage keys that may interfere with site themes
      try {
        var host = (window.location.hostname || '').toLowerCase();
        if (host.indexOf('youtube.com') !== -1) {
          localStorage.removeItem('yt-theme');
        } else if (host.indexOf('tradingview.com') !== -1) {
          localStorage.removeItem('tv_theme');
        }
      } catch(e) {}
    } catch(e) {}
  })();
`

// Listen for theme updates to sync all active webviews live
nativeTheme.on('updated', () => {
  const isDark = nativeTheme.shouldUseDarkColors
  const script = getWebviewThemeScript(isDark)
  for (const wc of activeWebviewContents) {
    if (!wc.isDestroyed()) {
      if (typeof (wc as any).setBackgroundColor === 'function') {
        ;(wc as any).setBackgroundColor(isDark ? '#09090b' : '#ffffff')
      }
      wc.executeJavaScript(script).catch(() => {})
    }
  }
})

// Enforce single instance lock to prevent data corruption in local JSON storage
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  console.warn('[Main Process] Another instance is already running. Quitting duplicate instance.')
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    // Focus the main window if a second instance attempt is made
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()

      // Forward any URL passed via CLI argument (e.g. tct-orbit https://example.com)
      const urlArg = commandLine.find(
        (arg) => arg.startsWith('http://') || arg.startsWith('https://')
      )
      if (urlArg) {
        mainWindow.webContents.send('tab:create-from-external', urlArg)
      }
    }
  })

  // Handle macOS open-url event when clicked from Mail, Slack, Terminal, etc.
  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      mainWindow.webContents.send('tab:create-from-external', url)
    }
  })

  app.whenReady().then(async () => {
    // Set custom User-Agent on defaultSession for Google Auth & Cloudflare compatibility
    session.defaultSession.setUserAgent(customUserAgent)

    // Initialize 100% private local storage on user's machine
    localStorageService.init()

    // Sync saved theme preference to Chromium nativeTheme so webviews immediately inherit correct prefers-color-scheme
    const startupState = themeManager.getState()
    themeManager.applyNativeThemeSource(startupState.mode, startupState.webColorScheme)

    // Register all IPC handlers
    registerAllIpc(ipcMain, () => mainWindow)

    // Configure safe permission handling
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      const url = webContents.getURL()
      // Allow standard permissions on secure origins, deny dangerous ones
      const allowedPermissions = ['fullscreen', 'notifications', 'media']
      if (url.startsWith('https://') && allowedPermissions.includes(permission)) {
        callback(true)
      } else {
        callback(false)
      }
    })

    // Webview & window security rules: apply User-Agent, sanitize webPreferences and block dangerous protocols
    app.on('web-contents-created', (_, contents) => {
      contents.setUserAgent(customUserAgent)

      // Intercept and sanitize any attached webview preferences
      contents.on('will-attach-webview', (_event, webPreferences) => {
        delete webPreferences.preload
        delete (webPreferences as any).preloadURL
        webPreferences.nodeIntegration = false
        webPreferences.contextIsolation = true
        webPreferences.webSecurity = true
        webPreferences.allowRunningInsecureContent = false
      })

      // Security rules & minimalist scrollbar injection for webview contents
      if (contents.getType() === 'webview') {
        activeWebviewContents.add(contents)
        contents.on('destroyed', () => activeWebviewContents.delete(contents))

        // Set matching background color to eliminate white flashes on new webview creation / navigation
        const isDark = nativeTheme.shouldUseDarkColors
        if (typeof (contents as any).setBackgroundColor === 'function') {
          ;(contents as any).setBackgroundColor(isDark ? '#09090b' : '#ffffff')
        }

        const customScrollbarCss = `
          ::-webkit-scrollbar {
            width: 5px !important;
            height: 5px !important;
          }
          ::-webkit-scrollbar-track {
            background: transparent !important;
          }
          ::-webkit-scrollbar-thumb {
            background: rgba(120, 120, 140, 0.35) !important;
            border-radius: 9999px !important;
          }
          ::-webkit-scrollbar-thumb:hover {
            background: rgba(120, 120, 140, 0.6) !important;
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
        contents.on('dom-ready', () => {
          contents.insertCSS(customScrollbarCss).catch(() => {})
          const isDark = nativeTheme.shouldUseDarkColors
          contents.executeJavaScript(getWebviewThemeScript(isDark)).catch(() => {})
        })

        contents.on('did-finish-load', () => {
          const isDark = nativeTheme.shouldUseDarkColors
          contents.executeJavaScript(getWebviewThemeScript(isDark)).catch(() => {})
        })

        // Handle target="_blank", window.open(), and links opening new windows/tabs
        contents.setWindowOpenHandler((details) => {
          try {
            const currentUrl = contents.getURL() || 'http://localhost'
            const parsed = new URL(details.url, currentUrl)
            if (['http:', 'https:'].includes(parsed.protocol)) {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('tab:create-from-external', parsed.href)
              }
            }
          } catch (e) {
            console.warn('[Webview] Malformed URL in window open handler:', details.url, e)
          }
          return { action: 'deny' }
        })

        // Guard against dangerous schemes without blocking relative or in-page redirection
        contents.on('will-navigate', (event, navigationUrl) => {
          try {
            const currentUrl = contents.getURL() || 'http://localhost'
            const parsed = new URL(navigationUrl, currentUrl)
            if (['file:', 'javascript:', 'vbscript:'].includes(parsed.protocol)) {
              event.preventDefault()
              console.warn(`[Security] Blocked navigation to dangerous protocol: ${parsed.protocol}`)
              return
            }
            if (parsed.protocol === 'data:' && !navigationUrl.startsWith('data:image/')) {
              event.preventDefault()
              console.warn('[Security] Blocked non-image data: URL navigation')
              return
            }
          } catch (e) {
            // Do not prevent default on non-standard in-page navigation
            console.warn('[Navigation] Could not parse navigation URL:', navigationUrl, e)
          }
        })

        // Edge-style comprehensive right-click context menu (Links, Images, Text Selection, Editable, Navigation)
        contents.on('context-menu', (_event, params) => {
          const menuTemplate: Electron.MenuItemConstructorOptions[] = []

          // 1. Link items
          if (params.linkURL) {
            menuTemplate.push(
              {
                label: 'Open link in new tab',
                click: () => {
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('tab:create-from-external', params.linkURL)
                  }
                }
              },
              {
                label: 'Open link in new window',
                click: () => {
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('tab:create-from-external', params.linkURL)
                  }
                }
              },
              {
                label: 'Copy link address',
                click: () => {
                  clipboard.writeText(params.linkURL)
                }
              },
              {
                label: 'Save link as...',
                click: () => {
                  contents.downloadURL(params.linkURL)
                }
              },
              { type: 'separator' }
            )
          }

          // 2. Image items
          if (params.hasImageContents || params.mediaType === 'image') {
            if (params.srcURL) {
              menuTemplate.push(
                {
                  label: 'Open image in new tab',
                  click: () => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                      mainWindow.webContents.send('tab:create-from-external', params.srcURL)
                    }
                  }
                },
                {
                  label: 'Save image as...',
                  click: () => {
                    contents.downloadURL(params.srcURL)
                  }
                },
                {
                  label: 'Copy image',
                  click: () => {
                    contents.copyImageAt(params.x, params.y)
                  }
                },
                {
                  label: 'Copy image link',
                  click: () => {
                    clipboard.writeText(params.srcURL)
                  }
                },
                { type: 'separator' }
              )
            }
          }

          // 3. Text selection items
          if (params.selectionText && params.selectionText.trim().length > 0) {
            const selectedText = params.selectionText.trim()
            const truncated = selectedText.length > 25 ? selectedText.substring(0, 25) + '…' : selectedText
            menuTemplate.push(
              {
                label: 'Copy',
                accelerator: 'CmdOrCtrl+C',
                click: () => {
                  contents.copy()
                }
              },
              {
                label: `Search web for "${truncated}"`,
                click: () => {
                  const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(selectedText)}`
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('tab:create-from-external', searchUrl)
                  }
                }
              },
              {
                label: 'Read aloud',
                accelerator: 'CmdOrCtrl+Shift+U',
                click: () => {
                  const escaped = JSON.stringify(selectedText)
                  contents.executeJavaScript(`
                    try {
                      window.speechSynthesis.cancel();
                      var u = new SpeechSynthesisUtterance(${escaped});
                      window.speechSynthesis.speak(u);
                    } catch(e) {}
                  `).catch(() => {})
                }
              },
              { type: 'separator' }
            )
          }

          // 4. Editable field items (input, textarea)
          if (params.isEditable) {
            menuTemplate.push(
              {
                label: 'Undo',
                accelerator: 'CmdOrCtrl+Z',
                enabled: params.editFlags.canUndo,
                click: () => contents.undo()
              },
              {
                label: 'Redo',
                accelerator: 'CmdOrCtrl+Y',
                enabled: params.editFlags.canRedo,
                click: () => contents.redo()
              },
              { type: 'separator' },
              {
                label: 'Cut',
                accelerator: 'CmdOrCtrl+X',
                enabled: params.editFlags.canCut,
                click: () => contents.cut()
              },
              {
                label: 'Copy',
                accelerator: 'CmdOrCtrl+C',
                enabled: params.editFlags.canCopy,
                click: () => contents.copy()
              },
              {
                label: 'Paste',
                accelerator: 'CmdOrCtrl+V',
                enabled: params.editFlags.canPaste,
                click: () => contents.paste()
              },
              {
                label: 'Select all',
                accelerator: 'CmdOrCtrl+A',
                enabled: params.editFlags.canSelectAll,
                click: () => contents.selectAll()
              },
              { type: 'separator' }
            )
          }

          // 5. Standard Page Navigation & Options (matches Edge Image 2)
          menuTemplate.push(
            {
              label: 'Back',
              accelerator: 'Alt+Left',
              enabled: contents.canGoBack(),
              click: () => contents.goBack()
            },
            {
              label: 'Forward',
              accelerator: 'Alt+Right',
              enabled: contents.canGoForward(),
              click: () => contents.goForward()
            },
            {
              label: 'Refresh',
              accelerator: 'CmdOrCtrl+R',
              click: () => contents.reload()
            },
            { type: 'separator' },
            {
              label: 'Save as...',
              accelerator: 'CmdOrCtrl+S',
              click: () => {
                const pageUrl = contents.getURL() || params.pageURL
                if (pageUrl) {
                  dialog.showSaveDialog(mainWindow!, {
                    defaultPath: 'page.html',
                    filters: [
                      { name: 'Webpage, Complete', extensions: ['html', 'htm'] },
                      { name: 'All Files', extensions: ['*'] }
                    ]
                  }).then((result) => {
                    if (!result.canceled && result.filePath) {
                      contents.savePage(result.filePath, 'HTMLComplete').catch(() => {})
                    }
                  }).catch(() => {})
                }
              }
            },
            {
              label: 'Print...',
              accelerator: 'CmdOrCtrl+P',
              click: () => contents.print()
            },
            {
              label: 'Create QR Code for this page',
              click: () => {
                const pageUrl = contents.getURL() || params.pageURL
                if (pageUrl && mainWindow && !mainWindow.isDestroyed()) {
                  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pageUrl)}`
                  mainWindow.webContents.send('tab:create-from-external', qrUrl)
                }
              }
            },
            {
              label: 'Read aloud',
              accelerator: 'CmdOrCtrl+Shift+U',
              click: () => {
                contents.executeJavaScript(`
                  try {
                    if (window.speechSynthesis.speaking) {
                      window.speechSynthesis.cancel();
                    } else {
                      var text = (document.body ? document.body.innerText : '').substring(0, 3000);
                      var u = new SpeechSynthesisUtterance(text);
                      window.speechSynthesis.speak(u);
                    }
                  } catch(e) {}
                `).catch(() => {})
              }
            },
            {
              label: 'Translate to English',
              click: () => {
                const pageUrl = contents.getURL() || params.pageURL
                if (pageUrl && mainWindow && !mainWindow.isDestroyed()) {
                  const transUrl = `https://translate.google.com/translate?u=${encodeURIComponent(pageUrl)}`
                  mainWindow.webContents.send('tab:create-from-external', transUrl)
                }
              }
            },
            { type: 'separator' },
            {
              label: 'View page source',
              accelerator: 'CmdOrCtrl+U',
              click: () => {
                const pageUrl = contents.getURL() || params.pageURL
                if (pageUrl && mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('tab:create-from-external', `view-source:${pageUrl}`)
                }
              }
            },
            {
              label: 'Inspect',
              accelerator: 'CmdOrCtrl+Shift+I',
              click: () => {
                contents.inspectElement(params.x, params.y)
                if (!contents.isDevToolsOpened()) {
                  contents.openDevTools({ mode: 'detach' })
                }
              }
            }
          )

          const menu = Menu.buildFromTemplate(menuTemplate)
          if (mainWindow && !mainWindow.isDestroyed()) {
            menu.popup({ window: mainWindow })
          } else {
            menu.popup()
          }
        })
      }
    })

    // Create main window
    mainWindow = createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow()
      } else if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
