import {
  app,
  session,
  shell,
  safeStorage,
  type WebFrameMain,
  type WebContents,
  type BrowserWindow,
  type Session,
  type IpcMain,
  type IpcMainInvokeEvent,
  type IpcMainEvent,
  WebContentsView
} from 'electron'
import { z, type ZodType } from 'zod'
import path from 'path'

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

  const frameUrl = frame.url
  if (!frameUrl) {
    console.warn('[Security Guard] Rejected IPC: frame has no URL')
    return false
  }

  try {
    const parsed = new URL(frameUrl)

    // Production environment (packaged app)
    if (app.isPackaged) {
      if (parsed.protocol === 'file:') {
        const normalizedFramePath = path.normalize(decodeURIComponent(parsed.pathname))
        const appPath = path.normalize(app.getAppPath())

        const cleanFramePath = process.platform === 'win32'
          ? normalizedFramePath.replace(/^[/\\]+/, '').toLowerCase()
          : normalizedFramePath
        const cleanAppPath = process.platform === 'win32'
          ? appPath.replace(/^[/\\]+/, '').toLowerCase()
          : appPath

        const isInsideApp = cleanFramePath.startsWith(cleanAppPath)
        if (!isInsideApp) {
          console.warn(`[Security Guard] Rejected IPC: file URL is outside application bundle: ${frameUrl}`)
        }
        return isInsideApp
      }

      // Custom app protocols if registered
      if (parsed.protocol === 'app:' || parsed.protocol === 'tct-orbit:') {
        return true
      }

      console.warn(`[Security Guard] Rejected IPC: unauthorized protocol in packaged build: ${frameUrl}`)
      return false
    }

    // Development environment
    const devServerUrl = process.env['ELECTRON_RENDERER_URL']
    if (devServerUrl) {
      try {
        const devParsed = new URL(devServerUrl)
        if (parsed.origin === devParsed.origin) {
          return true
        }
      } catch {}
    }

    // Local file protocol in development
    if (parsed.protocol === 'file:') {
      return true
    }

    console.warn(`[Security Guard] Rejected IPC: frame origin does not match internal UI in dev: ${frameUrl}`)
    return false
  } catch (err) {
    console.error('[Security Guard] Error parsing frame URL for sender validation:', err)
    return false
  }
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
    if (!validateSender(event.senderFrame)) {
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
    if (!validateSender(event.senderFrame)) {
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
    favicon: z.string().nullable().optional()
  }),
  tabUpdate: z.tuple([
    z.string().min(1),
    z.object({
      url: z.string().optional(),
      title: z.string().optional(),
      favicon: z.string().nullable().optional(),
      isPinned: z.boolean().optional(),
      spaceId: z.string().optional(),
      order: z.number().optional()
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
    icon: z.string().optional()
  }),
  spaceUpdate: z.tuple([
    z.string().min(1),
    z.object({
      name: z.string().optional(),
      color: z.string().optional(),
      icon: z.string().optional(),
      isActive: z.boolean().optional()
    })
  ]),
  spaceId: z.string().min(1),

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
    autoArchiveDuration: z.enum(['off', '12h', '24h', '3d', '7d']).optional()
  }),

  // Downloads
  downloadsOpenFolder: z.string().optional(),
  downloadsShowInFolder: z.string().min(1),

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
      'resetZoom'
    ]),
    args: z.array(z.any()).optional().default([])
  }),
  webContentsTarget: z.object({
    webContentsId: z.number().int().positive()
  }),

  // Privacy
  privacyUpdatePrefs: z.record(z.string(), z.any()),
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
export function setupWebRTCLeakProtection(contents: WebContents): void {
  try {
    contents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
  } catch (err) {
    console.warn('[Security] Could not apply WebRTC IP handling policy:', err)
  }
}

/**
 * Strips tracking identifiers and enforces Referer privacy rules on outgoing web requests.
 */
export function setupWebRequestHardening(ses: Session): void {
  ses.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders }

    try {
      const parsed = new URL(details.url)

      // 1. Strip Google Chrome client telemetry and backend tracking identifiers
      delete requestHeaders['X-Client-Data']
      delete requestHeaders['x-client-data']
      delete requestHeaders['X-Google-GFE-Backend-Req-Headers']

      // 2. Send Global Privacy Control & Do Not Track signals
      requestHeaders['Sec-GPC'] = '1'
      requestHeaders['DNT'] = '1'

      // 3. Referer Leakage Prevention: Downgrade to origin-only for cross-origin requests
      if (details.referrer && details.referrer.startsWith('http')) {
        try {
          const refUrl = new URL(details.referrer)
          if (refUrl.origin !== parsed.origin) {
            requestHeaders['Referer'] = refUrl.origin + '/'
          }
        } catch {
          delete requestHeaders['Referer']
        }
      }
    } catch {}

    callback({ requestHeaders })
  })
}

/**
 * Hardens device, sensor, and media permissions: default-deny all sensitive permissions.
 */
export function lockDownSessionPermissions(ses: Session): void {
  const SENSITIVE_PERMISSIONS = new Set([
    'camera',
    'microphone',
    'geolocation',
    'notifications',
    'clipboard-read',
    'midi',
    'midi-sysex',
    'sensors',
    'accessibility-events',
    'serial',
    'hid',
    'usb',
    'idle-detection',
    'window-management',
    'local-fonts',
    'screen-wake-lock'
  ])

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const url = webContents.getURL()
    if (url.startsWith('devtools://')) {
      return callback(true)
    }

    if (SENSITIVE_PERMISSIONS.has(permission)) {
      console.warn(`[Security] Blocked hardware permission request "${permission}" for URL: ${details.requestingUrl || url}`)
      return callback(false)
    }

    // Permit standard browser view operations (fullscreen, pointerLock, DRM/EME, clipboard sanitized write)
    if (['fullscreen', 'pointerLock', 'mediaKeySystem', 'clipboard-sanitized-write'].includes(permission)) {
      return callback(true)
    }

    return callback(false)
  })

  ses.setPermissionCheckHandler((webContents, permission) => {
    if (webContents && !webContents.isDestroyed() && webContents.getURL().startsWith('devtools://')) {
      return true
    }
    if (SENSITIVE_PERMISSIONS.has(permission)) {
      return false
    }
    return true
  })
}

/**
 * Configures the dedicated isolated browsing partition ('persist:browser-tabs')
 */
export function setupIsolatedTabSession(partition = 'persist:browser-tabs'): Session {
  const tabSession = session.fromPartition(partition)
  lockDownSessionPermissions(tabSession)
  setupWebRequestHardening(tabSession)
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
    const devServerUrl = process.env['ELECTRON_RENDERER_URL']
    const isAllowed = devServerUrl
      ? navigationUrl.startsWith(devServerUrl)
      : navigationUrl.startsWith('file://') && navigationUrl.includes('renderer')

    if (!isAllowed) {
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
        shell.openExternal(rawUrl).catch(() => {})
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

      if (isSmallPopup && isAuthFlow) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            parent: mainWindow || undefined,
            autoHideMenuBar: true,
            webPreferences: {
              partition: 'persist:browser-tabs',
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
            sourceWebContentsId: contents.id
          })
        }
        return { action: 'deny' }
      }

      shell.openExternal(rawUrl).catch(() => {})
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
  targetSessions: Session[] = [session.fromPartition('persist:browser-tabs'), session.defaultSession]
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
