import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { BrowserWindow, Notification, session } from 'electron'
import { getAppPaths } from '../storage/paths'
import { getAppNativeIcon } from '../resources'
import { localStorageService } from '../storage/localStorage'
import { SHARED_TAB_PARTITION, ensureProfileSession, profilePartitionFor } from '../sessions'
import type {
  SnoozedTab,
  SnoozeTabData,
  PageWatch,
  AddPageWatchData,
  SpaceFocusRule
} from '../../src/types/smart'

/**
 * Snoozed tabs, page watchers and per-space focus rules (persisted in smart.json).
 * - Snoozes: a timer hands due tabs back to the UI, which reopens them.
 * - Watchers: pages are loaded one at a time in a hidden, sandboxed, muted window using the
 *   same session as the tabs (so logged-in pages and ad blocking work), then compared.
 */

const MAX_SNOOZES = 500
const MAX_WATCHES = 30
const MIN_INTERVAL_MIN = 15
const MAX_INTERVAL_MIN = 7 * 24 * 60
const WATCH_TEXT_MAX = 5000
const LOAD_TIMEOUT_MS = 30_000
/** Let scripts render dynamic content before reading the page */
const SETTLE_MS = 3500

interface SmartFile {
  snoozes: SnoozedTab[]
  watches: PageWatch[]
  focusRules: SpaceFocusRule[]
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)

const clampInterval = (min: number) => Math.min(MAX_INTERVAL_MIN, Math.max(MIN_INTERVAL_MIN, Math.round(min || 60)))

function isWebUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Same normalization the page uses: collapse whitespace so layout changes aren't "changes" */
const normalizeText = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, WATCH_TEXT_MAX)

class SmartService {
  private filePath = ''
  private data: SmartFile = { snoozes: [], watches: [], focusRules: [] }
  private saveTimer: NodeJS.Timeout | null = null
  private getMainWindow: () => BrowserWindow | null = () => null
  private rendererReady = false
  private snoozeTimer: NodeJS.Timeout | null = null
  private watchTimer: NodeJS.Timeout | null = null
  private checking = false

