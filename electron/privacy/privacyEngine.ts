import { app, session, BrowserWindow, webContents as allWebContents, type Session, type WebContents } from 'electron'
import fs from 'fs'
import path from 'path'
import { ElectronBlocker, Request } from '@ghostery/adblocker-electron'
import {
  type PrivacyShieldPrefs,
  type MasterShieldStatus,
  type PrivacyStats,
  type SiteShieldStatus,
  type DohProvider,
  type ProxyMode,
  type ProxyTestResult,
  type PrivacyReport,
  DEFAULT_PRIVACY_SHIELD_PREFS,
  DOH_TEMPLATES,
  PRIVATE_PARTITION,
  TOR_PROXY_URL
} from './types'
import { getShieldInjectionScript } from './preloadShield'
import { lockDownSessionPermissions } from '../security'
import { isAppUiFile } from '../appUi'
import { downloadsService } from '../storage/downloadsService'
import { sitePermissions } from '../permissions/sitePermissions'
import { SHARED_TAB_PARTITION, getProfileSessions, onTabSessionCreated } from '../sessions'

// Tracking query parameters stripped from top-level navigations
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
  's_kwcid'
])

// Fallback ad/tracker hosts, used ONLY while the full EasyList engine is not loaded yet
// (first launch while lists download, or when the network is unavailable).
const FALLBACK_AD_HOSTS = [
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

// Refresh filter lists in the background when the cache is older than this
const LIST_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000
const LIST_FETCH_TIMEOUT_MS = 20_000
const MAX_SITE_STATS_ENTRIES = 500

// HTTPS-Only loop guard: if a host bounces back to http this many times in the window, stop upgrading it
const HTTPS_UPGRADE_WINDOW_MS = 10_000
const HTTPS_UPGRADE_MAX_ATTEMPTS = 3

function hostMatchesSuffix(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith('.' + suffix)
}

/** Hosts that should never be force-upgraded to HTTPS (routers, LAN devices, dev servers) */
function isLocalOrPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.lan') || h.endsWith('.internal') || h.endsWith('.home.arpa')) {
    return true
  }
  if (h.includes(':')) {
    // IPv6 loopback, link-local and unique-local ranges
    return h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')
  }
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

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

/**
 * Sign-in / single sign-on providers. Their cookies are allowed in a third-party context (like
 * Chrome's and Firefox's login exceptions) so "Sign in with ...", Microsoft 365 and company SSO
 * keep working while third-party cookies stay blocked for everything else.
 */
const SIGN_IN_HOSTS = [
  'accounts.google.com',
  'login.microsoftonline.com',
  'login.microsoft.com',
  'login.live.com',
  'login.windows.net',
  'account.live.com',
  'appleid.apple.com',
  'idmsa.apple.com',
  'account.apple.com',
  'okta.com',
  'oktapreview.com',
  'okta-emea.com',
  'auth0.com',
  'onelogin.com',
  'duosecurity.com',
  'pingidentity.com',
  'pingone.com',
  'login.salesforce.com',
  'my.salesforce.com',
  'jumpcloud.com',
  'cloudflareaccess.com',
  'clerk.accounts.dev',
  'b2clogin.com'
]

export function isSignInHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return SIGN_IN_HOSTS.some((d) => h === d || h.endsWith(`.${d}`))
}

function isYouTubeHost(hostname: string): boolean {
  return hostMatchesSuffix(hostname, 'youtube.com') || hostMatchesSuffix(hostname, 'youtu.be')
}

const YOUTUBE_SPA_PREFIXES = [
  '/youtubei/',
  '/s/desktop/',
  '/shorts',
  '/feed',
  '/api/stats/',
  '/watch',
  '/channel/',
  '/c/',
  '/@',
  '/results',
  '/playlist',
  '/live'
]

type WebRequestDetails = {
  url: string
  resourceType?: string
  referrer?: string
  webContents?: WebContents
  webContentsId?: number
  id?: number
}

/**
 * URL of the top-level page that issued a request. Whitelisting and per-site stats are keyed on
 * this, not on the request URL (otherwise allowing "example.com" never unblocks its ad requests).
 */
function getPageUrl(details: WebRequestDetails): string {
  if (details.resourceType === 'mainFrame') return details.url
  try {
    const wc = details.webContents
    if (wc && !wc.isDestroyed()) {
      const u = wc.getURL()
      if (u && u.startsWith('http')) return u
    }
  } catch {}
  return details.referrer || ''
}

