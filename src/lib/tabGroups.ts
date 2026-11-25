import type { Tab, TabGroup } from '@/types/api'

/** Root group = depth 1 (same limit as the main process) */
export const MAX_GROUP_DEPTH = 8

export const GROUP_COLORS = [
  '#6366f1', // Indigo
  '#3b82f6', // Blue
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#f97316', // Orange
  '#ef4444', // Red
  '#ec4899', // Pink
  '#8b5cf6', // Purple
  '#64748b' // Slate
]

export function groupById(groups: TabGroup[]): Map<string, TabGroup> {
  return new Map(groups.map((g) => [g.id, g]))
}

/** Nested groups without their own color use the nearest ancestor's color */
export function resolveGroupColor(group: TabGroup, byId: Map<string, TabGroup>, fallback = '#6366f1'): string {
  let cur: TabGroup | undefined = group
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    if (cur.color) return cur.color
    seen.add(cur.id)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return fallback
}

/** Depth of a group: root = 1 */
export function groupDepth(groupId: string | null | undefined, byId: Map<string, TabGroup>): number {
  let depth = 0
  let cur = groupId ? byId.get(groupId) : undefined
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    depth++
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return depth
}

/** Height of the subtree under a group (leaf = 1) */
export function subtreeHeight(groupId: string, groups: TabGroup[]): number {
  const children = groups.filter((g) => g.parentId === groupId)
  if (children.length === 0) return 1
  return 1 + Math.max(...children.map((c) => subtreeHeight(c.id, groups)))
}

export function isDescendantGroup(groupId: string, ancestorId: string, byId: Map<string, TabGroup>): boolean {
  let cur = byId.get(groupId)
  const seen = new Set<string>()
  while (cur?.parentId && !seen.has(cur.id)) {
    seen.add(cur.id)
    if (cur.parentId === ancestorId) return true
    cur = byId.get(cur.parentId)
  }
  return false
}

/** Can `groupId` be moved under `newParentId` without a cycle or exceeding the depth limit? */
export function canMoveGroup(groupId: string, newParentId: string | null, groups: TabGroup[]): boolean {
  const byId = groupById(groups)
  if (newParentId === groupId) return false
  if (newParentId && isDescendantGroup(newParentId, groupId, byId)) return false
  return groupDepth(newParentId, byId) + subtreeHeight(groupId, groups) <= MAX_GROUP_DEPTH
}

/** Full path label: "Work › Design Review" */
export function groupPathLabel(group: TabGroup, byId: Map<string, TabGroup>): string {
  const names: string[] = []
  let cur: TabGroup | undefined = group
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    names.unshift(cur.name)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return names.join(' › ')
}

/** Every tab inside a group, including nested groups */
export function tabsInGroupTree(groupId: string, groups: TabGroup[], tabs: Tab[]): Tab[] {
  const ids = new Set<string>([groupId])
  let grew = true
  while (grew) {
    grew = false
    for (const g of groups) {
      if (g.parentId && ids.has(g.parentId) && !ids.has(g.id)) {
        ids.add(g.id)
        grew = true
      }
    }
  }
  return tabs.filter((t) => t.groupId && ids.has(t.groupId))
}

/**
 * Group a new tab should join when it is opened from `source` (a link, middle-click, "new tab
 * to right"): the source tab's group, when that group or any ancestor has "open links in group".
 */
export function groupForNewTab(source: Tab | null | undefined, groups: TabGroup[]): string | null {
  if (!source?.groupId) return null
  const byId = groupById(groups)
  let cur = byId.get(source.groupId)
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    if (cur.openLinksInGroup) return source.groupId
    seen.add(cur.id)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return null
}
