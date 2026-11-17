import { app, BrowserWindow, nativeTheme, session, type IpcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { getAppPaths } from '../storage/paths'
import { localStorageService } from '../storage/localStorage'
import type {
  ThemeMode,
  ResolvedTheme,
  AccentPreset,
  WebColorScheme,
  ThemeState,
  SetThemeData
} from '../../src/types/api'

export const DARK_BACKGROUND_COLOR = '#09090b'
export const LIGHT_BACKGROUND_COLOR = '#ffffff'

// Browser chrome titleBarOverlay colors
export const DARK_CHROME_COLOR = '#0d0e12'
export const LIGHT_CHROME_COLOR = '#f4f4f6'
export const DARK_SYMBOL_COLOR = '#f4f4f5'
export const LIGHT_SYMBOL_COLOR = '#18181b'

class ThemeManager {
  private mode: ThemeMode = 'dark'
  private accent: AccentPreset = 'orbit-blue'
  private webColorScheme: WebColorScheme = 'match-browser'
  private getMainWindow: (() => BrowserWindow | null) | null = null

  /**
   * Read raw settings from state.json synchronously before window creation
   */
  public getPersistedThemeSettings(): {
    mode: ThemeMode
    accent: AccentPreset
    webColorScheme: WebColorScheme
  } {
    try {
      const paths = getAppPaths()
      const stateFilePath = paths.stateFilePath

      if (fs.existsSync(stateFilePath)) {
        const raw = fs.readFileSync(stateFilePath, 'utf-8')
        const parsed = JSON.parse(raw)
        const s = parsed?.settings
        if (s) {
          const mode: ThemeMode = ['light', 'dark', 'system'].includes(s.theme)
            ? (s.theme as ThemeMode)
            : 'dark'
          const accent: AccentPreset = s.accentPreset || 'orbit-blue'
          const webColorScheme: WebColorScheme = [
            'match-browser',
            'light',
            'dark',
            'system'
          ].includes(s.webColorScheme)
            ? (s.webColorScheme as WebColorScheme)
            : 'match-browser'

          return { mode, accent, webColorScheme }
        }
      }
    } catch (err) {
      console.warn('[ThemeManager] Could not read persisted theme from disk, using defaults:', err)
    }

    return {
      mode: 'dark',
      accent: 'orbit-blue',
      webColorScheme: 'match-browser'
    }
  }

  /**
   * Resolves the effective theme ('light' or 'dark') given mode ('light' | 'dark' | 'system')
   */
  public resolveTheme(mode: ThemeMode): ResolvedTheme {
    if (mode === 'system') {
      return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    }
    return mode
  }

  /**
   * Resolves exact window background color aligned with CSS --background (#09090b for dark, #ffffff for light)
   */
  public getBackgroundColor(resolved: ResolvedTheme): string {
    return resolved === 'dark' ? DARK_BACKGROUND_COLOR : LIGHT_BACKGROUND_COLOR
  }

  /**
   * Returns complete initial startup theme state and window background color before BrowserWindow is constructed
   */
  public getStartupTheme(): {
    mode: ThemeMode
    resolved: ResolvedTheme
    accent: AccentPreset
    webColorScheme: WebColorScheme
    backgroundColor: string
  } {
    const persisted = this.getPersistedThemeSettings()
    this.mode = persisted.mode
    this.accent = persisted.accent
    this.webColorScheme = persisted.webColorScheme

    const resolved = this.resolveTheme(this.mode)
    const backgroundColor = this.getBackgroundColor(resolved)

    // Pre-apply nativeTheme.themeSource before window displays
    this.applyNativeThemeSource(this.mode, this.webColorScheme)

    return {
      mode: this.mode,
      resolved,
      accent: this.accent,
      webColorScheme: this.webColorScheme,
      backgroundColor
    }
  }

  /**
   * Controls Chromium's nativeTheme.themeSource based on webColorScheme & browser mode
   * This guarantees websites receive the correct native @media (prefers-color-scheme)
   */
  public applyNativeThemeSource(mode: ThemeMode, webColorScheme: WebColorScheme): void {
    let source: 'light' | 'dark' | 'system' = 'system'

    if (webColorScheme === 'match-browser') {
      source = mode
    } else if (webColorScheme === 'light') {
      source = 'light'
    } else if (webColorScheme === 'dark') {
      source = 'dark'
    } else if (webColorScheme === 'system') {
      source = 'system'
    }

    nativeTheme.themeSource = source

    // Sync search engine cookies according to effective dark mode
    const isDark = nativeTheme.shouldUseDarkColors
    this.syncSearchEngineCookies(isDark).catch(() => {})
  }

  /**
   * Synchronize YouTube, DuckDuckGo, Google, Bing, and TradingView search cookies
   */
  public async syncSearchEngineCookies(_isDark: boolean): Promise<void> {
    const ses = session.defaultSession
    if (!ses) return

    try {
      // Clean up legacy hardcoded Bangkok PREF cookie if previously injected
      const ytCookies = await ses.cookies.get({ domain: '.youtube.com', name: 'PREF' })
      for (const c of ytCookies) {
        if (c.value && c.value.includes('Asia.Bangkok')) {
          await ses.cookies.remove('https://www.youtube.com', 'PREF')
        }
      }
    } catch {}

    try {
      // Clean up legacy injected TradingView theme cookie
      await ses.cookies.remove('https://www.tradingview.com', 'theme')
    } catch {}
  }

  /**
   * Applies background color and titleBarOverlay colors to a specific window
   */
  public updateWindowChrome(win: BrowserWindow, resolved: ResolvedTheme): void {
    if (win.isDestroyed()) return

    const isDark = resolved === 'dark'
    const bgColor = this.getBackgroundColor(resolved)

    // Set matching window background
    win.setBackgroundColor(bgColor)

    // Configure titleBarOverlay if supported and enabled on Windows or Linux
    if (typeof (win as any).setTitleBarOverlay === 'function') {
      try {
        ;(win as any).setTitleBarOverlay({
          color: isDark ? DARK_CHROME_COLOR : LIGHT_CHROME_COLOR,
          symbolColor: isDark ? DARK_SYMBOL_COLOR : LIGHT_SYMBOL_COLOR,
          height: 40
        })
      } catch (err) {
        // Ignored if window frame or titleBarStyle doesn't accept overlay
      }
    }
  }

  /**
   * Broadcast theme updates to all active windows
   */
  public broadcastThemeChanged(): void {
    const resolved = this.resolveTheme(this.mode)
    const state = this.getState()

    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        this.updateWindowChrome(win, resolved)
        win.webContents.send('theme:changed', state)
      }
    }
  }

  /**
   * Atomically persist theme settings to User Data/Default/state.json
   */
  public persistThemeAtomic(updates: Partial<SetThemeData>): void {
    try {
      const paths = getAppPaths()
      const filePath = paths.stateFilePath
      const dir = path.dirname(filePath)

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      let currentData: any = {}
      if (fs.existsSync(filePath)) {
        try {
          currentData = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
        } catch {
          currentData = {}
        }
      }

      if (!currentData.settings) {
        currentData.settings = {}
      }

      if (updates.mode !== undefined) {
        currentData.settings.theme = updates.mode
      }
      if (updates.accent !== undefined) {
        currentData.settings.accentPreset = updates.accent
      }
      if (updates.webColorScheme !== undefined) {
        currentData.settings.webColorScheme = updates.webColorScheme
      }
      currentData.settings.updatedAt = new Date().toISOString()

      // Atomic write pattern: write unique .tmp file, then renameSync
      const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
      fs.writeFileSync(tmpPath, JSON.stringify(currentData, null, 2), 'utf-8')
      fs.renameSync(tmpPath, filePath)

      // Also keep localStorageService in-memory settings updated
      localStorageService.updateSettings({
        ...(updates.mode ? { theme: updates.mode } : {}),
        ...(updates.accent ? { accentPreset: updates.accent } : {}),
        ...(updates.webColorScheme ? { webColorScheme: updates.webColorScheme } : {})
      })
    } catch (err) {
      console.error('[ThemeManager] Failed to atomically persist theme:', err)
    }
  }

  /**
   * Current snapshot of the theme state
   */
  public getState(): ThemeState {
    const resolved = this.resolveTheme(this.mode)
    return {
      mode: this.mode,
      resolved,
      accent: this.accent,
      webColorScheme: this.webColorScheme
    }
  }

  /**
   * Update theme state from IPC call or system event
   */
  public setTheme(data: SetThemeData): ThemeState {
    if (data.mode !== undefined) {
      this.mode = data.mode
    }
    if (data.accent !== undefined) {
      this.accent = data.accent
    }
    if (data.webColorScheme !== undefined) {
      this.webColorScheme = data.webColorScheme
    }

    this.applyNativeThemeSource(this.mode, this.webColorScheme)
    this.persistThemeAtomic(data)
    this.broadcastThemeChanged()

    return this.getState()
  }

  /**
   * Initialize theme manager and register IPC & OS theme listeners
   */
  public init(ipcMain: IpcMain, getMainWindow: () => BrowserWindow | null): void {
    this.getMainWindow = getMainWindow

    // 1. Listen for OS theme updates live
    nativeTheme.on('updated', () => {
      // If mode is 'system', OS theme change updates resolved theme live
      if (this.mode === 'system') {
        this.broadcastThemeChanged()
      }
    })

    // 2. Register IPC handlers: theme:get and theme:set
    ipcMain.handle('theme:get', () => {
      return this.getState()
    })

    ipcMain.handle('theme:set', (_, data: SetThemeData) => {
      return this.setTheme(data)
    })
  }
}

export const themeManager = new ThemeManager()
