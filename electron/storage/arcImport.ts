import fs from 'fs'
import os from 'os'
import path from 'path'
import { localStorageService, type ImportedSpace } from './localStorage'
import type { ArcImportInfo, ArcImportResult } from '../../src/types/api'

/**
 * Import spaces, folders, pinned AND unpinned tabs from Arc.
 *
 * Arc keeps its sidebar in StorableSidebar.json (read-only here, never modified):
 *   macOS:   ~/Library/Application Support/Arc/StorableSidebar.json
 *   Windows: %LOCALAPPDATA%\Packages\TheBrowserCompany.Arc_*\LocalCache\Local\Arc\StorableSidebar.json
 *
 * Mapping: Arc space -> Orbit space, Arc folder -> nested tab group, pinned/unpinned tabs
 * keep their pin state, Favorites (top apps) become pinned tabs in the first imported space.
 */

const MAX_FILE_BYTES = 50 * 1024 * 1024
const MAX_TABS = 2000
const SPACE_COLORS = ['#6366f1', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444']

/** Arc's data folder (contains StorableSidebar.json and "User Data"), or null */
export function findArcDir(): string | null {
  const home = os.homedir()
  const candidates: string[] = []
  if (process.platform === 'darwin') {
    candidates.push(path.join(home, 'Library', 'Application Support', 'Arc'))
  } else if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
    const packages = path.join(local, 'Packages')
    try {
      for (const entry of fs.readdirSync(packages)) {
        if (entry.startsWith('TheBrowserCompany.Arc')) {
          candidates.push(path.join(packages, entry, 'LocalCache', 'Local', 'Arc'))
        }
      }
    } catch {}
  }
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'StorableSidebar.json'))) || null
}

interface ArcItem {
  id: string
  parentID?: string | null
  childrenIds?: string[]
  title?: string | null
  data?: {
    tab?: { savedURL?: string; savedTitle?: string }
    list?: unknown
    itemContainer?: unknown
    splitView?: unknown
  }
}

interface ArcSpace {
  id: string
  title?: string
  containerIDs?: unknown[]
}

/** Arc stores arrays as [id, object, id, object, ...]: keep only the objects */
function objectsOnly<T>(arr: unknown): T[] {
  return Array.isArray(arr) ? (arr.filter((x) => x && typeof x === 'object') as T[]) : []
}

function isWebUrl(url: unknown): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url) && url.length < 8192
}

function readSidebar(): { spaces: ArcSpace[]; items: Map<string, ArcItem>; topApps: string[] } | null {
  const dir = findArcDir()
  if (!dir) return null
  const file = path.join(dir, 'StorableSidebar.json')
  const stat = fs.statSync(file)
  if (stat.size > MAX_FILE_BYTES) throw new Error('Arc sidebar file is too large')
  const json = JSON.parse(fs.readFileSync(file, 'utf8'))
  const containers: any[] = objectsOnly<any>(json?.sidebar?.containers)
  // The first container is "global"; the one with spaces holds everything we need
  const main = containers.find((c) => Array.isArray(c?.spaces) && Array.isArray(c?.items))
  if (!main) return { spaces: [], items: new Map(), topApps: [] }
  const items = new Map<string, ArcItem>()
  for (const item of objectsOnly<ArcItem>(main.items)) {
    if (typeof item.id === 'string') items.set(item.id, item)
  }
  const topApps = Array.isArray(main.topAppsContainerIDs)
    ? main.topAppsContainerIDs.filter((x: unknown): x is string => typeof x === 'string')
    : []
  return { spaces: objectsOnly<ArcSpace>(main.spaces), items, topApps }
}

/** ["pinned", id, "unpinned", id] -> { pinned: id, unpinned: id } */
function spaceContainers(space: ArcSpace): { pinned?: string; unpinned?: string } {
  const ids = Array.isArray(space.containerIDs) ? space.containerIDs : []
  const result: { pinned?: string; unpinned?: string } = {}
  for (let i = 0; i < ids.length - 1; i++) {
    if (ids[i] === 'pinned' && typeof ids[i + 1] === 'string') result.pinned = ids[i + 1] as string
    if (ids[i] === 'unpinned' && typeof ids[i + 1] === 'string') result.unpinned = ids[i + 1] as string
  }
  return result
}

function collect(
  items: Map<string, ArcItem>,
  containerId: string,
  isPinned: boolean,
  out: ImportedSpace,
  budget: { left: number }
): void {
  const walk = (itemId: string, groupPath: string[], seen: Set<string>) => {
    if (budget.left <= 0 || seen.has(itemId)) return
    seen.add(itemId)
    const item = items.get(itemId)
    if (!item) return
    const tab = item.data?.tab
    if (tab) {
      const url = tab.savedURL
      if (isWebUrl(url)) {
        out.tabs.push({ url, title: (item.title || tab.savedTitle || url).slice(0, 1000), isPinned, groupPath })
        budget.left--
      }
      return
    }
    let childPath = groupPath
    // A "list" is an Arc folder: becomes a (nested) tab group. Split views just flatten.
    if (item.data?.list !== undefined) {
      childPath = [...groupPath, item.id]
      out.groups.push({ path: childPath, name: item.title || 'Folder' })
    }
    for (const childId of item.childrenIds || []) walk(childId, childPath, seen)
  }
  const container = items.get(containerId)
  const seen = new Set<string>([containerId])
  for (const childId of container?.childrenIds || []) walk(childId, [], seen)
}

function buildImport(): ImportedSpace[] {
  const sidebar = readSidebar()
  if (!sidebar) return []
  const budget = { left: MAX_TABS }
  const result: ImportedSpace[] = []
  sidebar.spaces.forEach((space, i) => {
    const imported: ImportedSpace = {
      name: `${space.title || `Space ${i + 1}`}`.slice(0, 70) + ' (Arc)',
      color: SPACE_COLORS[i % SPACE_COLORS.length],
      tabs: [],
      groups: []
    }
    const { pinned, unpinned } = spaceContainers(space)
    if (pinned) collect(sidebar.items, pinned, true, imported, budget)
    if (unpinned) collect(sidebar.items, unpinned, false, imported, budget)
    result.push(imported)
  })

  // Favorites (top apps) -> pinned tabs in the first space
  if (result.length > 0) {
    const favorites: ImportedSpace = { name: '', color: '', tabs: [], groups: [] }
    for (const containerId of sidebar.topApps) collect(sidebar.items, containerId, true, favorites, budget)
    result[0].tabs.unshift(...favorites.tabs.map((t) => ({ ...t, groupPath: [] })))
  }
  return result.filter((s) => s.tabs.length > 0 || s.groups.length > 0)
}

export function detectArc(): ArcImportInfo {
  try {
    const spaces = buildImport()
    return {
      found: findArcDir() !== null,
      spaces: spaces.length,
      tabs: spaces.reduce((n, s) => n + s.tabs.length, 0)
    }
  } catch (err) {
    console.warn('[ArcImport] Could not read Arc sidebar:', err)
    return { found: findArcDir() !== null, spaces: 0, tabs: 0 }
  }
}

export function runArcImport(): ArcImportResult {
  try {
    const spaces = buildImport()
    if (spaces.length === 0) {
      return { success: false, spaces: 0, tabs: 0, groups: 0, error: 'No Arc spaces with tabs were found' }
    }
    const counts = localStorageService.importSpaces(spaces)
    return { success: true, ...counts }
  } catch (err: any) {
    console.error('[ArcImport] Import failed:', err)
    return { success: false, spaces: 0, tabs: 0, groups: 0, error: err?.message || 'Could not read Arc data' }
  }
}
