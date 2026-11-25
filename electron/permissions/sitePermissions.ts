import { app, BrowserWindow, type WebContents } from 'electron'
import fs from 'fs'
import path from 'path'
import { promptWindowFor } from '../essentials/windowOf'

/**
 * Per-site permission decisions + interactive prompts.
 *
 * Web pages asking for the camera, microphone, location, notifications, clipboard or MIDI get a
 * prompt in the browser UI instead of a silent denial. "Remember" decisions are stored per origin
 * (private-tab decisions only live in memory). Everything else sensitive stays blocked.
 */

export type PromptablePermission = 'camera' | 'microphone' | 'geolocation' | 'notifications' | 'clipboard-read' | 'midi'
export type PermissionDecision = 'allow' | 'block'

export const PROMPTABLE_PERMISSIONS: PromptablePermission[] = [
  'camera',
  'microphone',
  'geolocation',
  'notifications',
  'clipboard-read',
  'midi'
]

export interface PermissionPromptRequest {
  id: string
  origin: string
  permissions: PromptablePermission[]
  isPrivate: boolean
}

type SiteDecisions = Record<string, Partial<Record<PromptablePermission, PermissionDecision>>>

const PROMPT_TIMEOUT_MS = 60_000

function safeOrigin(url: string): string {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : ''
  } catch {
    return ''
  }
}

/** Map an Electron permission request to the user-facing permission(s) it covers */
export function toPromptable(permission: string, details?: any): PromptablePermission[] {
  switch (permission) {
    case 'media': {
      const types: string[] = Array.isArray(details?.mediaTypes) ? details.mediaTypes : []
      const out: PromptablePermission[] = []
      if (types.includes('video')) out.push('camera')
      if (types.includes('audio')) out.push('microphone')
      // Unknown media types: ask for both (getUserMedia without explicit types)
      return out.length > 0 ? out : ['camera', 'microphone']
    }
    case 'camera':
    case 'videoCapture':
      return ['camera']
    case 'microphone':
    case 'audioCapture':
      return ['microphone']
    case 'geolocation':
      return ['geolocation']
    case 'notifications':
      return ['notifications']
    case 'clipboard-read':
      return ['clipboard-read']
    case 'midi':
    case 'midiSysex':
    case 'midi-sysex':
      return ['midi']
    default:
      return []
  }
}

class SitePermissionsService {
  private decisions: SiteDecisions = {}
  /** Private-tab decisions: never written to disk */
  private privateDecisions: SiteDecisions = {}
  private filePath = ''
  private saveTimer: NodeJS.Timeout | null = null
  private pending = new Map<string, { resolve: (allow: boolean) => void; timer: NodeJS.Timeout; req: PermissionPromptRequest }>()
  private getWindow: () => BrowserWindow | null = () => null
  /** In-flight prompts keyed by origin+permissions, so repeated requests share one prompt */
  private inflight = new Map<string, Promise<boolean>>()

