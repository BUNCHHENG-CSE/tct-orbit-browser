export type DohProvider = 'mullvad' | 'cloudflare' | 'quad9' | 'adguard'

export type MasterShieldStatus = 'ACTIVE' | 'PARTIALLY_ACTIVE' | 'OFF'

/** off = direct, system = OS proxy settings, tor = local Tor SOCKS5, custom = proxyUrl */
export type ProxyMode = 'off' | 'system' | 'tor' | 'custom'

export const TOR_PROXY_URL = 'socks5://127.0.0.1:9050'

/** In-memory (non-persistent) partition used by private tabs */
export const PRIVATE_PARTITION = 'private-tabs'

export interface PrivacyShieldPrefs {
  adBlockerEnabled: boolean
  trackerProtection: boolean
  fingerprintResistance: boolean
  httpsOnlyMode: boolean
  dnsOverHttps: boolean
  dohProvider: DohProvider
  webrtcProtection: boolean
  globalPrivacyControl: boolean
  stripTrackingParams: boolean
  blockThirdPartyCookies: boolean
  clearCacheOnExit: boolean
  blockPings: boolean
  strictReferrer: boolean
  spoofLanguage: boolean
  blockCookieBanners: boolean
  proxyMode: ProxyMode
  proxyUrl: string
  whitelistedOrigins: string[]
}

export const DEFAULT_PRIVACY_SHIELD_PREFS: PrivacyShieldPrefs = {
  adBlockerEnabled: true,
  trackerProtection: true,
  fingerprintResistance: true,
  httpsOnlyMode: true,
  dnsOverHttps: true,
  dohProvider: 'cloudflare',
  webrtcProtection: false, // Default off for smooth video-calling compatibility, optional toggle
  globalPrivacyControl: true,
  stripTrackingParams: true,
  blockThirdPartyCookies: true,
  clearCacheOnExit: false,
  blockPings: true,
  strictReferrer: false,
  spoofLanguage: false,
  blockCookieBanners: false,
  proxyMode: 'off',
  proxyUrl: TOR_PROXY_URL,
  whitelistedOrigins: []
}

export const DOH_TEMPLATES: Record<DohProvider, string> = {
  mullvad: 'https://dns.mullvad.net/dns-query',
  cloudflare: 'https://cloudflare-dns.com/dns-query',
  quad9: 'https://dns.quad9.net/dns-query',
  adguard: 'https://dns.adguard-dns.com/dns-query'
}

export interface PrivacyStats {
  adsBlockedTotal: number
  trackersBlockedTotal: number
  fingerprintProbesBlockedTotal: number
  httpsUpgradesTotal: number
}

export interface SiteShieldStatus {
  origin: string
  isWhitelisted: boolean
  adsBlocked: number
  trackersBlocked: number
  isHttps: boolean
}

export interface ProxyTestResult {
  ok: boolean
  ip?: string
  isTor?: boolean
  error?: string
}

export interface PrivacyReport {
  since: string
  days: Array<{ date: string; ads: number; trackers: number; https: number }>
  totals: { ads: number; trackers: number; https: number }
  topSites: Array<{ origin: string; ads: number; trackers: number; total: number }>
}
