import { nativeTheme, session, type IpcMain } from 'electron'
import type { UpdateSettingsData } from '../../src/types/api'
import { localStorageService } from '../storage/localStorage'
import { themeManager } from '../theme/themeManager'

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
  ipcMain.handle('settings:get', async () => {
    return localStorageService.getSettings()
  })

  // Update settings
  ipcMain.handle('settings:update', async (_, data: UpdateSettingsData) => {
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

