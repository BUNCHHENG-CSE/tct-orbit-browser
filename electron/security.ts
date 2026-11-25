import { sitePermissions, toPromptable } from './permissions/sitePermissions'
import { PRIVATE_PARTITION } from './privacy/types'
import { getPersistentTabSessions } from './sessions'
import {
  app,
  session,
  shell,
  safeStorage,
  dialog,
  BrowserWindow,
  type WebFrameMain,
  type WebContents,
  type Session,
  type IpcMain,
  type IpcMainInvokeEvent,
  type IpcMainEvent,
  WebContentsView
} from 'electron'
import { z, type ZodType } from 'zod'
import { devServerUrl, isAppUiUrl } from './appUi'

// ==============================================================================
// 1. IPC Sender Validation & Frame Guard
// ==============================================================================

/**
 * Validates that an incoming IPC request originated strictly from the internal
 * browser UI shell (file:// in production or local Vite dev server in development).
 * Rejects requests from child frames, untrusted webviews, or external HTTP(S) frames.
 */
export function validateSender(frame: WebFrameMain | null | undefined): boolean {
  if (!frame) {
    console.warn('[Security Guard] Rejected IPC: frame is null or undefined')
    return false
  }

  // Reject IPC calls from nested sub-frames or iframes to prevent iframe-based privilege escalation
  if (frame.parent !== null) {
    console.warn(`[Security Guard] Rejected IPC: call originated from nested sub-frame: ${frame.url}`)
    return false
  }

  if (!isAppUiUrl(frame.url)) {
    console.warn(`[Security Guard] Rejected IPC: not the browser UI: ${frame.url || '(no URL)'}`)
    return false
  }
  return true
}

/** The call comes from the UI page AND from a real window (never a webview or extension page) */
function isTrustedSender(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return validateSender(event.senderFrame) && event.sender.getType() === 'window'
}

/**
 * Type-safe, sender-validated wrapper for ipcMain.handle
 */
export function secureHandle(
  ipcMain: IpcMain,
  channel: string,
  schema: ZodType<any> | null,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any
): void {
  ipcMain.handle(channel, async (event, ...args: any[]) => {
    if (!isTrustedSender(event)) {
      console.error(`[Security Guard] UNAUTHORIZED: Invoke on channel "${channel}" from frame: ${event.senderFrame?.url || 'unknown'}`)
      throw new Error(`Unauthorized IPC invocation on channel: ${channel}`)
    }

    if (schema) {
      const target = args.length <= 1 ? args[0] : args
      const result = schema.safeParse(target)
      if (!result.success) {
        console.error(`[Security Guard] INVALID PAYLOAD on channel "${channel}":`, result.error.issues)
        throw new Error(`Invalid payload for channel: ${channel}`)
      }
    }

    return handler(event, ...args)
  })
}

/**
 * Type-safe, sender-validated wrapper for ipcMain.on
 */
export function secureOn(
  ipcMain: IpcMain,
  channel: string,
  schema: ZodType<any> | null,
  listener: (event: IpcMainEvent, ...args: any[]) => void
): void {
  ipcMain.on(channel, (event, ...args: any[]) => {
    if (!isTrustedSender(event)) {
      console.error(`[Security Guard] UNAUTHORIZED: Event on channel "${channel}" from frame: ${event.senderFrame?.url || 'unknown'}`)
      return
    }

    if (schema) {
      const target = args.length <= 1 ? args[0] : args
      const result = schema.safeParse(target)
      if (!result.success) {
        console.error(`[Security Guard] INVALID PAYLOAD on channel "${channel}":`, result.error.issues)
        return
      }
    }

    listener(event, ...args)
  })
}

// ==============================================================================
// 2. Payload Validation Schemas (Zod)
// ==============================================================================

