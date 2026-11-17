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
 * Generate client-side theme synchronization JavaScript for all web pages, search engines, and arbitrary domains.
 * - Synchronizes major sites (YouTube, DuckDuckGo, Google, Bing, Wikipedia, TradingView).
 * - Enforces native Chromium color-scheme on modern sites.
 * - Avoids destructive CSS inversion filters to preserve pristine website graphics, images, charts, and video.
 */
export function getThemeSyncScript(isDark: boolean): string {
  return `
    (function() {
      try {
        var isDark = ${isDark ? 'true' : 'false'};
        var root = document.documentElement;
        if (!root) return;
        var host = (window.location.hostname || '').toLowerCase();

        // 1. YouTube Optimization
        if (host.indexOf('youtube.com') !== -1) {
          if (isDark) {
            root.setAttribute('dark', 'true');
            root.classList.add('dark');
            try {
              localStorage.setItem('yt-theme', JSON.stringify({ themeType: 'DARK' }));
              document.cookie = 'PREF=f6=400&tz=Asia.Bangkok; path=/; domain=.youtube.com; max-age=31536000';
            } catch(e) {}
          } else {
            root.removeAttribute('dark');
            root.removeAttribute('darker-dark-theme');
            root.classList.remove('dark');
            try {
              localStorage.setItem('yt-theme', JSON.stringify({ themeType: 'LIGHT' }));
              document.cookie = 'PREF=f6=0&tz=Asia.Bangkok; path=/; domain=.youtube.com; max-age=31536000';
            } catch(e) {}
          }
          var ytd = document.querySelector('ytd-app');
          if (ytd) ytd.style.backgroundColor = isDark ? '#0f0f0f' : '#ffffff';
          root.classList.remove('tct-force-dark');
          root.style.colorScheme = isDark ? 'dark' : 'light';
          return;
        }

        // 2. DuckDuckGo Optimization
        if (host.indexOf('duckduckgo.com') !== -1) {
          if (isDark) {
            root.classList.remove('theme-light');
            root.classList.add('theme-dark');
            if (document.body) {
              document.body.classList.remove('theme-light');
              document.body.classList.add('theme-dark');
            }
            try {
              document.cookie = 'ae=d; path=/; domain=.duckduckgo.com; max-age=31536000';
              document.cookie = 'kae=d; path=/; domain=.duckduckgo.com; max-age=31536000';
              localStorage.setItem('theme', 'dark');
              localStorage.setItem('kae', 'd');
            } catch(e) {}
          } else {
            root.classList.remove('theme-dark');
            root.classList.add('theme-light');
            if (document.body) {
              document.body.classList.remove('theme-dark');
              document.body.classList.add('theme-light');
            }
            try {
              document.cookie = 'ae=l; path=/; domain=.duckduckgo.com; max-age=31536000';
              document.cookie = 'kae=-1; path=/; domain=.duckduckgo.com; max-age=31536000';
              localStorage.setItem('theme', 'light');
              localStorage.setItem('kae', '-1');
            } catch(e) {}
          }
          root.style.colorScheme = isDark ? 'dark' : 'light';
        }

        // 3. Google Search Optimization
        if (host.indexOf('google.') !== -1) {
          if (isDark) {
            root.classList.add('dark');
            if (document.body) document.body.classList.add('dark');
            try {
              document.cookie = 'SEARCH_THEME=1; path=/; domain=' + host.replace(/^www\\./, '.') + '; max-age=31536000';
            } catch(e) {}
          } else {
            root.classList.remove('dark');
            if (document.body) document.body.classList.remove('dark');
            try {
              document.cookie = 'SEARCH_THEME=0; path=/; domain=' + host.replace(/^www\\./, '.') + '; max-age=31536000';
            } catch(e) {}
          }
          root.style.colorScheme = isDark ? 'dark' : 'light';
        }

        // 4. Bing Search Optimization
        if (host.indexOf('bing.com') !== -1) {
          if (isDark) {
            root.classList.add('b_dark');
            if (document.body) document.body.classList.add('b_dark');
            try {
              document.cookie = '_EDGE_S=mbl=1; path=/; domain=.bing.com; max-age=31536000';
            } catch(e) {}
          } else {
            root.classList.remove('b_dark');
            if (document.body) document.body.classList.remove('b_dark');
            try {
              document.cookie = '_EDGE_S=mbl=0; path=/; domain=.bing.com; max-age=31536000';
            } catch(e) {}
          }
          root.style.colorScheme = isDark ? 'dark' : 'light';
        }

        // 5. Wikipedia & Wikimedia Sites
        if (host.indexOf('wikipedia.org') !== -1 || host.indexOf('wikimedia.org') !== -1) {
          if (isDark) {
            root.classList.add('skin-theme-clientpref-night');
            root.classList.remove('skin-theme-clientpref-day');
          } else {
            root.classList.remove('skin-theme-clientpref-night');
            root.classList.add('skin-theme-clientpref-day');
          }
          root.classList.remove('tct-force-dark');
          if (document.body) document.body.classList.remove('tct-force-dark');
          root.style.colorScheme = isDark ? 'dark' : 'light';
          return;
        }

        // 6. TradingView Optimization
        if (host.indexOf('tradingview.com') !== -1) {
          if (isDark) {
            root.classList.add('theme-dark');
            root.classList.remove('theme-light');
            if (document.body) {
              document.body.classList.add('theme-dark');
              document.body.classList.remove('theme-light');
            }
            root.setAttribute('data-theme', 'dark');
            try {
              localStorage.setItem('theme', 'dark');
              localStorage.setItem('tradingview.current_theme.name', 'dark');
              localStorage.setItem('tv_theme', 'dark');
              document.cookie = 'theme=dark; path=/; domain=.tradingview.com; max-age=31536000';
            } catch(e) {}
            var tvStyle = document.getElementById('tct-tv-theme');
            if (!tvStyle) {
              tvStyle = document.createElement('style');
              tvStyle.id = 'tct-tv-theme';
              (document.head || root).appendChild(tvStyle);
            }
            tvStyle.textContent = \`
              html.theme-dark, html.theme-dark body, html.theme-dark main {
                background-color: #131722 !important;
                color: #d1d4dc !important;
              }
              html.theme-dark h1, html.theme-dark h2, html.theme-dark h3 {
                color: #f0f3fa !important;
              }
              html.theme-dark [class*="wrapper-"], html.theme-dark [class*="container-"] {
                background-color: transparent !important;
              }
            \`;
          } else {
            root.classList.remove('theme-dark');
            root.classList.add('theme-light');
            if (document.body) {
              document.body.classList.remove('theme-dark');
              document.body.classList.add('theme-light');
            }
            root.setAttribute('data-theme', 'light');
            try {
              localStorage.setItem('theme', 'light');
              localStorage.setItem('tradingview.current_theme.name', 'light');
              localStorage.setItem('tv_theme', 'light');
              document.cookie = 'theme=light; path=/; domain=.tradingview.com; max-age=31536000';
            } catch(e) {}
            var tvStyle = document.getElementById('tct-tv-theme');
            if (tvStyle && tvStyle.parentNode) tvStyle.parentNode.removeChild(tvStyle);
          }
          root.classList.remove('tct-force-dark');
          if (document.body) document.body.classList.remove('tct-force-dark');
          var tvLegacyStyle = document.getElementById('tct-orbit-universal-theme');
          if (tvLegacyStyle && tvLegacyStyle.parentNode) tvLegacyStyle.parentNode.removeChild(tvLegacyStyle);
          root.style.colorScheme = isDark ? 'dark' : 'light';
          return;
        }

        // 7. Universal Non-Destructive Theme Synchronization
        root.style.colorScheme = isDark ? 'dark' : 'light';
        var meta = document.querySelector('meta[name="color-scheme"]');
        if (!meta) {
          meta = document.createElement('meta');
          meta.name = 'color-scheme';
          if (document.head) document.head.appendChild(meta);
        }
        if (meta) meta.content = isDark ? 'dark' : 'light';

        root.classList.remove('tct-force-dark');
        if (document.body) {
          document.body.classList.remove('tct-force-dark');
        }
        var styleEl = document.getElementById('tct-orbit-universal-theme');
        if (styleEl && styleEl.parentNode) {
          styleEl.parentNode.removeChild(styleEl);
        }

        if (isDark) {
          if (root.getAttribute('data-theme') === 'light') {
            root.setAttribute('data-theme', 'dark');
          }
          if (root.getAttribute('data-color-mode') === 'light') {
            root.setAttribute('data-color-mode', 'dark');
          }
        } else {
          if (root.getAttribute('data-theme') === 'dark') {
            root.setAttribute('data-theme', 'light');
          }
          if (root.getAttribute('data-color-mode') === 'dark') {
            root.setAttribute('data-color-mode', 'light');
          }
        }
      } catch(e) {}
    })();
  `
}
