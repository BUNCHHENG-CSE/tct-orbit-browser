import { nativeTheme, session, type IpcMain } from 'electron'
import type { UpdateSettingsData } from '../../src/types/api'
import { localStorageService } from '../storage/localStorage'
import { themeManager } from '../theme/themeManager'

export async function syncSearchEngineCookies(isDark: boolean): Promise<void> {
  const ses = session.defaultSession
  if (!ses) return

  const exp = Math.floor(Date.now() / 1000) + 31536000 // 1 year expiry

  // 1. YouTube: f6=400 forces dark theme, f6=0 / f6=800 forces light theme
  try {
    await ses.cookies.set({
      url: 'https://www.youtube.com',
      name: 'PREF',
      value: isDark ? 'f6=400&tz=Asia.Bangkok' : 'f6=0&tz=Asia.Bangkok',
      domain: '.youtube.com',
      path: '/',
      expirationDate: exp
    })
  } catch {}

  // 2. DuckDuckGo: ae=d, kae=d (dark mode) vs ae=l, kae=-1 (light mode)
  try {
    await ses.cookies.set({
      url: 'https://duckduckgo.com',
      name: 'ae',
      value: isDark ? 'd' : 'l',
      domain: '.duckduckgo.com',
      path: '/',
      expirationDate: exp
    })
    await ses.cookies.set({
      url: 'https://duckduckgo.com',
      name: 'kae',
      value: isDark ? 'd' : '-1',
      domain: '.duckduckgo.com',
      path: '/',
      expirationDate: exp
    })
  } catch {}

  // 3. Google Search: SEARCH_THEME=1 (dark) vs SEARCH_THEME=0 (light)
  try {
    await ses.cookies.set({
      url: 'https://www.google.com',
      name: 'SEARCH_THEME',
      value: isDark ? '1' : '0',
      domain: '.google.com',
      path: '/',
      expirationDate: exp
    })
  } catch {}

  // 4. Bing Search: _EDGE_S=mbl=1 (dark) vs _EDGE_S=mbl=0 (light)
  try {
    await ses.cookies.set({
      url: 'https://www.bing.com',
      name: '_EDGE_S',
      value: isDark ? 'mbl=1' : 'mbl=0',
      domain: '.bing.com',
      path: '/',
      expirationDate: exp
    })
  } catch {}

  // 5. TradingView: theme=dark vs theme=light
  try {
    await ses.cookies.set({
      url: 'https://www.tradingview.com',
      name: 'theme',
      value: isDark ? 'dark' : 'light',
      domain: '.tradingview.com',
      path: '/',
      expirationDate: exp
    })
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