function safeOrigin(url: string): string {
  if (!url) return ''
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

const SPOOFED_ACCEPT_LANGUAGE = 'en-US,en;q=0.9'
const PROXY_MODES: ProxyMode[] = ['off', 'system', 'tor', 'custom']
const PROXY_URL_RE = /^(socks5|socks4|http|https):\/\/[a-z0-9.\-_[\]:]+:\d{1,5}$/i

const BOOLEAN_PREF_KEYS: Array<keyof PrivacyShieldPrefs> = [
  'adBlockerEnabled',
  'trackerProtection',
  'fingerprintResistance',
  'httpsOnlyMode',
  'dnsOverHttps',
  'webrtcProtection',
  'globalPrivacyControl',
  'stripTrackingParams',
  'blockThirdPartyCookies',
  'clearCacheOnExit',
  'blockPings',
  'strictReferrer',
  'spoofLanguage',
  'blockCookieBanners'
]

/** Keep only known keys with the right type (input comes from IPC and from imported backup files) */
function sanitizePrefs(input: unknown): Partial<PrivacyShieldPrefs> {
  const out: Partial<PrivacyShieldPrefs> = {}
  if (!input || typeof input !== 'object') return out
  const src = input as Record<string, unknown>
  for (const key of BOOLEAN_PREF_KEYS) {
    if (typeof src[key] === 'boolean') (out as any)[key] = src[key]
  }
  if (typeof src.dohProvider === 'string') {
    // 'automatic' secure-DNS mode falls back to system DNS, so every listed provider is safe to keep
    const provider = src.dohProvider as DohProvider
    if (Object.prototype.hasOwnProperty.call(DOH_TEMPLATES, provider)) out.dohProvider = provider
  }
  if (typeof src.proxyMode === 'string' && PROXY_MODES.includes(src.proxyMode as ProxyMode)) {
    out.proxyMode = src.proxyMode as ProxyMode
  }
  if (typeof src.proxyUrl === 'string' && PROXY_URL_RE.test(src.proxyUrl.trim())) {
    out.proxyUrl = src.proxyUrl.trim()
  }
  if (Array.isArray(src.whitelistedOrigins)) {
    out.whitelistedOrigins = Array.from(
      new Set(
        src.whitelistedOrigins
          .filter((o): o is string => typeof o === 'string' && o.length > 0 && o.length < 2048)
          .map((o) => safeOrigin(o) || o)
      )
    )
  }
  return out
}

export class PrivacyEngine {
  private prefs: PrivacyShieldPrefs = { ...DEFAULT_PRIVACY_SHIELD_PREFS, whitelistedOrigins: [] }
  private whitelist = new Set<string>()
  private blocker: ElectronBlocker | null = null
  private stats: PrivacyStats = {
    adsBlockedTotal: 0,
    trackersBlockedTotal: 0,
    fingerprintProbesBlockedTotal: 0,
    httpsUpgradesTotal: 0
  }
  private siteStats: Map<string, { ads: number; trackers: number }> = new Map()
  private httpsUpgradeAttempts = new Map<string, { count: number; first: number }>()
  private httpsExemptHosts = new Set<string>()
  /** Hosts whose top-level navigation was just upgraded to https (host -> time), for fallback */
  private recentHttpsUpgrades = new Map<string, number>()
  private initialized = false
  private refreshingLists = false
  private prefsPath = ''
  private cacheDir = ''
  /** Persistent counters for the privacy report (daily totals + per-site totals) */
  private reportPath = ''
  private daily: Record<string, { ads: number; trackers: number; https: number }> = {}
  private siteTotals: Record<string, { ads: number; trackers: number }> = {}
  private reportSince = new Date().toISOString()
  private reportSaveTimer: NodeJS.Timeout | null = null
  /** Focus Sprint: top-level navigations to these domains are blocked (null = off) */
  private focusBlockedDomains: string[] | null = null
  /** Hooks for UI notifications (set by main.ts) */
  public onHttpsFallback: ((info: { host: string; url: string; webContentsId?: number }) => void) | null = null
  public onFocusBlocked: ((info: { url: string; host: string; webContentsId?: number }) => void) | null = null
  /** Which prebuilt list set the current engine was built from */
  private engineVariant: 'ads-tracking' | 'full' | null = null

  /** All browsing sessions the shield protects (UI default, persistent tabs, private tabs, space profiles) */
  private getSessions(): Session[] {
    return [
      session.defaultSession,
      session.fromPartition(SHARED_TAB_PARTITION),
      session.fromPartition(PRIVATE_PARTITION),
      ...getProfileSessions()
    ]
  }

  private get wantedVariant(): 'ads-tracking' | 'full' {
    return this.prefs.blockCookieBanners ? 'full' : 'ads-tracking'
  }

  private cachePathFor(variant: 'ads-tracking' | 'full'): string {
    // Keep the original file name for the default variant so existing caches stay valid
    return path.join(this.cacheDir, variant === 'full' ? 'adblocker-cache-full.bin' : 'adblocker-cache.bin')
  }

  public async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    this.prefsPath = path.join(app.getPath('userData'), 'privacy-shield-prefs.json')
    this.reportPath = path.join(app.getPath('userData'), 'privacy-report.json')
    this.loadReport()
    this.cacheDir = app.getPath('userData')

    this.loadPrefs()

    // Load cached filter engine synchronously (fast, ~tens of ms). Never block startup on the network:
    // downloading lists happens in the background and the engine is hot-swapped when ready.
    const cacheFresh = this.loadCachedEngine()

    for (const ses of this.getSessions()) {
      // NOTE: Electron supports exactly ONE listener per webRequest event and ONE permission
      // handler per session. This engine owns them all — do not register others elsewhere.
      this.setupNetworkFilters(ses)
      lockDownSessionPermissions(ses)
    }

    try {
      session.fromPartition(PRIVATE_PARTITION).setSpellCheckerEnabled(false)
    } catch {}

    // Space profiles (separate cookies/logins) are created lazily: protect them the same way
    onTabSessionCreated((ses) => {
      this.setupNetworkFilters(ses)
      lockDownSessionPermissions(ses)
      try {
        ses.setSpellCheckerEnabled(false)
      } catch {}
      void ses.setProxy(this.getProxyConfig()).catch((err) => {
        console.error('[PrivacyEngine] Failed to apply proxy to profile session:', err)
      })
    })

    this.applySecureDns()
    await this.applyProxy()
    // Only once the proxy is in place: with Tor on, this download must not reveal the real IP
    if (!cacheFresh) void this.refreshFilterLists()

    // Clear-on-exit: before-quit does not wait for async listeners, so hold the quit until done
    let clearing = false
    let cleared = false
    app.on('before-quit', (event) => {
      if (!this.prefs.clearCacheOnExit || cleared) return
      event.preventDefault()
      if (clearing) return
      clearing = true
      const timeout = new Promise((resolve) => setTimeout(resolve, 5000))
      Promise.race([this.clearBrowsingData(), timeout]).finally(() => {
        cleared = true
        app.quit()
      })
    })
  }

  private loadPrefs(): void {
    try {
      if (fs.existsSync(this.prefsPath)) {
        const loaded = JSON.parse(fs.readFileSync(this.prefsPath, 'utf8'))
        this.prefs = { ...DEFAULT_PRIVACY_SHIELD_PREFS, whitelistedOrigins: [], ...sanitizePrefs(loaded) }
      }
    } catch (err) {
      console.warn('[PrivacyEngine] Could not load saved privacy prefs, using defaults:', err)
      this.prefs = { ...DEFAULT_PRIVACY_SHIELD_PREFS, whitelistedOrigins: [] }
    }
    this.whitelist = new Set(this.prefs.whitelistedOrigins)
  }

  private savePrefs(): void {
    const data = JSON.stringify(this.prefs, null, 2)
    const tmp = `${this.prefsPath}.tmp`
    fs.promises
      .writeFile(tmp, data, 'utf8')
      .then(() => fs.promises.rename(tmp, this.prefsPath))
      .catch((err) => console.error('[PrivacyEngine] Failed to save privacy prefs to disk:', err))
  }

  /** Returns true when a cache was loaded AND is recent enough to skip a refresh */
  private loadCachedEngine(): boolean {
    const variant = this.wantedVariant
    const cachePath = this.cachePathFor(variant)
    try {
      if (!fs.existsSync(cachePath)) return false
      const stat = fs.statSync(cachePath)
      this.blocker = ElectronBlocker.deserialize(fs.readFileSync(cachePath))
      this.engineVariant = variant
      console.log(`[PrivacyEngine] AdBlocker engine (${variant}) loaded from cache`)
      return Date.now() - stat.mtimeMs < LIST_MAX_AGE_MS
    } catch (err) {
      // Corrupt cache, or engine format changed after a library upgrade
      // Keep whatever engine is already running; a refresh will replace it
      console.warn('[PrivacyEngine] AdBlocker cache unusable, will re-download lists:', err)
      return false
    }
  }

  /** Download prebuilt EasyList + EasyPrivacy in the background, then hot-swap the engine */
  private async refreshFilterLists(): Promise<void> {
    if (this.refreshingLists) return
    this.refreshingLists = true
    // Through the browser's own network stack, so proxy / Tor and secure DNS settings apply
    // (Node's fetch would connect directly and reveal the real IP address)
    const timedFetch = (input: RequestInfo | URL, init: RequestInit = {}) =>
      session.defaultSession.fetch(input instanceof URL ? input.toString() : (input as string), {
        ...init,
        credentials: 'omit',
        signal: AbortSignal.timeout(LIST_FETCH_TIMEOUT_MS)
      } as RequestInit) as Promise<any>
    const variant = this.wantedVariant
    try {
      // 'full' adds EasyList Cookie (consent banners) + annoyance lists on top of ads & tracking
      const fresh =
        variant === 'full'
          ? await ElectronBlocker.fromPrebuiltFull(timedFetch)
          : await ElectronBlocker.fromPrebuiltAdsAndTracking(timedFetch)
      // The toggle may have flipped while downloading; only swap in the wanted set
      if (variant === this.wantedVariant) {
        this.blocker = fresh
        this.engineVariant = variant
      }
      const cachePath = this.cachePathFor(variant)
      const tmp = `${cachePath}.tmp`
      await fs.promises.writeFile(tmp, fresh.serialize())
      await fs.promises.rename(tmp, cachePath)
      console.log(`[PrivacyEngine] AdBlocker filter lists (${variant}) refreshed`)
    } catch (err) {
      console.warn('[PrivacyEngine] Could not refresh filter lists (keeping current engine):', err)
    } finally {
      this.refreshingLists = false
      // Toggle changed during the download: switch to the other set now
      if (this.engineVariant !== null && this.engineVariant !== this.wantedVariant) {
        if (!this.loadCachedEngine()) void this.refreshFilterLists()
      }
    }
  }

  // --- Proxy / Tor routing ---

  private get isProxyActive(): boolean {
    return this.prefs.proxyMode === 'tor' || this.prefs.proxyMode === 'custom'
  }

  private getProxyRules(): string {
    return this.prefs.proxyMode === 'tor' ? TOR_PROXY_URL : this.prefs.proxyUrl
  }

  /** Route every browsing session through the configured proxy (no bypass except loopback) */
  private getProxyConfig(): Electron.ProxyConfig {
    if (this.prefs.proxyMode === 'system') return { mode: 'system' }
    if (this.isProxyActive) {
      return { mode: 'fixed_servers', proxyRules: this.getProxyRules(), proxyBypassRules: '<-loopback>' }
    }
    return { mode: 'direct' }
  }

  private async applyProxy(): Promise<void> {
    const config = this.getProxyConfig()
    for (const ses of this.getSessions()) {
      try {
        await ses.setProxy(config)
        // Drop pooled connections so new requests actually use the new route
        await ses.closeAllConnections()
      } catch (err) {
        console.error('[PrivacyEngine] Failed to apply proxy settings:', err)
      }
    }
  }

  /** Fetch the public exit IP through the tab session (honors proxy + filters) */
  public async testProxy(): Promise<ProxyTestResult> {
    const ses = session.fromPartition(SHARED_TAB_PARTITION)
    try {
      const res = await ses.fetch('https://check.torproject.org/api/ip', {
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store'
      } as RequestInit)
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
      const data = (await res.json()) as { IsTor?: boolean; IP?: string }
      return { ok: true, ip: data.IP, isTor: !!data.IsTor }
    } catch (err: any) {
      return {
        ok: false,
        error: this.isProxyActive
          ? `Proxy unreachable (${this.getProxyRules()}). Is Tor / your proxy running?`
          : err?.message || 'Network error'
      }
    }
  }

  /** Wipe everything the private-tab session stored (called when the last private tab closes) */
  public async clearPrivateSession(): Promise<void> {
    const ses = session.fromPartition(PRIVATE_PARTITION)
    sitePermissions.clearPrivate()
    downloadsService.clearEphemeral()
    this.forgetPrivateTraces()
    try {
      await ses.clearStorageData()
      await ses.clearCache()
      await ses.clearAuthCache()
      await ses.clearHostResolverCache()
      await ses.closeAllConnections()
    } catch (err) {
      console.warn('[PrivacyEngine] Failed to clear private session:', err)
    }
  }

  /** Hosts remembered in memory by the HTTPS upgrade */
  private forgetPrivateTraces(): void {
    this.httpsUpgradeAttempts.clear()
    this.recentHttpsUpgrades.clear()
  }

  /** Apply DNS-over-HTTPS. 'automatic' falls back to system DNS so sites never fail to resolve. */
  private applySecureDns(): void {
    try {
      if (this.prefs.dnsOverHttps) {
        app.configureHostResolver({
          secureDnsMode: 'automatic',
          secureDnsServers: [DOH_TEMPLATES[this.prefs.dohProvider] || DOH_TEMPLATES.cloudflare]
        })
      } else {
        app.configureHostResolver({ secureDnsMode: 'off' })
      }
    } catch (err) {
      console.warn('[PrivacyEngine] Could not configure DNS-over-HTTPS:', err)
    }
  }

  /** WebRTC policy honoring the user toggle. Both modes hide private LAN IPs. */
  public getWebRTCPolicy(): 'disable_non_proxied_udp' | 'default_public_interface_only' {
    // Behind a proxy/Tor any direct UDP would reveal the real IP: always force proxied-only
    return this.prefs.webrtcProtection || this.isProxyActive ? 'disable_non_proxied_udp' : 'default_public_interface_only'
  }

  private applyWebRTCPolicyToAll(): void {
    const policy = this.getWebRTCPolicy()
    for (const wc of allWebContents.getAllWebContents()) {
      try {
        if (!wc.isDestroyed() && wc.getType() === 'webview') wc.setWebRTCIPHandlingPolicy(policy)
      } catch {}
    }
  }

  private isPageWhitelisted(pageUrl: string): boolean {
    if (this.whitelist.size === 0 || !pageUrl) return false
    return this.whitelist.has(safeOrigin(pageUrl))
  }

  private shouldUpgradeToHttps(hostname: string): boolean {
    if (isLocalOrPrivateHost(hostname) || this.httpsExemptHosts.has(hostname)) return false
    const now = Date.now()
    const entry = this.httpsUpgradeAttempts.get(hostname)
    if (!entry || now - entry.first > HTTPS_UPGRADE_WINDOW_MS) {
      this.httpsUpgradeAttempts.set(hostname, { count: 1, first: now })
      if (this.httpsUpgradeAttempts.size > 1000) this.httpsUpgradeAttempts.clear()
      return true
    }
    entry.count++
    if (entry.count > HTTPS_UPGRADE_MAX_ATTEMPTS) {
      // The server keeps redirecting https -> http; stop the redirect loop for this session
      console.warn(`[PrivacyEngine] HTTPS-Only: ${hostname} does not support HTTPS, allowing http for this session`)
      this.httpsExemptHosts.add(hostname)
      this.httpsUpgradeAttempts.delete(hostname)
      return false
    }
    return true
  }

  /**
   * Attach network-level privacy filters to an Electron session
   */
  public setupNetworkFilters(ses: Session): void {
    // 1. onBeforeRequest: Ad/Tracker blocking, HTTPS upgrade, tracking-parameter stripping
    const isUiSession = ses === session.defaultSession
    const isPrivate = ses === session.fromPartition(PRIVATE_PARTITION)
    ses.webRequest.onBeforeRequest({ urls: ['*://*/*', 'file://*/*'] }, (details, callback) => {
      let parsed: URL
      try {
        parsed = new URL(details.url)
      } catch {
        return callback({})
      }

      // Local files. The UI may only read its own files, and nothing may reach a network share:
      // on Windows, loading \\server\x (e.g. as a tab icon) sends the user's login hash to that server.
      if (parsed.protocol === 'file:') {
        const remote = parsed.hostname !== '' || parsed.pathname.startsWith('//')
        return callback({ cancel: remote || (isUiSession && !isAppUiFile(details.url)) })
      }

      const hostname = parsed.hostname.toLowerCase()
      const isMainFrame = details.resourceType === 'mainFrame'
      const pageUrl = getPageUrl(details)
      const pageOrigin = safeOrigin(pageUrl)

      // Focus Sprint: block distracting sites for top-level navigations (independent of the shield)
      if (isMainFrame && this.focusBlockedDomains && this.focusBlockedDomains.some((d) => hostMatchesSuffix(hostname, d))) {
        this.onFocusBlocked?.({ url: details.url, host: hostname, webContentsId: details.webContentsId })
        return callback({ cancel: true })
      }

      // Site shield disabled by the user for this page
      if (this.isPageWhitelisted(pageUrl)) {
        return callback({})
      }

      // Hyperlink auditing (<a ping>) and navigator.sendBeacon(): pure tracking, never needed
      if (this.prefs.blockPings && details.resourceType === 'ping') {
        this.recordBlocked(pageOrigin, 'trackers', isPrivate)
        return callback({ cancel: true })
      }

      // C. HTTPS-Only Mode upgrade (checked first for navigations so upgrades are not skipped by allowlists)
      if (this.prefs.httpsOnlyMode && parsed.protocol === 'http:' && (isMainFrame || details.resourceType === 'subFrame')) {
        if (this.shouldUpgradeToHttps(hostname)) {
          this.stats.httpsUpgradesTotal++
          this.bumpDaily('https')
          if (isMainFrame) {
            if (this.recentHttpsUpgrades.size > 200) this.recentHttpsUpgrades.clear()
            this.recentHttpsUpgrades.set(hostname, Date.now())
          }
          parsed.protocol = 'https:'
          return callback({ redirectURL: parsed.toString() })
        }
      }

      // Never block media delivery streams (e.g. YouTube *.googlevideo.com)
      if (hostMatchesSuffix(hostname, 'googlevideo.com')) {
        return callback({})
      }

      // Never block YouTube navigations or its SPA endpoints (breaks Shorts/Subscriptions routing)
      if (isYouTubeHost(hostname)) {
        if (isMainFrame || YOUTUBE_SPA_PREFIXES.some((p) => parsed.pathname.startsWith(p))) {
          return callback({})
        }
      }

      const blockingEnabled = this.prefs.adBlockerEnabled || this.prefs.trackerProtection

      if (!isMainFrame && blockingEnabled) {
        if (this.blocker) {
          // A. EasyList / EasyPrivacy matching. The request type and source page MUST be passed so
          // that $third-party, $script, $image, $xhr ... options are evaluated correctly.
          try {
            const req = Request.fromRawDetails({
              requestId: `${details.id}`,
              tabId: details.webContentsId,
              url: details.url,
              sourceUrl: pageUrl || details.referrer || '',
              type: (details.resourceType || 'other') as any
            })
            const { match, redirect } = this.blocker.match(req)
            if (match) {
              const isTracker = details.resourceType === 'ping' || (details.resourceType === 'xhr' && req.isThirdParty)
              this.recordBlocked(pageOrigin, isTracker ? 'trackers' : 'ads', isPrivate)
              if (redirect && redirect.dataUrl) {
                return callback({ redirectURL: redirect.dataUrl })
              }
              return callback({ cancel: true })
            }
          } catch (err) {
            console.warn('[PrivacyEngine] Filter match failed for', details.url, err)
          }
        } else if (FALLBACK_AD_HOSTS.some((h) => hostMatchesSuffix(hostname, h))) {
          // B. Engine still loading: block the most common ad networks by exact host suffix
          this.recordBlocked(pageOrigin, 'ads', isPrivate)
          return callback({ cancel: true })
        }
      }

      // D. Query parameter stripping — ONLY on top-level navigations.
      // Never redirect fetch/XHR subresources: that breaks CORS & POST payloads.
      if (isMainFrame && this.prefs.stripTrackingParams && parsed.search) {
        let stripped = false
        for (const param of Array.from(parsed.searchParams.keys())) {
          if (TRACKING_QUERY_PARAMS.has(param.toLowerCase())) {
            parsed.searchParams.delete(param)
            stripped = true
          }
        }
        if (stripped) {
          this.recordBlocked(pageOrigin || parsed.origin, 'trackers', isPrivate)
          return callback({ redirectURL: parsed.toString() })
        }
      }

      return callback({})
    })

    // 2. onBeforeSendHeaders: telemetry header stripping, GPC/DNT, referrer trimming, 3rd-party cookie blocking
    ses.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
      const requestHeaders = details.requestHeaders

      // Always strip Chromium client telemetry identifiers
      delete requestHeaders['X-Client-Data']
      delete requestHeaders['x-client-data']

      try {
        const pageUrl = getPageUrl(details)
        if (!this.isPageWhitelisted(pageUrl)) {
          const parsed = new URL(details.url)

          if (this.prefs.globalPrivacyControl) {
            requestHeaders['DNT'] = '1'
            requestHeaders['Sec-GPC'] = '1'
          }

          // Generic locale so the language list can't narrow down who you are
          if (this.prefs.spoofLanguage) {
            requestHeaders['Accept-Language'] = SPOOFED_ACCEPT_LANGUAGE
          }

          // Referrer trimming: origin-only cross-origin; nothing at all cross-site in strict mode
          if (details.referrer && details.referrer.startsWith('http')) {
            const refOrigin = safeOrigin(details.referrer)
            if (refOrigin && refOrigin !== parsed.origin) {
              const crossSite = !isSameSiteOrRelated(parsed.hostname, new URL(details.referrer).hostname)
              if (this.prefs.strictReferrer && crossSite) {
                delete requestHeaders['Referer']
                delete requestHeaders['referer']
              } else {
                requestHeaders['Referer'] = refOrigin + '/'
              }
            }
          }

          // Third-party cookie blocking on subresources only (never on frame navigations)
          const isFrameNav = details.resourceType === 'mainFrame' || details.resourceType === 'subFrame'
          if (this.prefs.blockThirdPartyCookies && !isFrameNav && pageUrl.startsWith('http')) {
            const hostname = parsed.hostname.toLowerCase()
            if (
              !hostMatchesSuffix(hostname, 'googlevideo.com') &&
              !isSignInHost(hostname) &&
              !isSameSiteOrRelated(hostname, new URL(pageUrl).hostname)
            ) {
              delete requestHeaders['Cookie']
              delete requestHeaders['cookie']
            }
          }
        }
      } catch {}

      return callback({ requestHeaders })
    })

    // HTTPS-First fallback: the site has no working HTTPS (connection refused, empty response, ...).
    // Remember the host for this session and reload over http, instead of a dead-end error page
    // where "Retry" would just upgrade and fail again.
    ses.webRequest.onErrorOccurred({ urls: ['https://*/*'] }, (details) => {
      if (details.resourceType !== 'mainFrame' || details.error === 'net::ERR_ABORTED') return
      try {
        const parsed = new URL(details.url)
        const hostname = parsed.hostname.toLowerCase()
        const upgradedAt = this.recentHttpsUpgrades.get(hostname)
        if (upgradedAt === undefined || Date.now() - upgradedAt > 60_000) return
        this.recentHttpsUpgrades.delete(hostname)
        this.httpsExemptHosts.add(hostname)
        console.warn(`[PrivacyEngine] HTTPS-Only: ${hostname} failed over https (${details.error}), falling back to http`)
        const wc = details.webContents
        if (wc && !wc.isDestroyed()) {
          parsed.protocol = 'http:'
          const httpUrl = parsed.toString()
          this.onHttpsFallback?.({ host: hostname, url: httpUrl, webContentsId: wc.id })
          wc.loadURL(httpUrl).catch(() => {})
        }
      } catch {}
    })

    // 3. onHeadersReceived: block third-party Set-Cookie
    ses.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (details, callback) => {
      const isFrameNav = details.resourceType === 'mainFrame' || details.resourceType === 'subFrame'
      if (!this.prefs.blockThirdPartyCookies || isFrameNav || !details.responseHeaders) {
        return callback({})
      }

      try {
        const pageUrl = getPageUrl(details)
        if (pageUrl.startsWith('http') && !this.isPageWhitelisted(pageUrl)) {
          const hostname = new URL(details.url).hostname.toLowerCase()
          if (
            !hostMatchesSuffix(hostname, 'googlevideo.com') &&
            !isSignInHost(hostname) &&
            !isSameSiteOrRelated(hostname, new URL(pageUrl).hostname)
          ) {
            const responseHeaders = { ...details.responseHeaders }
            let changed = false
            for (const key of Object.keys(responseHeaders)) {
              if (key.toLowerCase() === 'set-cookie') {
                delete responseHeaders[key]
                changed = true
              }
            }
            if (changed) return callback({ responseHeaders })
          }
        }
      } catch {}

      // Unmodified: avoid copying headers for every response
      return callback({})
    })
  }

  /**
   * Inject cosmetic ad-hiding CSS and fingerprinting resistance into guest WebContents.
   * Runs once per document (dom-ready) to avoid stacking duplicate stylesheets.
   */
  public injectShieldScript(wc: WebContents): void {
    if (!wc || wc.isDestroyed()) return

    wc.on('dom-ready', () => {
      try {
        if (wc.isDestroyed()) return
        const url = wc.getURL()
        if (!url || !url.startsWith('http')) return

        const parsed = new URL(url)
        const isWhitelisted = this.whitelist.has(parsed.origin)

        // 1. EasyList cosmetic filters (element hiding)
        if (this.blocker && this.prefs.adBlockerEnabled && !isWhitelisted) {
          try {
            const domain = Request.fromRawDetails({ url }).domain || parsed.hostname
            const cosmetic = this.blocker.getCosmeticsFilters({
              url,
              hostname: parsed.hostname,
              domain
            })
            if (cosmetic && cosmetic.styles) {
              // Default (author) origin: user-origin !important would override the page's own
              // layout rules and could break scrolling on some sites.
              wc.insertCSS(cosmetic.styles).catch(() => {})
            }
          } catch (err) {
            console.warn('[PrivacyEngine] Cosmetic filter injection failed for', url, err)
          }
        }

        // 2. Fingerprinting resistance and YouTube ad skipper
        const script = getShieldInjectionScript(
          this.prefs.adBlockerEnabled,
          this.prefs.fingerprintResistance,
          isWhitelisted,
          this.prefs.spoofLanguage
        )
        wc.executeJavaScript(script).catch(() => {})
      } catch {}
    })
  }

  private recordBlocked(pageOrigin: string, type: 'ads' | 'trackers', isPrivate: boolean): void {
    if (type === 'ads') this.stats.adsBlockedTotal++
    else this.stats.trackersBlockedTotal++
    this.bumpDaily(type)

    // Sites visited in private tabs are counted in the totals but never remembered by name
    if (!pageOrigin || isPrivate) return
    // Persistent per-site totals for the privacy report (bounded)
    let total = this.siteTotals[pageOrigin]
    if (!total) {
      const keys = Object.keys(this.siteTotals)
      if (keys.length >= 1000) {
        // Drop the site with the fewest blocks to stay bounded
        let minKey = keys[0]
        for (const k of keys) {
          const t = this.siteTotals[k]
          const m = this.siteTotals[minKey]
          if (t.ads + t.trackers < m.ads + m.trackers) minKey = k
        }
        delete this.siteTotals[minKey]
      }
      total = this.siteTotals[pageOrigin] = { ads: 0, trackers: 0 }
    }
    total[type]++
    let current = this.siteStats.get(pageOrigin)
    if (!current) {
      if (this.siteStats.size >= MAX_SITE_STATS_ENTRIES) {
        const oldest = this.siteStats.keys().next().value
        if (oldest !== undefined) this.siteStats.delete(oldest)
      }
      current = { ads: 0, trackers: 0 }
      this.siteStats.set(pageOrigin, current)
    }
    current[type]++
  }

  // --- Privacy report (persistent counters) ---

  private loadReport(): void {
    try {
      if (fs.existsSync(this.reportPath)) {
        const raw = JSON.parse(fs.readFileSync(this.reportPath, 'utf8'))
        if (raw && typeof raw === 'object') {
          if (raw.daily && typeof raw.daily === 'object') this.daily = raw.daily
          if (raw.siteTotals && typeof raw.siteTotals === 'object') this.siteTotals = raw.siteTotals
          if (typeof raw.since === 'string') this.reportSince = raw.since
        }
      }
    } catch (err) {
      console.warn('[PrivacyEngine] Could not load privacy report data:', err)
    }
  }

  private bumpDaily(kind: 'ads' | 'trackers' | 'https'): void {
    const day = new Date().toISOString().slice(0, 10)
    let d = this.daily[day]
    if (!d) {
      d = this.daily[day] = { ads: 0, trackers: 0, https: 0 }
      // Keep ~90 days
      const days = Object.keys(this.daily).sort()
      while (days.length > 90) delete this.daily[days.shift() as string]
    }
    d[kind]++
    this.scheduleReportSave()
  }

  private scheduleReportSave(): void {
    if (this.reportSaveTimer || !this.reportPath) return
    this.reportSaveTimer = setTimeout(() => this.flushReport(), 5000)
  }

  /** Write report counters now (also called on quit) */
  public flushReport(): void {
    if (this.reportSaveTimer) {
      clearTimeout(this.reportSaveTimer)
      this.reportSaveTimer = null
    }
    if (!this.reportPath) return
    try {
      const tmp = `${this.reportPath}.tmp`
      fs.writeFileSync(tmp, JSON.stringify({ since: this.reportSince, daily: this.daily, siteTotals: this.siteTotals }), 'utf8')
      fs.renameSync(tmp, this.reportPath)
    } catch (err) {
      console.warn('[PrivacyEngine] Could not save privacy report data:', err)
    }
  }

  public getReport(days = 7): PrivacyReport {
    const series: PrivacyReport['days'] = []
    const totals = { ads: 0, trackers: 0, https: 0 }
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
      const d = this.daily[date] || { ads: 0, trackers: 0, https: 0 }
      series.push({ date, ads: d.ads, trackers: d.trackers, https: d.https })
      totals.ads += d.ads
      totals.trackers += d.trackers
      totals.https += d.https
    }
    const topSites = Object.entries(this.siteTotals)
      .map(([origin, t]) => ({ origin, ads: t.ads, trackers: t.trackers, total: t.ads + t.trackers }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
    return { since: this.reportSince, days: series, totals, topSites }
  }

  public resetReport(): void {
    this.daily = {}
    this.siteTotals = {}
    this.reportSince = new Date().toISOString()
    this.flushReport()
  }

  // --- Focus Sprint blocking ---

  public setFocusBlock(domains: string[] | null): void {
    if (!domains || domains.length === 0) {
      this.focusBlockedDomains = null
      return
    }
    const clean = domains
      .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0])
      .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))
    this.focusBlockedDomains = clean.length > 0 ? Array.from(new Set(clean)) : null
  }

  public getFocusBlock(): string[] | null {
    return this.focusBlockedDomains ? [...this.focusBlockedDomains] : null
  }

  // --- Public Getters & Actions ---

  public getPrefs(): PrivacyShieldPrefs {
    return { ...this.prefs, whitelistedOrigins: [...this.prefs.whitelistedOrigins] }
  }

  public updatePrefs(updates: Partial<PrivacyShieldPrefs>): PrivacyShieldPrefs {
    const clean = sanitizePrefs(updates)
    const prev = this.prefs
    this.prefs = { ...this.prefs, ...clean }
    this.whitelist = new Set(this.prefs.whitelistedOrigins)

    if (prev.dnsOverHttps !== this.prefs.dnsOverHttps || prev.dohProvider !== this.prefs.dohProvider) {
      this.applySecureDns()
    }
    const proxyChanged = prev.proxyMode !== this.prefs.proxyMode || prev.proxyUrl !== this.prefs.proxyUrl
    if (proxyChanged) {
      void this.applyProxy()
    }
    if (prev.webrtcProtection !== this.prefs.webrtcProtection || proxyChanged) {
      this.applyWebRTCPolicyToAll()
    }
    if (prev.blockCookieBanners !== this.prefs.blockCookieBanners) {
      if (!this.loadCachedEngine()) void this.refreshFilterLists()
    }
    if (prev.httpsOnlyMode !== this.prefs.httpsOnlyMode) {
      this.httpsExemptHosts.clear()
      this.httpsUpgradeAttempts.clear()
      this.recentHttpsUpgrades.clear()
    }

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

    return {
      origin,
      isWhitelisted: this.whitelist.has(origin),
      adsBlocked: stats.ads,
      trackersBlocked: stats.trackers,
      isHttps
    }
  }

  public toggleSiteShield(originOrUrl: string): boolean {
    const origin = safeOrigin(originOrUrl) || originOrUrl
    if (!origin) return false

    if (this.whitelist.has(origin)) {
      this.whitelist.delete(origin)
    } else {
      this.whitelist.add(origin)
    }
    this.prefs.whitelistedOrigins = Array.from(this.whitelist)

    this.savePrefs()
    this.broadcastState()
    return !this.whitelist.has(origin)
  }

  public getStats(): PrivacyStats {
    return { ...this.stats }
  }

  /**
   * Clear browsing cache, cookies, and visited site storage without touching app settings localStorage
   */
  public async clearBrowsingData(): Promise<{ success: boolean }> {
    try {
      for (const ses of this.getSessions()) {
        // defaultSession hosts the browser UI itself: its localStorage holds theme, settings and
        // per-site zoom, so only drop its HTTP cache. Web content lives in the tab partitions.
        if (ses !== session.defaultSession) {
          await ses.clearStorageData({
            storages: ['cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'serviceworkers', 'cachestorage']
          })
        }
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
