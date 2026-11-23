import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '@/lib/ipc'
import type {
  PrivacyShieldPrefs,
  MasterShieldStatus,
  PrivacyStats,
  DohProvider,
  SiteShieldStatus,
  ProxyMode,
  ProxyTestResult
} from '@/types/api'

export const PRIVACY_STORAGE_KEY = 'privacyShieldPrefs'

export const DEFAULT_PREFS: PrivacyShieldPrefs = {
  adBlockerEnabled: true,
  trackerProtection: true,
  fingerprintResistance: true,
  httpsOnlyMode: true,
  dnsOverHttps: true,
  dohProvider: 'cloudflare',
  webrtcProtection: false,
  globalPrivacyControl: true,
  stripTrackingParams: true,
  blockThirdPartyCookies: true,
  clearCacheOnExit: false,
  blockPings: true,
  strictReferrer: false,
  spoofLanguage: false,
  blockCookieBanners: false,
  proxyMode: 'off',
  proxyUrl: 'socks5://127.0.0.1:9050',
  whitelistedOrigins: []
}

/** One-click hardening (proxy is left as-is: it needs Tor / a proxy actually running) */
export const MAX_PRIVACY_PREFS: Partial<PrivacyShieldPrefs> = {
  adBlockerEnabled: true,
  trackerProtection: true,
  fingerprintResistance: true,
  httpsOnlyMode: true,
  dnsOverHttps: true,
  webrtcProtection: true,
  globalPrivacyControl: true,
  stripTrackingParams: true,
  blockThirdPartyCookies: true,
  blockPings: true,
  strictReferrer: true,
  spoofLanguage: true,
  blockCookieBanners: true,
  clearCacheOnExit: true
}

function getStoredPrefs(): PrivacyShieldPrefs {
  try {
    const raw = localStorage.getItem(PRIVACY_STORAGE_KEY)
    if (raw) {
      return { ...DEFAULT_PREFS, ...JSON.parse(raw) }
    }
  } catch (e) {
    console.warn('[usePrivacyShield] Failed to read localStorage prefs:', e)
  }
  return { ...DEFAULT_PREFS }
}

function storePrefs(prefs: PrivacyShieldPrefs): void {
  try {
    localStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(prefs))
  } catch (e) {
    console.warn('[usePrivacyShield] Failed to write localStorage prefs:', e)
  }
}

