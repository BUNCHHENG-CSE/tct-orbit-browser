import { app, dialog, type BrowserWindow } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { bookmarksService } from './bookmarksService'
import { historyService } from './historyService'
import type { HistoryEntry } from '../../src/types/api'

/**
 * Import bookmarks and history from Chrome, Edge, Brave, Vivaldi, Opera (Chromium family)
 * and Firefox, plus any browser's exported bookmarks HTML file.
 *
 * Databases are copied to a temp folder first: the source browser may be running and holding
 * a lock on them. Nothing is ever written to the other browser's profile.
 */

export type ImportBrowserKind = 'chromium' | 'firefox'

export interface ImportSource {
  id: string
  browser: string
  profileName: string
  kind: ImportBrowserKind
  profilePath: string
  hasBookmarks: boolean
  hasHistory: boolean
}

export interface ImportResult {
  success: boolean
  bookmarks: number
  history: number
  error?: string
}

const MAX_HISTORY_IMPORT = 5000
// Chrome stores times as microseconds since 1601-01-01
const CHROME_EPOCH_OFFSET_MS = 11644473600000

function isWebUrl(url: unknown): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url) && url.length < 4096
}

function chromiumRoots(): Array<{ browser: string; dir: string }> {
  const home = os.homedir()
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
    const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
    return [
      { browser: 'Google Chrome', dir: path.join(local, 'Google', 'Chrome', 'User Data') },
      { browser: 'Microsoft Edge', dir: path.join(local, 'Microsoft', 'Edge', 'User Data') },
      { browser: 'Brave', dir: path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data') },
      { browser: 'Vivaldi', dir: path.join(local, 'Vivaldi', 'User Data') },
      { browser: 'Opera', dir: path.join(roaming, 'Opera Software', 'Opera Stable') }
    ]
  }
  if (process.platform === 'darwin') {
    const support = path.join(home, 'Library', 'Application Support')
    return [
      { browser: 'Google Chrome', dir: path.join(support, 'Google', 'Chrome') },
      { browser: 'Microsoft Edge', dir: path.join(support, 'Microsoft Edge') },
      { browser: 'Brave', dir: path.join(support, 'BraveSoftware', 'Brave-Browser') },
      { browser: 'Vivaldi', dir: path.join(support, 'Vivaldi') },
      { browser: 'Opera', dir: path.join(support, 'com.operasoftware.Opera') }
    ]
  }
  const config = process.env.XDG_CONFIG_HOME || path.join(home, '.config')
  return [
    { browser: 'Google Chrome', dir: path.join(config, 'google-chrome') },
    { browser: 'Chromium', dir: path.join(config, 'chromium') },
    { browser: 'Microsoft Edge', dir: path.join(config, 'microsoft-edge') },
    { browser: 'Brave', dir: path.join(config, 'BraveSoftware', 'Brave-Browser') },
    { browser: 'Vivaldi', dir: path.join(config, 'vivaldi') },
    { browser: 'Opera', dir: path.join(config, 'opera') }
  ]
}

function firefoxRoot(): string {
  const home = os.homedir()
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Mozilla', 'Firefox', 'Profiles')
  }
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Firefox', 'Profiles')
  return path.join(home, '.mozilla', 'firefox')
}

function safeReaddir(dir: string): string[] {
  try {
    return fs.readdirSync(dir)
  } catch {
    return []
  }
}

export function detectSources(): ImportSource[] {
  const sources: ImportSource[] = []

  for (const { browser, dir } of chromiumRoots()) {
    if (!fs.existsSync(dir)) continue
    // Profile display names live in "Local State"
    let names: Record<string, string> = {}
    try {
      const localState = JSON.parse(fs.readFileSync(path.join(dir, 'Local State'), 'utf8'))
      const cache = localState?.profile?.info_cache || {}
      for (const [k, v] of Object.entries<any>(cache)) names[k] = v?.name || k
    } catch {
      names = {}
    }
    // Opera keeps the profile files directly in the root
    const profileDirs = fs.existsSync(path.join(dir, 'Bookmarks')) || fs.existsSync(path.join(dir, 'History'))
      ? ['']
      : safeReaddir(dir).filter((d) => d === 'Default' || /^Profile \d+$/.test(d))
    for (const p of profileDirs) {
      const profilePath = path.join(dir, p)
      const hasBookmarks = fs.existsSync(path.join(profilePath, 'Bookmarks'))
      const hasHistory = fs.existsSync(path.join(profilePath, 'History'))
      if (!hasBookmarks && !hasHistory) continue
      sources.push({
        id: `${browser}|${profilePath}`,
        browser,
        profileName: names[p] || p || 'Default',
        kind: 'chromium',
        profilePath,
        hasBookmarks,
        hasHistory
      })
    }
  }

  const ffRoot = firefoxRoot()
  for (const p of safeReaddir(ffRoot)) {
    const profilePath = path.join(ffRoot, p)
    if (!fs.existsSync(path.join(profilePath, 'places.sqlite'))) continue
    sources.push({
      id: `Firefox|${profilePath}`,
      browser: 'Firefox',
      profileName: p.replace(/^[a-z0-9]+\./i, ''),
      kind: 'firefox',
      profilePath,
      hasBookmarks: true,
      hasHistory: true
    })
  }

  return sources
}

