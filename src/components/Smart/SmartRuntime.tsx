import React, { useEffect } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/ipc'
import { isMainWindow } from '@/lib/extraWindow'
import { reopenSnoozed } from '@/lib/snooze'
import { runInTab } from '@/lib/webviewRegistry'
import { scrollToRatioScript } from '@/lib/pageScripts'
import { placeNewTab } from '@/lib/tabPlacement'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useSmartStore } from '@/store/useSmartStore'
import type { PageWatch } from '@/types/smart'

/** Open a watched page in a new tab and mark its change as seen */
export async function openWatchedPage(watch: PageWatch): Promise<void> {
  const store = useBrowserStore.getState()
  const spaceId =
    watch.spaceId && store.spaces.some((s) => s.id === watch.spaceId) ? watch.spaceId : store.activeSpaceId || store.spaces[0]?.id
  if (!spaceId) return
  if (spaceId !== store.activeSpaceId) {
    store.setActiveSpaceId(spaceId)
    api.spaces.setActive(spaceId).catch(() => {})
  }
  try {
    const tab = await api.tabs.create({ spaceId, url: watch.url, title: watch.title })
    placeNewTab(spaceId, tab, true)
  } catch {}
  api.smart.watchUpdate(watch.id, { unseen: false }).catch(() => {})
}

/**
 * Background glue for the smart features (mounted once in the main window):
 * snoozed tabs coming back, page-change alerts, split-view scroll sync, focus rules.
 */
export const SmartRuntime: React.FC = () => {
  const activeSpaceId = useBrowserStore((s) => s.activeSpaceId)

  // Focus rules + snoozes that came due while the browser was closed
  useEffect(() => {
    if (!isMainWindow || !api.smart) return
    void useSmartStore.getState().loadFocusRules()
    const off = api.smart.onSnoozeDue((items) => void reopenSnoozed(items))
    return off
  }, [])

  // Opening a space wakes the tabs snoozed "until I open this space" (and anything due)
  useEffect(() => {
    if (!isMainWindow || !api.smart || !activeSpaceId) return
    let cancelled = false
    // Wait until the space's tabs are in the store so reopened tabs land in the right place
    const t = setTimeout(() => {
      api.smart
        .snoozeTakeDue(activeSpaceId)
        .then((items) => {
          if (!cancelled && items.length > 0) void reopenSnoozed(items)
        })
        .catch(() => {})
    }, 800)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [activeSpaceId])

  // Page watchers: toast when a watched page changes
  useEffect(() => {
    if (!isMainWindow || !api.smart) return
    const offUpdated = api.smart.onWatchUpdated((watch, changed) => {
      window.dispatchEvent(new CustomEvent('tct:watch-updated', { detail: watch }))
      if (!changed) return
      toast('A page you watch changed', {
        description: watch.label ? `${watch.title} — ${watch.label}` : watch.title,
        duration: 12000,
        action: { label: 'Open', onClick: () => void openWatchedPage(watch) }
      })
    })
    const offOpen = api.smart.onWatchOpen((watch) => void openWatchedPage(watch))
    return () => {
      offUpdated()
      offOpen()
    }
  }, [])

  // Split view "Sync scroll": scrolling one pane scrolls the other to the same position
  useEffect(() => {
    const programmatic = new Map<string, number>()
    const onScrolled = (e: Event) => {
      const { tabId, ratio } = (e as CustomEvent).detail || {}
      if (!useSmartStore.getState().syncScroll || typeof ratio !== 'number') return
      const { activeTabId, splitTabId } = useBrowserStore.getState()
      if (!activeTabId || !splitTabId || activeTabId === splitTabId) return
      // Echo of a scroll we caused: don't bounce it back
      const until = programmatic.get(tabId)
      if (until && until > Date.now()) return
      const other = tabId === activeTabId ? splitTabId : tabId === splitTabId ? activeTabId : null
      if (!other) return
      programmatic.set(other, Date.now() + 250)
      void runInTab(other, scrollToRatioScript(ratio))
    }
    window.addEventListener('tct:page-scrolled', onScrolled)
    return () => window.removeEventListener('tct:page-scrolled', onScrolled)
  }, [])

  // Closing split view turns sync off
  const splitTabId = useBrowserStore((s) => s.splitTabId)
  useEffect(() => {
    if (!splitTabId) useSmartStore.getState().setSyncScroll(false)
  }, [splitTabId])

  // Other parts of the UI open Smart Tools with an event
  useEffect(() => {
    const onOpen = (e: Event) => useSmartStore.getState().openSmartTools((e as CustomEvent).detail?.tab)
    window.addEventListener('tct:open-smart-tools', onOpen)
    return () => window.removeEventListener('tct:open-smart-tools', onOpen)
  }, [])

  return null
}
