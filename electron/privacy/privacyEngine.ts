import { app, session, BrowserWindow, type Session, type WebContents } from 'electron'
import fs from 'fs'
import path from 'path'
import fetch from 'cross-fetch'
import { ElectronBlocker, Request } from '@ghostery/adblocker-electron'
import {
  type PrivacyShieldPrefs,
  type MasterShieldStatus,
  type PrivacyStats,
  type SiteShieldStatus,
  DEFAULT_PRIVACY_SHIELD_PREFS
} from './types'
import { getShieldInjectionScript } from './preloadShield'

// Tracking query parameters stripped from navigation & web requests
const TRACKING_QUERY_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_brand',
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'msclkid',
  'zanpid',
  'mc_eid',
  'igshid',
  'yclid',
  '_hsenc',
  '_hsmi',
  'mkt_tok',
  'trk',
  'tracking_id',
  's_kwcid'
])

// Hardcoded network patterns for high-frequency ad & tracker networks (fallback blocking)
const AD_URL_PATTERNS = [
  'doubleclick.net',
  'googleadservices.com',
  'googlesyndication.com',
  'scorecardresearch.com',
  'criteo.com',
  'adnxs.com',
  'moatads.com',
  'taboola.com',
  'outbrain.com',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'casalemedia.com'
]

function getRootDomain(hostname: string): string {
  if (!hostname) return ''
  const parts = hostname.toLowerCase().split('.')
  if (parts.length <= 2) return hostname.toLowerCase()
  const commonSecondLevel = new Set(['co', 'com', 'org', 'net', 'edu', 'gov', 'ac'])
  if (parts.length >= 3 && commonSecondLevel.has(parts[parts.length - 2])) {
    return parts.slice(-3).join('.')
  }
  return parts.slice(-2).join('.')
}

// First-party infrastructure domain clusters that share state legitimately (CDNs, auth, media, APIs)
const FIRST_PARTY_ECOSYSTEMS: Array<Set<string>> = [
  new Set(['youtube.com', 'youtu.be', 'ytimg.com', 'googlevideo.com', 'googleapis.com', 'google.com', 'gstatic.com', 'googleusercontent.com']),
  new Set(['github.com', 'githubassets.com', 'githubusercontent.com']),
  new Set(['microsoft.com', 'live.com', 'office.com', 'microsoftonline.com', 'msftauth.net']),
  new Set(['twitter.com', 'x.com', 'twimg.com']),
  new Set(['amazon.com', 'media-amazon.com', 'ssl-images-amazon.com', 'a2z.com'])
]

function isSameSiteOrRelated(targetHostname: string, topHostname: string): boolean {
  if (!targetHostname || !topHostname) return true
  const rootTarget = getRootDomain(targetHostname)
  const rootTop = getRootDomain(topHostname)
  if (rootTarget === rootTop) return true

  for (const cluster of FIRST_PARTY_ECOSYSTEMS) {
    if (cluster.has(rootTarget) && cluster.has(rootTop)) {
      return true
    }
  }
  return false
}

export class PrivacyEngine {
  private prefs: PrivacyShieldPrefs = { ...DEFAULT_PRIVACY_SHIELD_PREFS }
  private blocker: ElectronBlocker | null = null
  private stats: PrivacyStats = {
    adsBlockedTotal: 0,
    trackersBlockedTotal: 0,
    fingerprintProbesBlockedTotal: 0,
    httpsUpgradesTotal: 0
  }
  private siteStats: Map<string, { ads: number; trackers: number }> = new Map()
  private initialized = false
  private prefsPath = ''
  private cachePath = ''

  public async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    this.prefsPath = path.join(app.getPath('userData'), 'privacy-shield-prefs.json')
    this.cachePath = path.join(app.getPath('userData'), 'adblocker-cache.bin')