export const Schemas = {
  // Tabs
  tabList: z.string().min(1),
  tabCreate: z.object({
    spaceId: z.string().min(1),
    url: z.string().min(1),
    title: z.string().optional(),
    favicon: z.string().nullable().optional(),
    isPinned: z.boolean().optional(),
    order: z.number().optional(),
    isPrivate: z.boolean().optional(),
    groupId: z.string().max(200).nullable().optional()
  }),
  tabUpdate: z.tuple([
    z.string().min(1),
    z.object({
      url: z.string().optional(),
      title: z.string().optional(),
      favicon: z.string().nullable().optional(),
      isPinned: z.boolean().optional(),
      spaceId: z.string().optional(),
      order: z.number().optional(),
      groupId: z.string().max(200).nullable().optional()
    })
  ]),
  tabRemove: z.string().min(1),
  tabReorder: z.tuple([
    z.string().min(1),
    z.array(z.string())
  ]),

  // Spaces
  spaceCreate: z.object({
    name: z.string().min(1).max(80),
    color: z.string().optional(),
    icon: z.string().optional(),
    order: z.number().optional(),
    initialUrl: z.string().max(8192).optional(),
    initialTitle: z.string().max(1000).optional(),
    isolated: z.boolean().optional()
  }),
  spaceUpdate: z.tuple([
    z.string().min(1),
    z.object({
      name: z.string().optional(),
      color: z.string().optional(),
      icon: z.string().optional(),
      isActive: z.boolean().optional(),
      isolated: z.boolean().optional()
    })
  ]),
  spaceId: z.string().min(1),

  // Tab groups
  groupList: z.string().min(1).max(200),
  groupCreate: z.object({
    spaceId: z.string().min(1).max(200),
    name: z.string().max(80),
    parentId: z.string().max(200).nullable().optional(),
    color: z.string().max(32).nullable().optional(),
    tabIds: z.array(z.string().max(200)).max(500).optional()
  }),
  groupUpdate: z.tuple([
    z.string().min(1).max(200),
    z.object({
      name: z.string().max(80).optional(),
      color: z.string().max(32).nullable().optional(),
      collapsed: z.boolean().optional(),
      parentId: z.string().max(200).nullable().optional(),
      order: z.number().int().min(0).max(100000).optional(),
      openLinksInGroup: z.boolean().optional()
    })
  ]),
  groupRemove: z.union([
    z.string().min(1).max(200),
    z.tuple([z.string().min(1).max(200), z.boolean().optional()])
  ]),

  // Saved split layouts
  splitSave: z.object({
    name: z.string().max(80),
    primary: z.object({ url: z.string().min(1).max(8192), title: z.string().max(1000) }),
    secondary: z.object({ url: z.string().min(1).max(8192), title: z.string().max(1000) }),
    ratio: z.number().min(0).max(1)
  }),
  splitRemove: z.string().min(1).max(200),

  // Settings
  settingsUpdate: z.object({
    defaultSearchEngine: z.string().optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
    sidebarCollapsed: z.boolean().optional(),
    accentColor: z.string().optional(),
    accentPreset: z.string().optional(),
    webColorScheme: z.enum(['match-browser', 'light', 'dark', 'system']).optional(),
    smoothScrolling: z.boolean().optional(),
    startupBehavior: z.enum(['new-tab', 'previous-session', 'custom-urls']).optional(),
    startupCustomUrls: z.array(z.string()).optional(),
    downloadPath: z.string().optional(),
    askWhereToSave: z.boolean().optional(),
    openFolderOnDownload: z.boolean().optional(),
    defaultZoom: z.number().min(50).max(300).optional(),
    autoArchiveDuration: z.enum(['off', '12h', '24h', '3d', '7d']).optional(),
    memorySaverEnabled: z.boolean().optional(),
    sleepTimeoutMinutes: z.number().int().min(1).max(1440).optional(),
    newTabPage: z.enum(['command-bar', 'start-page']).optional(),
    tabLayout: z.enum(['sidebar', 'topbar']).optional(),
    newTabsOnTop: z.boolean().optional(),
    favoritesBar: z.enum(['always', 'never', 'new-tab']).optional()
  }),

  // Downloads
  downloadsOpenFolder: z.string().optional(),
  downloadsShowInFolder: z.string().min(1),
  downloadsControl: z.string().min(1).max(200),
  downloadsOpenFile: z.string().min(1),
  downloadsDeleteFile: z.object({
    id: z.string().min(1),
    deleteDiskFile: z.boolean().optional()
  }),

  // Backup & Restore
  backupExport: z.object({
    categories: z.array(z.enum(['settings', 'spaces', 'tabs', 'privacy'])).optional(),
    includeOpenTabs: z.boolean().optional(),
    includePinnedTabs: z.boolean().optional()
  }).optional(),
  backupInspectJson: z.string().min(1),
  backupImport: z.object({
    rawContent: z.string().min(1),
    mode: z.enum(['merge', 'replace'])
  }),

  // History
  historyRecord: z.object({
    url: z.string().min(1),
    title: z.string().optional(),
    favicon: z.string().nullable().optional(),
    spaceId: z.string().optional()
  }),
  historyGet: z.object({
    query: z.string().optional(),
    spaceId: z.string().optional(),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional()
  }).optional(),
  historySearch: z.object({
    query: z.string(),
    limit: z.number().int().positive().optional()
  }),
  historyDelete: z.string().min(1),
  historyDeleteByUrl: z.string().min(1),
  historyClear: z.enum(['last-hour', 'today', 'last-7-days', 'all']).optional(),

  // Notes
  notesGet: z.string().min(1),
  notesSave: z.object({
    spaceId: z.string().min(1),
    content: z.string()
  }),

  // Bookmarks
  bookmarksAdd: z.object({
    url: z.string().min(1),
    title: z.string(),
    favicon: z.string().nullable().optional(),
    spaceId: z.string().optional(),
    folder: z.string().optional(),
    isReadingList: z.boolean().optional()
  }),
  bookmarksDelete: z.string().min(1),
  bookmarksUpdate: z.tuple([
    z.string().min(1).max(100),
    z.object({ title: z.string().max(500).optional(), url: z.string().min(1).max(4096).optional(), folder: z.string().min(1).max(300).optional() })
  ]),
  bookmarksReorder: z.array(z.string().min(1).max(100)).max(5000),
  bookmarksRenameFolder: z.tuple([z.string().min(1).max(300), z.string().min(1).max(300)]),
  bookmarksFolder: z.string().min(1).max(300),
  bookmarksDeleteByUrl: z.string().min(1),
  bookmarksToggleRead: z.string().min(1),
  bookmarksIsBookmarked: z.string().min(1),

  // Site Info & Permissions
  siteGetInfo: z.union([z.string().min(1), z.tuple([z.string().min(1), z.string().max(200).optional()])]),
  siteClearData: z.string().min(1),

  // Theme
  themeSet: z.object({
    mode: z.enum(['light', 'dark', 'system']).optional(),
    accent: z.string().optional(),
    webColorScheme: z.enum(['match-browser', 'light', 'dark', 'system']).optional()
  }),

  // Navigation
  navigationOpenExternal: z.string().url().refine(
    (url) => url.startsWith('http://') || url.startsWith('https://'),
    { message: 'Only http and https protocols are permitted for external opening' }
  ),

  // Window
  windowSetTitle: z.string().max(300),
  windowSetFullScreen: z.boolean(),

  // Process / Task Manager
  processKill: z.object({
    pid: z.number().int().positive().optional(),
    webContentsId: z.number().int().positive().optional()
  }),

  // DevTools
  devtoolsOpen: z.object({
    webContentsId: z.number().int().positive().optional(),
    bounds: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number()
    }).optional()
  }),
  devtoolsInspect: z.object({
    webContentsId: z.number().int().positive(),
    x: z.number(),
    y: z.number(),
    bounds: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number()
    }).optional()
  }),
  devtoolsBounds: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
  }),
  devtoolsOverlayRects: z.array(z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
  })).max(20),
  devtoolsSyncTab: z.object({
    webContentsId: z.number().int().positive()
  }),

  // Webview Action Proxy - Whitelisted methods only
  webviewCall: z.object({
    webContentsId: z.number().int().positive(),
    method: z.enum([
      'reload',
      'reloadIgnoringCache',
      'goBack',
      'goForward',
      'stop',
      'print',
      'undo',
      'redo',
      'cut',
      'copy',
      'paste',
      'selectAll',
      'zoomIn',
      'zoomOut',
      'resetZoom',
      'setAudioMuted',
      'isAudioMuted',
      'findInPage',
      'stopFindInPage'
    ]),
    args: z.array(z.any()).optional().default([])
  }),
  webContentsTarget: z.object({
    webContentsId: z.number().int().positive()
  }),

  // Privacy
  privacyUpdatePrefs: z
    .object({
      adBlockerEnabled: z.boolean(),
      trackerProtection: z.boolean(),
      fingerprintResistance: z.boolean(),
      httpsOnlyMode: z.boolean(),
      dnsOverHttps: z.boolean(),
      dohProvider: z.enum(['mullvad', 'cloudflare', 'quad9', 'adguard']),
      webrtcProtection: z.boolean(),
      globalPrivacyControl: z.boolean(),
      stripTrackingParams: z.boolean(),
      blockThirdPartyCookies: z.boolean(),
      clearCacheOnExit: z.boolean(),
      blockPings: z.boolean(),
      strictReferrer: z.boolean(),
      spoofLanguage: z.boolean(),
      blockCookieBanners: z.boolean(),
      proxyMode: z.enum(['off', 'system', 'tor', 'custom']),
      proxyUrl: z
        .string()
        .max(300)
        .regex(/^(socks5|socks4|http|https):\/\/[a-z0-9.\-_[\]:]+:\d{1,5}$/i, 'Expected scheme://host:port'),
      whitelistedOrigins: z.array(z.string().max(2048)).max(5000)
    })
    .partial(),
  privacyTargetUrl: z.string().min(1),
  privacyToggleOrigin: z.string().min(1)
}

