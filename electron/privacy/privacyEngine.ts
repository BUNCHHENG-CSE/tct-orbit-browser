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

// Hardcoded network patterns for high-frequency ad & tracker networks (fallback & YouTube ad-break blocking)
const AD_URL_PATTERNS = [
  'doubleclick.net',
  'googleadservices.com',
  'googlesyndication.com',
  'youtube.com/pagead',
  'youtube.com/api/stats/ads',
  'youtube.com/youtubei/v1/player/ad_break',
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
    this.setupNetworkFilters(session.defaultSession)
    this.setupPermissionsHandler(session.defaultSession)

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

      // A. Ghostery / EasyList / AdGuard engine matching
      if ((this.prefs.adBlockerEnabled || this.prefs.trackerProtection) && this.blocker) {
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

      // B. Fast hardcoded ad & tracker network blocking fallback (including YouTube adbreaks)
      if (this.prefs.adBlockerEnabled || this.prefs.trackerProtection) {
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

      // C. HTTPS-Only Mode Upgrade
      if (this.prefs.httpsOnlyMode && parsed.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
        this.stats.httpsUpgradesTotal++
        parsed.protocol = 'https:'
        return callback({ redirectURL: parsed.toString() })
      }

      // D. Query Parameter Stripping (e.g. utm_*, fbclid, gclid)
      if (this.prefs.stripTrackingParams && parsed.search) {
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

    // 2. onBeforeSendHeaders: GPC, DNT, and Referrer origin trimming
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

          // Referrer Trimming: trim referrer to origin-only
          if (details.referrer && details.referrer.startsWith('http')) {
            try {
              const refUrl = new URL(details.referrer)
              requestHeaders['Referer'] = refUrl.origin + '/'
            } catch {}
          }

          // Third-party cookie blocking (exempt media streams like googlevideo.com)
          if (this.prefs.blockThirdPartyCookies && details.webContents && !parsed.hostname.includes('googlevideo.com')) {
            try {
              const topUrl = details.webContents.getURL()
              if (topUrl && topUrl.startsWith('http')) {
                const topOrigin = new URL(topUrl).origin
                if (parsed.origin !== topOrigin && !parsed.hostname.endsWith(new URL(topUrl).hostname)) {
                  delete requestHeaders['Cookie']
                }
              }
            } catch {}
          }
        }
      } catch {}

      return callback({ requestHeaders })
    })

    // 3. onHeadersReceived: Block third-party Set-Cookie
    ses.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (details, callback) => {
      const responseHeaders = { ...details.responseHeaders }

      if (this.prefs.blockThirdPartyCookies && details.webContents) {
        try {
          const parsed = new URL(details.url)
          const isWhitelisted = this.prefs.whitelistedOrigins.includes(parsed.origin)

          if (!isWhitelisted) {
            const topUrl = details.webContents.getURL()
            if (topUrl && topUrl.startsWith('http')) {
              const topOrigin = new URL(topUrl).origin
              if (parsed.origin !== topOrigin && !parsed.hostname.endsWith(new URL(topUrl).hostname)) {
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

      // Deny sensitive hardware & fingerprinting permissions by default (Mullvad Standard)
      const sensitivePermissions = [
        'camera',
        'microphone',
        'geolocation',
        'notifications',
        'clipboard-read',
        'midi',
        'pointerLock',
        'openExternal',
        'sensors',
        'accessibility-events'
      ]

      if (sensitivePermissions.includes(permission)) {
        console.warn(`[PrivacyEngine] Denied permission "${permission}" requested by origin: ${origin || url}`)
        return callback(false)
      }

      return callback(false)
    })

    ses.setPermissionCheckHandler((_webContents, permission) => {
      if (['camera', 'microphone', 'geolocation', 'notifications'].includes(permission)) {
        return false
      }
      return false
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
      await session.defaultSession.clearStorageData({
        storages: ['cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
      })
      await session.defaultSession.clearCache()
      await session.defaultSession.clearAuthCache()
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