  public init(getWindow: () => BrowserWindow | null): void {
    this.getWindow = getWindow
    this.filePath = path.join(app.getPath('userData'), 'site-permissions.json')
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
        if (raw && typeof raw === 'object') this.decisions = this.sanitize(raw)
      }
    } catch (err) {
      console.warn('[SitePermissions] Could not load saved decisions:', err)
    }
  }

  private sanitize(raw: any): SiteDecisions {
    const out: SiteDecisions = {}
    for (const [origin, perms] of Object.entries(raw || {})) {
      if (!safeOrigin(origin) || !perms || typeof perms !== 'object') continue
      const clean: Partial<Record<PromptablePermission, PermissionDecision>> = {}
      for (const p of PROMPTABLE_PERMISSIONS) {
        const v = (perms as any)[p]
        if (v === 'allow' || v === 'block') clean[p] = v
      }
      if (Object.keys(clean).length > 0) out[origin] = clean
    }
    return out
  }

  private scheduleSave(): void {
    if (!this.filePath) return
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      try {
        const tmp = `${this.filePath}.tmp`
        fs.writeFileSync(tmp, JSON.stringify(this.decisions), 'utf8')
        fs.renameSync(tmp, this.filePath)
      } catch (err) {
        console.error('[SitePermissions] Failed to save decisions:', err)
      }
    }, 300)
  }

  private store(isPrivate: boolean): SiteDecisions {
    return isPrivate ? this.privateDecisions : this.decisions
  }

  /** Stored decision for every permission, or null if at least one is undecided */
  public getDecision(origin: string, perms: PromptablePermission[], isPrivate: boolean): PermissionDecision | null {
    const site = this.store(isPrivate)[origin]
    if (!site) return null
    let allAllowed = true
    for (const p of perms) {
      const d = site[p]
      if (d === 'block') return 'block'
      if (d !== 'allow') allAllowed = false
    }
    return allAllowed ? 'allow' : null
  }

  public setDecision(origin: string, perm: PromptablePermission, decision: PermissionDecision | null, isPrivate = false): void {
    const o = safeOrigin(origin)
    if (!o || !PROMPTABLE_PERMISSIONS.includes(perm)) return
    const s = this.store(isPrivate)
    const site = { ...(s[o] || {}) }
    if (decision) site[perm] = decision
    else delete site[perm]
    if (Object.keys(site).length > 0) s[o] = site
    else delete s[o]
    if (!isPrivate) this.scheduleSave()
  }

  public resetOrigin(origin: string): void {
    const o = safeOrigin(origin) || origin
    delete this.decisions[o]
    delete this.privateDecisions[o]
    this.scheduleSave()
  }

  public listAll(): SiteDecisions {
    return JSON.parse(JSON.stringify(this.decisions))
  }

  public clearPrivate(): void {
    this.privateDecisions = {}
  }

  /** Silent check (navigator.permissions.query, Notification.permission ...) */
  public check(contents: WebContents | null, origin: string, permission: string, isPrivate: boolean): boolean {
    const perms = toPromptable(permission, { mediaTypes: permission === 'media' ? ['video', 'audio'] : [] })
    if (perms.length === 0 || !contents || contents.getType() !== 'webview') return false
    const o = safeOrigin(origin)
    if (!o) return false
    // For 'media' checks, report granted if either device is allowed
    const site = this.store(isPrivate)[o]
    if (!site) return false
    return perms.some((p) => site[p] === 'allow')
  }

  /** Decide a request: stored decision, otherwise ask the user */
  public async request(contents: WebContents | null, requestingUrl: string, permission: string, details: any, isPrivate: boolean): Promise<boolean> {
    const perms = toPromptable(permission, details)
    if (perms.length === 0) return false
    // Only web pages in tabs can be prompted for (never the browser UI itself)
    if (!contents || contents.isDestroyed() || contents.getType() !== 'webview') return false
    const origin = safeOrigin(requestingUrl || contents.getURL())
    if (!origin) return false

    const stored = this.getDecision(origin, perms, isPrivate)
    if (stored) return stored === 'allow'

    const key = `${isPrivate ? 'p:' : ''}${origin}|${perms.join(',')}`
    const existing = this.inflight.get(key)
    if (existing) return existing

    const promise = this.prompt(contents, { id: `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, origin, permissions: perms, isPrivate })
    this.inflight.set(key, promise)
    try {
      return await promise
    } finally {
      this.inflight.delete(key)
    }
  }

  private prompt(contents: WebContents, req: PermissionPromptRequest): Promise<boolean> {
    const win = promptWindowFor(contents) ?? this.getWindow()
    if (!win || win.isDestroyed()) return Promise.resolve(false)
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        // No answer: deny (the page can ask again later)
        this.pending.delete(req.id)
        if (!win.isDestroyed()) win.webContents.send('permissions:dismiss', req.id)
        resolve(false)
      }, PROMPT_TIMEOUT_MS)
      this.pending.set(req.id, { resolve, timer, req })
      win.webContents.send('permissions:request', req)
    })
  }

  /** Answer from the UI prompt */
  public respond(id: string, allow: boolean, remember: boolean): boolean {
    const entry = this.pending.get(id)
    if (!entry) return false
    clearTimeout(entry.timer)
    this.pending.delete(id)
    if (remember) {
      for (const p of entry.req.permissions) {
        this.setDecision(entry.req.origin, p, allow ? 'allow' : 'block', entry.req.isPrivate)
      }
    }
    entry.resolve(allow)
    return true
  }
}

export const sitePermissions = new SitePermissionsService()