// ==============================================================================
// 3. WebRTC IP Leak Prevention & Session Hardening
// ==============================================================================

/**
 * Configure Chromium WebRTC IP handling policy to prevent leaking private LAN IP
 * addresses and local interfaces when connecting to WebRTC peers or STUN servers.
 */
export function setupWebRTCLeakProtection(
  contents: WebContents,
  policy: 'disable_non_proxied_udp' | 'default_public_interface_only' = 'disable_non_proxied_udp'
): void {
  try {
    contents.setWebRTCIPHandlingPolicy(policy)
  } catch (err) {
    console.warn('[Security] Could not apply WebRTC IP handling policy:', err)
  }
}

// NOTE: Request-header hardening (X-Client-Data stripping, GPC/DNT, referrer trimming) lives in
// PrivacyEngine.setupNetworkFilters. Electron allows only ONE onBeforeSendHeaders listener per
// session, so registering a second one here would silently replace (or be replaced by) that one.

// --- User gestures & external apps ---

const lastUserInput = new WeakMap<WebContents, number>()

/** Remember real clicks / key presses, so pages can't act "for" the user without one */
export function trackUserInput(contents: WebContents): void {
  contents.on('input-event', (_event, input) => {
    if (input.type === 'mouseDown' || input.type === 'keyDown' || input.type === 'rawKeyDown' || input.type === 'gestureTap') {
      lastUserInput.set(contents, Date.now())
    }
  })
}

