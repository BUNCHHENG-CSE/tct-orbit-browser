import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import {
  History,
  Search,
  Trash2,
  ExternalLink,
  Copy,
  Globe,
  Clock,
  Layers,
  X,
  Filter,
  Check,
  Calendar,
  AlertTriangle,
  ChevronDown
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/ipc'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useSpaces } from '@/hooks/useSpaces'
import { useTabs } from '@/hooks/useTabs'
import { modKey } from '@/lib/platform'
import type { HistoryEntry, HistoryClearRange } from '@/types/api'

interface HistoryDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export const HistoryDialog: React.FC<HistoryDialogProps> = ({
  open: propOpen,
  onOpenChange: propOnOpenChange
}) => {
  const storeOpen = useBrowserStore((s) => s.historyDialogOpen)
  const setStoreOpen = useBrowserStore((s) => s.setHistoryDialogOpen)

  const isOpen = propOpen !== undefined ? propOpen : storeOpen
  const setIsOpen = propOnOpenChange || setStoreOpen

  const { spaces, activeSpaceId } = useSpaces()
  const { createTab, setActiveTab } = useTabs(activeSpaceId)

  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week'>('all')

  // Clear confirmation modal state
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [clearRange, setClearRange] = useState<HistoryClearRange>('today')
  const [clearing, setClearing] = useState(false)

  // Load history records from IPC
  const fetchHistory = useCallback(async () => {
    if (!api.history?.getHistory) return
    setLoading(true)
    try {
      const res = await api.history.getHistory({
        query: searchQuery.trim() || undefined,
        spaceId: selectedSpaceId !== 'all' ? selectedSpaceId : undefined,
        limit: 300
      })
      setEntries(res?.entries || [])
    } catch (err) {
      console.error('[History] Failed to load history:', err)
      toast.error('Failed to load browsing history.')
    } finally {
      setLoading(false)
    }
  }, [searchQuery, selectedSpaceId])

  useEffect(() => {
    if (isOpen) {
      fetchHistory()
    }
  }, [isOpen, fetchHistory])

  // Listen for global 'open-history' event
  useEffect(() => {
    const handleOpenHistory = () => {
      setIsOpen(true)
    }
    window.addEventListener('open-history', handleOpenHistory)
    return () => window.removeEventListener('open-history', handleOpenHistory)
  }, [setIsOpen])

  // Delete an individual history item
  const handleDeleteItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    try {
      if (api.history?.deleteItem) {
        await api.history.deleteItem(id)
        setEntries((prev) => prev.filter((item) => item.id !== id))
        toast.success('Removed from history')
      }
    } catch {
      toast.error('Failed to remove item')
    }
  }

  // Copy URL to clipboard
  const handleCopyUrl = (e: React.MouseEvent, url: string) => {
    e.stopPropagation()
    navigator.clipboard.writeText(url)
    toast.success('URL copied to clipboard')
  }

  // Open URL in active space or as a new tab
  const handleOpenUrl = async (url: string, newTab = false) => {
    setIsOpen(false)
    if (!activeSpaceId) return

    if (newTab) {
      try {
        const tab = await createTab({
          spaceId: activeSpaceId,
          url,
          title: 'Loading...'
        })
        setActiveTab(tab.id)
      } catch (err) {
        console.error('Failed to open tab from history:', err)
      }
    } else {
      window.dispatchEvent(
        new CustomEvent('tct:webview-navigate', {
          detail: { url }
        })
      )
    }
  }

  // Confirm clear history
  const handleConfirmClear = async () => {
    setClearing(true)
    try {
      if (api.history?.clearHistory) {
        await api.history.clearHistory(clearRange)
        await fetchHistory()
        setClearDialogOpen(false)
        toast.success('Browsing history cleared')
      }
    } catch {
      toast.error('Failed to clear history')
    } finally {
      setClearing(false)
    }
  }

  // Filter entries by date filter tabs
  const filteredEntries = useMemo(() => {
    if (dateFilter === 'all') return entries

    const now = new Date()
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const yesterdayMidnight = todayMidnight - 24 * 60 * 60 * 1000
    const weekAgo = todayMidnight - 7 * 24 * 60 * 60 * 1000

    return entries.filter((item) => {
      const itemTime = Date.parse(item.visitedAt)
      if (isNaN(itemTime)) return false

      if (dateFilter === 'today') {
        return itemTime >= todayMidnight
      }
      if (dateFilter === 'yesterday') {
        return itemTime >= yesterdayMidnight && itemTime < todayMidnight
      }
      if (dateFilter === 'week') {
        return itemTime >= weekAgo
      }
      return true
    })
  }, [entries, dateFilter])

  // Group entries chronologically by calendar date
  const groupedEntries = useMemo(() => {
    const groups: { label: string; date: string; items: HistoryEntry[] }[] = []
    const now = new Date()
    const todayStr = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10)

    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const yesterdayStr = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()).toISOString().slice(0, 10)

    filteredEntries.forEach((item) => {
      const dateKey = item.visitedAt ? item.visitedAt.slice(0, 10) : 'Unknown'
      let label = dateKey
      if (dateKey === todayStr) {
        label = 'Today'
      } else if (dateKey === yesterdayStr) {
        label = 'Yesterday'
      } else {
        try {
          const d = new Date(dateKey)
          label = d.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'short',
            day: 'numeric'
          })
        } catch {
          label = dateKey
        }
      }

      let group = groups.find((g) => g.date === dateKey)
      if (!group) {
        group = { label, date: dateKey, items: [] }
        groups.push(group)
      }
      group.items.push(item)
    })

    return groups
  }, [filteredEntries])

  // Helper to format time (e.g. 10:42 AM)
  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString)
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  // Get space metadata for badge
  const getSpaceMeta = (spaceId?: string) => {
    if (!spaceId) return null
    return spaces.find((s) => s.id === spaceId)
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          className="max-w-3xl w-[92vw] h-[82vh] max-h-[750px] p-0 flex flex-col rounded-3xl bg-background border border-border shadow-2xl overflow-hidden z-50"
        >
          {/* Header */}
          <DialogHeader className="px-6 pt-5 pb-3.5 border-b border-border shrink-0 flex flex-row items-center justify-between space-y-0 pr-14">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
                <History className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2.5">
                  <span>Browsing History</span>
                  <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-muted/80 text-muted-foreground border border-border/50">
                    {filteredEntries.length} {filteredEntries.length === 1 ? 'visit' : 'visits'}
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Search, review, and manage your local browsing activity.
                </DialogDescription>
              </div>
            </div>

            {/* Clear History Button (Safely offset from top-right close X) */}
            <button
              onClick={() => setClearDialogOpen(true)}
              className="px-3 py-1.5 rounded-xl border border-border/80 bg-muted/40 hover:bg-destructive/15 hover:border-destructive/40 hover:text-destructive text-muted-foreground text-xs font-medium flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear History</span>
            </button>
          </DialogHeader>

          {/* Search & Filter Toolbar */}
          <div className="px-6 py-3 border-b border-border bg-muted/15 flex flex-wrap items-center gap-3 shrink-0">
            {/* Search Input */}
            <div className="flex-1 min-w-[260px] relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search history by title, domain, or URL..."
                className="w-full h-9 pl-10 pr-9 rounded-xl bg-background border border-border text-foreground text-xs placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all shadow-2xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Custom Styled Space Filter */}
            {spaces.length > 0 && (
              <div className="relative flex items-center">
                <Layers className="w-3.5 h-3.5 absolute left-3 text-muted-foreground pointer-events-none" />
                <select
                  value={selectedSpaceId}
                  onChange={(e) => setSelectedSpaceId(e.target.value)}
                  className="h-9 pl-9 pr-8 rounded-xl bg-background border border-border text-xs font-medium text-foreground outline-none cursor-pointer hover:bg-muted/40 transition-colors appearance-none focus:ring-2 focus:ring-primary/25 focus:border-primary shadow-2xs"
                >
                  <option value="all">All Spaces</option>
                  {spaces.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 text-muted-foreground pointer-events-none opacity-60" />
              </div>
            )}

            {/* Quick Date Range Pills */}
            <div className="h-9 flex items-center gap-0.5 p-1 bg-muted/50 rounded-xl border border-border text-[11px] select-none">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'today', label: 'Today' },
                  { id: 'yesterday', label: 'Yesterday' },
                  { id: 'week', label: 'Last 7 Days' }
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDateFilter(tab.id)}
                  className={`h-7 px-3 rounded-lg transition-all font-medium cursor-pointer flex items-center justify-center ${
                    dateFilter === tab.id
                      ? 'bg-background text-foreground shadow-2xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Timeline List Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {loading ? (
              <div className="h-48 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Clock className="w-6 h-6 animate-spin text-primary" />
                <span className="text-xs">Loading browsing history...</span>
              </div>
            ) : groupedEntries.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 select-none">
                <div className="w-14 h-14 rounded-3xl bg-muted/50 border border-border/80 flex items-center justify-center text-muted-foreground/70 mb-3 shadow-inner">
                  <History className="w-7 h-7" />
                </div>
                <h3 className="text-sm font-semibold text-foreground tracking-tight mb-1">
                  {searchQuery ? 'No Matching History Found' : 'No Browsing History Yet'}
                </h3>
                <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                  {searchQuery
                    ? `No visits matched "${searchQuery}". Try a different keyword or filter.`
                    : 'Pages you visit across your Spaces will appear here.'}
                </p>
              </div>
            ) : (
              groupedEntries.map((group) => (
                <div key={group.date} className="space-y-2">
                  {/* Date Header */}
                  <div className="sticky -top-4 z-10 flex items-center gap-2 pt-4 pb-1.5 -mt-4 bg-background">
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                      {group.label}
                    </span>
                    <div className="flex-1 h-[1px] bg-border/60" />
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>

                  {/* History Cards */}
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const spaceMeta = getSpaceMeta(item.spaceId)
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleOpenUrl(item.url, false)}
                          className="group flex items-center justify-between gap-3 px-3 py-2 rounded-xl hover:bg-muted/60 border border-transparent hover:border-border transition-all cursor-pointer"
                        >
                          {/* Left: Favicon + Time + Title & URL */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="text-[11px] text-muted-foreground/75 font-mono w-14 shrink-0 select-none">
                              {formatTime(item.visitedAt)}
                            </span>

                            {/* Favicon */}
                            <div className="w-5 h-5 rounded-md bg-muted/80 flex items-center justify-center shrink-0 overflow-hidden">
                              {item.favicon ? (
                                <img
                                  src={item.favicon}
                                  alt=""
                                  className="w-3.5 h-3.5 object-contain rounded-2xs"
                                  onError={(e) => {
                                    ;(e.target as HTMLElement).style.display = 'none'
                                  }}
                                />
                              ) : (
                                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                            </div>

                            {/* Title & Domain */}
                            <div className="min-w-0 flex-1 flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                                  {item.title || item.url}
                                </span>
                                {item.visitCount > 1 && (
                                  <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded-md bg-muted text-muted-foreground select-none shrink-0">
                                    {item.visitCount}x
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-muted-foreground truncate font-mono">
                                {item.url}
                              </span>
                            </div>
                          </div>

                          {/* Right: Space Badge + Quick Actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            {spaceMeta && (
                              <span
                                className="text-[10px] font-medium px-2 py-0.5 rounded-full select-none flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity"
                                style={{
                                  backgroundColor: `${spaceMeta.color}20`,
                                  color: spaceMeta.color
                                }}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: spaceMeta.color }}
                                />
                                {spaceMeta.name}
                              </span>
                            )}

                            {/* Quick Action Buttons */}
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => handleCopyUrl(e, item.url)}
                                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title="Copy URL"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleOpenUrl(item.url, true)
                                }}
                                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title="Open in New Tab"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => handleDeleteItem(e, item.id)}
                                className="p-1.5 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                                title="Delete from history"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground shrink-0 select-none">
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-0.5 rounded-md bg-muted border border-border text-[11px] font-mono font-semibold text-foreground shadow-2xs">
                {modKey}+H
              </kbd>
              <span className="text-xs text-muted-foreground">
                opens browsing history anytime
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="px-4 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium transition-colors shadow-xs cursor-pointer"
            >
              Done
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for Clearing Browsing History */}
      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl bg-background border border-border shadow-2xl p-6 z-50">
          <DialogHeader className="space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-1">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <DialogTitle className="text-base font-bold text-foreground">
              Clear Browsing History
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Choose the time range of browsing history you want to remove. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-2">
            {(
              [
                { id: 'last-hour', title: 'Last Hour' },
                { id: 'today', title: 'Today' },
                { id: 'last-7-days', title: 'Last 7 Days' },
                { id: 'all', title: 'All Time (Everything)' }
              ] as const
            ).map((opt) => (
              <label
                key={opt.id}
                onClick={() => setClearRange(opt.id)}
                className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-colors ${
                  clearRange === opt.id
                    ? 'border-destructive bg-destructive/5 text-foreground font-medium'
                    : 'border-border bg-muted/30 hover:bg-muted/60 text-muted-foreground'
                }`}
              >
                <span className="text-xs">{opt.title}</span>
                {clearRange === opt.id && <Check className="w-4 h-4 text-destructive" />}
              </label>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setClearDialogOpen(false)}
              disabled={clearing}
              className="px-4 py-2 rounded-xl border border-border hover:bg-muted text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmClear}
              disabled={clearing}
              className="px-4 py-2 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-medium transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{clearing ? 'Clearing...' : 'Clear History'}</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
