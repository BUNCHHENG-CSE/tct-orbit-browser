import { toast } from 'sonner'
import { api } from '@/lib/ipc'
import { runInTab } from '@/lib/webviewRegistry'
import { ELEMENT_PICKER_SCRIPT, type PickedArea } from '@/lib/pageScripts'
import { isStartPageUrl } from '@/lib/startPage'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useSmartStore } from '@/store/useSmartStore'

export const WATCH_INTERVALS: Array<{ min: number; label: string }> = [
  { min: 15, label: 'Every 15 minutes' },
  { min: 60, label: 'Every hour' },
  { min: 360, label: 'Every 6 hours' },
  { min: 1440, label: 'Once a day' }
]

export const intervalLabel = (min: number) =>
  WATCH_INTERVALS.find((i) => i.min === min)?.label.toLowerCase() ?? `every ${min} minutes`

/**
 * "Watch this page for changes": the user clicks the part of the active page to watch
 * (a price, "out of stock", a results table…) or picks the whole page.
 */
export async function watchActivePage(): Promise<void> {
  const store = useBrowserStore.getState()
  const tabs = store.activeSpaceId ? store.tabsBySpace[store.activeSpaceId] || [] : []
  const tab = tabs.find((t) => t.id === store.activeTabId)
  if (!tab || isStartPageUrl(tab.url) || !/^https?:/i.test(tab.url)) {
    toast('Open the web page you want to watch first')
    return
  }
  if (tab.isPrivate) {
    toast('Private tabs cannot be watched', { description: 'Watching a page saves it on this device.' })
    return
  }

  // Get dialogs out of the way so the page can be clicked
  useSmartStore.getState().setSmartToolsOpen(false)
  toast('Click the part of the page to watch', { description: 'Or choose "Whole page" in the bar at the top. Esc cancels.', duration: 5000 })

  const picked = await runInTab<PickedArea | null>(tab.id, ELEMENT_PICKER_SCRIPT, true)
  if (!picked) return
  if (!picked.text) {
    toast.error('That part of the page has no text to watch', { description: 'Try a slightly bigger area.' })
    return
  }

  try {
    const watch = await api.smart.watchAdd({
      url: tab.url,
      title: tab.title || tab.url,
      selector: picked.selector,
      label: picked.selector ? picked.text.slice(0, 140) : 'Whole page',
      intervalMin: 60,
      spaceId: tab.spaceId,
      initialText: picked.text
    })
    if (!watch) {
      toast.error('This page cannot be watched')
      return
    }
    toast.success('Watching this page', {
      description: `Checked ${intervalLabel(watch.intervalMin)}. You'll get a notification when it changes.`,
      action: { label: 'Manage', onClick: () => useSmartStore.getState().openSmartTools('watching') }
    })
    window.dispatchEvent(new CustomEvent('tct:watch-updated', { detail: watch }))
  } catch (err) {
    toast.error(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not watch this page')
  }
}
