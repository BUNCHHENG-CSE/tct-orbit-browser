import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Star, X, Folder, ChevronDown, Check } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/ipc'
import {
  FAVORITES_BAR,
  FOLDER_SEP,
  OTHER_FAVORITES,
  READING_LIST,
  addFavorite,
  barOrder,
  ensureFavoritesLoaded,
  folderName,
  useFavorites
} from '@/lib/favorites'
import { modKey } from '@/lib/platform'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { EditFavoriteDialog, type EditTarget } from '@/components/Favorites/EditFavoriteDialog'
import type { BookmarkItem } from '@/types/api'

interface BookmarkPopoverProps {
  url?: string
  title?: string
  favicon?: string | null
}

const inBar = (folder: string) => folder === FAVORITES_BAR || folder.startsWith(FAVORITES_BAR + FOLDER_SEP)
const folderLabel = (path: string) => (path === OTHER_FAVORITES ? 'Other favorites' : folderName(path))

/**
 * Star in the address bar, Edge style: one click saves the page to the Favorites bar right away
 * and shows "Favorite added" to rename it, pick another folder, open the full editor (More) or
 * remove it. Clicking the filled star again edits the existing favorite. Ctrl+D does the same.
 */
export const BookmarkPopover: React.FC<BookmarkPopoverProps> = ({ url, title = '', favicon }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [justAdded, setJustAdded] = useState(false)
  const [name, setName] = useState('')
  const [folder, setFolder] = useState(FAVORITES_BAR)
  const [itemId, setItemId] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const items = useFavorites((s) => s.items)
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => ensureFavoritesLoaded(), [])

  const existing = useMemo(
    () => (url ? items.find((b) => b.url === url && !b.isReadingList && b.folder !== READING_LIST) : undefined),
    [items, url]
  )
  const isFavorite = !!existing

  // Folder picker: Favorites bar, Other favorites and imported roots, each with subfolders (indented)
  const folders = useMemo(() => {
    const set = new Set<string>([FAVORITES_BAR, OTHER_FAVORITES])
    for (const b of items) {
      if (!b.folder || b.isReadingList || b.folder === READING_LIST) continue
      const parts = b.folder.split(FOLDER_SEP)
      for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join(FOLDER_SEP))
    }
    const rank = (p: string) => (p.startsWith(FAVORITES_BAR) ? 0 : p.startsWith(OTHER_FAVORITES) ? 1 : 2)
    return [...set].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  }, [items])

  const openFor = (item: BookmarkItem, added: boolean) => {
    setItemId(item.id)
    setName(item.title || item.url)
    setFolder(item.folder || OTHER_FAVORITES)
    setJustAdded(added)
    setIsOpen(true)
    // Edge selects the name so you can type a new one right away
    setTimeout(() => nameRef.current?.select(), 30)
  }

  /** Remove the favorite for this page (filled star clicked again), with Undo */
  const removeFavorite = async (item: BookmarkItem) => {
    setIsOpen(false)
    await api.bookmarks.delete(item.id)
    toast('Removed from favorites', {
      action: {
        label: 'Undo',
        onClick: () =>
          void addFavorite({ url: item.url, title: item.title, favicon: item.favicon ?? null }, item.folder || FAVORITES_BAR)
      }
    })
  }

  /**
   * Star click: not a favorite → add it to the favorites bar and show the editor;
   * already a favorite (filled star) → remove it.
   * Ctrl+D (`edit`): add, or open the editor for an existing favorite.
   */
  const handleStar = async (edit = false) => {
    if (!url) return
    const current = itemId ? useFavorites.getState().items.find((b) => b.id === itemId) : undefined
    if (isOpen) {
      if (edit) return void applyAndClose()
      // Star clicked again while "Favorite added" is showing: undo the add
      return current ? void removeFavorite(current) : setIsOpen(false)
    }
    if (existing) return edit ? openFor(existing, false) : void removeFavorite(existing)
    try {
      const item = await addFavorite({ url, title: title || url, favicon: favicon ?? null }, FAVORITES_BAR)
      if (item) openFor(item, true)
    } catch {
      toast.error('Could not add favorite')
    }
  }

  /** Save name / folder changes (Done, Enter, or clicking away) */
  const applyAndClose = async () => {
    setIsOpen(false)
    const item = itemId ? useFavorites.getState().items.find((b) => b.id === itemId) : undefined
    if (!item) return
    const newTitle = name.trim() || item.url
    const changes: { title?: string; folder?: string } = {}
    if (newTitle !== item.title) changes.title = newTitle
    if (folder !== item.folder) changes.folder = folder
    if (!Object.keys(changes).length) return
    await api.bookmarks.update?.(item.id, changes)
    // Moved onto the bar: put it at the end
    if (changes.folder && inBar(folder)) {
      await api.bookmarks.reorder?.([...barOrder(useFavorites.getState().items).filter((id) => id !== item.id), item.id])
    }
  }

  const handleRemove = async () => {
    setIsOpen(false)
    if (itemId) await api.bookmarks.delete(itemId)
    toast.success('Favorite removed')
  }

  const handleMore = () => {
    const item = itemId ? useFavorites.getState().items.find((b) => b.id === itemId) : undefined
    setIsOpen(false)
    if (item) setEditing({ kind: 'link', item: { ...item, title: name.trim() || item.title, folder } })
  }

  // Ctrl+D
  const starRef = useRef(handleStar)
  starRef.current = handleStar
  useEffect(() => {
    const onToggle = () => void starRef.current(true)
    window.addEventListener('tct:toggle-bookmark', onToggle)
    return () => window.removeEventListener('tct:toggle-bookmark', onToggle)
  }, [])

  // Clicking away saves (menus opened from the popover, like the folder picker, don't count)
  const applyRef = useRef(applyAndClose)
  applyRef.current = applyAndClose
  useEffect(() => {
    if (!isOpen) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (popoverRef.current?.contains(t) || buttonRef.current?.contains(t) || t.closest?.('[data-radix-popper-content-wrapper]')) return
      void applyRef.current()
    }
    // Clicking into the web page doesn't reach this window: it just loses focus
    const onBlur = () => void applyRef.current()
    window.addEventListener('mousedown', onDown)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('blur', onBlur)
    }
  }, [isOpen])

  // Different page: close without carrying over the editor
  useEffect(() => {
    setIsOpen(false)
  }, [url])

  if (!url || !/^(https?|file):/i.test(url)) return null

  return (
    <div className="relative flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => void handleStar()}
        className={`shrink-0 flex items-center justify-center w-6 h-6 rounded-md transition-colors cursor-pointer ${
          isOpen ? 'bg-primary/15' : 'hover:bg-muted'
        }`}
        title={isFavorite ? `Remove from favorites · ${modKey}+D to edit` : `Add this page to favorites (${modKey}+D)`}
      >
        <Star
          className={`w-3.5 h-3.5 transition-transform active:scale-90 ${
            isFavorite ? 'fill-primary text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
        />
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={justAdded ? 'Favorite added' : 'Edit favorite'}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsOpen(false)
          }}
          className="absolute right-0 top-full mt-2 w-[300px] rounded-xl bg-popover border border-border shadow-2xl p-4 z-50 text-foreground animate-in fade-in zoom-in-95 duration-150 select-none text-[13px]"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[15px] font-semibold">{justAdded ? 'Favorite added' : 'Edit favorite'}</span>
            <button
              onClick={() => void applyAndClose()}
              className="w-7 h-7 -mr-1.5 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void applyAndClose()
            }}
          >
            <label className="block text-xs font-medium text-foreground mb-1">Name</label>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-8 px-2.5 rounded-md bg-background border border-border text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 select-text"
            />

            <label className="block text-xs font-medium text-foreground mt-3 mb-1">Folder</label>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="w-full h-8 px-2.5 flex items-center gap-2 rounded-md bg-background border border-border hover:border-muted-foreground/50 text-left"
                >
                  <Folder className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{folderLabel(folder)}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={4}
                className="w-[268px] max-h-[min(320px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto rounded-lg p-1 z-[60]"
              >
                {folders.map((f) => {
                  const depth = f.split(FOLDER_SEP).length - 1
                  return (
                    <DropdownMenuItem
                      key={f}
                      onClick={() => setFolder(f)}
                      className="text-[13px] rounded-md cursor-pointer gap-2"
                      style={{ paddingLeft: 8 + depth * 16 }}
                    >
                      <Folder className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{folderLabel(f)}</span>
                      {f === folder && <Check className="w-3.5 h-3.5 text-primary" />}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center justify-between mt-4">
              <button type="button" onClick={handleMore} className="h-8 px-3.5 rounded-md bg-muted hover:bg-muted/70 font-medium">
                More
              </button>
              <div className="flex items-center gap-2">
                <button type="submit" className="h-8 px-4 rounded-md bg-primary text-primary-foreground font-semibold hover:bg-primary/90">
                  Done
                </button>
                <button type="button" onClick={() => void handleRemove()} className="h-8 px-3.5 rounded-md bg-muted hover:bg-muted/70 font-medium">
                  Remove
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <EditFavoriteDialog target={editing} onClose={() => setEditing(null)} barOrderIds={barOrder(items)} />
    </div>
  )
}
