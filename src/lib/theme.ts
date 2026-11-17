import type { ThemeMode, ResolvedTheme, AccentPreset, WebColorScheme } from '@/types/api'

export interface AccentPresetOption {
  id: AccentPreset
  name: string
  hex: string
  lightPrimary: string
  darkPrimary: string
  description?: string
}

export const ACCENT_PRESETS: AccentPresetOption[] = [
  {
    id: 'orbit-blue',
    name: 'Orbit Blue',
    hex: '#3b82f6',
    lightPrimary: '#2563eb',
    darkPrimary: '#3b82f6',
    description: 'Crisp azure electric blue'
  },
  {
    id: 'nebula-violet',
    name: 'Nebula Violet',
    hex: '#8b5cf6',
    lightPrimary: '#7c3aed',
    darkPrimary: '#8b5cf6',
    description: 'Cosmic violet indigo glow'
  },
  {
    id: 'emerald',
    name: 'Emerald',
    hex: '#10b981',
    lightPrimary: '#059669',
    darkPrimary: '#10b981',
    description: 'Lush organic emerald green'
  },
  {
    id: 'amber',
    name: 'Amber',
    hex: '#f59e0b',
    lightPrimary: '#d97706',
    darkPrimary: '#f59e0b',
    description: 'Warm solar amber gold'
  },
  {
    id: 'rose',
    name: 'Rose',
    hex: '#f43f5e',
    lightPrimary: '#e11d48',
    darkPrimary: '#f43f5e',
    description: 'Vibrant neon crimson rose'
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    hex: '#71717a',
    lightPrimary: '#18181b',
    darkPrimary: '#f4f4f5',
    description: 'High-contrast studio zinc neutral'
  }
]

/**
 * Convert HEX color (e.g. #ec4899 or #6366f1) to HSL values formatted for Tailwind CSS variables:
 * "H S% L%" (e.g. "330 81% 60%")
 */
export function hexToHsl(hex: string): string {
  if (!hex) return '221.2 83.2% 53.3%'
  let cleanHex = hex.replace('#', '').trim()
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map((c) => c + c).join('')
  }
  if (cleanHex.length !== 6) {
    return '221.2 83.2% 53.3%'
  }

  const r = parseInt(cleanHex.substring(0, 2), 16) / 255
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h = Math.round(h * 60)
  }

  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

/**
 * Apply the accent highlight color to document root CSS variables:
 * If a known preset is given, sets data-accent attribute.
 * If an arbitrary custom HEX is provided, converts and sets inline CSS variables.
 */
export function applyAccentColor(accentOrHex: string): void {
  if (!accentOrHex || typeof document === 'undefined') return
  try {
    const root = document.documentElement
    const preset = ACCENT_PRESETS.find((p) => p.id === accentOrHex || p.hex.toLowerCase() === accentOrHex.toLowerCase())

    if (preset) {
      root.setAttribute('data-accent', preset.id)
      root.style.removeProperty('--primary')
      root.style.removeProperty('--ring')
      root.style.removeProperty('--sidebar-primary')
      root.style.removeProperty('--sidebar-ring')
      root.style.setProperty('--accent-color', preset.hex)
    } else {
      root.setAttribute('data-accent', 'custom')
      const hsl = hexToHsl(accentOrHex)
      root.style.setProperty('--primary', hsl)
      root.style.setProperty('--ring', hsl)
      root.style.setProperty('--sidebar-primary', hsl)
      root.style.setProperty('--sidebar-ring', hsl)
      root.style.setProperty('--accent-color', accentOrHex)
    }
  } catch (err) {
    console.error('[applyAccentColor] Failed to apply accent color:', err)
  }
}

/**
 * Helper to determine whether the active theme should render as dark.
 * Resolves 'system' against the OS prefers-color-scheme media query.
 */
export function resolveIsDark(themeSetting?: string): boolean {
  const theme = themeSetting || 'dark'
  if (theme === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return true
  }
  return theme === 'dark'
}

/**
 * Apply full theme state to document DOM synchronously
 */
export function applyThemeToDOM(resolved: ResolvedTheme, accent: AccentPreset): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (resolved === 'dark') {
    root.classList.add('dark')
    root.style.colorScheme = 'dark'
  } else {
    root.classList.remove('dark')
    root.style.colorScheme = 'light'
  }
  applyAccentColor(accent)
}

/**
 * Non-destructive theme helper for webviews.
 *
 * Strategy: Websites render using their own native CSS and media queries
 * driven directly by Chromium's nativeTheme.themeSource ('dark' | 'light' | 'system').
 *
 * We do NOT inject custom DOM classes, attributes, inline styles, or cookies.
 * This function only purges any legacy injected style tags and temporary keys
 * so that websites render in their 100% original, pristine design.
 */
export function getThemeSyncScript(_isDark?: boolean): string {
  return `
    (function() {
      try {
        var tvStyle = document.getElementById('tct-tv-theme');
        if (tvStyle && tvStyle.parentNode) tvStyle.parentNode.removeChild(tvStyle);

        var universalStyle = document.getElementById('tct-orbit-universal-theme');
        if (universalStyle && universalStyle.parentNode) universalStyle.parentNode.removeChild(universalStyle);

        if (document.documentElement) {
          document.documentElement.classList.remove('tct-force-dark');
        }
        if (document.body) {
          document.body.classList.remove('tct-force-dark');
        }

        // Clean up legacy injected localStorage keys that may interfere with site themes
        try {
          var host = (window.location.hostname || '').toLowerCase();
          if (host.indexOf('youtube.com') !== -1) {
            localStorage.removeItem('yt-theme');
          } else if (host.indexOf('tradingview.com') !== -1) {
            localStorage.removeItem('tv_theme');
          }
        } catch(e) {}
      } catch(e) {}
    })();
  `
}
