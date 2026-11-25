import dotenv from 'dotenv'
import os from 'os'
import { app, BrowserWindow, ipcMain, session, nativeTheme, powerSaveBlocker } from 'electron'
import { createMainWindow } from './windows/mainWindow'
import { setupWindowsTaskbar } from './windows/taskbar'
import { registerAllIpc } from './ipc'
import { smartService } from './smart/smartService'
import { pageIndex } from './smart/pageIndex'
import { secureHandle } from './security'
import { localStorageService } from './storage/localStorage'
import { historyService } from './storage/historyService'
import { notesService } from './storage/notesService'
import { downloadsService } from './storage/downloadsService'
import { bookmarksService } from './storage/bookmarksService'
import { applyNativeTheme } from './ipc/settings'
import { themeManager } from './theme/themeManager'
import { initAppPaths, runStartupMigration } from './storage/paths'
import { devtoolsManager } from './devtools/devtoolsManager'
import { privacyEngine } from './privacy/privacyEngine'
import { sitePermissions } from './permissions/sitePermissions'
import { syncService } from './storage/syncService'
import { PRIVATE_PARTITION } from './privacy/types'
import { PRIVATE_WINDOW_SPACE_ID, PRIVATE_START } from '../shared/privateWindow'
import { queueLaunchUrl, isOpenableUrl } from './launchUrls'
import { extensionManager } from './extensions'
import { passwordManager } from './passwords'
import {
  SHARED_TAB_PARTITION,
  resolveTabPartition,
  partitionOfSession,
  setProfileValidator,
  onTabSessionCreated,
  ensureProfileSession,
  profilePartitionFor
} from './sessions'
import { getAppNativeIcon, getBrowserLogoPath } from './resources'
import {
  setupIsolatedTabSession,
  setupWebContentsSecurity,
  setupWebRTCLeakProtection,
  trackUserInput,
  hasRecentUserInput,
  openExternalFromPage,
  SAFE_EXTERNAL_PROTOCOLS,
  DANGEROUS_PROTOCOLS
} from './security'
import { isAppUiUrl } from './appUi'

// Development only. dotenv reads .env from the CURRENT FOLDER: an installed browser started by
// opening a file in Downloads would otherwise load a .env planted there (proxy, TLS, data folder).
if (!app.isPackaged) dotenv.config({ quiet: true })

// Early channel, userData paths, and database isolation setup
const appPaths = initAppPaths()
process.title = appPaths.channelMeta.displayName
app.name = appPaths.channelMeta.displayName
app.setName(appPaths.channelMeta.displayName)
runStartupMigration()

// Standard Chrome User-Agent configuration
// Strips Electron/<version> and app tokens so Google Auth, YouTube, and Cloudflare identify pure desktop Chrome
function setupCustomUserAgent(): string {
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

  app.userAgentFallback = cleaned
  return cleaned
}

const customUserAgent = setupCustomUserAgent()

// Cross-platform engine & hardware acceleration switches
app.commandLine.appendSwitch('enable-smooth-scrolling')

// Disable pull-to-refresh & overscroll history navigation gestures
// Prevents pages from auto-refreshing when scrolling or overscrolling down
app.commandLine.appendSwitch('disable-pull-to-refresh')
app.commandLine.appendSwitch('pull-to-refresh', '0')
app.commandLine.appendSwitch('overscroll-history-navigation', '0')
app.commandLine.appendSwitch('disable-overscroll-edge-effect')

// High-performance hardware acceleration & zero-copy pipeline
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('enable-native-gpu-memory-buffers')
app.commandLine.appendSwitch('ignore-gpu-blocklist')

// Optimization Switches (Clean telemetry & background overhead reduction)
app.commandLine.appendSwitch('disable-breakpad')
app.commandLine.appendSwitch('disable-component-update')
app.commandLine.appendSwitch('disable-domain-reliability')
app.commandLine.appendSwitch('disable-sync')
app.commandLine.appendSwitch('disable-background-networking')
app.commandLine.appendSwitch('disable-client-side-phishing-detection')
app.commandLine.appendSwitch('disable-default-apps')

// Cloudflare high-performance DoH with resilient system fallback and preconnect leak prevention
// Disable PullToRefreshEffect, OverscrollHistoryNavigation and SlideToNavigate so pages only refresh via F5 or Refresh button
app.commandLine.appendSwitch(
  'disable-features',
  'PreconnectToSearch,Prerender2,CalculateNativeWinOcclusion,AutofillServerCommunication,PullToRefreshEffect,OverscrollHistoryNavigation,SlideToNavigate' +
    (os.totalmem() / 1024 ** 3 <= 8.5 ? ',BackForwardCache' : '')
)

