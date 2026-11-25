/** Updates, screen sharing, sign-in prompts, safe browsing, autofill, routing, boosts, highlights, capture, AI */

import type { SpaceRoute } from '../../shared/siteRules'

export type { SpaceRoute }

export type UpdatePhase = 'unsupported' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'none' | 'error'

export interface UpdateState {
  phase: UpdatePhase
  version?: string
  percent?: number
  error?: string
  /** Why this build can't update itself */
  reason?: string
  checkedAt?: number
}

export interface ScreenSource {
  id: string
  name: string
  kind: 'screen' | 'window'
  thumbnail: string
  icon?: string
}

export interface ScreenShareRequest {
  id: string
  origin: string
  sources: ScreenSource[]
  /** The page asked for audio and this system can share it */
  audioAvailable: boolean
}

export interface AuthRequest {
  id: string
  host: string
  realm: string
  isProxy: boolean
  /** Credentials would travel unencrypted */
  insecure: boolean
}

export interface UnsafeSiteInfo {
  url: string
  host: string
  kind: 'phishing' | 'malware'
  webContentsId?: number
}

export interface SafeBrowsingStatus {
  enabled: boolean
  entries: number
  updatedAt: number | null
}

export interface AddressProfile {
  id: string
  label: string
  name: string
  organization: string
  street: string
  street2: string
  city: string
  state: string
  zip: string
  country: string
  email: string
  phone: string
}

export type AddressInput = Omit<AddressProfile, 'id'> & { id?: string }

export interface Boost {
  id: string
  /** Site it applies to (host, includes subdomains) */
  host: string
  enabled: boolean
  css: string
  /** CSS selectors of hidden elements */
  hidden: string[]
  updatedAt: number
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink'

export interface PageHighlight {
  id: string
  url: string
  title: string
  text: string
  /** Text just before / after, to find the right spot when the words repeat */
  before: string
  after: string
  color: HighlightColor
  createdAt: number
}

export interface AiStatus {
  available: boolean
  models: string[]
  error?: string
}

export interface AiAskData {
  id: string
  model: string
  question: string
  pageTitle: string
  pageUrl: string
  pageText: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface AiChunk {
  id: string
  text: string
  done: boolean
  error?: string
}

export interface CaptureRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PasswordImportResult {
  ok: boolean
  canceled?: boolean
  added: number
  updated: number
  skipped: number
  error?: string
  /** Where the (unencrypted) file is */
  filePath?: string
}

export interface PasswordExportResult {
  ok: boolean
  canceled?: boolean
  count: number
  error?: string
}

export interface EssentialsApi {
  updates: {
    state: () => Promise<UpdateState>
    check: () => Promise<UpdateState>
    install: () => Promise<boolean>
    onState: (callback: (state: UpdateState) => void) => () => void
  }
  pages: {
    /** Asks "Leave site?" if the page has unsaved changes. True = fine to close. */
    confirmClose: (webContentsId: number) => Promise<boolean>
  }
  screenShare: {
    respond: (id: string, sourceId: string | null, audio: boolean) => Promise<boolean>
    onRequest: (callback: (req: ScreenShareRequest) => void) => () => void
    onDismiss: (callback: (id: string) => void) => () => void
  }
  auth: {
    respond: (id: string, username: string | null, password: string) => Promise<boolean>
    onRequest: (callback: (req: AuthRequest) => void) => () => void
    onDismiss: (callback: (id: string) => void) => () => void
  }
  safeBrowsing: {
    status: () => Promise<SafeBrowsingStatus>
    refresh: () => Promise<SafeBrowsingStatus>
    /** Open this site anyway (until the browser closes) */
    allow: (host: string) => Promise<boolean>
    onBlocked: (callback: (info: UnsafeSiteInfo) => void) => () => void
  }
  addresses: {
    list: () => Promise<AddressProfile[]>
    save: (data: AddressInput) => Promise<AddressProfile[]>
    remove: (id: string) => Promise<AddressProfile[]>
    encrypted: () => Promise<boolean>
  }
  passwordFiles: {
    importCsv: () => Promise<PasswordImportResult>
    exportCsv: () => Promise<PasswordExportResult>
    deleteImported: (filePath: string) => Promise<boolean>
  }
  routes: {
    list: () => Promise<SpaceRoute[]>
    save: (pattern: string, spaceId: string) => Promise<SpaceRoute[]>
    remove: (id: string) => Promise<SpaceRoute[]>
    onChanged: (callback: (routes: SpaceRoute[]) => void) => () => void
  }
  boosts: {
    list: () => Promise<Boost[]>
    save: (data: { host: string; css: string; hidden: string[]; enabled: boolean }) => Promise<Boost[]>
    remove: (id: string) => Promise<Boost[]>
  }
  highlights: {
    list: (url?: string) => Promise<PageHighlight[]>
    /** Highlight the text currently selected in a tab */
    add: (webContentsId: number, color: HighlightColor) => Promise<PageHighlight | null>
    remove: (id: string) => Promise<boolean>
    scrollTo: (webContentsId: number, id: string) => Promise<boolean>
  }
  capture: {
    fullPage: (webContentsId: number) => Promise<{ ok: boolean; dataUrl?: string; truncated?: boolean; error?: string }>
    visible: (webContentsId: number) => Promise<{ ok: boolean; dataUrl?: string; error?: string }>
    save: (dataUrl: string, name: string) => Promise<{ ok: boolean; filePath?: string; canceled?: boolean; error?: string }>
    copy: (dataUrl: string) => Promise<boolean>
  }
  ai: {
    status: () => Promise<AiStatus>
    ask: (data: AiAskData) => Promise<boolean>
    cancel: (id: string) => Promise<boolean>
    onChunk: (callback: (chunk: AiChunk) => void) => () => void
  }
  windows: {
    /** New normal window, optionally with a link */
    open: (url?: string) => Promise<boolean>
    /** Move a tab into a new window */
    moveTab: (tabId: string) => Promise<boolean>
    /** Move a tab from an extra window back to the main window */
    moveTabToMain: (tabId: string) => Promise<boolean>
    /** A tab was moved into this window from another one */
    onTabsChanged: (callback: (info: { spaceId: string; activate?: string }) => void) => () => void
  }
  shortcuts: {
    /** While true, keys are not treated as shortcuts (Settings is recording a new one) */
    setRecording: (recording: boolean) => Promise<boolean>
  }
}
