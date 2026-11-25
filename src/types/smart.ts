/**
 * "Smart" browsing features: snoozed tabs, page watchers, per-space focus rules
 * and full-text search over pages you've read. Everything stays on this device.
 */

export interface SnoozedTab {
  id: string
  url: string
  title: string
  favicon?: string | null
  spaceId: string
  /** Wake time (ms since epoch); null = only wakes when the space is opened */
  wakeAt: number | null
  /** Also (or only) wake the next time this space is opened */
  wakeOnSpaceOpen: boolean
  createdAt: number
}

export interface SnoozeTabData {
  url: string
  title: string
  favicon?: string | null
  spaceId: string
  wakeAt: number | null
  wakeOnSpaceOpen: boolean
}

export interface PageWatch {
  id: string
  url: string
  title: string
  /** CSS selector of the watched area; null = the page's main text */
  selector: string | null
  /** Short preview of what is being watched (shown in the list) */
  label: string
  intervalMin: number
  spaceId: string | null
  lastText: string
  previousText: string
  lastCheckedAt: number | null
  lastChangedAt: number | null
  changeCount: number
  /** Changed since the user last looked */
  unseen: boolean
  error: string | null
  createdAt: number
}

export interface AddPageWatchData {
  url: string
  title: string
  selector: string | null
  label: string
  intervalMin: number
  spaceId: string | null
  initialText: string
}

export type FocusRuleWhen = 'always' | 'sprint'

export interface SpaceFocusRule {
  spaceId: string
  enabled: boolean
  when: FocusRuleWhen
  domains: string[]
}

export interface PageSearchHit {
  url: string
  title: string
  favicon: string | null
  snippet: string
  visitedAt: number
}

export interface IndexPageData {
  url: string
  title: string
  favicon?: string | null
  spaceId?: string
  text: string
}

export interface PageIndexStatus {
  enabled: boolean
  pages: number
  sizeKB: number
}

export interface SmartApi {
  snoozeAdd: (data: SnoozeTabData) => Promise<SnoozedTab>
  snoozeList: () => Promise<SnoozedTab[]>
  snoozeRemove: (id: string) => Promise<boolean>
  /** Remove and return snoozes that are due now (and, with spaceId, those waiting for that space) */
  snoozeTakeDue: (spaceId?: string) => Promise<SnoozedTab[]>
  onSnoozeDue: (callback: (items: SnoozedTab[]) => void) => () => void

  pageIndex: (data: IndexPageData) => Promise<boolean>
  pageSearch: (query: string, limit?: number) => Promise<PageSearchHit[]>
  pageIndexStatus: () => Promise<PageIndexStatus>
  pageIndexSetEnabled: (enabled: boolean) => Promise<PageIndexStatus>
  pageIndexClear: () => Promise<PageIndexStatus>

  watchList: () => Promise<PageWatch[]>
  watchAdd: (data: AddPageWatchData) => Promise<PageWatch | null>
  watchUpdate: (id: string, data: { intervalMin?: number; unseen?: boolean }) => Promise<PageWatch | null>
  watchRemove: (id: string) => Promise<boolean>
  watchCheckNow: (id: string) => Promise<PageWatch | null>
  /** A watched page changed (or a check finished) */
  onWatchUpdated: (callback: (watch: PageWatch, changed: boolean) => void) => () => void
  /** The user clicked a "page changed" system notification */
  onWatchOpen: (callback: (watch: PageWatch) => void) => () => void

  focusRulesGet: () => Promise<SpaceFocusRule[]>
  focusRulesSet: (rules: SpaceFocusRule[]) => Promise<SpaceFocusRule[]>
}
