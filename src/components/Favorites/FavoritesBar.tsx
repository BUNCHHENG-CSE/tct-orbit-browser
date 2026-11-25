import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Globe,
  Folder,
  FolderOpen,
  ChevronsRight,
  ExternalLink,
  EyeOff,
  Pencil,
  Trash2,
  Plus,
  Star,
  Eye,
  Check
} from 'lucide-react'
import { toast } from 'sonner'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { api } from '@/lib/ipc'
import { useSettings } from '@/hooks/useSettings'
import { useBrowserStore } from '@/store/useBrowserStore'
import { TAB_DRAG_TYPE } from '@/components/Sidebar/TabGroupContext'
import {
  FAVORITES_BAR,
  buildTree,
  barOrder,
  ensureFavoritesLoaded,
  faviconFor,
  flattenLinks,
  isInBar,
  openFavorite,
  addFavorite,
  addActiveTabToFavorites,
  useFavorites,
  type FavNode
} from '@/lib/favorites'
import { EditFavoriteDialog, type EditTarget } from './EditFavoriteDialog'
import type { BookmarkItem, FavoritesBarMode } from '@/types/api'

const FAV_DRAG_TYPE = 'application/x-tct-favorite'
const itemCls =
  'flex items-center gap-1.5 h-6 px-2 rounded-md text-[12px] text-foreground/85 hover:bg-muted hover:text-foreground transition-colors max-w-[170px] shrink-0 cursor-default'
const menuItem = 'text-xs rounded-lg cursor-pointer gap-2'

const FavIcon: React.FC<{ item: BookmarkItem }> = ({ item }) => {
  const [broken, setBroken] = useState(false)
  const src = faviconFor(item)
  return src && !broken ? (
    <img src={src} alt="" className="w-4 h-4 shrink-0 rounded-sm object-contain" onError={() => setBroken(true)} draggable={false} />
  ) : (
    <Globe className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
  )
}

/** Open all links of a folder in new tabs */
async function openAll(nodes: FavNode[]) {
  const links = flattenLinks(nodes)
  if (links.length > 15 && !window.confirm(`Open ${links.length} tabs?`)) return
  for (const b of links) await openFavorite(b.url, b.title, 'new')
}

/* ---------------------------------------------------- folder dropdown content */

const FolderMenuItems: React.FC<{ nodes: FavNode[]; onEdit: (t: EditTarget) => void }> = ({ nodes, onEdit }) => (
  <>
    {nodes.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Empty folder</div>}
    {nodes.map((n) =>
      n.kind === 'link' ? (
        <DropdownMenuItem
          key={n.item.id}
          className={menuItem}
          onClick={(e) => void openFavorite(n.item.url, n.item.title, e.ctrlKey || e.metaKey ? 'new' : 'current')}
          onAuxClick={(e) => e.button === 1 && void openFavorite(n.item.url, n.item.title, 'new')}
          onContextMenu={(e) => {
            e.preventDefault()
            onEdit({ kind: 'link', item: n.item })
          }}
          title={`${n.item.title}\n${n.item.url}`}
        >
          <FavIcon item={n.item} />
          <span className="truncate max-w-[260px]">{n.item.title || n.item.url}</span>
        </DropdownMenuItem>
      ) : (
        <DropdownMenuSub key={n.path}>
          <DropdownMenuSubTrigger className={menuItem}>
            <Folder className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="truncate max-w-[220px]">{n.name}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[200px] max-h-[70vh] overflow-y-auto rounded-xl p-1">
            <FolderMenuItems nodes={n.children} onEdit={onEdit} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )
    )}
    {flattenLinks(nodes).length > 1 && (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuItem className={menuItem} onClick={() => void openAll(nodes)}>
          <ExternalLink className="w-3.5 h-3.5" /> Open all ({flattenLinks(nodes).length})
        </DropdownMenuItem>
      </>
    )}
  </>
)

/* ---------------------------------------------------- the bar */

/**
 * Favorites bar (Edge style) under the toolbar. Shows the "Favorites bar" bookmark folder:
 * links and folders, overflow in a » menu. Drag to reorder, drop a tab or link to add it,
 * drop onto a folder to move it there. Right-click for open / edit / delete / visibility.
 */
