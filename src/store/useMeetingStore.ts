import { create } from 'zustand'
import { toast } from 'sonner'
import { useBrowserStore } from '@/store/useBrowserStore'
import { api } from '@/lib/ipc'
import { playFocusChime } from '@/lib/audioChime'

/**
 * Meeting mode: open the meeting next to your notes, with a countdown in the title bar.
 * Notes can be the space's Orbit notes (side drawer) or any page (doc, agenda) in split view.
 */

export type MeetingNotesMode = 'drawer' | 'url' | 'none'

export interface ActiveMeeting {
  title: string
  meetingUrl: string
  notesMode: MeetingNotesMode
  notesUrl?: string
  /** Start time (ms since epoch) */
  startAt: number
  meetingTabId: string | null
  notesTabId: string | null
  /** Space the meeting was started in (its notes get the meeting summary) */
  spaceId?: string
  /** Pages opened during the meeting (link catcher) */
  links?: MeetingLink[]
}

export interface MeetingLink {
  url: string
  title: string
  at: number
}

const MAX_MEETING_LINKS = 40

export interface StartMeetingOptions {
  title?: string
  meetingUrl: string
  notesMode: MeetingNotesMode
  notesUrl?: string
  startAt: number
}

const RECENT_KEY = 'tct_meeting_recent_v1'
const ACTIVE_KEY = 'tct_meeting_active_v1'

function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 6) : []
  } catch {
    return []
  }
}

function loadActive(): ActiveMeeting | null {
  try {
    const v = JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null')
    // Forget meetings that started more than 4 hours ago
    if (v && typeof v.meetingUrl === 'string' && typeof v.startAt === 'number' && Date.now() - v.startAt < 4 * 3600_000) {
      return v
    }
  } catch {}
  return null
}

function persistActive(m: ActiveMeeting | null) {
  try {
    if (m) localStorage.setItem(ACTIVE_KEY, JSON.stringify(m))
    else localStorage.removeItem(ACTIVE_KEY)
  } catch {}
}

/** "Google Meet", "Zoom", ... from the link, used as the default title */
export function meetingProvider(url: string): string {
  try {
    const host = new URL(url).hostname
    if (host.endsWith('meet.google.com')) return 'Google Meet'
    if (host.endsWith('zoom.us') || host.endsWith('zoom.com')) return 'Zoom'
    if (host.includes('teams.microsoft.com') || host.includes('teams.live.com')) return 'Microsoft Teams'
    if (host.endsWith('whereby.com')) return 'Whereby'
    if (host.includes('jit.si') || host.includes('jitsi')) return 'Jitsi'
    if (host.endsWith('webex.com')) return 'Webex'
    if (host.endsWith('discord.com')) return 'Discord'
    if (host.endsWith('slack.com')) return 'Slack huddle'
    return host.replace(/^www\./, '')
  } catch {
    return 'Meeting'
  }
}

interface MeetingState {
  dialogOpen: boolean
  active: ActiveMeeting | null
  recentUrls: string[]
  setDialogOpen: (open: boolean) => void
  start: (opts: StartMeetingOptions) => Promise<void>
  end: () => void
  /** Bring the meeting (and its notes) back on screen */
  focus: () => void
  /** Record a page opened during the meeting (ignored when no meeting is running) */
  captureLink: (url: string, title: string, tabId: string) => void
}

export const useMeetingStore = create<MeetingState>((set, get) => ({
  dialogOpen: false,
  active: loadActive(),
  recentUrls: loadRecent(),

  setDialogOpen: (dialogOpen) => set({ dialogOpen }),

  start: async (opts) => {
    const store = useBrowserStore.getState()
    const spaceId = store.activeSpaceId || store.spaces[0]?.id
    if (!spaceId) return
    const title = (opts.title || '').trim() || meetingProvider(opts.meetingUrl)
    try {
      const meetingTab = await api.tabs.create({ spaceId, url: opts.meetingUrl, title })
      store.insertTabNextTo(spaceId, meetingTab, store.activeTabId, true)

      let notesTabId: string | null = null
      if (opts.notesMode === 'url' && opts.notesUrl) {
        const notesTab = await api.tabs.create({ spaceId, url: opts.notesUrl, title: 'Meeting notes' })
        useBrowserStore.getState().insertTabNextTo(spaceId, notesTab, meetingTab.id, false)
        notesTabId = notesTab.id
      }

      const active: ActiveMeeting = {
        title,
        meetingUrl: opts.meetingUrl,
        notesMode: opts.notesMode,
        notesUrl: opts.notesUrl,
        startAt: opts.startAt,
        meetingTabId: meetingTab.id,
        notesTabId,
        spaceId,
        links: []
      }
      const recentUrls = [opts.meetingUrl, ...get().recentUrls.filter((u) => u !== opts.meetingUrl)].slice(0, 6)
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(recentUrls))
      } catch {}
      persistActive(active)
      set({ active, recentUrls, dialogOpen: false })
      get().focus()
      playFocusChime('start')
    } catch (err) {
      console.error('[Meeting] Could not start meeting mode:', err)
      toast.error('Could not open the meeting')
    }
  },

  end: () => {
    persistActive(null)
    const store = useBrowserStore.getState()
    const active = get().active
    if (active?.notesTabId && store.splitTabId === active.notesTabId) store.closeSplitView()
    set({ active: null })
    const links = active?.links || []
    const spaceId = active?.spaceId || store.activeSpaceId
    if (active && links.length > 0 && spaceId) {
      // Link catcher: everything opened during the call goes to the end of the space's notes
      const when = new Date(Math.min(active.startAt, Date.now())).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
      const lines = links.map((l) => `- [${l.title.replace(/[[\]]/g, '') || l.url}](${l.url})`)
      const text = `### Links from ${active.title} (${when})\n${lines.join('\n')}\n`
      window.dispatchEvent(new CustomEvent('tct:append-to-notes', { detail: { spaceId, text } }))
      toast('Meeting mode ended', { description: `${links.length} link${links.length === 1 ? '' : 's'} from the call saved to your notes` })
    } else {
      toast('Meeting mode ended')
    }
  },

  captureLink: (url, title, tabId) => {
    const active = get().active
    if (!active || Date.now() < active.startAt - 10 * 60_000) return
    // The call itself isn't a "link from the meeting"
    if (tabId === active.meetingTabId || url === active.meetingUrl) return
    try {
      const u = new URL(url)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return
    } catch {
      return
    }
    const links = active.links || []
    if (links.some((l) => l.url === url) || links.length >= MAX_MEETING_LINKS) return
    const next: ActiveMeeting = { ...active, links: [...links, { url, title: (title || url).slice(0, 200), at: Date.now() }] }
    persistActive(next)
    set({ active: next })
  },

  focus: () => {
    const active = get().active
    if (!active) return
    const store = useBrowserStore.getState()
    const tabs = store.activeSpaceId ? store.tabsBySpace[store.activeSpaceId] || [] : []
    const meetingTab = tabs.find((t) => t.id === active.meetingTabId)
    if (!meetingTab) {
      toast.info('The meeting tab is not in this space')
      return
    }
    store.setActiveTabId(meetingTab.id)
    if (active.notesMode === 'url' && active.notesTabId && tabs.some((t) => t.id === active.notesTabId)) {
      store.setSplitTabId(active.notesTabId)
      store.setSplitRatio(0.62)
      store.setSplitActivePane('primary')
    } else if (active.notesMode === 'drawer') {
      store.setNotesDrawerOpen(true)
    }
  }
}))