export function hasRecentUserInput(contents: WebContents, withinMs = 5000): boolean {
  return Date.now() - (lastUserInput.get(contents) ?? 0) < withinMs
}

function dialogParent(contents: WebContents | null): BrowserWindow | null {
  const host = (contents as any)?.hostWebContents as WebContents | undefined
  const win = contents ? BrowserWindow.fromWebContents(host && !host.isDestroyed() ? host : contents) : null
  return win && !win.isDestroyed() ? win : null
}

/** Native yes/no question. One at a time per page, so a page can't stack dialogs. */
const asking = new WeakSet<WebContents>()
async function askUser(contents: WebContents, message: string, detail: string, confirm: string): Promise<boolean> {
  if (asking.has(contents)) return false
  asking.add(contents)
  try {
    const options: Electron.MessageBoxOptions = {
      type: 'question',
      buttons: [confirm, 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      message,
      detail
    }
    const win = dialogParent(contents)
    const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
    return response === 0
  } finally {
    asking.delete(contents)
  }
}

/** Link to another app (mailto:, zoommtg: ...): known schemes only, and only if the user wants it */
async function allowExternalUrl(contents: WebContents | null, rawUrl: string): Promise<boolean> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (!SAFE_EXTERNAL_PROTOCOLS.has(url.protocol) || rawUrl.length > 8192) return false
  if (!contents || contents.isDestroyed()) return false
  if (hasRecentUserInput(contents)) return true
  // The page did this on its own (no click): ask first
  return askUser(contents, 'Open another app?', `${contents.getURL().slice(0, 200)}\nwants to open:\n${rawUrl.slice(0, 300)}`, 'Open')
}