export const FavoritesBar: React.FC = () => {
  const items = useFavorites((s) => s.items)
  const { settings, updateSettings } = useSettings()
  const mode: FavoritesBarMode = settings?.favoritesBar ?? 'always'
  const [editing, setEditing] = useState<EditTarget | null>(null)

  useEffect(() => ensureFavoritesLoaded(), [])

  const barItems = useMemo(() => items.filter(isInBar), [items])
  const nodes = useMemo(() => buildTree(barItems, FAVORITES_BAR), [barItems])
  const nodeId = (n: FavNode) => (n.kind === 'link' ? n.item.id : `folder:${n.path}`)

  /* ---- overflow: measure every node in a hidden row, show what fits, rest goes into » ---- */
  const rowRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(nodes.length)

  useLayoutEffect(() => {
    const row = rowRef.current
    const measure = measureRef.current
    if (!row || !measure) return
    const compute = () => {
      const widths = Array.from(measure.children).map((c) => (c as HTMLElement).offsetWidth + 2)
      const total = widths.reduce((a, b) => a + b, 0)
      const available = row.clientWidth
      if (total <= available) return setVisibleCount(nodes.length)
      let used = 34 // » button
      let count = 0
      for (const w of widths) {
        if (used + w > available) break
        used += w
        count++
      }
      setVisibleCount(count)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(row)
    return () => ro.disconnect()
  }, [nodes])

  /* ---- drag & drop ---- */
  const [dropHint, setDropHint] = useState<{ id: string; pos: 'before' | 'after' | 'into' } | null>(null)
  const [barDrop, setBarDrop] = useState(false)

  const isFavDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(FAV_DRAG_TYPE)
  const isExternalDrag = (e: React.DragEvent) =>
    e.dataTransfer.types.includes(TAB_DRAG_TYPE) || e.dataTransfer.types.includes('text/uri-list')

  /** Page dropped from a tab or a link */
  const pageFromDrop = (e: React.DragEvent): { url: string; title?: string; favicon?: string | null } | null => {
    const tabId = e.dataTransfer.getData(TAB_DRAG_TYPE)
    if (tabId) {
      const s = useBrowserStore.getState()
      const tab = Object.values(s.tabsBySpace).flat().find((t) => t.id === tabId)
      if (tab && /^https?:/i.test(tab.url)) return { url: tab.url, title: tab.title, favicon: tab.favicon }
      return null
    }
    const url = (e.dataTransfer.getData('text/uri-list') || '').split('\n').find((l) => l && !l.startsWith('#'))?.trim()
    return url && /^https?:/i.test(url) ? { url, title: e.dataTransfer.getData('text/plain') || url } : null
  }

  /** Move node `dragId` before/after `targetId` (top level), keeping one order over the bar */
  const moveNode = async (dragId: string, targetId: string, pos: 'before' | 'after') => {
    const ids = nodes.map(nodeId)
    const from = ids.indexOf(dragId)
    if (from === -1 || dragId === targetId) return
    const reordered = nodes.filter((n) => nodeId(n) !== dragId)
    const at = reordered.findIndex((n) => nodeId(n) === targetId) + (pos === 'after' ? 1 : 0)
    reordered.splice(at, 0, nodes[from])
    // A dragged item that came from inside a folder goes to the bar root
    const dragged = nodes[from]
    if (dragged.kind === 'link' && dragged.item.folder !== FAVORITES_BAR) await api.bookmarks.update?.(dragged.item.id, { folder: FAVORITES_BAR })
    await api.bookmarks.reorder?.(flattenLinks(reordered).map((b) => b.id))
  }

  const nodeDropProps = (n: FavNode) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!isFavDrag(e) && !isExternalDrag(e)) return
      e.preventDefault()
      e.stopPropagation()
      const r = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - r.left
      const pos = n.kind === 'folder' && x > r.width * 0.25 && x < r.width * 0.75 ? 'into' : x < r.width / 2 ? 'before' : 'after'
      const id = nodeId(n)
      if (dropHint?.id !== id || dropHint.pos !== pos) setDropHint({ id, pos })
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropHint(null)
    },
    onDrop: async (e: React.DragEvent) => {
      const hint = dropHint
      setDropHint(null)
      setBarDrop(false)
      if (!hint) return
      e.preventDefault()
      e.stopPropagation()
      const favId = e.dataTransfer.getData(FAV_DRAG_TYPE)
      if (hint.pos === 'into' && n.kind === 'folder') {
        if (favId && !favId.startsWith('folder:')) await api.bookmarks.update?.(favId, { folder: n.path })
        else if (!favId) {
          const page = pageFromDrop(e)
          if (page) await addFavorite(page, n.path)
        }
        return
      }
      if (favId) return void moveNode(favId, nodeId(n), hint.pos === 'into' ? 'after' : hint.pos)
      const page = pageFromDrop(e)
      if (!page) return
      const added = await addFavorite(page, FAVORITES_BAR)
      if (added) {
        const fresh = (await api.bookmarks.list()).filter(isInBar)
        const tree = buildTree(fresh, FAVORITES_BAR)
        const order = tree.filter((t) => nodeId(t) !== added.id)
        const at = order.findIndex((t) => nodeId(t) === nodeId(n)) + (hint.pos === 'after' ? 1 : 0)
        const addedNode = tree.find((t) => nodeId(t) === added.id)
        if (addedNode) order.splice(at, 0, addedNode)
        await api.bookmarks.reorder?.(flattenLinks(order).map((b) => b.id))
      }
    }
  })

  const dragProps = (n: FavNode) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(FAV_DRAG_TYPE, nodeId(n))
      if (n.kind === 'link') {
        e.dataTransfer.setData('text/uri-list', n.item.url)
        e.dataTransfer.setData('text/plain', n.item.url)
      }
      e.dataTransfer.effectAllowed = 'copyMove'
    }
  })

  const hintFor = (n: FavNode) => (dropHint?.id === nodeId(n) ? dropHint.pos : null)

  /* ---- context menus ---- */
  const visibilityMenu = (
    <ContextMenuSub>
      <ContextMenuSubTrigger className={menuItem}>
        <Eye className="w-3.5 h-3.5" /> Show favorites bar
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-44 rounded-xl p-1">
        {(
          [
            ['always', 'Always'],
            ['never', 'Never'],
            ['new-tab', 'Only on new tabs']
          ] as const
        ).map(([id, label]) => (
          <ContextMenuItem key={id} className={menuItem} onClick={() => void updateSettings({ favoritesBar: id })}>
            <span className="w-3.5">{mode === id && <Check className="w-3.5 h-3.5" />}</span>
            {label}
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  )

  const barMenuItems = (
    <>
      <ContextMenuItem
        className={menuItem}
        onClick={async () => {
          const added = await addActiveTabToFavorites()
          if (added) toast.success('Added to favorites bar')
          else toast('Open a web page first')
        }}
      >
        <Star className="w-3.5 h-3.5" /> Add this page to favorites bar
      </ContextMenuItem>
      <ContextMenuItem className={menuItem} onClick={() => setEditing({ kind: 'new-folder', parent: FAVORITES_BAR })}>
        <Plus className="w-3.5 h-3.5" /> Add this page to a new folder
      </ContextMenuItem>
      <ContextMenuSeparator />
      {visibilityMenu}
      <ContextMenuItem className={menuItem} onClick={() => useBrowserStore.getState().setBookmarksDialogOpen(true)}>
        <FolderOpen className="w-3.5 h-3.5" /> Manage favorites
      </ContextMenuItem>
    </>
  )

  const linkMenu = (b: BookmarkItem) => (
    <ContextMenuContent className="w-56 rounded-xl p-1">
      <ContextMenuItem className={menuItem} onClick={() => void openFavorite(b.url, b.title, 'new')}>
        <ExternalLink className="w-3.5 h-3.5" /> Open in new tab
      </ContextMenuItem>
      <ContextMenuItem className={menuItem} onClick={() => void openFavorite(b.url, b.title, 'private')}>
        <EyeOff className="w-3.5 h-3.5 text-violet-500" /> Open in private tab
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className={menuItem} onClick={() => setEditing({ kind: 'link', item: b })}>
        <Pencil className="w-3.5 h-3.5" /> Edit
      </ContextMenuItem>
      <ContextMenuItem
        className={`${menuItem} text-destructive focus:text-destructive`}
        onClick={() => void api.bookmarks.delete(b.id).then(() => toast.success('Favorite removed'))}
      >
        <Trash2 className="w-3.5 h-3.5" /> Delete
      </ContextMenuItem>
      <ContextMenuSeparator />
      {barMenuItems}
    </ContextMenuContent>
  )

  const folderMenu = (n: Extract<FavNode, { kind: 'folder' }>) => (
    <ContextMenuContent className="w-56 rounded-xl p-1">
      <ContextMenuItem className={menuItem} onClick={() => void openAll(n.children)}>
        <ExternalLink className="w-3.5 h-3.5" /> Open all ({flattenLinks(n.children).length})
      </ContextMenuItem>
      <ContextMenuItem className={menuItem} onClick={() => setEditing({ kind: 'folder', path: n.path })}>
        <Pencil className="w-3.5 h-3.5" /> Rename
      </ContextMenuItem>
      <ContextMenuItem
        className={`${menuItem} text-destructive focus:text-destructive`}
        onClick={() => {
          const count = flattenLinks(n.children).length
          if (!window.confirm(`Delete the folder "${n.name}" and its ${count} favorite${count === 1 ? '' : 's'}?`)) return
          void api.bookmarks.deleteFolder?.(n.path).then(() => toast.success('Folder deleted'))
        }}
      >
        <Trash2 className="w-3.5 h-3.5" /> Delete folder
      </ContextMenuItem>
      <ContextMenuSeparator />
      {barMenuItems}
    </ContextMenuContent>
  )

  /* ---- rendering ---- */
  const renderNode = (n: FavNode, measuring = false) => {
    const hint = measuring ? null : hintFor(n)
    const indicator =
      hint === 'before' || hint === 'after' ? (
        <span className={`pointer-events-none absolute top-0.5 bottom-0.5 w-0.5 rounded-full bg-primary ${hint === 'before' ? '-left-px' : '-right-px'}`} />
      ) : null

    if (n.kind === 'link') {
      const b = n.item
      const button = (
        <button
          className={`relative ${itemCls}`}
          title={`${b.title}\n${b.url}`}
          onClick={(e) => void openFavorite(b.url, b.title, e.ctrlKey || e.metaKey ? 'new' : e.shiftKey ? 'private' : 'current')}
          onAuxClick={(e) => {
            if (e.button === 1) {
              e.preventDefault()
              void openFavorite(b.url, b.title, 'new')
            }
          }}
          {...(measuring ? {} : { ...dragProps(n), ...nodeDropProps(n) })}
        >
          {indicator}
          <FavIcon item={b} />
          {b.title && <span className="truncate">{b.title}</span>}
        </button>
      )
      if (measuring) return <React.Fragment key={b.id}>{button}</React.Fragment>
      return (
        <ContextMenu key={b.id}>
          <ContextMenuTrigger asChild>{button}</ContextMenuTrigger>
          {linkMenu(b)}
        </ContextMenu>
      )
    }

    const trigger = (
      <button
        className={`relative ${itemCls} ${hint === 'into' ? 'bg-primary/15 ring-1 ring-primary/50' : ''}`}
        title={n.name}
        {...(measuring ? {} : { ...dragProps(n), ...nodeDropProps(n) })}
      >
        {indicator}
        <Folder className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{n.name}</span>
      </button>
    )
    if (measuring) return <React.Fragment key={n.path}>{trigger}</React.Fragment>
    return (
      <ContextMenu key={n.path}>
        <DropdownMenu>
          <ContextMenuTrigger asChild>
            <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          </ContextMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={4} className="min-w-[220px] max-h-[70vh] overflow-y-auto rounded-xl p-1">
            <FolderMenuItems nodes={n.children} onEdit={setEditing} />
          </DropdownMenuContent>
        </DropdownMenu>
        {folderMenu(n)}
      </ContextMenu>
    )
  }

  const visible = nodes.slice(0, visibleCount)
  const overflow = nodes.slice(visibleCount)

  // Nothing on the bar yet: don't show an empty strip (add favorites with the star or import them)
  if (nodes.length === 0) {
    return <EditFavoriteDialog target={editing} onClose={() => setEditing(null)} barOrderIds={barOrder(items)} />
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={`relative flex items-center h-8 px-2 gap-0.5 bg-chrome border-b border-border select-none app-no-drag ${
              barDrop ? 'bg-primary/5' : ''
            }`}
            onDragOver={(e) => {
              if (!isExternalDrag(e) && !isFavDrag(e)) return
              e.preventDefault()
              if (!barDrop) setBarDrop(true)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setBarDrop(false)
            }}
            onDrop={async (e) => {
              setBarDrop(false)
              e.preventDefault()
              const favId = e.dataTransfer.getData(FAV_DRAG_TYPE)
              if (favId) {
                // Dropped on empty bar space: move to the end
                const last = nodes[nodes.length - 1]
                if (last) void moveNode(favId, nodeId(last), 'after')
                return
              }
              const page = pageFromDrop(e)
              if (page && (await addFavorite(page))) toast.success('Added to favorites bar')
            }}
          >
            {/* Hidden row used to measure item widths */}
            <div ref={measureRef} aria-hidden className="absolute left-0 top-0 invisible pointer-events-none flex gap-0.5 whitespace-nowrap">
              {nodes.map((n) => renderNode(n, true))}
            </div>

            <div ref={rowRef} className="flex items-center gap-0.5 flex-1 min-w-0 overflow-hidden">
              {visible.map((n) => renderNode(n))}
            </div>

            {overflow.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-7 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground shrink-0" title="More favorites">
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={4} className="min-w-[220px] max-h-[70vh] overflow-y-auto rounded-xl p-1">
                  <FolderMenuItems nodes={overflow} onEdit={setEditing} />
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56 rounded-xl p-1">{barMenuItems}</ContextMenuContent>
      </ContextMenu>

      <EditFavoriteDialog target={editing} onClose={() => setEditing(null)} barOrderIds={barOrder(items)} />
    </>
  )
}