  public init(getMainWindow: () => BrowserWindow | null): void {
    this.getMainWindow = getMainWindow
    this.filePath = path.join(getAppPaths().userProfileDir, 'smart.json')
    try {
      if (fs.existsSync(this.filePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Partial<SmartFile>
        this.data = {
          snoozes: Array.isArray(parsed.snoozes) ? parsed.snoozes : [],
          watches: Array.isArray(parsed.watches) ? parsed.watches : [],
          focusRules: Array.isArray(parsed.focusRules) ? parsed.focusRules : []
        }
      }
    } catch (err) {
      console.warn('[Smart] Could not load smart.json, starting fresh:', err)
    }

    this.snoozeTimer = setInterval(() => this.deliverDueSnoozes(), 30_000)
    // First watcher pass a little after startup, so it never competes with restoring tabs
    setTimeout(() => void this.runDueWatches(), 45_000)
    this.watchTimer = setInterval(() => void this.runDueWatches(), 60_000)
  }

  public dispose(): void {
    if (this.snoozeTimer) clearInterval(this.snoozeTimer)
    if (this.watchTimer) clearInterval(this.watchTimer)
    this.flushSave()
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.persist()
    }, 500)
  }

  public flushSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
      this.persist()
    }
  }

  private persist(): void {
    if (!this.filePath) return
    try {
      const tmp = `${this.filePath}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(this.data), 'utf-8')
      fs.renameSync(tmp, this.filePath)
    } catch (err) {
      console.error('[Smart] Failed to save smart.json:', err)
    }
  }

  private send(channel: string, ...args: unknown[]): boolean {
    const win = this.getMainWindow()
    if (!win || win.isDestroyed()) return false
    win.webContents.send(channel, ...args)
    return true
  }

  private notify(title: string, body: string, onClick?: () => void): void {
    try {
      if (!Notification.isSupported()) return
      const n = new Notification({ title, body, silent: false, icon: getAppNativeIcon() })
      n.on('click', () => {
        const win = this.getMainWindow()
        if (win && !win.isDestroyed()) {
          if (win.isMinimized()) win.restore()
          win.show()
          win.focus()
        }
        onClick?.()
      })
      n.show()
    } catch {}
  }

  // ---------------------------------------------------------------- Snoozed tabs

  public snoozeAdd(input: SnoozeTabData): SnoozedTab {
    if (!isWebUrl(input.url)) throw new Error('Only web pages can be snoozed')
    const item: SnoozedTab = {
      id: newId(),
      url: input.url,
      title: (input.title || input.url).slice(0, 300),
      favicon: input.favicon ?? null,
      spaceId: input.spaceId,
      wakeAt: input.wakeAt,
      wakeOnSpaceOpen: !!input.wakeOnSpaceOpen || input.wakeAt === null,
      createdAt: Date.now()
    }
    this.data.snoozes.push(item)
    if (this.data.snoozes.length > MAX_SNOOZES) this.data.snoozes.splice(0, this.data.snoozes.length - MAX_SNOOZES)
    this.scheduleSave()
    return item
  }

  public snoozeList(): SnoozedTab[] {
    return [...this.data.snoozes].sort((a, b) => (a.wakeAt ?? Infinity) - (b.wakeAt ?? Infinity))
  }

  public snoozeRemove(id: string): boolean {
    const before = this.data.snoozes.length
    this.data.snoozes = this.data.snoozes.filter((s) => s.id !== id)
    if (this.data.snoozes.length === before) return false
    this.scheduleSave()
    return true
  }

  /** Called by the UI on startup (marks it ready) and whenever a space is opened */
  public snoozeTakeDue(spaceId?: string): SnoozedTab[] {
    this.rendererReady = true
    const now = Date.now()
    const due = this.data.snoozes.filter(
      (s) => (s.wakeAt !== null && s.wakeAt <= now) || (!!spaceId && s.wakeOnSpaceOpen && s.spaceId === spaceId)
    )
    if (due.length > 0) {
      const ids = new Set(due.map((s) => s.id))
      this.data.snoozes = this.data.snoozes.filter((s) => !ids.has(s.id))
      this.scheduleSave()
    }
    return due
  }

  private deliverDueSnoozes(): void {
    if (!this.rendererReady) return
    const now = Date.now()
    const due = this.data.snoozes.filter((s) => s.wakeAt !== null && s.wakeAt <= now)
    if (due.length === 0) return
    if (!this.send('smart:snooze-due', due)) return
    const ids = new Set(due.map((s) => s.id))
    this.data.snoozes = this.data.snoozes.filter((s) => !ids.has(s.id))
    this.scheduleSave()
    const win = this.getMainWindow()
    if (win && !win.isFocused()) {
      this.notify(
        due.length === 1 ? 'Snoozed tab is back' : `${due.length} snoozed tabs are back`,
        due.length === 1 ? due[0].title : due.map((d) => d.title).slice(0, 3).join(', ')
      )
    }
  }

  // ---------------------------------------------------------------- Page watchers

  public watchList(): PageWatch[] {
    return [...this.data.watches].sort((a, b) => Number(b.unseen) - Number(a.unseen) || b.createdAt - a.createdAt)
  }

  public watchAdd(input: AddPageWatchData): PageWatch | null {
    if (!isWebUrl(input.url)) return null
    if (this.data.watches.length >= MAX_WATCHES) throw new Error(`You can watch up to ${MAX_WATCHES} pages`)
    // The text the user saw in their tab can differ from a fresh background load (lazy content,
    // scroll position). The first background check records the baseline silently instead, so
    // the user never gets a "changed" alert that is only a difference in how the page loaded.
    const text = ''
    const watch: PageWatch = {
      id: newId(),
      url: input.url,
      title: (input.title || input.url).slice(0, 300),
      selector: input.selector ? input.selector.slice(0, 1000) : null,
      label: (input.label || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      intervalMin: clampInterval(input.intervalMin),
      spaceId: input.spaceId,
      lastText: text,
      previousText: '',
      lastCheckedAt: text ? Date.now() : null,
      lastChangedAt: null,
      changeCount: 0,
      unseen: false,
      error: null,
      createdAt: Date.now()
    }
    this.data.watches.push(watch)
    this.scheduleSave()
    // Record the baseline soon, so the list shows "checked" right away
    setTimeout(() => void this.runDueWatches(), 5000)
    return watch
  }

  public watchUpdate(id: string, patch: { intervalMin?: number; unseen?: boolean }): PageWatch | null {
    const w = this.data.watches.find((x) => x.id === id)
    if (!w) return null
    if (patch.intervalMin !== undefined) w.intervalMin = clampInterval(patch.intervalMin)
    if (patch.unseen !== undefined) w.unseen = patch.unseen
    this.scheduleSave()
    return { ...w }
  }

  public watchRemove(id: string): boolean {
    const before = this.data.watches.length
    this.data.watches = this.data.watches.filter((w) => w.id !== id)
    if (before === this.data.watches.length) return false
    this.scheduleSave()
    return true
  }

  public async watchCheckNow(id: string): Promise<PageWatch | null> {
    const w = this.data.watches.find((x) => x.id === id)
    if (!w) return null
    // Wait for a running background check instead of opening two hidden windows
    for (let i = 0; i < 60 && this.checking; i++) await new Promise((r) => setTimeout(r, 500))
    this.checking = true
    try {
      await this.checkWatch(w)
    } finally {
      this.checking = false
    }
    return { ...w }
  }

  private async runDueWatches(): Promise<void> {
    if (this.checking) return
    const now = Date.now()
    const due = this.data.watches
      .filter((w) => !w.lastCheckedAt || now - w.lastCheckedAt >= w.intervalMin * 60_000)
      .sort((a, b) => (a.lastCheckedAt ?? 0) - (b.lastCheckedAt ?? 0))
    if (due.length === 0) return
    this.checking = true
    try {
      // A few per pass keeps the background cost low; the rest run on the next minute
      for (const w of due.slice(0, 3)) {
        if (!this.data.watches.includes(w)) continue
        await this.checkWatch(w)
      }
    } finally {
      this.checking = false
    }
  }

  private partitionFor(spaceId: string | null): string {
    if (spaceId) {
      const space = localStorageService.listSpaces().find((s) => s.id === spaceId)
      if (space?.isolated) {
        const partition = profilePartitionFor(spaceId)
        ensureProfileSession(partition)
        return partition
      }
    }
    return SHARED_TAB_PARTITION
  }

  private async readPage(url: string, selector: string | null, partition: string): Promise<string | null> {
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        session: session.fromPartition(partition),
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        backgroundThrottling: false,
        spellcheck: false
      }
    })
    try {
      win.webContents.setAudioMuted(true)
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      win.webContents.on('will-prevent-unload', (e) => e.preventDefault())

      await Promise.race([
        win.loadURL(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('The page took too long to load')), LOAD_TIMEOUT_MS))
      ])
      await new Promise((r) => setTimeout(r, SETTLE_MS))
      if (win.isDestroyed()) return null

      const script = `(function () {
        try {
          var sel = ${JSON.stringify(selector)};
          var el = null;
          if (sel) { el = document.querySelector(sel); if (!el) return { missing: true }; }
          else { el = document.querySelector('main, article, [role="main"]') || document.body; }
          return { text: (el.innerText || el.textContent || '') };
        } catch (e) { return { error: String(e && e.message || e) }; }
      })()`
      const res = (await win.webContents.executeJavaScript(script, true)) as { text?: string; missing?: boolean; error?: string }
      if (res?.missing) throw new Error('The watched part of the page was not found (the site may have changed its layout)')
      if (res?.error) throw new Error(res.error)
      return normalizeText(res?.text || '')
    } finally {
      if (!win.isDestroyed()) win.destroy()
    }
  }

  private async checkWatch(w: PageWatch): Promise<void> {
    let changed = false
    try {
      const text = await this.readPage(w.url, w.selector, this.partitionFor(w.spaceId))
      w.lastCheckedAt = Date.now()
      w.error = null
      if (text !== null) {
        if (!w.lastText) {
          w.lastText = text
        } else if (text !== w.lastText) {
          w.previousText = w.lastText
          w.lastText = text
          w.lastChangedAt = Date.now()
          w.changeCount += 1
          w.unseen = true
          changed = true
        }
      }
    } catch (err) {
      w.lastCheckedAt = Date.now()
      w.error = err instanceof Error ? err.message : String(err)
    }
    this.scheduleSave()
    const snapshot = { ...w }
    this.send('smart:watch-updated', snapshot, changed)
    if (changed) {
      this.notify('A page you watch changed', w.label ? `${w.title}\n${w.label}` : w.title, () => {
        this.send('smart:watch-open', snapshot)
      })
    }
  }

  // ---------------------------------------------------------------- Focus rules per space

  public focusRulesGet(): SpaceFocusRule[] {
    return this.data.focusRules.map((r) => ({ ...r, domains: [...r.domains] }))
  }

  public focusRulesSet(rules: SpaceFocusRule[]): SpaceFocusRule[] {
    const clean = new Map<string, SpaceFocusRule>()
    for (const r of rules) {
      if (!r || typeof r.spaceId !== 'string') continue
      const domains = Array.from(
        new Set(
          (r.domains || [])
            .map((d) => String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0])
            .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))
        )
      ).slice(0, 200)
      clean.set(r.spaceId, { spaceId: r.spaceId, enabled: !!r.enabled, when: r.when === 'sprint' ? 'sprint' : 'always', domains })
    }
    this.data.focusRules = Array.from(clean.values())
    this.scheduleSave()
    return this.focusRulesGet()
  }
}

export const smartService = new SmartService()