// --- Low/medium RAM devices: trade a little speed for a much smaller footprint ---
const totalRamGb = os.totalmem() / 1024 ** 3
const isLowRamDevice = totalRamGb <= 8.5
if (isLowRamDevice) {
  // (BackForwardCache is also disabled above: it keeps whole pages alive after navigating away)
  // Cap the HTTP disk cache, and ask V8 to favour a smaller heap over peak speed
  app.commandLine.appendSwitch('disk-cache-size', String(128 * 1024 * 1024))
  app.commandLine.appendSwitch('js-flags', '--optimize-for-size')
}

const enabledFeatures = [
  'OverlayScrollbar',
  'SmoothScrolling',
  'CanvasOopRasterization'
]

// --- 1. Linux Deep Optimization (Ubuntu 22.04 LTS, Debian, Fedora, Arch) ---
// - Enables native Wayland via Ozone with X11 fallback
// - Enables VA-API hardware video acceleration (prevents 100% CPU on 1080p/4K YouTube playback)
// - Integrates PipeWire for low-latency audio and screensharing
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto')
  app.commandLine.appendSwitch('enable-gpu-rasterization')
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
  enabledFeatures.push('VaapiVideoDecoder', 'VaapiVideoEncoder', 'VaapiIgnoreDriverChecks', 'WaylandWindowDecorations', 'WebRTCPipeWireCapturer')
}

// --- 2. Windows Deep Optimization (Windows 10, Windows 11 x64 & ARM64 Copilot+ PCs) ---
// - Direct3D 11 ANGLE backend for buttery-smooth 60/120Hz refresh rates and zero UI stutter
// - D3D11 hardware video decoding for smooth 4K/60fps YouTube playback
// - Hardware rasterization for high-framerate rendering without DWM black screen glitches
if (process.platform === 'win32') {
  // The Microsoft Store package brings its own identity; a different id would break its taskbar entry
  if (!process.windowsStore) app.setAppUserModelId(appPaths.channelMeta.appId)
  app.commandLine.appendSwitch('use-angle', 'd3d11')
  app.commandLine.appendSwitch('enable-gpu-rasterization')
  enabledFeatures.push('D3D11VideoDecoder')
}

// --- 3. macOS Deep Optimization (Apple Silicon M1-M4 & Intel Universal) ---
// - Metal ANGLE backend: native Apple Silicon Metal graphics pipeline
// - IOSurface zero-copy buffer sharing: leverages unified memory (UMA) to avoid CPU-to-GPU RAM copies
// - App Nap support: lets background windows enter low-power sleep while preserving audio
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('use-angle', 'metal')
  app.commandLine.appendSwitch('enable-zero-copy')
  app.commandLine.appendSwitch('enable-native-gpu-memory-buffers')
  enabledFeatures.push('Metal', 'AppNap', 'MacSysmemMemoryBudget')
  try {
    const { systemPreferences } = require('electron')
    systemPreferences.setUserDefault?.('AppleFontSmoothing', 'integer', 2)
  } catch {
    // ignore
  }
}

app.commandLine.appendSwitch('enable-features', enabledFeatures.join(','))

// Register custom protocol client for default browser integration.
// Installed app only: a dev run would register the bare electron.exe, which treats the link as an
// app to launch. "--" stops a crafted link from smuggling command-line switches into the browser.
// The Store package declares its links in its manifest (build/store/appxmanifest.xml).
if (app.isPackaged && !process.windowsStore) {
  const args = process.platform === 'win32' ? ['--'] : []
  for (const scheme of new Set([appPaths.channelMeta.userDataDirName, 'tct-orbit'])) {
    if (!app.isDefaultProtocolClient(scheme, process.execPath, args)) {
      app.setAsDefaultProtocolClient(scheme, process.execPath, args)
    }
  }
}

