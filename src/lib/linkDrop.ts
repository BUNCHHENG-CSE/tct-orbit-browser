import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { TAB_DRAG_TYPE, GROUP_DRAG_TYPE } from '@/components/Sidebar/TabGroupContext'
import { api } from '@/lib/ipc'
import { isPrivateWindow } from '@/lib/privateWindow'
import { placeNewTab } from '@/lib/tabPlacement'
import { useBrowserStore } from '@/store/useBrowserStore'

/** Drop a link (from a page, another app or the favorites bar) on the tabs to open it in a new tab */

/** A link is being dragged (not a tab or a tab group, which have their own drop rules) */
function isLinkDrag(dt: DataTransfer): boolean {
  const types = Array.from(dt.types)
  if (types.includes(TAB_DRAG_TYPE) || types.includes(GROUP_DRAG_TYPE)) return false
  return types.includes('text/uri-list')
}

/** First web address in dropped data. Never file:, javascript: or anything else. */
export function linkFromData(uriList: string, plain: string): string | null {
  const lines = [...uriList.split(/\r?\n/).filter((l) => l && !l.startsWith('#')), plain]
  for (const line of lines) {
    const text = line.trim()
    if (!/^https?:\/\/\S+$/i.test(text) || text.length > 8192) continue
    try {
      return new URL(text).toString()
    } catch {}
  }
  return null
}

/** Tab the pointer is over, and whether the link goes before or after it */
function dropTarget(e: React.DragEvent, horizontal: boolean): { tabId: string; after: boolean } | null {
  const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-tab-id]')
  if (!el?.dataset.tabId) return null
  const r = el.getBoundingClientRect()
  return { tabId: el.dataset.tabId, after: horizontal ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2 }
}

async function openDroppedLink(url: string, target: { tabId: string; after: boolean } | null): Promise<void> {
  const store = useBrowserStore.getState()
  const spaceId = store.activeSpaceId || store.spaces[0]?.id
  if (!spaceId) return
  // Pinned tabs stay first: dropping on them opens a normal tab
  const over = target && store.tabsBySpace[spaceId]?.find((t) => t.id === target.tabId && !t.isPinned)
  try {
    const tab = await api.tabs.create({ spaceId, url, title: 'Loading...', isPrivate: isPrivateWindow, groupId: over ? over.groupId ?? null : null })
    if (!over || !target) {
      placeNewTab(spaceId, tab)
      return
    }
    const others = (useBrowserStore.getState().tabsBySpace[spaceId] || []).filter((t) => t.id !== tab.id)
    const at = others.findIndex((t) => t.id === over.id) + (target.after ? 1 : 0)
    const next = [...others.slice(0, at), tab, ...others.slice(at)].map((t, order) => ({ ...t, order }))
    useBrowserStore.getState().setTabsForSpace(spaceId, next)
    useBrowserStore.getState().setActiveTabId(tab.id)
    await api.tabs.reorder(spaceId, next.map((t) => t.id))
  } catch (err) {
    console.error('[LinkDrop] Could not open link:', err)
    toast.error('Could not open the link')
  }
}

/** Props for an area that opens dropped links, and whether one is over it now */
export function useLinkDrop(orientation: 'vertical' | 'horizontal') {
  const [over, setOver] = useState(false)

  // The drag can end anywhere (Esc, another app): never leave the highlight on
  useEffect(() => {
    if (!over) return
    const clear = () => setOver(false)
    window.addEventListener('dragend', clear, true)
    window.addEventListener('drop', clear, true)
    window.addEventListener('mousemove', clear, true)
    return () => {
      window.removeEventListener('dragend', clear, true)
      window.removeEventListener('drop', clear, true)
      window.removeEventListener('mousemove', clear, true)
    }
  }, [over])

  return {
    over,
    linkDropProps: {
      onDragOver: (e: React.DragEvent) => {
        if (e.defaultPrevented || !isLinkDrag(e.dataTransfer)) return
        e.preventDefault()
        // The source decides what it allows; pages usually offer copy and link
        const allowed = e.dataTransfer.effectAllowed
        e.dataTransfer.dropEffect = /^(copy|copyLink|copyMove|all|uninitialized)$/.test(allowed) ? 'copy' : /link/i.test(allowed) ? 'link' : 'move'
        if (!over) setOver(true)
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false)
      },
      onDrop: (e: React.DragEvent) => {
        setOver(false)
        if (e.defaultPrevented || !isLinkDrag(e.dataTransfer)) return
        e.preventDefault()
        const url = linkFromData(e.dataTransfer.getData('text/uri-list'), e.dataTransfer.getData('text/plain'))
        if (url) void openDroppedLink(url, dropTarget(e, orientation === 'horizontal'))
      }
    }
  }
}