export function openExternalFromPage(contents: WebContents, rawUrl: string): void {
  allowExternalUrl(contents, rawUrl)
    .then((ok) => (ok ? shell.openExternal(rawUrl) : undefined))
    .catch(() => {})
}

/**
 * Hardens device, sensor, and media permissions: default-deny all sensitive permissions.
 */
export function lockDownSessionPermissions(ses: Session): void {
  // Decisions made in private tabs are kept in memory only
  const isPrivateSession = ses === session.fromPartition(PRIVATE_PARTITION)
  // Electron permission names (camera/microphone arrive as 'media')
  const SENSITIVE_PERMISSIONS = new Set([
    'media',
    'camera',
    'microphone',
    'display-capture',
    'geolocation',
    'notifications',
    'clipboard-read',
    'midi',
    'midiSysex',
    'midi-sysex',
    'sensors',
    'accessibility-events',
    'serial',
    'hid',
    'usb',
    'bluetooth',
    'idle-detection',
    'window-management',
    'local-fonts',
    'screen-wake-lock',
    'speaker-selection',
    // document.execCommand('paste'): would let pages read the clipboard without any prompt
    'deprecated-sync-clipboard-read',
    'payment-handler',
    'periodic-background-sync'
  ])

  // Harmless, user-initiated browser features
  const ALLOWED_PERMISSIONS = new Set([
    'fullscreen',
    'pointerLock',
    'keyboardLock',
    'mediaKeySystem',
    'clipboard-sanitized-write',
    'fileSystem'
  ])

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const url = webContents?.getURL() || ''
    if (url.startsWith('devtools://')) {
      return callback(true)
    }

    // External protocol launches (link to mailto:, ms-msdt:, search-ms: ...): only known-safe schemes
    if (permission === 'openExternal') {
      const externalURL = (details as { externalURL?: string }).externalURL || ''
      allowExternalUrl(webContents, externalURL)
        .then((ok) => {
          if (!ok) console.warn(`[Security] Blocked external protocol launch: ${externalURL.slice(0, 200)}`)
          callback(ok)
        })
        .catch(() => callback(false))
      return
    }

    // A page that was given a file to read now wants to change it: ask, like Chrome does
    if (permission === 'fileSystem' && (details as { fileAccessType?: string }).fileAccessType === 'writable') {
      const target = (details as { filePath?: string }).filePath || ''
      if (!webContents || webContents.isDestroyed()) return callback(false)
      let site = url
      try {
        site = new URL(details.requestingUrl || url).origin
      } catch {}
      askUser(webContents, 'Let this site change your files?', `${site}\nwants to save changes to:\n${target}`, 'Allow')
        .then((ok) => callback(ok))
        .catch(() => callback(false))
      return
    }

    // Camera, microphone, location, notifications, clipboard, MIDI: ask the user (per site)
    if (toPromptable(permission, details).length > 0 && ses !== session.defaultSession) {
      sitePermissions
        .request(webContents, details.requestingUrl || url, permission, details, isPrivateSession)
        .then((allow) => callback(allow))
        .catch(() => callback(false))
      return
    }

    if (SENSITIVE_PERMISSIONS.has(permission)) {
      console.warn(`[Security] Blocked permission request "${permission}" for URL: ${details.requestingUrl || url}`)
      return callback(false)
    }

    return callback(ALLOWED_PERMISSIONS.has(permission))
  })

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    if (webContents && !webContents.isDestroyed() && webContents.getURL().startsWith('devtools://')) {
      return true
    }
    if (toPromptable(permission).length > 0 && ses !== session.defaultSession) {
      return sitePermissions.check(webContents, requestingOrigin, permission, isPrivateSession)
    }
    return !SENSITIVE_PERMISSIONS.has(permission)
  })
}

/**
 * Configures the dedicated isolated browsing partition ('persist:browser-tabs').
 * Permissions and network filters are attached by PrivacyEngine.init().
 */
export function setupIsolatedTabSession(partition = 'persist:browser-tabs'): Session {
  const tabSession = session.fromPartition(partition)
  try {
    tabSession.setSpellCheckerEnabled(false)
  } catch {}
  lockDownSessionPermissions(tabSession)
  return tabSession
}

// ==============================================================================
// 4. Navigation, Popup & Protocol Hijack Protection
// ==============================================================================

