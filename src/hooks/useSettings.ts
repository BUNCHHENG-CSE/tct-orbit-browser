import { useEffect, useState, useCallback } from 'react'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useThemeStore } from '@/store/useThemeStore'
import { api } from '@/lib/ipc'
import type { Settings, UpdateSettingsData, ThemeMode, AccentPreset, WebColorScheme, StartupBehavior, AutoArchiveDuration } from '@/types/api'

export function useSettings() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const settings = useBrowserStore((s) => s.settings)
  const setSettings = useBrowserStore((s) => s.setSettings)

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.settings.get()
      setSettings(data)
      setError(null)
    } catch (err) {
      console.error('[useSettings] Error loading settings:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [setSettings])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const updateSettings = async (data: UpdateSettingsData): Promise<Settings> => {
    try {
      // Optimistic update (read latest store state, not a possibly stale render closure)
      const current = useBrowserStore.getState().settings
      if (current) {
        setSettings({ ...current, ...data } as Settings)
      }
      const updated = await api.settings.update(data)
      // Skip the second store write when the main process confirmed exactly what we applied:
      // it would re-render every settings consumer mid-animation (e.g. sidebar toggle) for nothing.
      const latest = useBrowserStore.getState().settings
      const confirmed =
        latest &&
        (Object.keys(data) as Array<keyof UpdateSettingsData>).every(
          (k) => JSON.stringify((latest as any)[k]) === JSON.stringify((updated as any)[k])
        )
      if (!confirmed) {
        setSettings(updated)
      }
      return updated
    } catch (err) {
      console.error('[useSettings] Error updating settings:', err)
      loadSettings()
      throw err
    }
  }

  const setDefaultSearchEngine = (defaultSearchEngine: string) => {
    return updateSettings({ defaultSearchEngine })
  }

  const setSidebarCollapsed = (sidebarCollapsed: boolean) => {
    return updateSettings({ sidebarCollapsed })
  }

  const setTheme = async (theme: string) => {
    if (['light', 'dark', 'system'].includes(theme)) {
      await useThemeStore.getState().setThemeMode(theme as ThemeMode)
    }
    return updateSettings({ theme })
  }

  const setAccentColor = async (accentColor: string) => {
    return updateSettings({ accentColor })
  }

  const setAccentPreset = async (accentPreset: AccentPreset) => {
    await useThemeStore.getState().setAccent(accentPreset)
    return updateSettings({ accentPreset })
  }

  const setWebColorScheme = async (webColorScheme: WebColorScheme) => {
    await useThemeStore.getState().setWebColorScheme(webColorScheme)
    return updateSettings({ webColorScheme })
  }

  const setStartupBehavior = (startupBehavior: StartupBehavior) => {
    return updateSettings({ startupBehavior })
  }

  const setStartupCustomUrls = (startupCustomUrls: string[]) => {
    return updateSettings({ startupCustomUrls })
  }

  const setDownloadPath = (downloadPath: string) => {
    return updateSettings({ downloadPath })
  }

  const setAskWhereToSave = (askWhereToSave: boolean) => {
    return updateSettings({ askWhereToSave })
  }

  const setOpenFolderOnDownload = (openFolderOnDownload: boolean) => {
    return updateSettings({ openFolderOnDownload })
  }

  const setDefaultZoom = (defaultZoom: number) => {
    return updateSettings({ defaultZoom })
  }

  const setAutoArchiveDuration = (autoArchiveDuration: AutoArchiveDuration) => {
    return updateSettings({ autoArchiveDuration })
  }

  return {
    settings,
    loading,
    error,
    updateSettings,
    setDefaultSearchEngine,
    setSidebarCollapsed,
    setTheme,
    setAccentColor,
    setAccentPreset,
    setWebColorScheme,
    setStartupBehavior,
    setStartupCustomUrls,
    setDownloadPath,
    setAskWhereToSave,
    setOpenFolderOnDownload,
    setDefaultZoom,
    setAutoArchiveDuration,
    reloadSettings: loadSettings
  }
}
