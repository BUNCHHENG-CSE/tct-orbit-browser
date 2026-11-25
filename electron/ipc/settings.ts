import { nativeTheme, session, type IpcMain } from 'electron'
import type { UpdateSettingsData } from '../../src/types/api'
import { localStorageService } from '../storage/localStorage'
import { themeManager } from '../theme/themeManager'
import { secureHandle, Schemas } from '../security'

export async function syncSearchEngineCookies(_isDark: boolean): Promise<void> {
  const ses = session.defaultSession
  if (!ses) return

  try {
    const ytCookies = await ses.cookies.get({ domain: '.youtube.com', name: 'PREF' })
    for (const c of ytCookies) {
      if (c.value && c.value.includes('Asia.Bangkok')) {
        await ses.cookies.remove('https://www.youtube.com', 'PREF')
      }
    }
  } catch {}

  try {
    await ses.cookies.remove('https://www.tradingview.com', 'theme')
  } catch {}
}

export function applyNativeTheme(theme: string | undefined): void {
  if (!theme) return
  if (theme === 'light') {
    nativeTheme.themeSource = 'light'
  } else if (theme === 'dark') {
    nativeTheme.themeSource = 'dark'
  } else {
    nativeTheme.themeSource = 'system'
  }

  const isDark = nativeTheme.shouldUseDarkColors
  syncSearchEngineCookies(isDark).catch(() => {})
}

export function register(ipcMain: IpcMain): void {
  // Get settings
  secureHandle(ipcMain, 'settings:get', null, async () => {
    return localStorageService.getSettings()
  })

  // Update settings
  secureHandle(ipcMain, 'settings:update', Schemas.settingsUpdate, async (_, input: UpdateSettingsData) => {
    // Known settings only. A new download folder comes from the system folder picker
    // (downloads:select-directory); here it can only be kept or reset.
    const data = Schemas.settingsUpdate.parse(input) as UpdateSettingsData
    if (data.downloadPath && data.downloadPath !== localStorageService.getSettings().downloadPath) delete data.downloadPath
    if (data.theme || data.accentPreset || data.webColorScheme) {
      themeManager.setTheme({
        ...(data.theme ? { mode: data.theme as any } : {}),
        ...(data.accentPreset ? { accent: data.accentPreset } : {}),
        ...(data.webColorScheme ? { webColorScheme: data.webColorScheme } : {})
      })
    } else if (data.theme) {
      applyNativeTheme(data.theme)
    }
    return localStorageService.updateSettings(data)
  })
}
