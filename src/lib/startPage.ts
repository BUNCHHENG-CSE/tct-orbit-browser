import { useBrowserStore } from '@/store/useBrowserStore'
import { api } from '@/lib/ipc'
import { isUrl, normalizeUrl, buildSearchUrl, SEARCH_ENGINES } from '@/lib/searchEngines'
import { resolveIsDark } from '@/lib/theme'
import { placeNewTab } from '@/lib/tabPlacement'
import { isPrivateWindow } from '@/lib/privateWindow'

/**
 * Orbit start page: an internal page rendered by the browser UI itself (never loaded in a
 * webview, so no web content can reach it). Tabs on this URL show <StartPage /> instead.
 */
export const START_PAGE_URL = 'orbit://start'
export const START_PAGE_TITLE = 'Start'

/** Start page of private tabs (no history, no shortcuts: nothing from your normal browsing) */
export const PRIVATE_START_URL = 'orbit://private'
export const PRIVATE_START_TITLE = 'Private Tab'

/** Any internal Orbit page (normal or private start page) */
export function isStartPageUrl(url: string | null | undefined): boolean {
  return url === START_PAGE_URL || url === PRIVATE_START_URL
}

export function isPrivateStartUrl(url: string | null | undefined): boolean {
  return url === PRIVATE_START_URL
}

/**
 * Navigate a start-page tab: a URL opens directly, anything else is searched with the default
 * engine. Changing the tab URL swaps the internal page for a real webview.
 */
export async function navigateFromStartPage(tabId: string, raw: string): Promise<void> {
  const input = raw.trim()
  if (!input) return
  const settings = useBrowserStore.getState().settings
  const engine = ((settings?.defaultSearchEngine as keyof typeof SEARCH_ENGINES) || 'duckduckgo') as keyof typeof SEARCH_ENGINES
  const asUrl = isUrl(input)
  const url = asUrl ? normalizeUrl(input) : buildSearchUrl(input, engine, resolveIsDark(settings?.theme))
  const title = asUrl ? input : `${input} - ${SEARCH_ENGINES[engine]?.name || 'Search'}`
  useBrowserStore.getState().updateTabInStore(tabId, { url, title })
  try {
    await api.tabs.update(tabId, { url, title })
  } catch (err) {
    console.error('[StartPage] Navigation failed:', err)
  }
}

/** The start page is the default; users can switch New Tab to the command bar in Settings */
export function startPageEnabled(): boolean {
  return useBrowserStore.getState().settings?.newTabPage !== 'command-bar'
}

/** New Tab (Ctrl+T, + buttons): the start page, or the command bar if the user chose it */
export async function openNewTab(): Promise<void> {
  const store = useBrowserStore.getState()
  if (!startPageEnabled()) {
    store.setCommandBarOpen(true, '', 'new-tab')
    return
  }
  const spaceId = store.activeSpaceId || store.spaces[0]?.id
  if (!spaceId) return
  try {
    const tab = isPrivateWindow
      ? await api.tabs.create({ spaceId, url: PRIVATE_START_URL, title: PRIVATE_START_TITLE })
      : await api.tabs.create({ spaceId, url: START_PAGE_URL, title: START_PAGE_TITLE })
    placeNewTab(spaceId, tab)
  } catch (err) {
    console.error('[StartPage] Could not open start page:', err)
    store.setCommandBarOpen(true, '', 'new-tab')
  }
}
