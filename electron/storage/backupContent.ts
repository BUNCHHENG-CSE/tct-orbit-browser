import type { BookmarkItem, Tab, TabGroup } from '../../src/types/api'

/**
 * Bookmarks, notes and tab groups inside backup files. Ids are local to one computer, so spaces
 * are matched by name and groups get a key that tabs refer to. Backup files come from outside:
 * everything is checked and clipped before use.
 */

export interface GroupBackup {
  key: string
  parentKey?: string
  spaceName: string
  name: string
  color: string | null
  collapsed: boolean
  order: number
  openLinksInGroup: boolean
}

export interface NoteBackup {
  spaceName: string
  content: string
  updatedAt?: string
}

export type BookmarkBackup = BookmarkItem & { spaceName?: string }

const MAX_DEPTH = 8
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v !== '' ? v.slice(0, max) : undefined)
const rows = (raw: unknown, max: number): Record<string, unknown>[] =>
  Array.isArray(raw) ? raw.slice(0, max).filter((x) => x && typeof x === 'object') : []

export function buildGroupBackup(groups: TabGroup[], spaceNames: Map<string, string>): { groups: GroupBackup[]; keyById: Map<string, string> } {
  const kept = groups.filter((g) => spaceNames.has(g.spaceId))
  const keyById = new Map(kept.map((g, i) => [g.id, `g${i}`]))
  return {
    keyById,
    groups: kept.map((g) => ({
      key: keyById.get(g.id)!,
      parentKey: g.parentId ? keyById.get(g.parentId) : undefined,
      spaceName: spaceNames.get(g.spaceId)!,
      name: g.name,
      color: g.color,
      collapsed: g.collapsed,
      order: g.order,
      openLinksInGroup: g.openLinksInGroup
    }))
  }
}

export function sanitizeGroups(raw: unknown): GroupBackup[] {
  return rows(raw, 5000).flatMap((g) => {
    const key = str(g.key, 100)
    const spaceName = str(g.spaceName, 80)
    if (!key || !spaceName) return []
    return [
      {
        key,
        parentKey: str(g.parentKey, 100),
        spaceName,
        name: str(g.name, 80) ?? 'Group',
        color: str(g.color, 64) ?? null,
        collapsed: !!g.collapsed,
        order: typeof g.order === 'number' ? g.order : 0,
        openLinksInGroup: !!g.openLinksInGroup
      }
    ]
  })
}

/** Recreate groups with new ids (parents first). `existing` groups are kept. */
export function restoreGroups(
  backup: GroupBackup[],
  spaceIds: Map<string, string>,
  existing: TabGroup[]
): {
  groups: TabGroup[]
  idFor: (key: string | undefined, spaceId: string) => string | null
  withTabs: (tabs: Tab[]) => TabGroup[]
} {
  const created = new Map<string, TabGroup>()
  const depth = new Map<string, number>()
  let pending = backup.filter((g) => spaceIds.has(g.spaceName.toLowerCase()))
  const keys = new Set(pending.map((g) => g.key))
  while (pending.length > 0) {
    const ready = pending.filter((g) => !g.parentKey || !keys.has(g.parentKey) || created.has(g.parentKey))
    // Only groups that contain each other are left
    if (ready.length === 0) break
    for (const g of ready) {
      if (created.has(g.key)) continue
      const spaceId = spaceIds.get(g.spaceName.toLowerCase())!
      const parent = g.parentKey ? created.get(g.parentKey) : undefined
      const nested = parent && parent.spaceId === spaceId && depth.get(g.parentKey!)! < MAX_DEPTH
      depth.set(g.key, nested ? depth.get(g.parentKey!)! + 1 : 1)
      created.set(g.key, {
        id: `group-${Date.now()}-${created.size}-${Math.random().toString(36).slice(2, 7)}`,
        spaceId,
        parentId: nested ? parent.id : null,
        name: g.name,
        color: g.color,
        collapsed: g.collapsed,
        order: g.order,
        openLinksInGroup: g.openLinksInGroup,
        createdAt: new Date().toISOString()
      })
    }
    pending = pending.filter((g) => !created.has(g.key))
  }
  const fresh = [...created.values()]
  return {
    groups: [...existing, ...fresh],
    idFor: (key, spaceId) => {
      const g = key ? created.get(key) : undefined
      return g && g.spaceId === spaceId ? g.id : null
    },
    withTabs: (tabs) => {
      const used = new Set<string>()
      const byId = new Map(fresh.map((g) => [g.id, g]))
      for (const t of tabs) for (let g = t.groupId ? byId.get(t.groupId) : undefined; g && !used.has(g.id); g = g.parentId ? byId.get(g.parentId) : undefined) used.add(g.id)
      return [...existing, ...fresh.filter((g) => used.has(g.id))]
    }
  }
}

export function sanitizeBookmarks(raw: unknown): BookmarkBackup[] {
  return rows(raw, 50_000).flatMap((b, i) => {
    const url = str(b.url, 8192)
    if (!url || !/^https?:\/\//i.test(url)) return []
    const favicon = str(b.favicon, 100_000)
    return [
      {
        id: str(b.id, 100) ?? `bm-imp-${Date.now()}-${i}`,
        url,
        title: str(b.title, 1000) ?? url,
        favicon: favicon && /^(https?:\/\/|data:image\/)/i.test(favicon) ? favicon : null,
        folder: str(b.folder, 200) ?? 'Bookmarks',
        isReadingList: !!b.isReadingList,
        isRead: !!b.isRead,
        ...(typeof b.order === 'number' && Number.isFinite(b.order) ? { order: b.order } : {}),
        createdAt: Number.isFinite(Date.parse(String(b.createdAt))) ? String(b.createdAt) : new Date().toISOString(),
        ...(str(b.spaceName, 80) ? { spaceName: str(b.spaceName, 80) } : {})
      }
    ]
  })
}

export function sanitizeNotes(raw: unknown): NoteBackup[] {
  return rows(raw, 1000).flatMap((n) => {
    const spaceName = str(n.spaceName, 80)
    const content = str(n.content, 2_000_000)
    return spaceName && content ? [{ spaceName, content, updatedAt: str(n.updatedAt, 64) }] : []
  })
}