/** Copy a (possibly locked) SQLite database and its WAL/journal to a temp dir */
function copyDatabase(file: string): { dbPath: string; cleanup: () => void } {
  const tmpDir = fs.mkdtempSync(path.join(app.getPath('temp'), 'tct-import-'))
  const dbPath = path.join(tmpDir, path.basename(file))
  fs.copyFileSync(file, dbPath)
  for (const suffix of ['-wal', '-shm', '-journal']) {
    if (fs.existsSync(file + suffix)) {
      try {
        fs.copyFileSync(file + suffix, dbPath + suffix)
      } catch {}
    }
  }
  return {
    dbPath,
    cleanup: () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {}
    }
  }
}

function openDb(dbPath: string): any {
  // node:sqlite ships with Node 22.5+ (Electron 45 bundles Node 24)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite')
  return new DatabaseSync(dbPath, { readOnly: true })
}

function queryAll(file: string, sql: string): any[] {
  const { dbPath, cleanup } = copyDatabase(file)
  let db: any = null
  try {
    db = openDb(dbPath)
    return db.prepare(sql).all()
  } finally {
    try {
      db?.close()
    } catch {}
    cleanup()
  }
}

type RawBookmark = { url: string; title: string; folder: string }

function addBookmarks(items: RawBookmark[], sourceLabel: string): number {
  let added = 0
  const seen = new Set<string>()
  // Insert oldest-first so the newest end up on top (add() prepends)
  for (const b of [...items].reverse()) {
    if (!isWebUrl(b.url) || seen.has(b.url) || bookmarksService.isBookmarked(b.url)) continue
    seen.add(b.url)
    const folder = b.folder ? `${sourceLabel} / ${b.folder}` : sourceLabel
    bookmarksService.add({ url: b.url, title: (b.title || b.url).slice(0, 500), folder: folder.slice(0, 200) })
    added++
  }
  return added
}

function addHistory(items: Array<{ url: string; title: string; visitCount: number; visitedAt: number }>): number {
  const existing = new Set(historyService.getAllEntries().map((e) => e.url))
  const entries: HistoryEntry[] = []
  for (const h of items) {
    if (!isWebUrl(h.url) || existing.has(h.url) || !Number.isFinite(h.visitedAt) || h.visitedAt <= 0) continue
    existing.add(h.url)
    entries.push({
      id: `hist-imp-${Date.now()}-${entries.length}-${Math.random().toString(36).slice(2, 6)}`,
      url: h.url,
      title: (h.title || h.url).slice(0, 500),
      favicon: null,
      visitedAt: new Date(Math.min(h.visitedAt, Date.now())).toISOString(),
      visitCount: Math.max(1, Math.floor(h.visitCount || 1))
    })
  }
  if (entries.length > 0) historyService.restoreEntries(entries, 'merge')
  return entries.length
}

// --- Chromium ---

function readChromiumBookmarks(profilePath: string): RawBookmark[] {
  const data = JSON.parse(fs.readFileSync(path.join(profilePath, 'Bookmarks'), 'utf8'))
  const out: RawBookmark[] = []
  const walk = (node: any, folder: string) => {
    if (!node) return
    if (node.type === 'url') {
      out.push({ url: node.url, title: node.name, folder })
    } else if (Array.isArray(node.children)) {
      for (const c of node.children) walk(c, folder ? `${folder} / ${node.name}` : node.name)
    }
  }
  const roots = data?.roots || {}
  for (const key of ['bookmark_bar', 'other', 'synced']) {
    const root = roots[key]
    if (!root) continue
    // Root names ("Bookmarks bar", "Other bookmarks") become the top-level folder
    for (const c of root.children || []) walk(c, root.name || '')
  }
  return out
}

function readChromiumHistory(profilePath: string) {
  const rows = queryAll(
    path.join(profilePath, 'History'),
    // Microseconds since 1601 exceed Number.MAX_SAFE_INTEGER (node:sqlite throws on them):
    // convert to milliseconds in SQL first
    `SELECT url, title, visit_count, CAST(last_visit_time / 1000 AS INTEGER) AS visit_ms FROM urls WHERE hidden = 0 ORDER BY last_visit_time DESC LIMIT ${MAX_HISTORY_IMPORT}`
  )
  return rows.map((r: any) => ({
    url: String(r.url),
    title: String(r.title || ''),
    visitCount: Number(r.visit_count) || 1,
    visitedAt: Number(r.visit_ms) - CHROME_EPOCH_OFFSET_MS
  }))
}

// --- Firefox ---

