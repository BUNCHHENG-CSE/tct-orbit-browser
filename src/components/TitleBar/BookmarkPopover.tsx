import React, { useState, useEffect, useRef } from 'react'
import { Star, Check, Trash2, X, BookmarkCheck, BookMarked } from 'lucide-react'
import { api } from '@/lib/ipc'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useSpaces } from '@/hooks/useSpaces'
import { toast } from 'sonner'
import { modKey } from '@/lib/platform'

interface BookmarkPopoverProps {
  url?: string
  title?: string
  favicon?: string | null
}

export const BookmarkPopover: React.FC<BookmarkPopoverProps> = ({
  url,
  title = '',
  favicon
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [bookmarkTitle, setBookmarkTitle] = useState(title)
  const [folder, setFolder] = useState<'Bookmarks' | 'Reading List'>('Bookmarks')
  const { spaces, activeSpaceId } = useSpaces()

  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Check if current URL is bookmarked
  useEffect(() => {
    if (!url || !api.bookmarks?.isBookmarked) {
      setIsBookmarked(false)
      return
    }
    let active = true
    api.bookmarks.isBookmarked(url).then((res) => {
      if (active) setIsBookmarked(Boolean(res))
    }).catch(() => {})
    return () => {
      active = false
    }
  }, [url])

  // Sync title when URL changes
  useEffect(() => {
    setBookmarkTitle(title || url || '')
  }, [title, url])

  // Global toggle-bookmark shortcut listener (Ctrl+D)
  useEffect(() => {
    const handleToggle = () => {
      setIsOpen((prev) => !prev)
    }
    window.addEventListener('tct:toggle-bookmark', handleToggle)
    return () => window.removeEventListener('tct:toggle-bookmark', handleToggle)
  }, [])

  // Click outside to dismiss
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleSave = async () => {
    if (!url || !api.bookmarks?.add) return
    try {
      await api.bookmarks.add({
        url,
        title: bookmarkTitle.trim() || url,
        favicon: favicon || null,
        spaceId: activeSpaceId || undefined,
        folder,
        isReadingList: folder === 'Reading List'
      })
      setIsBookmarked(true)
      setIsOpen(false)
      toast.success(folder === 'Reading List' ? 'Added to Reading List' : 'Saved to Bookmarks')
    } catch {
      toast.error('Failed to save bookmark')
    }
  }

  const handleRemove = async () => {
    if (!url || !api.bookmarks?.deleteByUrl) return
    try {
      await api.bookmarks.deleteByUrl(url)
      setIsBookmarked(false)
      setIsOpen(false)
      toast.success('Removed bookmark')
    } catch {
      toast.error('Failed to remove bookmark')
    }
  }

  if (!url || url === 'about:blank') return null

  return (
    <div className="relative flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="shrink-0 flex items-center justify-center p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        title={isBookmarked ? `Bookmarked (${modKey}+D to edit)` : `Bookmark this tab (${modKey}+D)`}
      >
        <Star
          className={`w-3.5 h-3.5 transition-transform active:scale-90 ${
            isBookmarked
              ? 'fill-amber-400 text-amber-500 scale-105'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        />
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 w-80 rounded-2xl bg-popover border border-border shadow-2xl p-4 z-50 text-foreground animate-in fade-in zoom-in-95 duration-150 select-none text-xs"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <BookMarked className="w-4 h-4 text-primary" />
              <span className="font-semibold text-foreground text-sm">
                {isBookmarked ? 'Edit Bookmark' : 'Bookmark Added'}
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Form */}
          <div className="py-3 space-y-3">
            {/* Title */}
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Name
              </label>
              <input
                type="text"
                value={bookmarkTitle}
                onChange={(e) => setBookmarkTitle(e.target.value)}
                className="w-full h-8 px-2.5 rounded-xl bg-background border border-border text-foreground text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
              />
            </div>

            {/* Folder / Destination */}
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Destination
              </label>
              <select
                value={folder}
                onChange={(e) => setFolder(e.target.value as any)}
                className="w-full h-8 px-2 rounded-xl bg-background border border-border text-foreground text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all cursor-pointer font-medium"
              >
                <option value="Bookmarks">Bookmarks</option>
                <option value="Reading List">Reading List (Read Later)</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
            {isBookmarked ? (
              <button
                onClick={handleRemove}
                className="py-1.5 px-3 rounded-xl border border-destructive/30 hover:bg-destructive/15 text-destructive font-medium flex items-center gap-1 transition-colors cursor-pointer text-xs"
              >
                <Trash2 className="w-3 h-3" />
                <span>Remove</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsOpen(false)}
                className="py-1.5 px-3 rounded-xl border border-border hover:bg-muted font-medium transition-colors cursor-pointer text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="py-1.5 px-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity cursor-pointer text-xs flex items-center gap-1 shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Done</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
