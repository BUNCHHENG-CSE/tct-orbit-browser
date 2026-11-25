import { app, session } from 'electron'
import fs from 'fs'
import path from 'path'
import { parseHostsList, isListedHost } from '../../shared/hostsList'
import { localStorageService } from '../storage/localStorage'
import type { SafeBrowsingStatus, UnsafeSiteInfo } from '../../src/types/essentials'

/**
 * Phishing and malware protection. Lists of bad hosts are downloaded and checked on this
 * computer: the addresses you visit are never sent anywhere.
 */

const LISTS = [
  { kind: 'phishing', file: 'phishing.txt', url: 'https://malware-filter.gitlab.io/malware-filter/phishing-filter-hosts.txt' },
  { kind: 'malware', file: 'malware.txt', url: 'https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-hosts-online.txt' }
] as const

const REFRESH_MS = 12 * 3600_000
const MAX_BYTES = 25 * 1024 * 1024

class SafeBrowsingService {
  private hosts: Record<'phishing' | 'malware', Set<string>> = { phishing: new Set(), malware: new Set() }
  /** Sites the user chose to open anyway, for this run only */
  private allowed = new Set<string>()
  private updatedAt: number | null = null
  private refreshing: Promise<void> | null = null
  private dir = ''
  public onBlocked: ((info: UnsafeSiteInfo) => void) | null = null

  public init(): void {
    this.dir = path.join(app.getPath('userData'), 'safe-browsing')
    for (const list of LISTS) {
      try {
        const file = path.join(this.dir, list.file)
        const text = fs.readFileSync(file, 'utf8')
        this.hosts[list.kind] = new Set(parseHostsList(text))
        const mtime = fs.statSync(file).mtimeMs
        this.updatedAt = this.updatedAt === null ? mtime : Math.min(this.updatedAt, mtime)
      } catch {
        this.updatedAt = 0 // a list is missing: refresh soon
      }
    }
    setTimeout(() => void this.refreshIfOld(), 8_000)
    setInterval(() => void this.refreshIfOld(), 3600_000)
  }

  public get enabled(): boolean {
    return localStorageService.getSettings().safeBrowsing !== false
  }

  private async refreshIfOld(): Promise<void> {
    if (this.enabled && Date.now() - (this.updatedAt ?? 0) > REFRESH_MS) await this.refresh()
  }

  public refresh(): Promise<void> {
    this.refreshing ??= this.download().finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  private async download(): Promise<void> {
    let ok = 0
    for (const list of LISTS) {
      try {
        const res = await session.defaultSession.fetch(list.url, { signal: AbortSignal.timeout(60_000), credentials: 'omit' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const text = await res.text()
        if (text.length > MAX_BYTES) throw new Error('too large')
        const hosts = parseHostsList(text)
        // An error page must not replace a good list
        if (hosts.length < 50) throw new Error('not a host list')
        this.hosts[list.kind] = new Set(hosts)
        await fs.promises.mkdir(this.dir, { recursive: true })
        const file = path.join(this.dir, list.file)
        await fs.promises.writeFile(`${file}.tmp`, text, 'utf8')
        await fs.promises.rename(`${file}.tmp`, file)
        ok++
      } catch (err) {
        console.warn(`[SafeBrowsing] Could not update the ${list.kind} list:`, err instanceof Error ? err.message : err)
      }
    }
    if (ok === LISTS.length) this.updatedAt = Date.now()
  }

  /** Kind of danger for a host, or null when it is fine */
  public check(host: string): 'phishing' | 'malware' | null {
    if (!this.enabled || this.allowed.has(host)) return null
    if (isListedHost(host, this.hosts.phishing)) return 'phishing'
    if (isListedHost(host, this.hosts.malware)) return 'malware'
    return null
  }

  public report(info: UnsafeSiteInfo): void {
    this.onBlocked?.(info)
  }

  public allow(host: string): void {
    this.allowed.add(host.toLowerCase())
  }

  public status(): SafeBrowsingStatus {
    return {
      enabled: this.enabled,
      entries: this.hosts.phishing.size + this.hosts.malware.size,
      updatedAt: this.updatedAt || null
    }
  }
}

export const safeBrowsing = new SafeBrowsingService()