export const DANGEROUS_PROTOCOLS = new Set([
  'file:',
  'javascript:',
  'vbscript:',
  'ms-msdt:',
  'search-ms:',
  'steam:',
  'cmd:',
  'powershell:',
  'ms-appinstaller:',
  'vss:'
])

export const SAFE_EXTERNAL_PROTOCOLS = new Set([
  'mailto:',
  'tel:',
  'magnet:',
  'slack:',
  'discord:',
  'zoommtg:'
])

/**
 * Attaches navigation, popup, and DevTools locks to the main browser UI BrowserWindow
 */
export function setupMainWindowSecurity(mainWindow: BrowserWindow): void {
  const wc = mainWindow.webContents

  // 1. Enforce WebRTC leak prevention
  setupWebRTCLeakProtection(wc)

  // 2. Prevent the internal UI shell from navigating away on link click or drag-and-drop
  wc.on('will-navigate', (event, navigationUrl) => {
    // Dev: HMR may reload the page. Built app: the UI never navigates.
    if (!devServerUrl() || !isAppUiUrl(navigationUrl)) {
      event.preventDefault()
      console.warn(`[Security] Blocked UI shell navigation to external URL: ${navigationUrl}`)
    }
  })

  // 3. Deny popup creation directly from the UI shell
  wc.setWindowOpenHandler((details) => {
    try {
      const parsed = new URL(details.url)
      if (['http:', 'https:'].includes(parsed.protocol)) {
        shell.openExternal(details.url).catch(() => {})
      }
    } catch {}
    return { action: 'deny' }
  })

  // 4. Production Anti-Tampering: Disable DevTools on internal UI window
  if (app.isPackaged) {
    wc.on('before-input-event', (event, input) => {
      // Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Cmd+Option+I, Cmd+Option+J
      const isDevToolsKey =
        input.key === 'F12' ||
        ((input.control || input.meta) &&
          input.shift &&
          (input.key.toLowerCase() === 'i' || input.key.toLowerCase() === 'j'))

      if (isDevToolsKey) {
        event.preventDefault()
      }
    })

    wc.on('devtools-opened', () => {
      wc.closeDevTools()
    })
  }
}

/**
 * Attaches security guards to child web views, WebContentsView instances, and webview tags
 */
export function setupWebContentsSecurity(contents: WebContents, mainWindow?: BrowserWindow | null): void {
  // 1. WebRTC leak prevention
  setupWebRTCLeakProtection(contents)
  trackUserInput(contents)
  // Links from a private tab's popup must open as private tabs
  const isPrivate = contents.session === session.fromPartition(PRIVATE_PARTITION)

  // Popups opened by popups get the same guards (without this they had none)
  contents.on('did-create-window', (popup) => setupWebContentsSecurity(popup.webContents, mainWindow))

  // 2. Block navigation to dangerous protocols
  contents.on('will-navigate', (event, navigationUrl) => {
    try {
      const currentUrl = contents.getURL() || 'http://localhost'
      const parsed = new URL(navigationUrl, currentUrl)

      if (DANGEROUS_PROTOCOLS.has(parsed.protocol)) {
        event.preventDefault()
        console.warn(`[Security] Blocked navigation to dangerous protocol: ${parsed.protocol}`)
        return
      }

      // Block non-image data URLs
      if (parsed.protocol === 'data:' && !navigationUrl.startsWith('data:image/')) {
        event.preventDefault()
        console.warn('[Security] Blocked non-image data: URL navigation')
        return
      }
    } catch (e) {
      console.warn('[Security] Could not parse navigation URL:', navigationUrl, e)
    }
  })

  // 3. Intercept popups & window.open
  contents.setWindowOpenHandler((details) => {
    try {
      const rawUrl = details.url || ''
      const parsed = new URL(rawUrl)
      const protocol = parsed.protocol

      // Safe OS external protocols
      if (SAFE_EXTERNAL_PROTOCOLS.has(protocol)) {
        openExternalFromPage(contents, rawUrl)
        return { action: 'deny' }
      }

      // Block dangerous protocols
      if (DANGEROUS_PROTOCOLS.has(protocol)) {
        console.warn(`[Security] Blocked window.open with dangerous protocol: ${protocol}`)
        return { action: 'deny' }
      }

      // Small explicit OAuth / login popups
      const isSmallPopup = details.features && (details.features.includes('width=') || details.features.includes('height='))
      const isAuthFlow =
        rawUrl.includes('accounts.google.com') ||
        rawUrl.includes('/oauth') ||
        rawUrl.includes('/auth') ||
        rawUrl.includes('login') ||
        rawUrl.includes('signin')

      if (isSmallPopup && isAuthFlow && ['http:', 'https:', 'about:'].includes(protocol)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            parent: mainWindow || undefined,
            autoHideMenuBar: true,
            webPreferences: {
              // Stay in the opener's profile (shared, private or a space profile)
              session: contents.session,
              nodeIntegration: false,
              nodeIntegrationInWorker: false,
              contextIsolation: true,
              sandbox: true,
              webSecurity: true,
              allowRunningInsecureContent: false
            }
          }
        }
      }

      // Standard web URLs: route to UI tab creation
      if (['http:', 'https:', 'about:', 'view-source:'].includes(protocol)) {
        const isActive = details.disposition !== 'background-tab'
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('tabs:open-url', {
            url: rawUrl,
            active: isActive,
            sourceWebContentsId: contents.id,
            isPrivate
          })
        }
        return { action: 'deny' }
      }

      // Unknown protocol: deny. Never hand arbitrary schemes to the OS (e.g. ms-msdt:, search-ms:)
      console.warn(`[Security] Blocked window.open with unknown protocol: ${protocol}`)
    } catch (err) {
      console.warn('[Security] Failed to handle window.open details:', details.url, err)
    }

    return { action: 'deny' }
  })
}

