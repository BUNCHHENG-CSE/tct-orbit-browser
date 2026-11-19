import React, { useState, useMemo } from 'react'
import {
  Sparkles,
  Copy,
  Clock,
  ArrowUpDown,
  Check,
  Trash2,
  Globe,
  Layers
} from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import { toast } from 'sonner'
import { useTabs } from '@/hooks/useTabs'
import { useBrowserStore } from '@/store/useBrowserStore'
import { api } from '@/lib/ipc'
import type { Tab } from '@/types/api'

interface TabTidyPopoverProps {
  collapsed?: boolean
}

export const TabTidyPopover: React.FC<TabTidyPopoverProps> = ({ collapsed = false }) => {
  const [open, setOpen] = useState(false)
  const activeSpaceId = useBrowserStore((s) => s.activeSpaceId)
  const { tabs, activeTabId, removeTab } = useTabs(activeSpaceId)

  // 1. Calculate Duplicates
  const duplicateGroups = useMemo(() => {
    const urlMap = new Map<string, Tab[]>()
    tabs.forEach((tab) => {
      if (!tab.url || tab.url === 'about:blank') return
      try {
        const norm = tab.url.replace(/\/+$/, '').toLowerCase()
        const existing = urlMap.get(norm) || []
        existing.push(tab)
        urlMap.set(norm, existing)
      } catch {
        // ignore
      }
    })

    const dups: { url: string; tabs: Tab[] }[] = []
    urlMap.forEach((tabList, url) => {
      if (tabList.length > 1) {
        dups.push({ url, tabs: tabList })
      }
    })
    return dups
  }, [tabs])

  const totalDuplicateCount = duplicateGroups.reduce((acc, g) => acc + (g.tabs.length - 1), 0)

  // 2. Calculate Idle / Stale Tabs (> 24 hours)
  const idleTabs = useMemo(() => {
    const now = Date.now()
    const cutoff = now - 24 * 60 * 60 * 1000

    return tabs.filter((t) => {
      if (t.isPinned) return false // Never close pinned tabs
      if (t.id === activeTabId) return false // Never close active tab
      const visited = Date.parse(t.lastVisited as string) || Date.parse(t.createdAt as string)
      return !isNaN(visited) && visited < cutoff
    })
  }, [tabs, activeTabId])

  // 3. Domain summary
  const domainGroups = useMemo(() => {
    const dMap = new Map<string, number>()
    tabs.forEach((t) => {
      if (!t.url || t.url === 'about:blank') return
      try {
        const hostname = new URL(t.url).hostname.replace(/^www\./, '')
        dMap.set(hostname, (dMap.get(hostname) || 0) + 1)
      } catch {}
    })
    return Array.from(dMap.entries()).filter(([_, count]) => count > 1)
  }, [tabs])

  // Action: Close all duplicates, keeping either the active tab or the latest one
  const handleCloseDuplicates = async () => {
    let closed = 0
    duplicateGroups.forEach((group) => {
      // Find keeper: prefer activeTab, otherwise keeper is the last tab
      let keeperIndex = group.tabs.findIndex((t) => t.id === activeTabId)
      if (keeperIndex === -1) keeperIndex = group.tabs.length - 1

      group.tabs.forEach((t, i) => {
        if (i !== keeperIndex) {
          removeTab(t.id)
          closed++
        }
      })
    })

    toast.success(`Closed ${closed} duplicate tab${closed === 1 ? '' : 's'}`)
    setOpen(false)
  }

  // Action: Close idle tabs
  const handleCloseIdleTabs = async () => {
    let closed = 0
    idleTabs.forEach((t) => {
      removeTab(t.id)
      closed++
    })
    toast.success(`Archived ${closed} idle tab${closed === 1 ? '' : 's'}`)
    setOpen(false)
  }

  // Action: Sort tabs by domain
  const handleSortByDomain = async () => {
    if (!activeSpaceId) return

    const pinned = tabs.filter((t) => t.isPinned)
    const unpinned = [...tabs.filter((t) => !t.isPinned)]

    unpinned.sort((a, b) => {
      try {
        const hostA = new URL(a.url).hostname.replace(/^www\./, '')
        const hostB = new URL(b.url).hostname.replace(/^www\./, '')
        return hostA.localeCompare(hostB)
      } catch {
        return 0
      }
    })

    const newOrder = [...pinned, ...unpinned].map((t) => t.id)
    try {
      await api.tabs.reorder(activeSpaceId, newOrder)
      useBrowserStore.getState().setTabsForSpace(
        activeSpaceId,
        [...pinned, ...unpinned].map((t, idx) => ({ ...t, order: idx }))
      )
      toast.success('Tabs organized by domain')
      setOpen(false)
    } catch {
      toast.error('Failed to organize tabs')
    }
  }

  const hasTidyActions = totalDuplicateCount > 0 || idleTabs.length > 0 || domainGroups.length > 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`p-1 rounded-lg transition-colors cursor-pointer ${
            hasTidyActions
              ? 'text-primary hover:bg-primary/15'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
          title="Tidy Tabs (Organize, deduplicate, and clean)"
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align={collapsed ? 'start' : 'end'}
        sideOffset={6}
        className="w-72 p-3 rounded-2xl bg-popover text-popover-foreground border border-border shadow-2xl space-y-3 z-50 select-none"
      >
        <div className="flex items-center justify-between border-b border-border pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold text-foreground">Tidy Tabs</span>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
            {tabs.length} total
          </span>
        </div>

        <div className="space-y-2 text-xs">
          {/* Action 1: Duplicate Cleaner */}
          <div className="p-2.5 rounded-xl bg-muted/40 border border-border space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Duplicate Tabs</span>
              </div>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  totalDuplicateCount > 0
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {totalDuplicateCount} extra
              </span>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {totalDuplicateCount > 0
                ? `Found ${totalDuplicateCount} duplicate open tab${totalDuplicateCount === 1 ? '' : 's'}.`
                : 'No duplicate tabs found in this space.'}
            </p>

            {totalDuplicateCount > 0 && (
              <button
                onClick={handleCloseDuplicates}
                className="w-full py-1.5 px-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer mt-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Close All Duplicates</span>
              </button>
            )}
          </div>

          {/* Action 2: Idle Tabs Cleaner (>24h) */}
          <div className="p-2.5 rounded-xl bg-muted/40 border border-border space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Idle Tabs (&gt;24h)</span>
              </div>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  idleTabs.length > 0
                    ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {idleTabs.length} idle
              </span>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {idleTabs.length > 0
                ? `${idleTabs.length} unpinned tab${idleTabs.length === 1 ? '' : 's'} untouched for 24+ hours.`
                : 'All open tabs were visited recently.'}
            </p>

            {idleTabs.length > 0 && (
              <button
                onClick={handleCloseIdleTabs}
                className="w-full py-1.5 px-2 rounded-lg bg-muted hover:bg-destructive/15 hover:text-destructive text-foreground text-xs font-medium border border-border transition-colors flex items-center justify-center gap-1.5 cursor-pointer mt-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Close Idle Tabs</span>
              </button>
            )}
          </div>

          {/* Action 3: Sort by Domain */}
          <div className="p-2.5 rounded-xl bg-muted/40 border border-border space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Group by Domain</span>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Reorder open tabs so pages from the same website sit side-by-side.
            </p>

            <button
              onClick={handleSortByDomain}
              className="w-full py-1.5 px-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium border border-border transition-colors flex items-center justify-center gap-1.5 cursor-pointer mt-1"
            >
              <ArrowUpDown className="w-3 h-3 text-primary" />
              <span>Organize Tabs by Domain</span>
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
