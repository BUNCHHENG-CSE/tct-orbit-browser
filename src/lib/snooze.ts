import { toast } from 'sonner'
import { api } from '@/lib/ipc'
import { useBrowserStore } from '@/store/useBrowserStore'
import { placeNewTab } from '@/lib/tabPlacement'
import type { Tab } from '@/types/api'
import type { SnoozedTab } from '@/types/smart'

export interface SnoozeOption {
  id: string
  label: string
  /** e.g. "Tue 9:00" */
  hint: string
  wakeAt: number | null
  wakeOnSpaceOpen: boolean
}

const fmt = (d: Date) =>
  d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })

function at(dayOffset: number, hour: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour, 0, 0, 0)
  return d
}

/** Snooze choices, computed from the current time */
export function snoozeOptions(): SnoozeOption[] {
  const now = new Date()
  const opts: SnoozeOption[] = []

  const inHour = new Date(now.getTime() + 60 * 60_000)
  opts.push({ id: '1h', label: 'In 1 hour', hint: inHour.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), wakeAt: inHour.getTime(), wakeOnSpaceOpen: false })

  // "This evening" only makes sense before 5pm
  if (now.getHours() < 17) {
    const evening = at(0, 18)
    opts.push({ id: 'evening', label: 'This evening', hint: fmt(evening), wakeAt: evening.getTime(), wakeOnSpaceOpen: false })
  }

  const tomorrow = at(1, 9)
  opts.push({ id: 'tomorrow', label: 'Tomorrow morning', hint: fmt(tomorrow), wakeAt: tomorrow.getTime(), wakeOnSpaceOpen: false })

  // Weekend (Saturday 10:00), unless it's already the weekend
  const day = now.getDay()
  if (day >= 1 && day <= 5) {
    const weekend = at(6 - day, 10)
    opts.push({ id: 'weekend', label: 'This weekend', hint: fmt(weekend), wakeAt: weekend.getTime(), wakeOnSpaceOpen: false })
  }

  // Next Monday 9:00
  const toMonday = ((8 - day) % 7) || 7
  const monday = at(toMonday, 9)
  opts.push({ id: 'next-week', label: 'Next week', hint: fmt(monday), wakeAt: monday.getTime(), wakeOnSpaceOpen: false })

  opts.push({ id: 'space', label: 'Next time I open this space', hint: '', wakeAt: null, wakeOnSpaceOpen: true })
  return opts
}

/** Save the snooze, then close the tab */
export async function snoozeTab(tab: Tab, option: SnoozeOption, closeTab: () => void | Promise<unknown>): Promise<void> {
  if (tab.isPrivate) {
    toast('Private tabs cannot be snoozed', { description: 'Nothing from a private tab is saved.' })
    return
  }
  try {
    new URL(tab.url)
  } catch {
    toast.error('This tab cannot be snoozed')
    return
  }
  if (!/^https?:/i.test(tab.url)) {
    toast('Only web pages can be snoozed')
    return
  }
  try {
    const item = await api.smart.snoozeAdd({
      url: tab.url,
      title: tab.title || tab.url,
      favicon: tab.favicon ?? null,
      spaceId: tab.spaceId,
      wakeAt: option.wakeAt,
      wakeOnSpaceOpen: option.wakeOnSpaceOpen
    })
    await closeTab()
    toast.success(option.wakeAt ? `Snoozed until ${option.hint}` : 'Snoozed until you open this space again', {
      description: tab.title,
      action: {
        label: 'Undo',
        onClick: () => {
          void api.smart.snoozeRemove(item.id).then(() => reopenSnoozed([item], false))
        }
      }
    })
  } catch (err) {
    console.error('[Snooze] Failed:', err)
    toast.error('Could not snooze this tab')
  }
}

/** Open snoozed tabs again (in their own space when it still exists) */
export async function reopenSnoozed(items: SnoozedTab[], announce = true): Promise<void> {
  const store = useBrowserStore.getState()
  for (const item of items) {
    const spaceId = store.spaces.some((s) => s.id === item.spaceId) ? item.spaceId : store.activeSpaceId || store.spaces[0]?.id
    if (!spaceId) continue
    try {
      const tab = await api.tabs.create({ spaceId, url: item.url, title: item.title, favicon: item.favicon ?? null })
      if (spaceId === useBrowserStore.getState().activeSpaceId) placeNewTab(spaceId, tab, false)
      // Other space: only touch its list if it's already loaded (otherwise it loads from disk later)
      else if (useBrowserStore.getState().tabsBySpace[spaceId]) useBrowserStore.getState().addTabToStore(spaceId, tab, null, false)
    } catch (err) {
      console.error('[Snooze] Could not reopen tab:', err)
    }
  }
  if (announce && items.length > 0) {
    toast(items.length === 1 ? 'Snoozed tab is back' : `${items.length} snoozed tabs are back`, {
      description: items.length === 1 ? items[0].title : items.map((i) => i.title).slice(0, 3).join(' · ')
    })
  }
}
