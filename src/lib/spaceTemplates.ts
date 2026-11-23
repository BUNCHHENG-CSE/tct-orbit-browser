import { api } from '@/lib/ipc'
import { useBrowserStore } from '@/store/useBrowserStore'
import type { Tab } from '@/types/api'

/**
 * Space templates: a named set of tabs (e.g. "Work", "Research") that can be reopened as a new
 * space in one click, optionally every time the browser starts.
 */
export interface SpaceTemplate {
  id: string
  name: string
  color: string
  tabs: Array<{ url: string; title: string; favicon?: string | null }>
  openOnStartup: boolean
  createdAt: string
}

const KEY = 'tct_space_templates_v1'
const STARTUP_KEY = 'tct_space_templates_opened_session'

export function loadTemplates(): SpaceTemplate[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((t) => t && typeof t.name === 'string' && Array.isArray(t.tabs)) : []
  } catch {
    return []
  }
}

export function saveTemplates(list: SpaceTemplate[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {}
  window.dispatchEvent(new CustomEvent('tct:space-templates-changed'))
}

/** Snapshot the tabs of a space (private tabs and internal pages excluded) */
export function templateFromTabs(name: string, color: string, tabs: Tab[]): SpaceTemplate {
  return {
    id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim().slice(0, 80) || 'Template',
    color,
    tabs: tabs
      .filter((t) => !t.isPrivate && /^https?:\/\//i.test(t.url))
      .map((t) => ({ url: t.url, title: t.title || t.url, favicon: t.favicon || null })),
    openOnStartup: false,
    createdAt: new Date().toISOString()
  }
}

/** Open a template as a brand-new space with all its tabs; returns the new space id */
export async function openTemplateAsSpace(tpl: SpaceTemplate): Promise<string | null> {
  if (tpl.tabs.length === 0) return null
  const [first, ...rest] = tpl.tabs
  const space = await api.spaces.create({
    name: tpl.name,
    color: tpl.color,
    initialUrl: first.url,
    initialTitle: first.title
  })
  const store = useBrowserStore.getState()
  store.addSpaceToStore(space)
  for (const sp of useBrowserStore.getState().spaces) {
    store.updateSpaceInStore(sp.id, { isActive: sp.id === space.id })
  }
  try {
    await api.spaces.setActive(space.id)
  } catch {}

  let lastId = space.tabs?.[0]?.id || null
  for (const t of rest) {
    try {
      const tab = await api.tabs.create({ spaceId: space.id, url: t.url, title: t.title, favicon: t.favicon })
      useBrowserStore.getState().addTabToStore(space.id, tab, lastId, false)
      lastId = tab.id
    } catch (err) {
      console.warn('[SpaceTemplates] Could not open tab', t.url, err)
    }
  }
  const firstTabId = space.tabs?.[0]?.id
  if (firstTabId) useBrowserStore.getState().setActiveTabId(firstTabId)
  return space.id
}

/** Open templates flagged "open on startup" once per browser session (skips ones already open) */
export async function openStartupTemplates(): Promise<number> {
  try {
    if (sessionStorage.getItem(STARTUP_KEY)) return 0
    sessionStorage.setItem(STARTUP_KEY, '1')
  } catch {}
  const existingNames = new Set(useBrowserStore.getState().spaces.map((s) => s.name))
  let opened = 0
  for (const tpl of loadTemplates().filter((t) => t.openOnStartup)) {
    if (existingNames.has(tpl.name)) continue
    if (await openTemplateAsSpace(tpl)) opened++
  }
  return opened
}
