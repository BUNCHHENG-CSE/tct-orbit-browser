import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  Timer,
  Video,
  Activity,
  Sparkles,
  Columns2,
  BookOpen,
  Tv2,
  FileText,
  Download,
  Star,
  KeyRound,
  History,
  Search,
  AppWindow,
  LayoutTemplate,
  ShieldCheck,
  Bot,
  Languages,
  Camera,
  Highlighter
} from 'lucide-react'
import { useBrowserStore } from '@/store/useBrowserStore'
import { usePomodoroStore } from '@/store/usePomodoroStore'
import { useMeetingStore } from '@/store/useMeetingStore'

const emit = (name: string) => window.dispatchEvent(new CustomEvent(name))

export interface HeaderFeature {
  label: string
  icon: React.ComponentType<{ className?: string }>
  iconCls?: string
  run: () => void
}

/** Tools-menu features that can be pinned to the title bar */
export const HEADER_FEATURES = {
  'focus-timer': { label: 'Focus Timer', icon: Timer, iconCls: 'text-primary', run: () => usePomodoroStore.getState().setIsOpen(true) },
  meeting: {
    label: 'Meeting Mode',
    icon: Video,
    iconCls: 'text-rose-500',
    run: () => {
      const m = useMeetingStore.getState()
      if (m.active) m.focus()
      else m.setDialogOpen(true)
    }
  },
  'task-manager': { label: 'Task Manager', icon: Activity, iconCls: 'text-emerald-500', run: () => useBrowserStore.getState().setTaskManagerOpen(true) },
  zen: {
    label: 'Zen Mode',
    icon: Sparkles,
    iconCls: 'text-purple-400',
    run: () => {
      const s = useBrowserStore.getState()
      s.setZenMode(!s.zenMode)
    }
  },
  split: { label: 'Split View', icon: Columns2, run: () => emit('tct:toggle-split-view') },
  reader: { label: 'Reader Mode', icon: BookOpen, run: () => emit('tct:toggle-reader-mode') },
  pip: { label: 'Picture-in-Picture', icon: Tv2, run: () => emit('tct:toggle-pip') },
  notes: { label: 'Space Notes', icon: FileText, run: () => emit('tct:toggle-notes') },
  downloads: { label: 'Downloads', icon: Download, run: () => emit('open-downloads') },
  bookmarks: { label: 'Bookmarks', icon: Star, iconCls: 'text-amber-500', run: () => useBrowserStore.getState().setBookmarksDialogOpen(true) },
  passwords: { label: 'Passwords', icon: KeyRound, iconCls: 'text-primary', run: () => emit('tct:open-passwords') },
  history: { label: 'History', icon: History, run: () => useBrowserStore.getState().setHistoryDialogOpen(true) },
  find: { label: 'Find in Page', icon: Search, run: () => emit('tct:toggle-find') },
  'tab-search': { label: 'Search Tabs', icon: AppWindow, iconCls: 'text-primary', run: () => emit('tct:open-tab-search') },
  templates: { label: 'Space Templates', icon: LayoutTemplate, run: () => emit('tct:open-space-templates') },
  ask: { label: 'Ask this page', icon: Bot, iconCls: 'text-primary', run: () => emit('tct:ask-page') },
  translate: { label: 'Translate page', icon: Languages, run: () => emit('tct:translate-page') },
  capture: { label: 'Web capture', icon: Camera, iconCls: 'text-amber-500', run: () => emit('tct:web-capture') },
  highlights: { label: 'Highlights', icon: Highlighter, iconCls: 'text-yellow-500', run: () => emit('tct:open-highlights') },
  privacy: { label: 'Privacy Report', icon: ShieldCheck, iconCls: 'text-emerald-500', run: () => emit('tct:open-privacy-report') }
} satisfies Record<string, HeaderFeature>

export type HeaderFeatureId = keyof typeof HEADER_FEATURES

interface HeaderPinsState {
  pinned: HeaderFeatureId[]
  toggle: (id: HeaderFeatureId) => void
}

export const useHeaderPins = create<HeaderPinsState>()(
  persist(
    (set) => ({
      pinned: [],
      toggle: (id) =>
        set((s) => ({ pinned: s.pinned.includes(id) ? s.pinned.filter((p) => p !== id) : [...s.pinned, id] }))
    }),
    {
      name: 'tct-header-pins',
      // Drop ids that no longer exist
      merge: (persisted, current) => {
        const p = (persisted as Partial<HeaderPinsState>)?.pinned ?? []
        return { ...current, pinned: p.filter((id) => id in HEADER_FEATURES) }
      }
    }
  )
)
