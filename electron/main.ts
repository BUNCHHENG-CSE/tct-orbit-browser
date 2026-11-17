import 'dotenv/config'
import { app, BrowserWindow, ipcMain, session, nativeTheme, Menu, clipboard, dialog, shell } from 'electron'
import { createMainWindow } from './windows/mainWindow'
import { registerAllIpc } from './ipc'
import { localStorageService } from './storage/localStorage'
import { applyNativeTheme } from './ipc/settings'
import { themeManager } from './theme/themeManager'
import { initAppPaths, runStartupMigration } from './storage/paths'
import { devtoolsManager } from './devtools/devtoolsManager'
import { privacyEngine } from './privacy/privacyEngine'
import { getBrowserLogoPath } from './resources'

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
app.commandLine.appendSwitch('enable-smooth-scrolling')
app.commandLine.appendSwitch('enable-features', 'OverlayScrollbar,SmoothScrolling')

// Mullvad-standard network privacy switches (DoH, disable insecure fallback, disable preconnect leaks)
app.commandLine.appendSwitch('dns-over-https-templates', 'https://dns.mullvad.net/dns-query')
app.commandLine.appendSwitch('disable-features', 'DnsOverHttpsFallback,PreconnectToSearch,Prerender2')

// Linux optimizations (Ubuntu, Debian, Fedora, Arch, openSUSE)
// Enables native Wayland support with auto-fallback to X11, crisp fractional scaling & GPU acceleration
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto')
  app.commandLine.appendSwitch('enable-features', 'OverlayScrollbar,WaylandWindowDecorations,SmoothScrolling')
  app.commandLine.appendSwitch('enable-gpu-rasterization')
  app.commandLine.appendSwitch('enable-zero-copy')
}

// Windows optimizations (Windows 10, Windows 11, x64, ARM64 Copilot+ PCs)
if (process.platform === 'win32') {
  app.setAppUserModelId(appPaths.channelMeta.appId)
  app.commandLine.appendSwitch('enable-gpu-rasterization')
  app.commandLine.appendSwitch('enable-zero-copy')
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

    // Initialize Privacy Engine before window creation
    await privacyEngine.init()

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

        // Inject Mullvad-standard Privacy Shield hardening & ad suppression
        privacyEngine.injectShieldScript(contents)

        // Close context menu whenever webview gains focus or is clicked
        contents.on('focus', () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('context-menu:close')
          }
        })

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
          /* Eliminate double root scrollbars on small screens / responsive SPAs */
          html {
            overflow-y: auto !important;
            overflow-x: hidden !important;
          }
          body {
            overflow-y: visible !important;
            overflow-x: hidden !important;
          }
        `
        contents.on('dom-ready', () => {
          contents.insertCSS(customScrollbarCss).catch(() => {})
          const isDark = nativeTheme.shouldUseDarkColors
          contents.executeJavaScript(getWebviewThemeScript(isDark)).catch(() => {})
          contents.executeJavaScript(`
            (function() {
              try {
                if (window.__tct_context_dismiss_installed) return;
                window.__tct_context_dismiss_installed = true;
                window.addEventListener('pointerdown', function() {
                  window.dispatchEvent(new CustomEvent('tct:page-clicked'));
                }, true);
              } catch(e) {}
            })();
          `).catch(() => {})
        })

        contents.on('did-finish-load', () => {
          const isDark = nativeTheme.shouldUseDarkColors
          contents.executeJavaScript(getWebviewThemeScript(isDark)).catch(() => {})
        })

        // Handle target="_blank", window.open(), and links opening new windows/tabs
        contents.setWindowOpenHandler((details) => {
          try {
            const rawUrl = details.url || ''
            let parsed: URL | null = null
            try {
              parsed = new URL(rawUrl)
            } catch {
              parsed = null
            }

            const protocol = parsed ? parsed.protocol : ''

            // External OS protocols -> delegate safely to shell.openExternal
            if (['mailto:', 'tel:', 'magnet:', 'slack:', 'discord:', 'zoommtg:'].includes(protocol)) {
              shell.openExternal(rawUrl).catch(() => {})
              return { action: 'deny' }
            }

            // Small explicit OAuth / sign-in popups (width/height defined)
            const isSmallPopup = details.features && (details.features.includes('width=') || details.features.includes('height='))
            const isAuthFlow = rawUrl.includes('accounts.google.com') || rawUrl.includes('/oauth') || rawUrl.includes('/auth') || rawUrl.includes('login') || rawUrl.includes('signin')
            if (isSmallPopup && isAuthFlow) {
              const startupTheme = themeManager.getStartupTheme()
              return {
                action: 'allow',
                overrideBrowserWindowOptions: {
                  icon: getBrowserLogoPath(),
                  backgroundColor: startupTheme.backgroundColor,
                  parent: mainWindow || undefined,
                  autoHideMenuBar: true,
                  webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    webSecurity: true,
                    userAgent: customUserAgent
                  }
                }
              }
            }

            // Standard web URLs: http, https, about, view-source
            if (['http:', 'https:', 'about:', 'view-source:'].includes(protocol) || !parsed) {
              const isActive = details.disposition !== 'background-tab'
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('tabs:open-url', {
                  url: rawUrl,
                  active: isActive,
                  sourceWebContentsId: contents.id
                })
              }
              return { action: 'deny' }
            }

            shell.openExternal(rawUrl).catch(() => {})
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

        // Edge-style comprehensive right-click context menu interceptor
        contents.on('context-menu', (event, params) => {
          event.preventDefault()

          // Exclude DevTools windows so native Chromium DevTools menus still work
          if (contents.isDevToolsFocused() || contents.getURL().startsWith('devtools://')) {
            return
          }

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('context-menu:open', {
              webContentsId: contents.id,
              params: {
                x: params.x,
                y: params.y,
                linkURL: params.linkURL,
                srcURL: params.srcURL,
                mediaType: params.mediaType,
                hasImageContents: params.hasImageContents,
                isEditable: params.isEditable,
                selectionText: params.selectionText,
                titleText: params.titleText,
                pageURL: params.pageURL || contents.getURL(),
                frameURL: params.frameURL,
                editFlags: params.editFlags,
                dictionarySuggestions: params.dictionarySuggestions
              },
              canGoBack: contents.navigationHistory ? contents.navigationHistory.canGoBack() : contents.canGoBack(),
              canGoForward: contents.navigationHistory ? contents.navigationHistory.canGoForward() : contents.canGoForward(),
              pageURL: contents.getURL() || params.pageURL
            })
          }
        })
      }

      // DevTools custom scrollbar styling fallback across all contexts
      const checkDevTools = () => {
        try {
          if (!contents.isDestroyed() && contents.getURL().startsWith('devtools://')) {
            devtoolsManager.applyScrollbar(contents)
          }
        } catch {}
      }
      contents.on('dom-ready', checkDevTools)
      contents.on('did-finish-load', checkDevTools)
    })

    // Create main window
    mainWindow = createMainWindow()
    devtoolsManager.init(mainWindow)

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
