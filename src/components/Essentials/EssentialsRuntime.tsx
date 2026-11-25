import React, { useEffect } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/ipc'
import { isExtraWindow, isMainWindow } from '@/lib/extraWindow'
import { isPrivateWindow } from '@/lib/privateWindow'
import { useRoutes } from '@/lib/routes'
import { resolveLanguage } from '@/lib/i18n'
import { translatePageUrl } from '@/lib/translatePage'
import { placeNewTab } from '@/lib/tabPlacement'
import { useBrowserStore } from '@/store/useBrowserStore'

/** Open an address in a new tab next to the current one */
export async function openInNewTab(url: string, title = 'Loading...'): Promise<void> {
  const store = useBrowserStore.getState()
  const spaceId = store.activeSpaceId || store.spaces[0]?.id
  if (!spaceId) return
  const tab = await api.tabs.create({ spaceId, url, title, isPrivate: isPrivateWindow })
  placeNewTab(spaceId, tab)
}

export function activeTab() {
  const s = useBrowserStore.getState()
  return s.activeSpaceId ? s.tabsBySpace[s.activeSpaceId]?.find((t) => t.id === s.activeTabId) ?? null : null
}

/** Opens Google Translate for the current page (the user is told where the page goes) */
export function translateActivePage(): void {
  const tab = activeTab()
  const url = tab ? translatePageUrl(tab.url) : null
  if (!url) {
    toast.info('This page can not be translated')
    return
  }
  void openInNewTab(url, 'Translation')
  toast('Opening in Google Translate', { description: 'Google sees the address of this page. "Ask this page" translates on your computer instead.' })
}

/** Background glue (mounted once per window): routes, updates, tabs arriving from other windows */
export const EssentialsRuntime: React.FC = () => {
  const language = useBrowserStore((s) => resolveLanguage(s.settings?.language))
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    if (isPrivateWindow) return
    api.essentials.routes
      .list()
      .then((routes) => useRoutes.setState({ routes }))
      .catch(() => {})
    return api.essentials.routes.onChanged((routes) => useRoutes.setState({ routes }))
  }, [])

  useEffect(() => api.settings.onChanged((settings) => useBrowserStore.getState().setSettings(settings)), [])

  // A tab moved here from another window
  useEffect(() => {
    return api.essentials.windows.onTabsChanged(({ spaceId, activate }) => {
      api.tabs
        .list(spaceId)
        .then((tabs) => {
          const store = useBrowserStore.getState()
          store.setTabsForSpace(spaceId, tabs)
          if (!activate) return
          if (store.activeSpaceId !== spaceId) store.setActiveSpaceId(spaceId)
          store.setActiveTabId(activate)
        })
        .catch(() => {})
    })
  }, [])

  useEffect(() => {
    if (!isMainWindow) return
    let announced = ''
    return api.essentials.updates.onState((s) => {
      if (s.phase !== 'ready' || !s.version || announced === s.version) return
      announced = s.version
      toast(`TCT Orbit ${s.version} is ready`, {
        description: 'Restart to update. Your tabs come back.',
        duration: Infinity,
        action: { label: 'Restart', onClick: () => void api.essentials.updates.install() },
        cancel: { label: 'Later', onClick: () => {} }
      })
    })
  }, [])

  useEffect(() => {
    const onTranslate = () => translateActivePage()
    window.addEventListener('tct:translate-page', onTranslate)
    return () => window.removeEventListener('tct:translate-page', onTranslate)
  }, [])

  // Extra windows have a single space: make sure nothing switches away from it
  useEffect(() => {
    if (isExtraWindow) document.documentElement.classList.add('extra-window')
  }, [])

  return null
}