    this.loadPrefs()
    await this.initAdBlocker()
    const tabSession = session.fromPartition('persist:browser-tabs')
    this.setupNetworkFilters(session.defaultSession)
    this.setupPermissionsHandler(session.defaultSession)
    this.setupNetworkFilters(tabSession)
    this.setupPermissionsHandler(tabSession)

    // Handle clear on exit if enabled
    app.on('before-quit', async () => {
      if (this.prefs.clearCacheOnExit) {
        await this.clearBrowsingData()
      }
    })
  }

  private loadPrefs(): void {
    try {
      if (fs.existsSync(this.prefsPath)) {
        const raw = fs.readFileSync(this.prefsPath, 'utf8')
        const loaded = JSON.parse(raw)
        if (loaded.dohProvider === 'mullvad') {
          loaded.dohProvider = 'cloudflare'
        }
        this.prefs = { ...DEFAULT_PRIVACY_SHIELD_PREFS, ...loaded }
      }
    } catch (err) {
      console.warn('[PrivacyEngine] Could not load saved privacy prefs, using defaults:', err)
      this.prefs = { ...DEFAULT_PRIVACY_SHIELD_PREFS }
    }
  }

  private savePrefs(): void {
    try {
      fs.writeFileSync(this.prefsPath, JSON.stringify(this.prefs, null, 2), 'utf8')
    } catch (err) {
      console.error('[PrivacyEngine] Failed to save privacy prefs to disk:', err)
    }
  }

  /**
   * Initialize @ghostery/adblocker-electron with EasyList, EasyPrivacy, and local caching
   */
  private async initAdBlocker(): Promise<void> {
    try {
      if (fs.existsSync(this.cachePath)) {
        try {
          const buffer = fs.readFileSync(this.cachePath)
          this.blocker = ElectronBlocker.deserialize(buffer)
        } catch (e) {
          console.warn('[PrivacyEngine] Cache corrupted, refreshing ad blocker rules from network...')
          this.blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch)
          try {
            fs.writeFileSync(this.cachePath, this.blocker.serialize())
          } catch {}
        }
      } else {
        this.blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch)
        try {
          fs.writeFileSync(this.cachePath, this.blocker.serialize())
        } catch {}
      }
      console.log('[PrivacyEngine] AdBlocker engine loaded successfully with prebuilt EasyList & EasyPrivacy rules')
    } catch (err) {
      console.error('[PrivacyEngine] Failed to initialize Ghostery/EasyList adblocker:', err)
    }
  }

  /**
   * Attach network-level privacy filters to an Electron session
   */
  public setupNetworkFilters(ses: Session): void {
    // 1. onBeforeRequest: Ad/Tracker blocking, tracking parameter stripping, and HTTPS upgrade
    ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      const urlStr = details.url
      let parsed: URL
      try {
        parsed = new URL(urlStr)
      } catch {
        return callback({})
      }

      const origin = parsed.origin
      const isWhitelisted = this.prefs.whitelistedOrigins.includes(origin)

      // Never block media delivery streams (e.g. YouTube *.googlevideo.com)
      if (parsed.hostname.includes('googlevideo.com')) {
        return callback({})
      }

      // Check if site is whitelisted
      if (isWhitelisted) {
        return callback({})
      }

      const isFirstPartyYouTube = parsed.hostname.endsWith('youtube.com') || parsed.hostname.endsWith('youtu.be')

      // Never block top-level navigations or core internal SPA endpoints for YouTube
      // Doing so breaks internal SPA routing for Shorts, Subscriptions, Channels, and Videos
      if (isFirstPartyYouTube && details.resourceType === 'mainFrame') {
        return callback({})
      }

      const isYouTubeCoreSpaApi = isFirstPartyYouTube && (
        parsed.pathname.startsWith('/youtubei/') ||
        parsed.pathname.startsWith('/s/desktop/') ||
        parsed.pathname.startsWith('/shorts') ||
        parsed.pathname.startsWith('/feed') ||
        parsed.pathname.startsWith('/api/stats/') ||
        parsed.pathname.startsWith('/watch') ||
        parsed.pathname.startsWith('/channel/') ||
        parsed.pathname.startsWith('/c/') ||
        parsed.pathname.startsWith('/@') ||
        parsed.pathname.startsWith('/results') ||
        parsed.pathname.startsWith('/playlist') ||
        parsed.pathname.startsWith('/live')
      )

      if (isYouTubeCoreSpaApi) {
        return callback({})
      }

      // A. Ghostery / EasyList / AdGuard engine matching (subresources only - NEVER cancel mainFrame navigations)
      if (details.resourceType !== 'mainFrame' && (this.prefs.adBlockerEnabled || this.prefs.trackerProtection) && this.blocker) {
        try {
          const req = Request.fromRawDetails(details)
          const match = this.blocker.match(req)
          if (match.match) {
            this.stats.adsBlockedTotal++
            this.recordSiteStat(origin, 'ads')
            if (match.redirect && match.redirect.dataUrl) {
              return callback({ redirectURL: match.redirect.dataUrl })
            }
            return callback({ cancel: true })
          }
        } catch {}
      }

      // B. Fast hardcoded ad & tracker network blocking fallback (subresources only)
      if (details.resourceType !== 'mainFrame' && !isFirstPartyYouTube && (this.prefs.adBlockerEnabled || this.prefs.trackerProtection)) {
        const hostname = parsed.hostname.toLowerCase()
        const pathname = parsed.pathname.toLowerCase()
        const fullPath = hostname + pathname

        const isAd = AD_URL_PATTERNS.some((pat) => fullPath.includes(pat) || hostname.endsWith(pat))
        if (isAd) {
          this.stats.adsBlockedTotal++
          this.recordSiteStat(origin, 'ads')
          return callback({ cancel: true })
        }
      }

      // C. HTTPS-Only Mode Upgrade (mainFrame or subFrame)
      if (this.prefs.httpsOnlyMode && parsed.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
        this.stats.httpsUpgradesTotal++
        parsed.protocol = 'https:'
        return callback({ redirectURL: parsed.toString() })
      }

      // D. Query Parameter Stripping (e.g. utm_*, fbclid, gclid)
      // CRITICAL: ONLY strip query parameters on top-level mainFrame document navigations!
      // NEVER return redirectURL for fetch/XHR subresources, as doing so breaks same-origin CORS & POST payloads
      if (details.resourceType === 'mainFrame' && this.prefs.stripTrackingParams && parsed.search) {
        let stripped = false
        const searchParams = parsed.searchParams
        for (const param of Array.from(searchParams.keys())) {
          if (TRACKING_QUERY_PARAMS.has(param.toLowerCase())) {
            searchParams.delete(param)
            stripped = true
            this.stats.trackersBlockedTotal++
            this.recordSiteStat(origin, 'trackers')
          }
        }
        if (stripped) {
          return callback({ redirectURL: parsed.toString() })
        }
      }

      return callback({})
    })

    // 2. onBeforeSendHeaders: GPC, DNT, Referrer origin trimming, and targeted cross-site tracker cookie blocking
    ses.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
      const requestHeaders = { ...details.requestHeaders }

      try {
        const parsed = new URL(details.url)
        const isWhitelisted = this.prefs.whitelistedOrigins.includes(parsed.origin)

        if (!isWhitelisted) {
          // Global Privacy Control & Do Not Track
          if (this.prefs.globalPrivacyControl) {
            requestHeaders['DNT'] = '1'
            requestHeaders['Sec-GPC'] = '1'
          }

          // Referrer Trimming: trim referrer to origin-only for cross-origin requests
          if (details.referrer && details.referrer.startsWith('http')) {
            try {
              const refUrl = new URL(details.referrer)
              if (refUrl.origin !== parsed.origin) {
                requestHeaders['Referer'] = refUrl.origin + '/'
              }
            } catch {}
          }

          // Third-party cookie blocking: only block cookies on subresource requests to external third-party tracking origins
          // Never block cookies on document frame navigations or within same-site/related first-party ecosystems
          const isFrameNav = details.resourceType === 'mainFrame' || details.resourceType === 'subFrame'
          if (this.prefs.blockThirdPartyCookies && !isFrameNav && !parsed.hostname.includes('googlevideo.com')) {
            try {
              const topUrl = details.webContents?.getURL() || details.referrer || ''
              if (topUrl && topUrl.startsWith('http')) {
                const topHostname = new URL(topUrl).hostname
                if (!isSameSiteOrRelated(parsed.hostname, topHostname)) {
                  delete requestHeaders['Cookie']
                }
              }
            } catch {}
          }
        }
      } catch {}

      return callback({ requestHeaders })
    })

    // 3. onHeadersReceived: Block third-party tracker Set-Cookie
    ses.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (details, callback) => {
      const responseHeaders = { ...details.responseHeaders }

      const isFrameNav = details.resourceType === 'mainFrame' || details.resourceType === 'subFrame'
      if (this.prefs.blockThirdPartyCookies && !isFrameNav) {
        try {
          const parsed = new URL(details.url)
          const isWhitelisted = this.prefs.whitelistedOrigins.includes(parsed.origin)

          if (!isWhitelisted && !parsed.hostname.includes('googlevideo.com')) {
            const topUrl = details.webContents?.getURL() || details.referrer || ''
            if (topUrl && topUrl.startsWith('http')) {
              const topHostname = new URL(topUrl).hostname
              if (!isSameSiteOrRelated(parsed.hostname, topHostname)) {
                delete responseHeaders['Set-Cookie']
                delete responseHeaders['set-cookie']
              }
            }
          }
        } catch {}
      }

      return callback({ responseHeaders })
    })
  }

  /**
   * Default-deny sensitive browser permissions (camera, microphone, geolocation, notifications, etc.)
   * while allowing standard non-invasive browser features (fullscreen, pointerLock, DRM/mediaKeySystem)
   */
  public setupPermissionsHandler(ses: Session): void {
    ses.setPermissionRequestHandler((webContents, permission, callback) => {
      const url = webContents.getURL()
      let origin = ''
      try {
        origin = new URL(url).origin
      } catch {}

      // Allow inspect/devtools internals
      if (url.startsWith('devtools://')) {
        return callback(true)
      }

      // Deny sensitive hardware & tracking permissions by default
      const sensitivePermissions = [
        'camera',
        'microphone',
        'geolocation',
        'notifications',
        'clipboard-read',
        'midi',
        'sensors',
        'accessibility-events'
      ]

      if (sensitivePermissions.includes(permission)) {
        console.warn(`[PrivacyEngine] Denied permission "${permission}" requested by origin: ${origin || url}`)
        return callback(false)
      }

      // Allow standard browser permissions (fullscreen, pointerLock, openExternal, mediaKeySystem / DRM, clipboard-sanitized-write)
      return callback(true)
    })

    ses.setPermissionCheckHandler((_webContents, permission) => {
      const sensitivePermissions = [
        'camera',
        'microphone',
        'geolocation',
        'notifications',
        'clipboard-read',
        'midi',
        'sensors',
        'accessibility-events'
      ]
      if (sensitivePermissions.includes(permission)) {
        return false
      }
      return true
    })
  }

  /**
   * Inject client-side fingerprinting resistance and cosmetic ad blocking into guest WebContents
   */
  public injectShieldScript(wc: WebContents): void {
    if (!wc || wc.isDestroyed()) return

    const apply = () => {
      try {
        const url = wc.getURL()
        if (!url || !url.startsWith('http')) return

        const parsed = new URL(url)
        const origin = parsed.origin
        const isWhitelisted = this.prefs.whitelistedOrigins.includes(origin)

        // 1. Inject Ghostery / EasyList cosmetic filter CSS stylesheets
        if (this.blocker && this.prefs.adBlockerEnabled && !isWhitelisted) {
          try {
            const cosmetic = this.blocker.getCosmeticsFilters({
              url,
              hostname: parsed.hostname,
              domain: parsed.hostname
            })
            if (cosmetic && cosmetic.styles) {
              wc.insertCSS(cosmetic.styles).catch(() => {})
            }
          } catch {}
        }

        // 2. Inject Mullvad fingerprinting resistance and YouTube ad skipper
        const script = getShieldInjectionScript(
          this.prefs.adBlockerEnabled,
          this.prefs.fingerprintResistance,
          isWhitelisted
        )

        wc.executeJavaScript(script).catch(() => {})
      } catch {}
    }

    wc.on('dom-ready', apply)
    wc.on('did-finish-load', apply)
    apply()
  }

  private recordSiteStat(origin: string, type: 'ads' | 'trackers'): void {
    const current = this.siteStats.get(origin) || { ads: 0, trackers: 0 }
    if (type === 'ads') current.ads++
    if (type === 'trackers') current.trackers++
    this.siteStats.set(origin, current)
  }

  // --- Public Getters & Actions ---

  public getPrefs(): PrivacyShieldPrefs {
    return { ...this.prefs }
  }

  public updatePrefs(updates: Partial<PrivacyShieldPrefs>): PrivacyShieldPrefs {
    this.prefs = { ...this.prefs, ...updates }
    this.savePrefs()
    this.broadcastState()
    return this.getPrefs()
  }

  public getMasterStatus(): MasterShieldStatus {
    const { adBlockerEnabled, trackerProtection, httpsOnlyMode, dnsOverHttps, fingerprintResistance } = this.prefs
    if (adBlockerEnabled && trackerProtection && httpsOnlyMode && dnsOverHttps && fingerprintResistance) {
      return 'ACTIVE'
    }
    if (!adBlockerEnabled && !trackerProtection && !fingerprintResistance && !httpsOnlyMode) {
      return 'OFF'
    }
    return 'PARTIALLY_ACTIVE'
  }

  public getSiteStatus(url: string): SiteShieldStatus {
    let origin = ''
    let isHttps = false
    try {
      const parsed = new URL(url)
      origin = parsed.origin
      isHttps = parsed.protocol === 'https:'
    } catch {
      origin = url
    }

    const stats = this.siteStats.get(origin) || { ads: 0, trackers: 0 }
    const isWhitelisted = this.prefs.whitelistedOrigins.includes(origin)

    return {
      origin,
      isWhitelisted,
      adsBlocked: stats.ads,
      trackersBlocked: stats.trackers,
      isHttps
    }
  }

  public toggleSiteShield(origin: string): boolean {
    if (!origin) return false

    const index = this.prefs.whitelistedOrigins.indexOf(origin)
    if (index === -1) {
      this.prefs.whitelistedOrigins.push(origin)
    } else {
      this.prefs.whitelistedOrigins.splice(index, 1)
    }

    this.savePrefs()
    this.broadcastState()
    return !this.prefs.whitelistedOrigins.includes(origin)
  }

  public getStats(): PrivacyStats {
    return { ...this.stats }
  }

  /**
   * Clear browsing cache, cookies, and visited site storage without touching app settings localStorage
   */
  public async clearBrowsingData(): Promise<{ success: boolean }> {
    try {
      const tabSession = session.fromPartition('persist:browser-tabs')
      for (const ses of [tabSession, session.defaultSession]) {
        await ses.clearStorageData({
          storages: ['cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
        })
        await ses.clearCache()
        await ses.clearAuthCache()
        await ses.clearHostResolverCache()
      }
      return { success: true }
    } catch (err) {
      console.error('[PrivacyEngine] Failed to clear browsing session data:', err)
      return { success: false }
    }
  }

  private broadcastState(): void {
    const payload = {
      prefs: this.getPrefs(),
      masterStatus: this.getMasterStatus(),
      stats: this.getStats()
    }
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('privacy:state-changed', payload)
      }
    }
  }
}

export const privacyEngine = new PrivacyEngine()
