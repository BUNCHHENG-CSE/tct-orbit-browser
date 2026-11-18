export type DohProvider = 'mullvad' | 'cloudflare' | 'quad9' | 'adguard'

export type MasterShieldStatus = 'ACTIVE' | 'PARTIALLY_ACTIVE' | 'OFF'

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
