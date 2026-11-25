import { useEffect, useState } from 'react'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useThemeStore } from '@/store/useThemeStore'
import { api } from '@/lib/ipc'
import type { Settings, UpdateSettingsData, ThemeMode, AccentPreset, WebColorScheme, StartupBehavior, AutoArchiveDuration } from '@/types/api'

/**
 * Settings are loaded ONCE and shared. useSettings is mounted by a dozen components; previously
 * each one fetched settings on mount and wrote a fresh object to the store, re-rendering every
 * settings consumer once per component at startup (and again whenever a menu or dialog mounted).
 */
let loadPromise: Promise<void> | null = null

function loadSettings(force = false): Promise<void> {
  if (loadPromise && !force) return loadPromise
  loadPromise = api.settings
    .get()
    .then((data) => {
      useBrowserStore.getState().setSettings(data)
    })
    .catch((err) => {
      console.error('[useSettings] Error loading settings:', err)
      loadPromise = null
      throw err
    })
  return loadPromise
}

async function updateSettings(data: UpdateSettingsData): Promise<Settings> {
  const { setSettings } = useBrowserStore.getState()
  try {
    // Optimistic update (read latest store state, not a possibly stale render closure)
    const current = useBrowserStore.getState().settings
    if (current) setSettings({ ...current, ...data } as Settings)
    const updated = await api.settings.update(data)
    // Skip the second store write when the main process confirmed exactly what we applied:
    // it would re-render every settings consumer mid-animation (e.g. sidebar toggle) for nothing.
    const latest = useBrowserStore.getState().settings
    const confirmed =
      latest &&
      (Object.keys(data) as Array<keyof UpdateSettingsData>).every(
        (k) => JSON.stringify((latest as any)[k]) === JSON.stringify((updated as any)[k])
      )
    if (!confirmed) setSettings(updated)
    return updated
  } catch (err) {
    console.error('[useSettings] Error updating settings:', err)
    void loadSettings(true).catch(() => {})
    throw err
  }
}

// Module-level, so every function is stable across renders and components
const actions = {
  updateSettings,
  setDefaultSearchEngine: (defaultSearchEngine: string) => updateSettings({ defaultSearchEngine }),
  setSidebarCollapsed: (sidebarCollapsed: boolean) => updateSettings({ sidebarCollapsed }),
  setTheme: async (theme: string) => {
    if (['light', 'dark', 'system'].includes(theme)) {
      await useThemeStore.getState().setThemeMode(theme as ThemeMode)
    }
    return updateSettings({ theme })
  },
  setAccentColor: async (accentColor: string) => updateSettings({ accentColor }),
  setAccentPreset: async (accentPreset: AccentPreset) => {
    await useThemeStore.getState().setAccent(accentPreset)
    return updateSettings({ accentPreset })
  },
  setWebColorScheme: async (webColorScheme: WebColorScheme) => {
    await useThemeStore.getState().setWebColorScheme(webColorScheme)
    return updateSettings({ webColorScheme })
  },
  setStartupBehavior: (startupBehavior: StartupBehavior) => updateSettings({ startupBehavior }),
  setStartupCustomUrls: (startupCustomUrls: string[]) => updateSettings({ startupCustomUrls }),
  setDownloadPath: (downloadPath: string) => updateSettings({ downloadPath }),
  setAskWhereToSave: (askWhereToSave: boolean) => updateSettings({ askWhereToSave }),
  setOpenFolderOnDownload: (openFolderOnDownload: boolean) => updateSettings({ openFolderOnDownload }),
  setDefaultZoom: (defaultZoom: number) => updateSettings({ defaultZoom }),
  setAutoArchiveDuration: (autoArchiveDuration: AutoArchiveDuration) => updateSettings({ autoArchiveDuration }),
  reloadSettings: () => loadSettings(true)
}

export function useSettings() {
  const settings = useBrowserStore((s) => s.settings)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    loadSettings().catch((err) => setError(err as Error))
  }, [])

  return {
    settings,
    loading: settings === null && !error,
    error,
    ...actions
  }
}
