import { create } from 'zustand'
import { api } from '@/lib/ipc'
import { usePomodoroStore } from '@/store/usePomodoroStore'
import type { SpaceFocusRule } from '@/types/smart'

/**
 * UI state for the smart features:
 * - live reading progress per tab (thin bar on tabs)
 * - per-space focus rules + temporary "allow for 10 minutes" exceptions
 * - split-view scroll sync
 */

interface SmartState {
  /** Reading progress 0..1 per tab id (missing = unknown / page too short) */
  progress: Record<string, number>
  setProgress: (tabId: string, ratio: number | null) => void

  focusRules: SpaceFocusRule[]
  /** host -> allowed until (ms) */
  focusAllowUntil: Record<string, number>
  loadFocusRules: () => Promise<void>
  saveFocusRules: (rules: SpaceFocusRule[]) => Promise<void>
  allowTemporarily: (host: string, minutes: number) => void

  syncScroll: boolean
  setSyncScroll: (on: boolean) => void

  smartToolsOpen: boolean
  smartToolsTab: SmartToolsTab
  openSmartTools: (tab?: SmartToolsTab) => void
  setSmartToolsOpen: (open: boolean) => void
}

export type SmartToolsTab = 'snoozed' | 'watching' | 'focus' | 'search'

export const useSmartStore = create<SmartState>((set, get) => ({
  progress: {},
  setProgress: (tabId, ratio) =>
    set((s) => {
      if (ratio === null || ratio < 0) {
        if (!(tabId in s.progress)) return s
        const next = { ...s.progress }
        delete next[tabId]
        return { progress: next }
      }
      if (s.progress[tabId] === ratio) return s
      return { progress: { ...s.progress, [tabId]: ratio } }
    }),

  focusRules: [],
  focusAllowUntil: {},
  loadFocusRules: async () => {
    try {
      const rules = await api.smart.focusRulesGet()
      set({ focusRules: rules })
    } catch {}
  },
  saveFocusRules: async (rules) => {
    set({ focusRules: rules })
    try {
      set({ focusRules: await api.smart.focusRulesSet(rules) })
    } catch {}
  },
  allowTemporarily: (host, minutes) =>
    set((s) => ({ focusAllowUntil: { ...s.focusAllowUntil, [host]: Date.now() + minutes * 60_000 } })),

  syncScroll: false,
  setSyncScroll: (syncScroll) => set({ syncScroll }),

  smartToolsOpen: false,
  smartToolsTab: 'snoozed',
  openSmartTools: (tab) => set({ smartToolsOpen: true, smartToolsTab: tab ?? get().smartToolsTab }),
  setSmartToolsOpen: (smartToolsOpen) => set({ smartToolsOpen })
}))

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

/**
 * If this space's focus rule blocks the URL right now, returns the matching domain.
 * Rules set to "sprint" only apply while a Focus Timer work sprint is running.
 */
export function focusBlockFor(spaceId: string | null | undefined, rawUrl: string): string | null {
  if (!spaceId) return null
  const { focusRules, focusAllowUntil } = useSmartStore.getState()
  const rule = focusRules.find((r) => r.spaceId === spaceId)
  if (!rule || !rule.enabled || rule.domains.length === 0) return null
  if (rule.when === 'sprint') {
    const p = usePomodoroStore.getState()
    if (!(p.isRunning && p.mode === 'work')) return null
  }
  let host: string
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    host = u.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
  const domain = rule.domains.find((d) => hostMatches(host, d))
  if (!domain) return null
  const until = focusAllowUntil[domain]
  if (until && until > Date.now()) return null
  return domain
}
