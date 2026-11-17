import { useEffect, useState, useCallback } from 'react'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useThemeStore } from '@/store/useThemeStore'
import { api } from '@/lib/ipc'
import type { Settings, UpdateSettingsData, ThemeMode, AccentPreset, WebColorScheme } from '@/types/api'

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
      if (settings) {
        setSettings({ ...settings, ...data } as Settings)
      }
      const updated = await api.settings.update(data)
      setSettings(updated)
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
    reloadSettings: loadSettings
  }
}
