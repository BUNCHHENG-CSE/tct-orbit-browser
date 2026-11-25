import fs from 'fs'
import path from 'path'
import { getAppPaths } from '../storage/paths'
import type { IndexPageData, PageIndexStatus, PageSearchHit } from '../../src/types/smart'

/**
 * Full-text index of pages the user has read ("search what pages said, not just their titles").
 * Stored only on this device, never for private tabs. Size is capped so search stays a fast
 * linear scan and the file stays small.
 */

const MAX_PAGES = 1500
const MAX_TEXT = 10_000
/** Re-index the same URL at most this often */
const REINDEX_MS = 6 * 3600_000

interface IndexedPage {
  url: string
  title: string
  favicon: string | null
  spaceId?: string
  text: string
  visitedAt: number
}

interface IndexFile {
  enabled: boolean
  pages: IndexedPage[]
}

class PageIndex {
  private filePath = ''
  private loaded = false
  private enabled = true
  /** Most recent first */
  private pages: IndexedPage[] = []
  /** Lower-cased title + text, built lazily for search */
  private lc = new WeakMap<IndexedPage, string>()
  private saveTimer: NodeJS.Timeout | null = null

  private ensureLoaded(): void {
    if (this.loaded) return
    this.loaded = true
    this.filePath = path.join(getAppPaths().userProfileDir, 'page-index.json')
    try {
      if (fs.existsSync(this.filePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Partial<IndexFile>
        this.enabled = parsed.enabled !== false
        if (Array.isArray(parsed.pages)) {
          this.pages = parsed.pages.filter((p) => p && typeof p.url === 'string' && typeof p.text === 'string').slice(0, MAX_PAGES)
        }
      }
    } catch (err) {
      console.warn('[PageIndex] Could not load index, starting fresh:', err)
      this.pages = []
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.persist()
    }, 5000)
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
      const data: IndexFile = { enabled: this.enabled, pages: this.pages }
      fs.writeFileSync(tmp, JSON.stringify(data), 'utf-8')
      fs.renameSync(tmp, this.filePath)
    } catch (err) {
      console.error('[PageIndex] Failed to save index:', err)
    }
  }

  public status(): PageIndexStatus {
    this.ensureLoaded()
    const bytes = this.pages.reduce((n, p) => n + p.text.length + p.title.length + p.url.length, 0)
    return { enabled: this.enabled, pages: this.pages.length, sizeKB: Math.round(bytes / 1024) }
  }

  public setEnabled(enabled: boolean): PageIndexStatus {
    this.ensureLoaded()
    this.enabled = enabled
    this.persist()
    return this.status()
  }

  public clear(): PageIndexStatus {
    this.ensureLoaded()
    this.pages = []
    this.persist()
    return this.status()
  }

  public add(data: IndexPageData): boolean {
    this.ensureLoaded()
    if (!this.enabled) return false
    let url: URL
    try {
      url = new URL(data.url)
    } catch {
      return false
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    const text = data.text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
    if (text.length < 200) return false

    // Same page without the #fragment counts as one entry
    url.hash = ''
    const key = url.toString()
    const now = Date.now()
    const idx = this.pages.findIndex((p) => p.url === key)
    if (idx !== -1) {
      const existing = this.pages[idx]
      this.pages.splice(idx, 1)
      if (now - existing.visitedAt < REINDEX_MS) {
        // Just bump to the top; keep the stored text
        this.pages.unshift({ ...existing, visitedAt: now })
        this.scheduleSave()
        return true
      }
    }
    this.pages.unshift({
      url: key,
      title: (data.title || key).slice(0, 300),
      favicon: data.favicon || null,
      spaceId: data.spaceId,
      text,
      visitedAt: now
    })
    if (this.pages.length > MAX_PAGES) this.pages.length = MAX_PAGES
    this.scheduleSave()
    return true
  }

  public search(query: string, limit = 5): PageSearchHit[] {
    this.ensureLoaded()
    const words = Array.from(
      new Set(
        query
          .toLowerCase()
          .split(/[\s,.;:!?"'()]+/)
          .filter((w) => w.length >= 2)
      )
    ).slice(0, 8)
    if (words.length === 0) return []

    const hits: Array<{ page: IndexedPage; score: number; lcText: string }> = []
    const now = Date.now()
    for (const page of this.pages) {
      let lcText = this.lc.get(page)
      if (lcText === undefined) {
        lcText = `${page.title}\n${page.text}`.toLowerCase()
        this.lc.set(page, lcText)
      }
      let score = 0
      let all = true
      for (const w of words) {
        const at = lcText.indexOf(w)
        if (at === -1) {
          all = false
          break
        }
        // Title matches (at the start of lcText) weigh more; count a few more occurrences
        score += at < page.title.length ? 6 : 2
        let from = at + w.length
        for (let i = 0; i < 4; i++) {
          const next = lcText.indexOf(w, from)
          if (next === -1) break
          score += 1
          from = next + w.length
        }
      }
      if (!all) continue
      // The whole phrase appearing as typed is a strong signal
      if (words.length > 1 && lcText.includes(words.join(' '))) score += 8
      // Prefer recent reads
      const ageDays = (now - page.visitedAt) / 86_400_000
      score += Math.max(0, 4 - ageDays / 7)
      hits.push({ page, score, lcText })
    }

    hits.sort((a, b) => b.score - a.score)
    return hits.slice(0, limit).map(({ page, lcText }) => ({
      url: page.url,
      title: page.title,
      favicon: page.favicon,
      snippet: makeSnippet(page, lcText, words),
      visitedAt: page.visitedAt
    }))
  }

  /** Keep the index in step with History deletions */
  public removeUrl(url: string): void {
    this.ensureLoaded()
    let key = url
    try {
      const u = new URL(url)
      u.hash = ''
      key = u.toString()
    } catch {}
    const before = this.pages.length
    this.pages = this.pages.filter((p) => p.url !== key && p.url !== url)
    if (this.pages.length !== before) this.scheduleSave()
  }

  public removeSince(cutoffMs: number): void {
    this.ensureLoaded()
    const before = this.pages.length
    this.pages = this.pages.filter((p) => p.visitedAt < cutoffMs)
    if (this.pages.length !== before) this.persist()
  }
}

function makeSnippet(page: IndexedPage, lcText: string, words: string[]): string {
  // lcText = title + "\n" + text; find the first match inside the body text
  const offset = page.title.length + 1
  let best = -1
  for (const w of words) {
    const at = lcText.indexOf(w, offset)
    if (at !== -1 && (best === -1 || at < best)) best = at
  }
  if (best === -1) return page.text.slice(0, 160)
  const pos = best - offset
  const start = Math.max(0, pos - 70)
  const end = Math.min(page.text.length, pos + 110)
  return `${start > 0 ? '…' : ''}${page.text.slice(start, end).trim()}${end < page.text.length ? '…' : ''}`
}

export const pageIndex = new PageIndex()