// Global exception handling for production stability
process.on('uncaughtException', (error) => {
  console.error('[Main Process] Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason: any) => {
  // ERR_ABORTED (-3) is Chromium's internal cancellation code when a navigation is superseded or redirected
  if (reason && (reason.errno === -3 || reason.code === 'ERR_ABORTED' || String(reason).includes('ERR_ABORTED'))) {
    return
  }
  console.error('[Main Process] Unhandled Promise Rejection:', reason)
})

let mainWindow: BrowserWindow | null = null
/** Open private windows (Edge InPrivate style) */
const privateWindows = new Set<BrowserWindow>()

/**
 * Browser window that owns some web contents: a webview's host window, or the window itself.
 * Events from a tab (right-click menu, shortcuts, links opening new tabs) go back to the window
 * the tab lives in, so the private window handles its own tabs.
 */
function windowFor(contents: Electron.WebContents | null | undefined): BrowserWindow | null {
  if (!contents || contents.isDestroyed()) return mainWindow
  const host = (contents as any).hostWebContents as Electron.WebContents | undefined
  const win = BrowserWindow.fromWebContents(host && !host.isDestroyed() ? host : contents)
  return win && !win.isDestroyed() ? win : mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

/**
 * Open the private window (only private tabs; everything is wiped when it closes). There is one
 * private window: asking again focuses it and opens a new tab (or the given link) in it.
 */
function openPrivateWindow(url?: string): BrowserWindow {
  const safeUrl = url && /^https?:\/\//i.test(url) ? url : undefined
  const existing = [...privateWindows].find((w) => !w.isDestroyed())
  if (existing) {
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    if (safeUrl) existing.webContents.send('tabs:open-url', { url: safeUrl, active: true, isPrivate: true })
    else existing.webContents.send('keyboard-shortcut:trigger', 'new-tab')
    return existing
  }
  // First tab exists before the window loads, so the window never starts empty
  if (localStorageService.listTabs(PRIVATE_WINDOW_SPACE_ID).length === 0) {
    localStorageService.createTab({
      spaceId: PRIVATE_WINDOW_SPACE_ID,
      url: safeUrl ?? PRIVATE_START.url,
      title: safeUrl ? 'Loading...' : PRIVATE_START.title,
      isPrivate: true
    })
  }
  const win = createMainWindow({ private: true })
  privateWindows.add(win)
  attachKeyboardShortcuts(win.webContents, false)
  win.on('closed', () => {
    privateWindows.delete(win)
    // Closing the window closes its tabs; the last private tab gone wipes the private session
    const hadPrivate = localStorageService.hasPrivateTabs()
    for (const tab of localStorageService.listTabs(PRIVATE_WINDOW_SPACE_ID)) localStorageService.removeTab(tab.id)
    if (hadPrivate && !localStorageService.hasPrivateTabs()) void privacyEngine.clearPrivateSession()
  })
  return win
}
const activeWebviewContents = new Set<Electron.WebContents>()
let mediaPowerSaveBlockerId: number | null = null

// Dynamic OS power management: prevents system sleep during background media playback (YouTube, Spotify)
// and immediately releases power lock when media pauses, allowing macOS App Nap & Windows EcoQoS to save battery
function updateMediaPowerSaveState(): void {
  let hasAudibleMedia = false
  for (const wc of activeWebviewContents) {
    if (!wc.isDestroyed() && typeof (wc as any).isCurrentlyAudible === 'function' && (wc as any).isCurrentlyAudible()) {
      hasAudibleMedia = true
      break
    }
  }

  if (hasAudibleMedia && mediaPowerSaveBlockerId === null) {
    mediaPowerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension')
  } else if (!hasAudibleMedia && mediaPowerSaveBlockerId !== null) {
    if (powerSaveBlocker.isStarted(mediaPowerSaveBlockerId)) {
      powerSaveBlocker.stop(mediaPowerSaveBlockerId)
    }
    mediaPowerSaveBlockerId = null
  }
}

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

// Shared global keyboard shortcut handler for both webview tabs and main window chrome
function attachKeyboardShortcuts(contents: Electron.WebContents, isWebview: boolean) {
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return

    const isCmdOrCtrl = input.control || input.meta
    const key = (input.key || '').toLowerCase()
    const code = input.code || ''
    const shift = !!input.shift
    const alt = !!input.alt

    const sendShortcut = (action: string) => {
      const win = windowFor(contents)
      if (win) win.webContents.send('keyboard-shortcut:trigger', action)
    }

    // 1. DevTools: F12 or Ctrl+Shift+I
    if (key === 'f12' || code === 'F12' || (isCmdOrCtrl && shift && !alt && (key === 'i' || code === 'KeyI'))) {
      event.preventDefault()
      sendShortcut('toggle-devtools')
      return
    }

    // Split View: Ctrl+\
    if (isCmdOrCtrl && !shift && !alt && (key === '\\' || code === 'Backslash')) {
      event.preventDefault()
      sendShortcut('toggle-split-view')
      return
    }

    // New Private Tab: Alt+Shift+N (Ctrl+Shift+N is Space Notes)
    if (alt && shift && !isCmdOrCtrl && (key === 'n' || code === 'KeyN')) {
      event.preventDefault()
      sendShortcut('new-private-tab')
      return
    }

    // Tab Search across all spaces: Ctrl+Shift+A
    if (isCmdOrCtrl && shift && !alt && (key === 'a' || code === 'KeyA')) {
      event.preventDefault()
      sendShortcut('tab-search')
      return
    }

    // Keyboard shortcut cheat sheet: Ctrl+/
    if (isCmdOrCtrl && !shift && !alt && (key === '/' || code === 'Slash')) {
      event.preventDefault()
      sendShortcut('shortcut-help')
      return
    }

    // Reader Mode: F9 or Ctrl+Alt+R
    if ((!isCmdOrCtrl && !shift && !alt && (key === 'f9' || code === 'F9')) || (isCmdOrCtrl && alt && !shift && (key === 'r' || code === 'KeyR'))) {
      event.preventDefault()
      sendShortcut('toggle-reader-mode')
      return
    }

    // Picture-in-Picture: Ctrl+Shift+P or Ctrl+Alt+P
    if ((isCmdOrCtrl && shift && !alt && (key === 'p' || code === 'KeyP')) || (isCmdOrCtrl && alt && !shift && (key === 'p' || code === 'KeyP'))) {
      event.preventDefault()
      sendShortcut('toggle-pip')
      return
    }

    // Print Page: Ctrl+P
    if (isCmdOrCtrl && !shift && !alt && (key === 'p' || code === 'KeyP')) {
      event.preventDefault()
      sendShortcut('print-page')
      return
    }

    // Space Notes: Ctrl+Shift+N
    if (isCmdOrCtrl && shift && !alt && (key === 'n' || code === 'KeyN')) {
      event.preventDefault()
      sendShortcut('toggle-notes')
      return
    }

    // 2. Screenshot: Ctrl+Shift+S
    if (isCmdOrCtrl && shift && !alt && (key === 's' || code === 'KeyS')) {
      event.preventDefault()
      sendShortcut('take-screenshot')
      return
    }

    // 3. Reopen closed tab: Ctrl+Shift+T
    if (isCmdOrCtrl && shift && !alt && (key === 't' || code === 'KeyT')) {
      event.preventDefault()
      sendShortcut('reopen-tab')
      return
    }

    // 4. Hard reload (ignore cache): Ctrl+Shift+R or Ctrl+F5
    if ((isCmdOrCtrl && shift && (key === 'r' || code === 'KeyR')) || (isCmdOrCtrl && (key === 'f5' || code === 'F5'))) {
      event.preventDefault()
      if (isWebview) {
        contents.reloadIgnoringCache()
      } else {
        sendShortcut('hard-reload')
      }
      return
    }

    // 5. Normal reload: Ctrl+R or F5
    if ((isCmdOrCtrl && !shift && !alt && (key === 'r' || code === 'KeyR')) || (!isCmdOrCtrl && !shift && !alt && (key === 'f5' || code === 'F5'))) {
      event.preventDefault()
      if (isWebview) {
        contents.reload()
      } else {
        sendShortcut('reload')
      }
      return
    }

    // 6. Next tab: Ctrl+Tab or Ctrl+PageDown
    if (isCmdOrCtrl && !shift && !alt && (key === 'tab' || code === 'Tab' || key === 'pagedown' || code === 'PageDown')) {
      event.preventDefault()
      sendShortcut('next-tab')
      return
    }

    // 7. Previous tab: Ctrl+Shift+Tab or Ctrl+PageUp
    if (isCmdOrCtrl && shift && !alt && (key === 'tab' || code === 'Tab' || key === 'pageup' || code === 'PageUp')) {
      event.preventDefault()
      sendShortcut('prev-tab')
      return
    }

    // 8. New tab: Ctrl+T or Ctrl+N
    if (isCmdOrCtrl && !shift && !alt && (key === 't' || code === 'KeyT' || key === 'n' || code === 'KeyN')) {
      event.preventDefault()
      sendShortcut('new-tab')
      return
    }

    // 9. Close tab: Ctrl+W or Ctrl+F4
    if ((isCmdOrCtrl && !shift && !alt && (key === 'w' || code === 'KeyW')) || (isCmdOrCtrl && (key === 'f4' || code === 'F4'))) {
      event.preventDefault()
      sendShortcut('close-tab')
      return
    }

    // 10. Focus Address Bar / Omnibox: Ctrl+L, Alt+D, or F6
    if (
      (isCmdOrCtrl && !shift && !alt && (key === 'l' || code === 'KeyL')) ||
      (alt && !isCmdOrCtrl && !shift && (key === 'd' || code === 'KeyD')) ||
      (!isCmdOrCtrl && !shift && !alt && (key === 'f6' || code === 'F6'))
    ) {
      event.preventDefault()
      sendShortcut('focus-address-bar')
      return
    }

    // 11. Open Command Bar: Ctrl+K
    if (isCmdOrCtrl && !shift && !alt && (key === 'k' || code === 'KeyK')) {
      event.preventDefault()
      sendShortcut('open-command-bar')
      return
    }

    // Open History: Ctrl+H
    if (isCmdOrCtrl && !shift && !alt && (key === 'h' || code === 'KeyH')) {
      event.preventDefault()
      sendShortcut('open-history')
      return
    }

    // Open Downloads: Ctrl+J
    if (isCmdOrCtrl && !shift && !alt && (key === 'j' || code === 'KeyJ')) {
      event.preventDefault()
      sendShortcut('open-downloads')
      return
    }

    // Find in Page: Ctrl+F
    if (isCmdOrCtrl && !shift && !alt && (key === 'f' || code === 'KeyF')) {
      event.preventDefault()
      sendShortcut('toggle-find')
      return
    }

    // Bookmark Tab: Ctrl+D
    if (isCmdOrCtrl && !shift && !alt && (key === 'd' || code === 'KeyD')) {
      event.preventDefault()
      sendShortcut('toggle-bookmark')
      return
    }

    // 12. Toggle Sidebar: Ctrl+S or Ctrl+B
    if (isCmdOrCtrl && !shift && !alt && (key === 's' || code === 'KeyS' || key === 'b' || code === 'KeyB')) {
      event.preventDefault()
      sendShortcut('toggle-sidebar')
      return
    }

    // 13. Open Settings: Ctrl+,
    if (isCmdOrCtrl && !shift && !alt && (key === ',' || code === 'Comma')) {
      event.preventDefault()
      sendShortcut('open-settings')
      return
    }

    // 14. Switch to tab 1..8: Ctrl+1..8
    if (isCmdOrCtrl && !shift && !alt && (/^[1-8]$/.test(input.key) || /^Digit[1-8]$/.test(code) || /^Numpad[1-8]$/.test(code))) {
      event.preventDefault()
      const digit = input.key && /^[1-8]$/.test(input.key) ? input.key : code.slice(-1)
      sendShortcut(`switch-tab-${digit}`)
      return
    }

    // 15. Switch to last tab: Ctrl+9
    if (isCmdOrCtrl && !shift && !alt && (input.key === '9' || code === 'Digit9' || code === 'Numpad9')) {
      event.preventDefault()
      sendShortcut('switch-tab-last')
      return
    }

    // 16. Back: Alt+Left or Ctrl+[
    if (
      (alt && !isCmdOrCtrl && !shift && (key === 'arrowleft' || code === 'ArrowLeft')) ||
      (isCmdOrCtrl && !shift && !alt && (key === '[' || code === 'BracketLeft'))
    ) {
      event.preventDefault()
      if (isWebview) {
        const canBack = contents.navigationHistory ? contents.navigationHistory.canGoBack() : contents.canGoBack()
        if (canBack) contents.goBack()
      } else {
        sendShortcut('back')
      }
      return
    }

    // 17. Forward: Alt+Right or Ctrl+]
    if (
      (alt && !isCmdOrCtrl && !shift && (key === 'arrowright' || code === 'ArrowRight')) ||
      (isCmdOrCtrl && !shift && !alt && (key === ']' || code === 'BracketRight'))
    ) {
      event.preventDefault()
      if (isWebview) {
        const canFwd = contents.navigationHistory ? contents.navigationHistory.canGoForward() : contents.canGoForward()
        if (canFwd) contents.goForward()
      } else {
        sendShortcut('forward')
      }
      return
    }

    // Zen Mode: F11 or Ctrl+Shift+F
    if ((!isCmdOrCtrl && !shift && !alt && (key === 'f11' || code === 'F11')) || (isCmdOrCtrl && shift && !alt && (key === 'f' || code === 'KeyF'))) {
      event.preventDefault()
      sendShortcut('toggle-zen-mode')
      return
    }

    // Orbit Task Manager: Shift+Escape
    if (shift && !isCmdOrCtrl && !alt && (key === 'escape' || code === 'Escape')) {
      event.preventDefault()
      sendShortcut('open-task-manager')
      return
    }

    // 18. Zoom In: Ctrl+=, Ctrl++, or Ctrl+NumpadAdd
    if (isCmdOrCtrl && !alt && (key === '=' || key === '+' || code === 'Equal' || code === 'NumpadAdd')) {
      event.preventDefault()
      sendShortcut('zoom-in')
      return
    }

    // 19. Zoom Out: Ctrl+- or Ctrl+NumpadSubtract
    if (isCmdOrCtrl && !alt && (key === '-' || code === 'Minus' || code === 'NumpadSubtract')) {
      event.preventDefault()
      sendShortcut('zoom-out')
      return
    }

    // 20. Zoom Reset: Ctrl+0 or Ctrl+Numpad0
    if (isCmdOrCtrl && !alt && (key === '0' || code === 'Digit0' || code === 'Numpad0')) {
      event.preventDefault()
      sendShortcut('zoom-reset')
      return
    }
  })
}

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

