import React, { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Folder, FolderOpen, Globe, Search, Star, StarHalf, Settings2, Eye, EyeOff, X, PinOff, Pencil, Trash2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { api } from '@/lib/ipc'
import { EditFavoriteDialog, type EditTarget } from './EditFavoriteDialog'
import { useSettings } from '@/hooks/useSettings'
import { useBrowserStore } from '@/store/useBrowserStore'
import {
  FAVORITES_BAR,
  FOLDER_SEP,
  OTHER_FAVORITES,
  READING_LIST,
  addActiveTabToFavorites,
  buildTree,
  ensureFavoritesLoaded,
  faviconFor,
  openFavorite,
  useFavorites,
  useFavoritesButton,
  addFavorite,
  barOrder,
  flattenLinks,
  type FavNode
} from '@/lib/favorites'
import type { BookmarkItem } from '@/types/api'

const iconBtn = 'w-7 h-7 flex items-center justify-center rounded-lg transition-colors cursor-pointer'

const FavIcon: React.FC<{ item: BookmarkItem }> = ({ item }) => {
  const [broken, setBroken] = useState(false)
  const src = faviconFor(item)
  return src && !broken ? (
    <img src={src} alt="" className="w-4 h-4 shrink-0 rounded-sm object-contain" onError={() => setBroken(true)} />
  ) : (
    <Globe className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
  )
}

/** Favorites button "☆≡" in the toolbar, Edge style */
const FavoritesIcon: React.FC = () => (
  <span className="relative w-4 h-4 inline-block">
    <Star className="absolute left-0 top-0 w-3 h-3" />
    <span className="absolute right-0 bottom-[1px] flex flex-col gap-[2px]">
      <span className="block w-[6px] h-[1.5px] rounded bg-current" />
      <span className="block w-[6px] h-[1.5px] rounded bg-current" />
      <span className="block w-[6px] h-[1.5px] rounded bg-current" />
    </span>
  </span>
)

/**
 * Favorites panel: the favorites bar and other folders as a collapsible tree, search,
 * "add this page", show/hide the favorites bar, and a link to the full manager.
 */
export const FavoritesPopover: React.FC = () => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([FAVORITES_BAR]))
  const items = useFavorites((s) => s.items)
  const { settings, updateSettings } = useSettings()
  const barShown = (settings?.favoritesBar ?? 'always') !== 'never'

  useEffect(() => ensureFavoritesLoaded(), [])
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const showButton = useFavoritesButton((s) => s.show)
  const setShowButton = useFavoritesButton((s) => s.setShow)
  // ⋯ menu → Favorites opens this panel
  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('tct:open-favorites', onOpen)
    return () => window.removeEventListener('tct:open-favorites', onOpen)
  }, [])
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const favorites = useMemo(
    () =>
      items
        .filter((b) => !b.isReadingList && b.folder !== READING_LIST)
        .map((b) => (b.folder ? b : { ...b, folder: OTHER_FAVORITES })),
    [items]
  )

  // Root folders: Favorites bar first, then "Other favorites", then imported roots ("Google Chrome / …")
  const roots = useMemo(() => {
    const names = new Set<string>()
    for (const b of favorites) names.add((b.folder || OTHER_FAVORITES).split(FOLDER_SEP)[0])
    names.add(FAVORITES_BAR)
    return [...names].sort((a, b) =>
      a === FAVORITES_BAR ? -1 : b === FAVORITES_BAR ? 1 : a === OTHER_FAVORITES ? -1 : b === OTHER_FAVORITES ? 1 : a.localeCompare(b)
    )
  }, [favorites])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return favorites.filter((b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)).slice(0, 50)
  }, [favorites, query])

  const toggle = (path: string) =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const open_ = (b: BookmarkItem, e: React.MouseEvent) => {
    setOpen(false)
    void openFavorite(b.url, b.title, e.ctrlKey || e.metaKey || e.button === 1 ? 'new' : 'current')
  }

  const removeLink = async (b: BookmarkItem) => {
    await api.bookmarks.delete(b.id)
    toast('Favorite removed', {
      action: { label: 'Undo', onClick: () => void addFavorite({ url: b.url, title: b.title, favicon: b.favicon ?? null }, b.folder || FAVORITES_BAR) }
    })
  }

  const removeFolder = async (path: string, name: string, children: FavNode[]) => {
    const count = flattenLinks(children).length
    if (!window.confirm(`Delete the folder "${name}" and its ${count} favorite${count === 1 ? '' : 's'}?`)) return
    await api.bookmarks.deleteFolder?.(path)
    toast.success('Folder deleted')
  }

  const edit = (target: EditTarget) => {
    setOpen(false)
    setEditing(target)
  }

  /** Small icon buttons that appear on hover */
  const rowAction = (title: string, icon: React.ReactNode, onClick: () => void, danger = false) => (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`w-6 h-6 shrink-0 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity ${
        danger ? 'text-muted-foreground hover:text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
      }`}
    >
      {icon}
    </button>
  )

  const menuItemCls = 'text-xs rounded-lg cursor-pointer gap-2'

  const linkRow = (b: BookmarkItem, depth: number) => (
    <ContextMenu key={b.id}>
      <ContextMenuTrigger asChild>
        <div
          className="group w-full flex items-center gap-1 h-7 pr-1 rounded-lg hover:bg-accent text-xs text-foreground cursor-pointer"
          style={{ paddingLeft: 8 + depth * 14 + 16 }}
          title={`${b.title}
${b.url}`}
          onClick={(e) => open_(b, e)}
          onAuxClick={(e) => e.button === 1 && open_(b, e)}
        >
          <FavIcon item={b} />
          <span className="flex-1 min-w-0 truncate pl-1">{b.title || b.url}</span>
          {rowAction('Edit', <Pencil className="w-3 h-3" />, () => edit({ kind: 'link', item: b }))}
          {rowAction('Delete', <Trash2 className="w-3 h-3" />, () => void removeLink(b), true)}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52 rounded-xl p-1">
        <ContextMenuItem className={menuItemCls} onClick={() => void openFavorite(b.url, b.title, 'new')}>
          <ExternalLink className="w-3.5 h-3.5" /> Open in new tab
        </ContextMenuItem>
        <ContextMenuItem className={menuItemCls} onClick={() => void openFavorite(b.url, b.title, 'private')}>
          <EyeOff className="w-3.5 h-3.5 text-violet-500" /> Open in private tab
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className={menuItemCls} onClick={() => edit({ kind: 'link', item: b })}>
          <Pencil className="w-3.5 h-3.5" /> Edit
        </ContextMenuItem>
        <ContextMenuItem className={`${menuItemCls} text-destructive focus:text-destructive`} onClick={() => void removeLink(b)}>
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )

  const folderRow = (path: string, name: string, children: FavNode[], depth: number) => {
    const isOpen = expanded.has(path)
    // Top-level roots (Favorites bar, Other favorites, imports) can't be renamed or deleted here
    const editable = depth > 0
    const row = (
      <div
        onClick={() => toggle(path)}
        className="group w-full flex items-center gap-1.5 h-7 pr-1 rounded-lg hover:bg-accent text-xs font-medium text-foreground cursor-pointer"
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <ChevronRight className={`w-3 h-3 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        {isOpen ? <FolderOpen className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /> : <Folder className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
        <span className="flex-1 min-w-0 truncate">{name}</span>
        {editable && rowAction('Rename', <Pencil className="w-3 h-3" />, () => edit({ kind: 'folder', path }))}
        {editable && rowAction('Delete folder', <Trash2 className="w-3 h-3" />, () => void removeFolder(path, name, children), true)}
      </div>
    )
    return (
      <div key={path}>
        {editable ? (
          <ContextMenu>
            <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
            <ContextMenuContent className="w-52 rounded-xl p-1">
              <ContextMenuItem className={menuItemCls} onClick={() => edit({ kind: 'folder', path })}>
                <Pencil className="w-3.5 h-3.5" /> Rename
              </ContextMenuItem>
              <ContextMenuItem
                className={`${menuItemCls} text-destructive focus:text-destructive`}
                onClick={() => void removeFolder(path, name, children)}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete folder
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ) : (
          row
        )}
        {isOpen && (
          <div>
            {children.length === 0 && (
              <div className="text-[11px] text-muted-foreground h-6 flex items-center" style={{ paddingLeft: 8 + (depth + 1) * 14 + 16 }}>
                Empty
              </div>
            )}
            {children.map((n) => (n.kind === 'link' ? linkRow(n.item, depth + 1) : folderRow(n.path, n.name, n.children, depth + 1)))}
          </div>
        )}
      </div>
    )
  }

  if (!showButton) return null

  const unpin = () => {
    setOpen(false)
    setShowButton(false)
    toast('Favorites button unpinned', {
      description: 'Pin it again from ⋯ → Favorites.',
      action: { label: 'Undo', onClick: () => setShowButton(true) }
    })
  }

  return (
    <>
    <EditFavoriteDialog target={editing} onClose={() => setEditing(null)} barOrderIds={barOrder(items)} />
    <Popover open={open} onOpenChange={setOpen}>
      <ContextMenu>
        <PopoverTrigger asChild>
          <ContextMenuTrigger asChild>
            <button
              className={`${iconBtn} ${open ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
              title="Favorites (right-click to unpin)"
            >
              <FavoritesIcon />
            </button>
          </ContextMenuTrigger>
        </PopoverTrigger>
        <ContextMenuContent className="w-52 rounded-xl p-1 text-xs">
          <ContextMenuItem onClick={unpin} className="rounded-lg cursor-pointer gap-2 text-xs">
            <PinOff className="w-3.5 h-3.5" /> Unpin from toolbar
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => useBrowserStore.getState().setBookmarksDialogOpen(true)}
            className="rounded-lg cursor-pointer gap-2 text-xs"
          >
            <Settings2 className="w-3.5 h-3.5" /> Manage favorites
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <PopoverContent
        align="end"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-80 p-1.5 rounded-2xl bg-popover/95 dark:bg-[#121316]/95 backdrop-blur-2xl border border-border/80 shadow-2xl z-50 select-none"
      >
        <div className="flex items-center justify-between pl-2.5 pr-1 pt-1 pb-1.5">
          <span className="text-sm font-semibold text-foreground">Favorites</span>
          <div className="flex items-center">
            <button
              className={`${iconBtn} text-muted-foreground hover:text-foreground hover:bg-accent`}
              title="Add this page to favorites bar"
              onClick={async () => {
                if (await addActiveTabToFavorites()) toast.success('Added to favorites bar')
                else toast('Open a web page first')
              }}
            >
              <StarHalf className="w-3.5 h-3.5" />
            </button>
            <button
              className={`${iconBtn} text-muted-foreground hover:text-foreground hover:bg-accent`}
              title={barShown ? 'Hide favorites bar (Ctrl+Shift+B)' : 'Show favorites bar (Ctrl+Shift+B)'}
              onClick={() => void updateSettings({ favoritesBar: barShown ? 'never' : 'always' })}
            >
              {barShown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button
              className={`${iconBtn} text-muted-foreground hover:text-foreground hover:bg-accent`}
              title="Manage favorites"
              onClick={() => {
                setOpen(false)
                useBrowserStore.getState().setBookmarksDialogOpen(true)
              }}
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="relative px-1 pb-1.5">
          <Search className="absolute left-3.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search favorites"
            className="w-full h-8 pl-8 pr-7 rounded-xl bg-background border border-border text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          {query && (
            <button className="absolute right-3 top-2 text-muted-foreground hover:text-foreground" onClick={() => setQuery('')}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim() ? (
            results.length ? (
              results.map((b) => linkRow(b, -1))
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground">No favorites match “{query.trim()}”</div>
            )
          ) : (
            roots.map((root) =>
              folderRow(root, root === OTHER_FAVORITES ? 'Other favorites' : root, buildTree(favorites, root), 0)
            )
          )}
        </div>
      </PopoverContent>
    </Popover>
    </>
  )
}