function readFirefoxBookmarks(profilePath: string): RawBookmark[] {
  const rows = queryAll(
    path.join(profilePath, 'places.sqlite'),
    'SELECT b.id AS id, b.parent AS parent, b.type AS type, b.title AS title, p.url AS url FROM moz_bookmarks b LEFT JOIN moz_places p ON b.fk = p.id'
  )
  const folders = new Map<number, { title: string; parent: number }>()
  for (const r of rows) if (Number(r.type) === 2) folders.set(Number(r.id), { title: String(r.title || ''), parent: Number(r.parent) })
  const folderPath = (id: number): string => {
    const parts: string[] = []
    let cur = folders.get(id)
    let guard = 0
    while (cur && guard++ < 32) {
      // Skip the unnamed root folder
      if (cur.title) parts.unshift(cur.title)
      cur = folders.get(cur.parent)
    }
    return parts.join(' / ')
  }
  return rows
    .filter((r: any) => Number(r.type) === 1 && isWebUrl(r.url))
    .map((r: any) => ({ url: String(r.url), title: String(r.title || ''), folder: folderPath(Number(r.parent)) }))
}

function readFirefoxHistory(profilePath: string) {
  const rows = queryAll(
    path.join(profilePath, 'places.sqlite'),
    `SELECT url, title, visit_count, CAST(last_visit_date / 1000 AS INTEGER) AS visit_ms FROM moz_places WHERE last_visit_date IS NOT NULL AND hidden = 0 ORDER BY last_visit_date DESC LIMIT ${MAX_HISTORY_IMPORT}`
  )
  return rows.map((r: any) => ({
    url: String(r.url),
    title: String(r.title || ''),
    visitCount: Number(r.visit_count) || 1,
    visitedAt: Number(r.visit_ms)
  }))
}

// --- Bookmarks HTML (Netscape format, exported by every browser) ---

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

export function parseBookmarksHtml(html: string): RawBookmark[] {
  const out: RawBookmark[] = []
  const stack: string[] = []
  let pendingFolder: string | null = null
  const tokenRe = /<DT><H3[^>]*>([\s\S]*?)<\/H3>|<DL>|<\/DL>|<DT><A\s+([^>]*)>([\s\S]*?)<\/A>/gi
  let m: RegExpExecArray | null
  while ((m = tokenRe.exec(html))) {
    const tok = m[0].toUpperCase()
    if (m[1] !== undefined) {
      pendingFolder = decodeEntities(m[1].trim())
    } else if (tok === '<DL>') {
      stack.push(pendingFolder ?? '')
      pendingFolder = null
    } else if (tok === '</DL>') {
      stack.pop()
    } else if (m[2] !== undefined) {
      const href = /HREF="([^"]*)"/i.exec(m[2])?.[1]
      if (href) {
        out.push({
          url: decodeEntities(href),
          title: decodeEntities(m[3].replace(/<[^>]+>/g, '').trim()),
          folder: stack.filter(Boolean).join(' / ')
        })
      }
    }
  }
  return out
}

// --- Public API ---

export function runImport(sourceId: string, what: { bookmarks: boolean; history: boolean }): ImportResult {
  const source = detectSources().find((s) => s.id === sourceId)
  if (!source) return { success: false, bookmarks: 0, history: 0, error: 'Browser profile not found' }
  const label = `Imported from ${source.browser}`
  const result: ImportResult = { success: true, bookmarks: 0, history: 0 }
  const errors: string[] = []

  if (what.bookmarks && source.hasBookmarks) {
    try {
      const items = source.kind === 'chromium' ? readChromiumBookmarks(source.profilePath) : readFirefoxBookmarks(source.profilePath)
      result.bookmarks = addBookmarks(items, label)
    } catch (err: any) {
      console.error('[Import] Bookmarks failed:', err)
      errors.push(`bookmarks: ${err?.message || err}`)
    }
  }
  if (what.history && source.hasHistory) {
    try {
      const items = source.kind === 'chromium' ? readChromiumHistory(source.profilePath) : readFirefoxHistory(source.profilePath)
      result.history = addHistory(items)
    } catch (err: any) {
      console.error('[Import] History failed:', err)
      errors.push(`history: ${err?.message || err}`)
    }
  }
  if (errors.length > 0) {
    result.error = errors.join('; ')
    result.success = result.bookmarks + result.history > 0
  }
  return result
}

export async function importBookmarksHtmlFile(win?: BrowserWindow | null): Promise<ImportResult | null> {
  const res = await dialog.showOpenDialog(win || (undefined as any), {
    title: 'Import bookmarks HTML file',
    defaultPath: app.getPath('downloads'),
    filters: [{ name: 'Bookmarks HTML (*.html, *.htm)', extensions: ['html', 'htm'] }],
    properties: ['openFile']
  })
  if (res.canceled || !res.filePaths[0]) return null
  try {
    const stat = fs.statSync(res.filePaths[0])
    if (stat.size > 50 * 1024 * 1024) return { success: false, bookmarks: 0, history: 0, error: 'File is too large' }
    const html = fs.readFileSync(res.filePaths[0], 'utf8')
    const items = parseBookmarksHtml(html)
    if (items.length === 0) return { success: false, bookmarks: 0, history: 0, error: 'No bookmarks found in this file' }
    return { success: true, bookmarks: addBookmarks(items, 'Imported bookmarks'), history: 0 }
  } catch (err: any) {
    return { success: false, bookmarks: 0, history: 0, error: err?.message || 'Could not read file' }
  }
}