// Every window carries the app icon: popups opened by popups, DevTools and helpers don't set their own
if (process.platform !== 'darwin') {
  app.on('browser-window-created', (_event, win) => {
    try {
      win.setIcon(getAppNativeIcon())
    } catch (err) {
      console.warn('[Window] Could not set the app icon:', err)
    }
  })
}

// Enforce single instance lock to prevent data corruption in local JSON storage
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  console.warn('[Main Process] Another instance is already running. Quitting duplicate instance.')
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    // Focus and show the main window if a second instance attempt is made
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()

      // Handle Windows JumpList tasks or CLI flags
      const hasIncognito = commandLine.includes('--incognito') || commandLine.includes('--inprivate')
      const hasNewWindow = commandLine.includes('--new-window')
      if (hasIncognito) {
        openPrivateWindow()
      } else if (hasNewWindow) {
        mainWindow.webContents.send('tab:create', {})
      }

      // Forward any URL passed via CLI argument (e.g. tct-orbit https://example.com)
      const urlArg = commandLine.find(isOpenableUrl)
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
      // Web addresses only: never file: or other schemes handed over by another app
      if (isOpenableUrl(url)) mainWindow.webContents.send('tab:create-from-external', url)
    } else {
      // Launched by clicking a link: open it once the UI is up
      queueLaunchUrl(url)
    }
  })

  app.whenReady().then(async () => {
    // Cold start with a link (Orbit is the default browser, or `tct-orbit https://...`)
    for (const arg of process.argv.slice(1)) queueLaunchUrl(arg)

    // Initialize Windows Taskbar identity, Start Menu shortcut, and JumpList
    setupWindowsTaskbar(appPaths.channelMeta.appId, appPaths.channelMeta.displayName)

    // Initialize dedicated isolated browsing partition ('persist:browser-tabs')
    const tabSession = setupIsolatedTabSession(SHARED_TAB_PARTITION)
    tabSession.setUserAgent(customUserAgent)
    session.defaultSession.setUserAgent(customUserAgent)
    try {
      session.defaultSession.setSpellCheckerEnabled(false)
      tabSession.setSpellCheckerEnabled(false)
    } catch {}

    // NOTE: no periodic "memory trimmer". window.gc() does not exist without --expose-gc, and
    // flushing the DNS cache / running JS in every tab every few minutes only cost CPU and latency.
    // Chromium already discards memory under pressure on its own.

    // Initialize 100% private local storage on user's machine
    localStorageService.init()
    passwordManager.init(() => mainWindow)
    historyService.init()
    notesService.init()
    downloadsService.init()
    bookmarksService.init()
    syncService.init()
    sitePermissions.init(() => mainWindow)
    smartService.init(() => mainWindow)

    // Sync saved theme preference to Chromium nativeTheme so webviews immediately inherit correct prefers-color-scheme
    const startupState = themeManager.getState()
    themeManager.applyNativeThemeSource(startupState.mode, startupState.webColorScheme)

    // Register all IPC handlers
    registerAllIpc(ipcMain, () => mainWindow)
    secureHandle(ipcMain, 'window:open-private', null, async (_event, url?: unknown) => {
      openPrivateWindow(typeof url === 'string' && url.length < 4096 ? url : undefined)
      return true
    })
    secureHandle(ipcMain, 'window:is-private', null, async (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      return !!win && privateWindows.has(win)
    })

    // Space profiles: only spaces marked "isolated" get their own session
    setProfileValidator((spaceId) => localStorageService.isSpaceIsolated(spaceId))
    onTabSessionCreated((ses) => {
      ses.setUserAgent(customUserAgent)
    })

    // Initialize Privacy Engine before window creation
    await privacyEngine.init()

    // Create every isolated space's profile now, so clear-data, proxy and panic wipe cover all of
    // them (not only the ones whose tabs were opened this run)
    for (const space of localStorageService.listSpaces()) {
      if (space.isolated) ensureProfileSession(profilePartitionFor(space.id))
    }

    // Chrome extensions the user added (Tools > Extensions)
    await extensionManager.init()

    // UI notices from the network layer
    privacyEngine.onHttpsFallback = (info) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('privacy:https-fallback', info)
    }
    privacyEngine.onFocusBlocked = (info) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('focus:blocked', info)
    }

    // Webview & window security rules: apply User-Agent, sanitize webPreferences and block dangerous protocols
    app.on('web-contents-created', (_, contents) => {
      contents.setUserAgent(customUserAgent)
      setupWebRTCLeakProtection(contents, privacyEngine.getWebRTCPolicy())

      // Intercept and sanitize any attached webview preferences
      contents.on('will-attach-webview', (event, webPreferences, params) => {
        // Only the browser UI may host tabs
        if (!isAppUiUrl(contents.getURL())) {
          event.preventDefault()
          return
        }

        // Enforce dedicated partition for untrusted web browsing tabs: shared, private, or the
        // profile of an isolated space. Never the UI's default session.
        // Electron creates the guest from webPreferences; params.partition alone has no effect.
        const partition = resolveTabPartition(webPreferences.partition ?? params.partition)
        params.partition = partition
        webPreferences.partition = partition
        delete webPreferences.session

        // Never allow untrusted web tabs to share the UI preload script
        delete webPreferences.preload
        delete (webPreferences as any).preloadURL
        delete webPreferences.enableBlinkFeatures
        webPreferences.nodeIntegrationInSubFrames = false
        webPreferences.webviewTag = false
        webPreferences.experimentalFeatures = false

        if (/^\s*(javascript|vbscript|data):/i.test(params.src || '')) params.src = 'about:blank'

        // Strict process isolation & sandbox enforcement
        webPreferences.nodeIntegration = false
        webPreferences.nodeIntegrationInWorker = false
        webPreferences.contextIsolation = true
        webPreferences.sandbox = true
        webPreferences.webSecurity = true
        webPreferences.allowRunningInsecureContent = false
        webPreferences.spellcheck = false
        webPreferences.backgroundThrottling = true
      })

      // Baseline for every other window (extension helpers, page watchers): no popups.
      // The UI window and sign-in popups replace this handler with their own.
      if (contents.getType() === 'window') {
        contents.setWindowOpenHandler(() => ({ action: 'deny' }))
      }

      // Security rules & minimalist scrollbar injection for webview contents
      if (contents.getType() === 'webview') {
        // Links, popups and context-menu actions from a private tab must stay private
        const isPrivateContents = contents.session === session.fromPartition(PRIVATE_PARTITION)
        // Popups (OAuth) must stay in the same profile as the tab that opened them
        const contentsPartition = partitionOfSession(contents.session)

        contents.setMaxListeners(50)
        activeWebviewContents.add(contents)
        contents.on('destroyed', () => {
          activeWebviewContents.delete(contents)
          updateMediaPowerSaveState()
        })

        // Track audible media playback to coordinate OS App Nap and sleep prevention
        contents.on('media-started-playing', () => updateMediaPowerSaveState())
        contents.on('media-paused', () => updateMediaPowerSaveState())

        // Inject Mullvad-standard Privacy Shield hardening & ad suppression
        privacyEngine.injectShieldScript(contents)

        // Password manager: offer to save logins, fill saved ones (isolated world)
        passwordManager.attach(contents)

        // Close context menu and omnibox dropdown whenever webview gains focus or is clicked
        contents.on('focus', () => {
          const win = windowFor(contents)
          if (win) {
            win.webContents.send('context-menu:close')
            win.webContents.send('omnibox:close')
          }
        })

        // Also dismiss on user mouse clicks anywhere on the webpage
        // Last real click / keypress: popups opened right after one are user-initiated
        trackUserInput(contents)
        contents.on('input-event', (_event, input) => {
          if (input.type === 'mouseDown') {
            const win = windowFor(contents)
            if (win) {
              win.webContents.send('context-menu:close')
              win.webContents.send('omnibox:close')
            }
          }
        })

        // Attach unified keyboard shortcut handler for webview contents
        attachKeyboardShortcuts(contents, true)

        // Set matching background color to eliminate white flashes on new webview creation / navigation
        const isDark = nativeTheme.shouldUseDarkColors
        if (typeof (contents as any).setBackgroundColor === 'function') {
          ;(contents as any).setBackgroundColor(isDark ? '#09090b' : '#ffffff')
        }

        const customScrollbarCss = `
          /* Horizontal only (blocks swipe-back). Vertical 'overscroll-behavior: none' on the root
             breaks mouse-wheel scrolling on many sites (verified on duckduckgo.com). Pull-to-refresh
             is already disabled via Chromium switches. */
          html, body {
            overscroll-behavior-x: none !important;
          }
          :root, html, body, * {
            scrollbar-width: thin !important;
            scrollbar-color: rgba(130, 130, 150, 0.4) transparent !important;
          }
          ::-webkit-scrollbar {
            width: 6px !important;
            height: 6px !important;
          }
          ::-webkit-scrollbar-track {
            background: transparent !important;
          }
          ::-webkit-scrollbar-thumb {
            background: rgba(130, 130, 150, 0.4) !important;
            border-radius: 9999px !important;
            border: 1px solid transparent !important;
            background-clip: padding-box !important;
          }
          ::-webkit-scrollbar-thumb:hover {
            background: rgba(150, 150, 180, 0.7) !important;
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
            if (SAFE_EXTERNAL_PROTOCOLS.has(protocol)) {
              openExternalFromPage(contents, rawUrl)
              return { action: 'deny' }
            }

            // Popup windows (window.open with a size, or disposition "new-window") stay real windows
            // that share the tab's session and keep window.opener, so "Sign in with Google / Apple /
            // Microsoft / Facebook ..." can report back to the page. Allowed for known sign-in URLs,
            // or for any popup opened right after the user clicked/typed (blocks popup spam).
            const isSmallPopup = !!details.features && (details.features.includes('width=') || details.features.includes('height='))
            const wantsPopupWindow = isSmallPopup || details.disposition === 'new-window'
            const isAuthFlow = /accounts\.google\.com|\/oauth|\/auth|login|signin|sign-in|sso|saml/i.test(rawUrl)
            const userInitiated = hasRecentUserInput(contents)
            if (wantsPopupWindow && (isAuthFlow || userInitiated) && ['http:', 'https:', 'about:'].includes(protocol)) {
              const startupTheme = themeManager.getStartupTheme()
              return {
                action: 'allow',
                overrideBrowserWindowOptions: {
                  icon: getBrowserLogoPath(),
                  backgroundColor: startupTheme.backgroundColor,
                  parent: windowFor(contents) || undefined,
                  autoHideMenuBar: true,
                  webPreferences: {
                    partition: contentsPartition,
                    nodeIntegration: false,
                    nodeIntegrationInWorker: false,
                    contextIsolation: true,
                    sandbox: true,
                    webSecurity: true,
                    allowRunningInsecureContent: false,
                    userAgent: customUserAgent
                  }
                }
              }
            }

            // Standard web URLs: http, https, about, view-source
            if (['http:', 'https:', 'about:', 'view-source:'].includes(protocol) || !parsed) {
              const isActive = details.disposition !== 'background-tab'
              const ownerWin = windowFor(contents)
              if (ownerWin) {
                ownerWin.webContents.send('tabs:open-url', {
                  url: rawUrl,
                  active: isActive,
                  sourceWebContentsId: contents.id,
                  isPrivate: isPrivateContents
                })
              }
              return { action: 'deny' }
            }

            // Unknown protocol: deny. Never hand arbitrary schemes to the OS (ms-msdt:, search-ms:, ...)
            console.warn(`[Security] Blocked window.open with unsupported protocol: ${protocol}`)
          } catch (e) {
            console.warn('[Webview] Malformed URL in window open handler:', details.url, e)
          }
          return { action: 'deny' }
        })

        // Allowed OAuth popups are real BrowserWindows: give them the same popup/navigation guards
        contents.on('did-create-window', (popup) => {
          setupWebContentsSecurity(popup.webContents, windowFor(contents))
          // "Sign in with ..." popups get saved-password fill too
          passwordManager.attach(popup.webContents)
        })

        // Guard against dangerous schemes without blocking relative or in-page redirection
        contents.on('will-navigate', (event, navigationUrl) => {
          try {
            const currentUrl = contents.getURL() || 'http://localhost'
            const parsed = new URL(navigationUrl, currentUrl)
            if (DANGEROUS_PROTOCOLS.has(parsed.protocol)) {
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

          const menuWin = windowFor(contents)
          if (menuWin) {
            menuWin.webContents.send('context-menu:open', {
              webContentsId: contents.id,
              isPrivate: isPrivateContents,
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
    mainWindow.once('closed', () => {
      mainWindow = null
    })
    attachKeyboardShortcuts(mainWindow.webContents, false)
    devtoolsManager.init(mainWindow)

    // Surface UI errors in the terminal (otherwise a renderer crash is just a black window)
    mainWindow.webContents.on('console-message', (details: any) => {
      const level = details?.level
      if (level === 'error' || level === 3) {
        console.error('[UI]', details.message, details.sourceId ? `(${details.sourceId}:${details.lineNumber})` : '')
      }
    })
    mainWindow.webContents.on('render-process-gone', (_e, details) => {
      console.error('[UI] Renderer process gone:', details.reason, 'exitCode:', details.exitCode)
    })
    app.on('child-process-gone', (_e, details) => {
      console.error('[Main] Child process gone:', details.type, details.reason)
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow()
        mainWindow.once('closed', () => {
          mainWindow = null
        })
        attachKeyboardShortcuts(mainWindow.webContents, false)
      } else if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
      }
    })
  })

  let shutdownTasksDone = false
  app.on('before-quit', () => {
    try {
      localStorageService.flushSave()
    } catch {}
    try {
      historyService.flushSave()
    } catch {}
    try {
      smartService.dispose()
      pageIndex.flushSave()
    } catch {}
    try {
      privacyEngine.flushReport()
    } catch {}
    // Once per quit (clear-on-exit re-triggers before-quit after its async cleanup)
    if (!shutdownTasksDone) {
      shutdownTasksDone = true
      try {
        syncService.syncOnExit()
      } catch {}
    }
    // Clean exit: next launch won't report a crash
    localStorageService.markCleanExit()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