export function usePrivacyShield() {
  const [prefs, setPrefsState] = useState<PrivacyShieldPrefs>(getStoredPrefs)
  const [masterStatus, setMasterStatus] = useState<MasterShieldStatus>('ACTIVE')
  const [stats, setStats] = useState<PrivacyStats>({
    adsBlockedTotal: 0,
    trackersBlockedTotal: 0,
    fingerprintProbesBlockedTotal: 0,
    httpsUpgradesTotal: 0
  })
  const [isClearing, setIsClearing] = useState(false)
  const saveDebounceRef = useRef<NodeJS.Timeout | null>(null)
  // Changes accumulated during the debounce window (previously only the LAST change was sent)
  const pendingUpdatesRef = useRef<Partial<PrivacyShieldPrefs>>({})
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  // Initial load from main process & localStorage sync
  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        if (api.privacy?.getState) {
          const state = await api.privacy.getState()
          if (!mounted) return
          if (state.prefs) {
            setPrefsState(state.prefs)
            storePrefs(state.prefs)
          }
          if (state.masterStatus) {
            setMasterStatus(state.masterStatus)
          }
          if (state.stats) {
            setStats(state.stats)
          }
        }
      } catch (err) {
        console.warn('[usePrivacyShield] Initial state sync warning:', err)
      }
    }

    init()

    let unsub: (() => void) | undefined
    if (api.privacy?.onStateChanged) {
      unsub = api.privacy.onStateChanged((state) => {
        if (!mounted) return
        if (state.prefs) {
          setPrefsState(state.prefs)
          storePrefs(state.prefs)
        }
        if (state.masterStatus) {
          setMasterStatus(state.masterStatus)
        }
        if (state.stats) {
          setStats(state.stats)
        }
      })
    }

    return () => {
      mounted = false
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  // Update preferences with debounce auto-save to localStorage and IPC
  const updatePrefs = useCallback((updates: Partial<PrivacyShieldPrefs>) => {
    pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates }
    setPrefsState((prev) => {
      const next = { ...prev, ...updates }
      storePrefs(next)

      // Recompute local master status optimistically
      const { adBlockerEnabled, trackerProtection, httpsOnlyMode, dnsOverHttps, fingerprintResistance } = next
      if (adBlockerEnabled && trackerProtection && httpsOnlyMode && dnsOverHttps && fingerprintResistance) {
        setMasterStatus('ACTIVE')
      } else if (!adBlockerEnabled && !trackerProtection && !fingerprintResistance && !httpsOnlyMode) {
        setMasterStatus('OFF')
      } else {
        setMasterStatus('PARTIALLY_ACTIVE')
      }

      // Debounce IPC update to main process
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current)
      }
      saveDebounceRef.current = setTimeout(async () => {
        const batch = pendingUpdatesRef.current
        pendingUpdatesRef.current = {}
        try {
          if (api.privacy?.updatePrefs) {
            await api.privacy.updatePrefs(batch)
          }
        } catch (e) {
          console.error('[usePrivacyShield] Failed to sync updates to main process:', e)
        }
      }, 100)

      return next
    })
  }, [])

  const togglePref = useCallback((key: keyof PrivacyShieldPrefs) => {
    const val = !prefsRef.current[key]
    updatePrefs({ [key]: val } as unknown as Partial<PrivacyShieldPrefs>)
  }, [updatePrefs])

  const setProxy = useCallback((proxyMode: ProxyMode, proxyUrl?: string) => {
    updatePrefs(proxyUrl !== undefined ? { proxyMode, proxyUrl } : { proxyMode })
  }, [updatePrefs])

  const applyMaxPrivacy = useCallback(() => {
    updatePrefs(MAX_PRIVACY_PREFS)
  }, [updatePrefs])

  const testProxy = useCallback(async (): Promise<ProxyTestResult> => {
    try {
      if (api.privacy?.testProxy) return await api.privacy.testProxy()
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Test failed' }
    }
    return { ok: false, error: 'Unavailable' }
  }, [])

  const setDohProvider = useCallback((provider: DohProvider) => {
    updatePrefs({ dohProvider: provider })
  }, [updatePrefs])

  const clearBrowsingData = useCallback(async (): Promise<boolean> => {
    setIsClearing(true)
    try {
      if (api.privacy?.clearBrowsingData) {
        const res = await api.privacy.clearBrowsingData()
        return res.success
      }
      return false
    } catch (e) {
      console.error('[usePrivacyShield] Error clearing browsing data:', e)
      return false
    } finally {
      setIsClearing(false)
    }
  }, [])

  const toggleSiteShield = useCallback(async (origin: string): Promise<boolean> => {
    try {
      if (api.privacy?.toggleSiteShield) {
        return await api.privacy.toggleSiteShield(origin)
      }
    } catch (e) {
      console.error('[usePrivacyShield] Error toggling site shield:', e)
    }
    return false
  }, [])

  const getSiteStatus = useCallback(async (url: string): Promise<SiteShieldStatus | null> => {
    try {
      if (api.privacy?.getSiteStatus) {
        return await api.privacy.getSiteStatus(url)
      }
    } catch (e) {
      console.error('[usePrivacyShield] Error getting site status:', e)
    }
    return null
  }, [])

  return {
    prefs,
    masterStatus,
    stats,
    isClearing,
    updatePrefs,
    togglePref,
    setDohProvider,
    setProxy,
    applyMaxPrivacy,
    testProxy,
    clearBrowsingData,
    toggleSiteShield,
    getSiteStatus
  }
}
