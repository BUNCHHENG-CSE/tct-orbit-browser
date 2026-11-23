import type { IpcMain } from 'electron'
import { privacyEngine } from '../privacy/privacyEngine'
import type { PrivacyShieldPrefs } from '../privacy/types'
import { secureHandle, Schemas } from '../security'

export function register(ipcMain: IpcMain): void {
  secureHandle(ipcMain, 'privacy:get-state', null, async () => {
    return {
      prefs: privacyEngine.getPrefs(),
      masterStatus: privacyEngine.getMasterStatus(),
      stats: privacyEngine.getStats()
    }
  })

  secureHandle(ipcMain, 'privacy:update-prefs', Schemas.privacyUpdatePrefs, async (_, updates: Partial<PrivacyShieldPrefs>) => {
    const prefs = privacyEngine.updatePrefs(updates)
    return {
      prefs,
      masterStatus: privacyEngine.getMasterStatus(),
      stats: privacyEngine.getStats()
    }
  })

  secureHandle(ipcMain, 'privacy:get-site-status', Schemas.privacyTargetUrl, async (_, url: string) => {
    return privacyEngine.getSiteStatus(url)
  })

  secureHandle(ipcMain, 'privacy:toggle-site-shield', Schemas.privacyToggleOrigin, async (_, origin: string) => {
    return privacyEngine.toggleSiteShield(origin)
  })

  secureHandle(ipcMain, 'privacy:get-stats', null, async () => {
    return privacyEngine.getStats()
  })

  secureHandle(ipcMain, 'privacy:test-proxy', null, async () => {
    return privacyEngine.testProxy()
  })

  secureHandle(ipcMain, 'privacy:clear-browsing-data', null, async () => {
    return privacyEngine.clearBrowsingData()
  })
}
