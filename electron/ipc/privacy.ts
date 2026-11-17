import type { IpcMain } from 'electron'
import { privacyEngine } from '../privacy/privacyEngine'
import type { PrivacyShieldPrefs } from '../privacy/types'

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('privacy:get-state', async () => {
    return {
      prefs: privacyEngine.getPrefs(),
      masterStatus: privacyEngine.getMasterStatus(),
      stats: privacyEngine.getStats()
    }
  })

  ipcMain.handle('privacy:update-prefs', async (_, updates: Partial<PrivacyShieldPrefs>) => {
    const prefs = privacyEngine.updatePrefs(updates)
    return {
      prefs,
      masterStatus: privacyEngine.getMasterStatus(),
      stats: privacyEngine.getStats()
    }
  })

  ipcMain.handle('privacy:get-site-status', async (_, url: string) => {
    return privacyEngine.getSiteStatus(url)
  })

  ipcMain.handle('privacy:toggle-site-shield', async (_, origin: string) => {
    return privacyEngine.toggleSiteShield(origin)
  })

  ipcMain.handle('privacy:get-stats', async () => {
    return privacyEngine.getStats()
  })

  ipcMain.handle('privacy:clear-browsing-data', async () => {
    return privacyEngine.clearBrowsingData()
  })
}
