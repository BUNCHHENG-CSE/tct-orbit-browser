import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getAppPaths } from './paths'
import type {
  HistoryEntry,
  RecordVisitData,
  HistoryFilterOptions,
  HistoryListResult,
  HistoryClearRange
} from '../../src/types/api'

const MAX_HISTORY_ITEMS = 10000

class HistoryService {
  private entries: HistoryEntry[] = []
  private filePath: string = ''
  private lastVisitRef: { url: string; time: number } = { url: '', time: 0 }
  private saveTimeout: NodeJS.Timeout | null = null

  public init(): void {
    try {
      const paths = getAppPaths()
      this.filePath = path.join(paths.userProfileDir, 'history.json')

      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8')
        const parsed = JSON.parse(content)
        if (Array.isArray(parsed)) {
          this.entries = parsed
          console.log(`[HistoryService] Loaded ${this.entries.length} history records from:`, this.filePath)
        }
      }
    } catch (err) {
      console.warn('[HistoryService] Failed to load history file, initializing fresh:', err)
      this.entries = []
    }
  }

  private scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }
    this.saveTimeout = setTimeout(() => {
      this.persist()
    }, 400)
  }

  private persist(): void {
    if (!this.filePath) return
    try {
      const tmpPath = `${this.filePath}.tmp`
      fs.writeFileSync(tmpPath, JSON.stringify(this.entries, null, 2), 'utf-8')
      fs.renameSync(tmpPath, this.filePath)
    } catch (err) {
      console.error('[HistoryService] Failed to persist history:', err)
    }
  }

  public recordVisit(data: RecordVisitData): HistoryEntry | null {
    if (!data.url || typeof data.url !== 'string') return null

    const rawUrl = data.url.trim()
    if (
      !rawUrl ||
      rawUrl === 'about:blank' ||
      rawUrl.startsWith('devtools://') ||
      rawUrl.startsWith('chrome://') ||
      rawUrl.startsWith('chrome-extension://')
    ) {
      return null
    }

    const now = Date.now()
    // Debounce rapid repeated triggers for the exact same URL within 1.5 seconds
    if (this.lastVisitRef.url === rawUrl && now - this.lastVisitRef.time < 1500) {
      return null
    }
    this.lastVisitRef = { url: rawUrl, time: now }

    const isoDate = new Date(now).toISOString()
    const cleanTitle = data.title?.trim() || rawUrl

    // Find if this URL already exists in history
    const existingIndex = this.entries.findIndex((e) => e.url === rawUrl)

    let entry: HistoryEntry

    if (existingIndex !== -1) {
      const existing = this.entries[existingIndex]
      entry = {
        ...existing,
        title: cleanTitle && cleanTitle !== rawUrl ? cleanTitle : existing.title,
        favicon: data.favicon || existing.favicon,
        visitedAt: isoDate,
        visitCount: (existing.visitCount || 1) + 1,
        spaceId: data.spaceId || existing.spaceId
      }
      // Move to top of history
      this.entries.splice(existingIndex, 1)
      this.entries.unshift(entry)
    } else {
      entry = {
        id: crypto.randomUUID ? crypto.randomUUID() : `hist-${now}-${Math.random().toString(36).slice(2, 8)}`,
        url: rawUrl,
        title: cleanTitle,
        favicon: data.favicon || null,
        visitedAt: isoDate,
        visitCount: 1,
        spaceId: data.spaceId
      }
      this.entries.unshift(entry)
    }

    // Cap total entries to prevent bloat
    if (this.entries.length > MAX_HISTORY_ITEMS) {
      this.entries = this.entries.slice(0, MAX_HISTORY_ITEMS)
    }

    this.scheduleSave()
    return entry
  }

  public getHistory(options: HistoryFilterOptions = {}): HistoryListResult {
    let filtered = [...this.entries]

    if (options.query && options.query.trim()) {
      const q = options.query.trim().toLowerCase()
      filtered = filtered.filter(
        (e) => e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q)
      )
    }

    if (options.spaceId) {
      filtered = filtered.filter((e) => e.spaceId === options.spaceId)
    }

    if (options.startDate) {
      const startMs = Date.parse(options.startDate)
      if (!isNaN(startMs)) {
        filtered = filtered.filter((e) => Date.parse(e.visitedAt) >= startMs)
      }
    }

    if (options.endDate) {
      const endMs = Date.parse(options.endDate)
      if (!isNaN(endMs)) {
        filtered = filtered.filter((e) => Date.parse(e.visitedAt) <= endMs)
      }
    }

    const total = filtered.length
    const offset = Math.max(0, options.offset || 0)
    const limit = Math.min(500, Math.max(1, options.limit || 100))

    const paged = filtered.slice(offset, offset + limit)
    return { entries: paged, total }
  }

  public searchHistory(query: string, limit = 10): HistoryEntry[] {
    if (!query || !query.trim()) {
      return this.entries.slice(0, limit)
    }

    const q = query.trim().toLowerCase()
    return this.entries
      .filter((e) => e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q))
      .slice(0, limit)
  }

  public deleteItem(id: string): boolean {
    const idx = this.entries.findIndex((e) => e.id === id)
    if (idx !== -1) {
      this.entries.splice(idx, 1)
      this.scheduleSave()
      return true
    }
    return false
  }

  public deleteByUrl(url: string): boolean {
    const prevCount = this.entries.length
    this.entries = this.entries.filter((e) => e.url !== url)
    if (this.entries.length !== prevCount) {
      this.scheduleSave()
      return true
    }
    return false
  }

  public clearHistory(range: HistoryClearRange = 'all'): boolean {
    if (range === 'all') {
      this.entries = []
    } else {
      const now = Date.now()
      let cutoffMs = 0

      if (range === 'last-hour') {
        cutoffMs = now - 60 * 60 * 1000
      } else if (range === 'today') {
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        cutoffMs = todayStart.getTime()
      } else if (range === 'last-7-days') {
        cutoffMs = now - 7 * 24 * 60 * 60 * 1000
      }

      this.entries = this.entries.filter((e) => Date.parse(e.visitedAt) < cutoffMs)
    }

    this.scheduleSave()
    return true
  }

  // Backup & Restore utilities
  public getAllEntries(): HistoryEntry[] {
    return [...this.entries]
  }

  public restoreEntries(imported: HistoryEntry[], mode: 'merge' | 'replace'): number {
    if (!Array.isArray(imported)) return 0

    if (mode === 'replace') {
      this.entries = [...imported]
    } else {
      const existingUrls = new Set(this.entries.map((e) => e.url))
      for (const item of imported) {
        if (!existingUrls.has(item.url)) {
          this.entries.push(item)
          existingUrls.add(item.url)
        }
      }
      // Re-sort by visitedAt descending
      this.entries.sort((a, b) => Date.parse(b.visitedAt) - Date.parse(a.visitedAt))
    }

    if (this.entries.length > MAX_HISTORY_ITEMS) {
      this.entries = this.entries.slice(0, MAX_HISTORY_ITEMS)
    }

    this.persist()
    return this.entries.length
  }
}

export const historyService = new HistoryService()
