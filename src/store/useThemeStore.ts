import { create } from 'zustand'
import type { ThemeMode, ResolvedTheme, AccentPreset, WebColorScheme, ThemeState } from '@/types/api'
import { applyThemeToDOM, ACCENT_PRESETS } from '@/lib/theme'

interface ThemeStoreState {
  mode: ThemeMode
  resolved: ResolvedTheme
  accent: AccentPreset
  webColorScheme: WebColorScheme
  isInitialized: boolean

  // Actions
  setThemeMode: (mode: ThemeMode) => Promise<void>
  setAccent: (accent: AccentPreset) => Promise<void>
  setWebColorScheme: (scheme: WebColorScheme) => Promise<void>
  toggleTheme: () => Promise<void>
  initTheme: () => Promise<void>
}

// Initial hydration from localStorage matching index.html pre-render script
function getInitialLocalStorage(): {
  mode: ThemeMode
  resolved: ResolvedTheme
  accent: AccentPreset
  webColorScheme: WebColorScheme
} {
  let mode: ThemeMode = 'dark'
  let accent: AccentPreset = 'orbit-blue'
  let webColorScheme: WebColorScheme = 'match-browser'

  if (typeof window !== 'undefined') {
    try {
      const storedMode = localStorage.getItem('tct_theme_mode') || localStorage.getItem('tct_pref_theme')
      if (storedMode === 'light' || storedMode === 'dark' || storedMode === 'system') {
        mode = storedMode
      }
      const storedAccent = localStorage.getItem('tct_theme_accent') || localStorage.getItem('tct_pref_accent_preset')
      if (storedAccent) {
        accent = storedAccent
      }
      const storedWebScheme = localStorage.getItem('tct_web_color_scheme')
      if (
        storedWebScheme === 'match-browser' ||
        storedWebScheme === 'light' ||
        storedWebScheme === 'dark' ||
        storedWebScheme === 'system'
      ) {
        webColorScheme = storedWebScheme
      }
    } catch {}
  }

  const isDark =
    mode === 'dark' ||
    (mode === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)

  return {
    mode,
    resolved: isDark ? 'dark' : 'light',
    accent,
    webColorScheme
  }
}

const initial = getInitialLocalStorage()

export const useThemeStore = create<ThemeStoreState>((set, get) => ({
  mode: initial.mode,
  resolved: initial.resolved,
  accent: initial.accent,
  webColorScheme: initial.webColorScheme,
  isInitialized: false,

  setThemeMode: async (mode: ThemeMode) => {
    const isDark =
      mode === 'dark' ||
      (mode === 'system' &&
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)

    const resolved: ResolvedTheme = isDark ? 'dark' : 'light'
    const accent = get().accent

    // 1. Mirror synchronously to localStorage for zero-flash blocking head script
    try {
      localStorage.setItem('tct_theme_mode', mode)
      localStorage.setItem('tct_pref_theme', mode)
    } catch {}

    // 2. Immediately apply to DOM
    applyThemeToDOM(resolved, accent)

    // 3. Update store
    set({ mode, resolved })

    // 4. Mirror to Electron main process for state.json persistence and window background
    if (typeof window !== 'undefined' && window.api?.theme?.set) {
      try {
        await window.api.theme.set({ mode })
      } catch (err) {
        console.error('[useThemeStore] Failed to send theme:set IPC:', err)
      }
    }
  },

  setAccent: async (accent: AccentPreset) => {
    const resolved = get().resolved

    // 1. Mirror synchronously to localStorage
    try {
      localStorage.setItem('tct_theme_accent', accent)
      localStorage.setItem('tct_pref_accent_preset', accent)
      const presetObj = ACCENT_PRESETS.find((p) => p.id === accent)
      if (presetObj) {
        localStorage.setItem('tct_pref_accent_color', JSON.stringify(presetObj.hex))
      }
    } catch {}

    // 2. Immediately apply to DOM
    applyThemeToDOM(resolved, accent)

    // 3. Update store
    set({ accent })

    // 4. Mirror to Electron main process
    if (typeof window !== 'undefined' && window.api?.theme?.set) {
      try {
        await window.api.theme.set({ accent })
      } catch (err) {
        console.error('[useThemeStore] Failed to send theme:set IPC for accent:', err)
      }
    }
  },

  setWebColorScheme: async (webColorScheme: WebColorScheme) => {
    try {
      localStorage.setItem('tct_web_color_scheme', webColorScheme)
    } catch {}

    set({ webColorScheme })

    if (typeof window !== 'undefined' && window.api?.theme?.set) {
      try {
        await window.api.theme.set({ webColorScheme })
      } catch (err) {
        console.error('[useThemeStore] Failed to send theme:set IPC for webColorScheme:', err)
      }
    }
  },

  toggleTheme: async () => {
    const current = get().mode
    const next: ThemeMode = current === 'dark' ? 'light' : 'dark'
    await get().setThemeMode(next)
  },

  initTheme: async () => {
    if (get().isInitialized) return

    // 1. Fetch persistent theme from Electron IPC
    if (typeof window !== 'undefined' && window.api?.theme?.get) {
      try {
        const state: ThemeState = await window.api.theme.get()
        if (state) {
          const resolved =
            state.mode === 'system'
              ? window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light'
              : state.mode === 'dark'
              ? 'dark'
              : 'light'

          try {
            localStorage.setItem('tct_theme_mode', state.mode)
            localStorage.setItem('tct_theme_accent', state.accent)
            localStorage.setItem('tct_web_color_scheme', state.webColorScheme)
          } catch {}

          applyThemeToDOM(resolved, state.accent)
          set({
            mode: state.mode,
            resolved,
            accent: state.accent,
            webColorScheme: state.webColorScheme,
            isInitialized: true
          })
        }
      } catch (err) {
        console.warn('[useThemeStore] Error getting theme from IPC, using local:', err)
      }
    }

    // 2. Subscribe to IPC theme:changed broadcast
    if (typeof window !== 'undefined' && window.api?.theme?.onChanged) {
      window.api.theme.onChanged((state) => {
        const resolved =
          state.mode === 'system'
            ? window.matchMedia('(prefers-color-scheme: dark)').matches
              ? 'dark'
              : 'light'
            : state.mode === 'dark'
            ? 'dark'
            : 'light'

        try {
          localStorage.setItem('tct_theme_mode', state.mode)
          localStorage.setItem('tct_theme_accent', state.accent)
          localStorage.setItem('tct_web_color_scheme', state.webColorScheme)
        } catch {}

        applyThemeToDOM(resolved, state.accent)
        set({
          mode: state.mode,
          resolved,
          accent: state.accent,
          webColorScheme: state.webColorScheme
        })
      })
    }

    // 3. Listen to OS system media query changes
    if (typeof window !== 'undefined' && window.matchMedia) {
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      const handleMediaChange = (e: MediaQueryListEvent | MediaQueryList) => {
        if (get().mode === 'system') {
          const nextResolved: ResolvedTheme = e.matches ? 'dark' : 'light'
          applyThemeToDOM(nextResolved, get().accent)
          set({ resolved: nextResolved })
        }
      }

      media.addEventListener('change', handleMediaChange)
    }

    set({ isInitialized: true })
  }
}))