/**
 * Creates a fully sandboxed WebContentsView instance for native tab embedding
 */
export function createSecureWebContentsView(
  partition = 'persist:browser-tabs'
): WebContentsView {
  const tabSession = session.fromPartition(partition)
  const view = new WebContentsView({
    webPreferences: {
      session: tabSession,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      backgroundThrottling: true
    }
  })

  setupWebContentsSecurity(view.webContents)
  return view
}

// ==============================================================================
// 5. Encrypted Local Storage (OS DPAPI / Keychain) via safeStorage
// ==============================================================================

export const safeStorageVault = {
  isAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  },

  encryptString(plaintext: string): string {
    if (!plaintext) return ''
    if (this.isAvailable()) {
      try {
        const encryptedBuffer = safeStorage.encryptString(plaintext)
        return `enc:${encryptedBuffer.toString('base64')}`
      } catch (err) {
        console.error('[SafeStorage] Failed to encrypt string:', err)
      }
    }
    // Return base64 fallback with clear prefix if OS encryption is unavailable
    return `plain:${Buffer.from(plaintext, 'utf-8').toString('base64')}`
  },

  decryptString(encoded: string): string {
    if (!encoded) return ''
    try {
      if (encoded.startsWith('enc:')) {
        const ciphertextBase64 = encoded.slice(4)
        const buffer = Buffer.from(ciphertextBase64, 'base64')
        return safeStorage.decryptString(buffer)
      }
      if (encoded.startsWith('plain:')) {
        const base64Str = encoded.slice(6)
        return Buffer.from(base64Str, 'base64').toString('utf-8')
      }
      return encoded
    } catch (err) {
      console.error('[SafeStorage] Failed to decrypt string:', err)
      return ''
    }
  }
}

// ==============================================================================
// 6. Panic Wipe & Browsing Session Eraser
// ==============================================================================

/**
 * Cleanly wipes cache, localStorage, cookies, IndexedDB, and temporary traces across sessions.
 */
export async function panicWipeBrowsingData(
  targetSessions: Session[] = [...getPersistentTabSessions(), session.defaultSession]
): Promise<boolean> {
  let allClean = true

  for (const ses of targetSessions) {
    if (!ses) continue
    try {
      await ses.clearStorageData({
        storages: [
          'cookies',
          'filesystem',
          'indexdb',
          'localstorage',
          'shadercache',
          'serviceworkers',
          'cachestorage'
        ]
      })
      await ses.clearCache()
      await ses.clearAuthCache()
      await ses.clearHostResolverCache()
    } catch (err) {
      console.error('[Security] Error during panic wipe of session:', err)
      allClean = false
    }
  }

  return allClean
}
