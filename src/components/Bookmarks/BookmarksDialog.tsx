import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import {
  BookMarked,
  Search,
  Trash2,
  ExternalLink,
  Copy,
  Globe,
  Clock,
  CheckCircle2,
  Circle,
  X,
  Star,
  BookOpen,
  Check
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/ipc'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useSpaces } from '@/hooks/useSpaces'
import { useTabs } from '@/hooks/useTabs'
import { modKey } from '@/lib/platform'
import type { BookmarkItem } from '@/types/api'

interface BookmarksDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export const BookmarksDialog: React.FC<BookmarksDialogProps> = ({
  open: propOpen,
  onOpenChange: propOnOpenChange
}) => {
  const storeOpen = useBrowserStore((s) => s.bookmarksDialogOpen)
  const setStoreOpen = useBrowserStore((s) => s.setBookmarksDialogOpen)

  const isOpen = propOpen !== undefined ? propOpen : storeOpen
  const setIsOpen = propOnOpenChange || setStoreOpen

  const { activeSpaceId } = useSpaces()
  const { createTab } = useTabs(activeSpaceId)

  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTabFilter, setActiveTabFilter] = useState<'all' | 'bookmarks' | 'reading-list'>('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fetchBookmarks = useCallback(async () => {
    if (!api.bookmarks?.list) return
    setLoading(true)
    try {
      const items = await api.bookmarks.list()
      setBookmarks(items || [])
    } catch (err) {
      console.error('[Bookmarks] Failed to fetch bookmarks:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      fetchBookmarks()
    }
  }, [isOpen, fetchBookmarks])

  // Global open-bookmarks event listener
  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true)
    }
    window.addEventListener('open-bookmarks', handleOpen)
    return () => window.removeEventListener('open-bookmarks', handleOpen)
  }, [setIsOpen])

  const filteredBookmarks = useMemo(() => {
    let result = bookmarks

    if (activeTabFilter === 'bookmarks') {
      result = result.filter((b) => !b.isReadingList)
    } else if (activeTabFilter === 'reading-list') {
      result = result.filter((b) => b.isReadingList)
    }

    const q = searchQuery.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.url.toLowerCase().includes(q) ||
          (b.folder && b.folder.toLowerCase().includes(q))
      )
    }

    return result
  }, [bookmarks, activeTabFilter, searchQuery])

  const handleOpenBookmark = async (bookmark: BookmarkItem) => {
    if (activeSpaceId) {
      await createTab({ url: bookmark.url, title: bookmark.title })
      setIsOpen(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    try {
      if (api.bookmarks?.delete) {
        await api.bookmarks.delete(id)
        setBookmarks((prev) => prev.filter((b) => b.id !== id))
        toast.success('Bookmark removed')
      }
    } catch {
      toast.error('Failed to remove bookmark')
    }
  }

  const handleToggleRead = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    try {
      if (api.bookmarks?.toggleRead) {
        await api.bookmarks.toggleRead(id)
        setBookmarks((prev) =>
          prev.map((b) => (b.id === id ? { ...b, isRead: !b.isRead } : b))
        )
      }
    } catch {
      toast.error('Failed to update status')
    }
  }

  const handleCopyUrl = (e: React.MouseEvent, bookmark: BookmarkItem) => {
    e.stopPropagation()
    navigator.clipboard.writeText(bookmark.url)
    setCopiedId(bookmark.id)
    toast.success('URL copied to clipboard')
    setTimeout(() => setCopiedId(null), 2000)
  }

  const readingListUnreadCount = useMemo(() => {
    return bookmarks.filter((b) => b.isReadingList && !b.isRead).length
  }, [bookmarks])

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl w-[90vw] h-[80vh] max-h-[700px] p-0 flex flex-col rounded-3xl bg-background border border-border shadow-2xl overflow-hidden z-50">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-3.5 border-b border-border shrink-0 flex flex-row items-center justify-between space-y-0 pr-14">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shadow-xs">
              <Star className="w-5 h-5 fill-amber-500/20" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2.5">
                <span>Bookmarks & Reading List</span>
                <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-muted/80 text-muted-foreground border border-border/50">
                  {bookmarks.length}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Organize saved pages and articles to read later.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Search & Tabs */}
        <div className="px-6 py-3 border-b border-border bg-muted/15 flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex-1 min-w-[220px] relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search bookmarks by title or URL..."
              className="w-full h-9 pl-10 pr-9 rounded-xl bg-background border border-border text-foreground text-xs placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="h-9 flex items-center gap-0.5 p-1 bg-muted/50 rounded-xl border border-border text-[11px] select-none">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'bookmarks', label: 'Bookmarks' },
                {
                  id: 'reading-list',
                  label: `Reading List ${readingListUnreadCount > 0 ? `(${readingListUnreadCount})` : ''}`
                }
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTabFilter(tab.id as any)}
                className={`h-7 px-3 rounded-lg transition-all font-medium cursor-pointer flex items-center justify-center ${
                  activeTabFilter === tab.id
                    ? 'bg-background text-foreground shadow-2xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {loading ? (
            <div className="h-48 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <Clock className="w-6 h-6 animate-spin text-primary" />
              <span className="text-xs">Loading bookmarks...</span>
            </div>
          ) : filteredBookmarks.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 select-none">
              <div className="w-14 h-14 rounded-3xl bg-muted/50 border border-border/80 flex items-center justify-center text-muted-foreground/70 mb-3 shadow-inner">
                <BookMarked className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-semibold text-foreground tracking-tight mb-1">
                {searchQuery ? 'No Matching Bookmarks' : 'No Bookmarks Yet'}
              </h3>
              <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                {searchQuery
                  ? `No bookmarks match "${searchQuery}".`
                  : `Press ${modKey}+D or click the star in the address bar to bookmark any webpage.`}
              </p>
            </div>
          ) : (
            filteredBookmarks.map((item) => (
              <div
                key={item.id}
                onClick={() => handleOpenBookmark(item)}
                className="group relative p-3 rounded-2xl bg-muted/20 hover:bg-muted/40 border border-border/70 hover:border-border transition-all flex items-center gap-3 cursor-pointer"
              >
                {/* Reading list check button if reading list */}
                {item.isReadingList && (
                  <button
                    onClick={(e) => handleToggleRead(e, item.id)}
                    className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                    title={item.isRead ? 'Mark as unread' : 'Mark as read'}
                  >
                    {item.isRead ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Circle className="w-4 h-4" />
                    )}
                  </button>
                )}

                {/* Favicon or Globe */}
                <div className="w-7 h-7 rounded-lg bg-background border border-border flex items-center justify-center shrink-0">
                  {item.favicon ? (
                    <img src={item.favicon} alt="" className="w-4 h-4 object-contain rounded-xs" />
                  ) : (
                    <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>

                {/* Title & URL */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p
                      className={`text-xs font-semibold truncate ${
                        item.isRead ? 'line-through text-muted-foreground opacity-75' : 'text-foreground'
                      }`}
                    >
                      {item.title}
                    </p>
                    {item.isReadingList && (
                      <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">
                        Read Later
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate font-mono mt-0.5 opacity-80">
                    {item.url}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleCopyUrl(e, item)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background border border-transparent hover:border-border transition-colors cursor-pointer"
                    title="Copy URL"
                  >
                    {copiedId === item.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, item.id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 transition-colors cursor-pointer"
                    title="Delete bookmark"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border bg-muted/20 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-muted-foreground flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono font-medium text-foreground">
              {modKey}+D
            </kbd>
            <span>bookmarks active tab instantly.</span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity shadow-xs cursor-pointer"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
