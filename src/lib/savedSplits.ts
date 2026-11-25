import { toast } from 'sonner'
import { useBrowserStore } from '@/store/useBrowserStore'
import { api } from '@/lib/ipc'
import type { SavedSplit, Tab } from '@/types/api'

const norm = (url: string) => url.replace(/\/+$/, '')

/** Reuse an open tab on the same URL in the space, or open a new one */
async function ensureTab(spaceId: string, url: string, title: string, exclude?: string): Promise<Tab> {
  const store = useBrowserStore.getState()
  const existing = (store.tabsBySpace[spaceId] || []).find((t) => t.id !== exclude && !t.isPrivate && norm(t.url) === norm(url))
  if (existing) {
    if (existing.isSleeping) store.setTabSleeping(existing.id, false)
    return existing
  }
  const tab = await api.tabs.create({ spaceId, url, title: title || 'Loading...' })
  store.addTabToStore(spaceId, tab, null, false)
  return tab
}

/** Open a saved layout in the current space: both pages side by side at the saved ratio */
export async function openSavedSplit(split: SavedSplit): Promise<void> {
  const store = useBrowserStore.getState()
  const spaceId = store.activeSpaceId || store.spaces[0]?.id
  if (!spaceId) return
  try {
    const primary = await ensureTab(spaceId, split.primary.url, split.primary.title)
    const secondary = await ensureTab(spaceId, split.secondary.url, split.secondary.title, primary.id)
    const s = useBrowserStore.getState()
    s.setActiveTabId(primary.id)
    s.setSplitTabId(secondary.id)
    s.setSplitRatio(split.ratio)
    s.setSplitActivePane('primary')
  } catch (err) {
    console.error('[SavedSplits] Could not open layout:', err)
    toast.error('Could not open split layout')
  }
}

/** The two tabs currently shown side by side, or null when split view is off */
export function getCurrentSplitTabs(): { primary: Tab; secondary: Tab } | null {
  const s = useBrowserStore.getState()
  const tabs = s.activeSpaceId ? s.tabsBySpace[s.activeSpaceId] || [] : []
  const primary = tabs.find((t) => t.id === s.activeTabId)
  const secondary = tabs.find((t) => t.id === s.splitTabId)
  if (!primary || !secondary || primary.id === secondary.id) return null
  return { primary, secondary }
}

export function defaultSplitName(primary: Tab, secondary: Tab): string {
  const host = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '')
    } catch {
      return u
    }
  }
  return `${host(primary.url)} + ${host(secondary.url)}`.slice(0, 80)
}

export async function saveCurrentSplit(name?: string): Promise<SavedSplit | null> {
  const current = getCurrentSplitTabs()
  if (!current) {
    toast.info('Open two tabs in split view first')
    return null
  }
  const { primary, secondary } = current
  if (primary.isPrivate || secondary.isPrivate) {
    toast.info('Split layouts with private tabs are not saved')
    return null
  }
  try {
    const saved = await api.splits.save({
      name: (name || '').trim() || defaultSplitName(primary, secondary),
      primary: { url: primary.url, title: primary.title || primary.url },
      secondary: { url: secondary.url, title: secondary.title || secondary.url },
      ratio: useBrowserStore.getState().splitRatio
    })
    window.dispatchEvent(new CustomEvent('tct:saved-splits-changed'))
    toast.success(`Layout "${saved.name}" saved`)
    return saved
  } catch (err) {
    console.error('[SavedSplits] Save failed:', err)
    toast.error('Could not save layout')
    return null
  }
}

export async function removeSavedSplit(id: string): Promise<void> {
  try {
    await api.splits.remove(id)
    window.dispatchEvent(new CustomEvent('tct:saved-splits-changed'))
  } catch (err) {
    console.error('[SavedSplits] Remove failed:', err)
  }
}
