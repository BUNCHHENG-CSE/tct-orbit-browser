import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import {
  Activity,
  Search,
  RefreshCw,
  XCircle,
  Globe,
  Sliders,
  X,
  Zap,
  Shield,
  Network,
  Lock,
  Loader2,
  Moon,
  Copy,
  ArrowUp,
  ArrowDown,
  AppWindow
} from 'lucide-react'
import { api } from '@/lib/ipc'
import { useBrowserStore } from '@/store/useBrowserStore'
import { extractDomain } from '@/lib/domainZoom'
import { isStartPageUrl } from '@/lib/startPage'
import { toast } from 'sonner'
import { ToolHeader, Segmented, toolDialogClass } from '@/components/ui/tool-dialog'
import type { ProcessMetricInfo, SystemMetricsResult, Tab } from '@/types/api'

type CategoryFilter = 'all' | 'tabs' | 'system'

const formatMB = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`)
type SortField = 'memory' | 'cpu' | 'pid'

export const TaskManagerDialog: React.FC = () => {
  const isOpen = useBrowserStore((s) => s.taskManagerOpen)
  const setIsOpen = useBrowserStore((s) => s.setTaskManagerOpen)
  const tabsBySpace = useBrowserStore((s) => s.tabsBySpace)

  const [metrics, setMetrics] = useState<SystemMetricsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [sortBy, setSortBy] = useState<SortField>('memory')
  const [sortAsc, setSortAsc] = useState(false)
  const [terminatingPid, setTerminatingPid] = useState<number | null>(null)
  const [cleaningRam, setCleaningRam] = useState(false)
  const [faviconErrors, setFaviconErrors] = useState<Record<string, boolean>>({})

  // Flat list of all open tabs across spaces
  const allTabs = useMemo<Tab[]>(() => {
    return Object.values(tabsBySpace).flat()
  }, [tabsBySpace])

  const fetchMetrics = useCallback(async () => {
    if (!api.system?.getProcessMetrics) return
    try {
      const data = await api.system.getProcessMetrics()
      if (data) {
        setMetrics(data)
      }
    } catch (err) {
      console.error('Failed to get process metrics:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleTrimMemory = async () => {
    if (!api.system?.trimMemory || cleaningRam) return
    setCleaningRam(true)
    try {
      const ok = await api.system.trimMemory()
      await new Promise((r) => setTimeout(r, 500))
      await fetchMetrics()
      if (ok) {
        toast.success('RAM Trimmed & Optimized', {
          description: 'Flushed Chromium caches and triggered V8 garbage collection across all processes.'
        })
      }
    } catch (err) {
      console.error('Failed to trim memory:', err)
      toast.error('Failed to trim memory')
    } finally {
      setCleaningRam(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    fetchMetrics()

    const interval = setInterval(() => {
      fetchMetrics()
    }, 1500)

    return () => clearInterval(interval)
  }, [isOpen, fetchMetrics])

  const handleEndTask = async (p: ProcessMetricInfo) => {
    if (!api.system?.killProcess) return
    setTerminatingPid(p.pid)
    try {
      const success = await api.system.killProcess({
        pid: p.pid,
        webContentsId: p.webContentsId
      })
      if (success) {
        toast.success(`Ended ${p.title || p.type}`, {
          description: `Freed ${p.memoryMB} MB of memory.`
        })
        await fetchMetrics()
      } else {
        toast.error('Failed to terminate process')
      }
    } catch {
      toast.error('Failed to terminate process')
    } finally {
      setTerminatingPid(null)
    }
  }

  const handleSortToggle = (field: SortField) => {
    if (sortBy === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortBy(field)
      setSortAsc(false)
    }
  }

  // Enriched processes with tab matching and metadata
  const enrichedProcesses = useMemo(() => {
    if (!metrics?.processes) return []

    return metrics.processes.map((p) => {
      let matchingTab = allTabs.find((t) => p.url && t.url === p.url)
      if (!matchingTab && p.title) {
        matchingTab = allTabs.find((t) => t.title === p.title)
      }

      let favicon: string | null = matchingTab?.favicon || null
      if (!favicon && p.url) {
        try {
          const origin = new URL(p.url).origin
          favicon = `${origin}/favicon.ico`
        } catch {}
      }

      // Prettify process descriptions
      let friendlyTitle = p.title || p.type
      let subtitle = p.url || ''
      let category = p.type

      if (p.type === 'Browser') {
        friendlyTitle = 'Browser Main Process'
        subtitle = 'Window shell, IPC router & session state'
        category = 'Host'
      } else if (p.type === 'GPU') {
        friendlyTitle = 'GPU Process (Direct3D / Compositor)'
        subtitle = 'Hardware acceleration & rasterization'
        category = 'GPU'
      } else if (p.type === 'Utility') {
        friendlyTitle = 'Utility & Network Service'
        subtitle = 'DNS-over-HTTPS, audio, and network stack'
        category = 'Utility'
      } else if (p.isWorker) {
        friendlyTitle = 'Background worker'
        subtitle = 'Service worker, extension or a renderer kept ready for the next tab'
        category = 'Worker'
      } else if (p.isAppUi) {
        friendlyTitle = 'TCT Orbit Interface'
        subtitle = 'Sidebar, toolbar, menus and start page'
        category = 'Interface'
      } else if (p.isTab) {
        category = 'Tab'
      }

      return {
        ...p,
        friendlyTitle,
        subtitle,
        category,
        favicon,
        spaceId: matchingTab?.spaceId
      }
    })
  }, [metrics, allTabs])

  // Counts for filter pills
  const counts = useMemo(() => {
    const tabsCount = enrichedProcesses.filter((p) => p.isTab).length
    const systemCount = enrichedProcesses.filter((p) => !p.isTab).length
    return {
      all: enrichedProcesses.length,
      tabs: tabsCount,
      system: systemCount
    }
  }, [enrichedProcesses])

  // Filtered and sorted processes
  const filteredProcesses = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()

    return enrichedProcesses
      .filter((p) => {
        // Category filter
        if (categoryFilter === 'tabs' && !p.isTab) return false
        if (categoryFilter === 'system' && p.isTab) return false

        // Search filter
        if (!q) return true
        return (
          p.friendlyTitle.toLowerCase().includes(q) ||
          p.subtitle.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.pid.toString().includes(q)
        )
      })
      .sort((a, b) => {
        let diff = 0
        if (sortBy === 'memory') {
          diff = b.memoryMB - a.memoryMB
        } else if (sortBy === 'cpu') {
          diff = b.cpuPercent - a.cpuPercent
        } else if (sortBy === 'pid') {
          diff = b.pid - a.pid
        }
        return sortAsc ? -diff : diff
      })
  }, [enrichedProcesses, categoryFilter, searchQuery, sortBy, sortAsc])

  // Plain-language suggestions: idle tabs that still hold memory, and the same page open twice
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const splitTabId = useBrowserStore((s) => s.splitTabId)
  const [dismissed, setDismissed] = useState<{ idle: boolean; dupes: boolean }>({ idle: false, dupes: false })
  const suggestions = useMemo(() => {
    const now = Date.now()
    const IDLE_MS = 60 * 60_000
    const memByUrl = new Map<string, number>()
    for (const p of enrichedProcesses) {
      if (p.isTab && p.url) memByUrl.set(p.url, (memByUrl.get(p.url) || 0) + p.memoryMB)
    }

    const idle = allTabs
      .filter(
        (t) =>
          t.id !== activeTabId &&
          t.id !== splitTabId &&
          !t.isPinned &&
          !t.isAudible &&
          !t.isSleeping &&
          !isStartPageUrl(t.url) &&
          now - (new Date(t.lastVisited || t.createdAt).getTime() || now) > IDLE_MS
      )
      .map((t) => ({ tab: t, mb: memByUrl.get(t.url) || 0 }))
      .filter((x) => x.mb > 0)
      .sort((a, b) => b.mb - a.mb)
    const idleMB = idle.reduce((n, x) => n + x.mb, 0)

    // Same page (ignoring #fragment) open more than once in a space: keep the active / most recent
    const dupes: Tab[] = []
    const bySpace = new Map<string, Map<string, Tab[]>>()
    for (const t of allTabs) {
      if (isStartPageUrl(t.url) || t.isPinned) continue
      const key = t.url.split('#')[0]
      const space = bySpace.get(t.spaceId) || new Map<string, Tab[]>()
      space.set(key, [...(space.get(key) || []), t])
      bySpace.set(t.spaceId, space)
    }
    for (const space of bySpace.values()) {
      for (const group of space.values()) {
        if (group.length < 2) continue
        const keep =
          group.find((t) => t.id === activeTabId || t.id === splitTabId) ||
          [...group].sort((a, b) => new Date(b.lastVisited).getTime() - new Date(a.lastVisited).getTime())[0]
        dupes.push(...group.filter((t) => t.id !== keep.id && t.id !== activeTabId && t.id !== splitTabId))
      }
    }
    return { idle, idleMB, dupes }
  }, [enrichedProcesses, allTabs, activeTabId, splitTabId])

  const sleepIdleTabs = () => {
    const store = useBrowserStore.getState()
    for (const { tab } of suggestions.idle) store.setTabSleeping(tab.id, true)
    toast.success(`${suggestions.idle.length} tab${suggestions.idle.length === 1 ? '' : 's'} put to sleep`, {
      description: `About ${formatMB(suggestions.idleMB)} freed. They wake up when you click them.`
    })
    setTimeout(() => void fetchMetrics(), 1200)
  }

  const closeDuplicates = () => {
    const store = useBrowserStore.getState()
    const list = suggestions.dupes
    for (const t of list) {
      store.removeTabFromStore(t.id)
      api.tabs.remove(t.id).catch(() => {})
    }
    toast.success(`Closed ${list.length} duplicate tab${list.length === 1 ? '' : 's'}`)
  }

  // Calculations for system memory breakdown gauge
  const totalSystemMB = metrics?.systemTotalMemoryMB || 16384
  const orbitMB = metrics?.totalAppMemoryMB || 0
  const freeMB = metrics?.systemFreeMemoryMB || 0
  const otherAppsMB = Math.max(0, Math.round(totalSystemMB - orbitMB - freeMB))

  const orbitPercent = Math.min(100, Math.round((orbitMB / totalSystemMB) * 1000) / 10)
  const freePercent = Math.min(100, Math.round((freeMB / totalSystemMB) * 1000) / 10)
  const otherPercent = Math.max(0, Math.round((100 - orbitPercent - freePercent) * 10) / 10)

  const sortHeader = (field: SortField, label: string, align: 'left' | 'right' = 'right', width = 'w-24') => (
    <button
      onClick={() => handleSortToggle(field)}
      className={`${width} shrink-0 flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'} hover:text-foreground transition-colors cursor-pointer ${
        sortBy === field ? 'text-foreground' : ''
      }`}
    >
      {label}
      {sortBy === field && (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
    </button>
  )

  const showIdleTip = !dismissed.idle && suggestions.idle.length > 0 && suggestions.idleMB >= 150
  const showDupesTip = !dismissed.dupes && suggestions.dupes.length > 0
  const maxProcessMB = Math.max(1, ...enrichedProcesses.map((p) => p.memoryMB))

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className={`max-w-[880px] max-h-[86vh] flex flex-col ${toolDialogClass}`}>
        <ToolHeader
          icon={Activity}
          title="Task Manager"
          badge={
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
            </span>
          }
          description={
            <>
              Memory and CPU used by each tab and part of TCT Orbit.{' '}
              <kbd className="ml-0.5 px-1.5 py-px rounded bg-muted ring-1 ring-border font-mono text-[10px] text-muted-foreground">Shift+Esc</kbd>
            </>
          }
          TitleAs={DialogTitle}
          DescriptionAs={DialogDescription}
          actions={
            <>
              <button
                onClick={handleTrimMemory}
                disabled={cleaningRam}
                title="Flush caches and run garbage collection in every tab"
                className="h-8 px-3 rounded-lg bg-primary/10 hover:bg-primary/15 text-primary text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {cleaningRam ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                Free up memory
              </button>
              <button
                onClick={() => {
                  setLoading(true)
                  fetchMetrics()
                }}
                title="Refresh"
                aria-label="Refresh"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </>
          }
        />

        {/* Overview: one memory bar + key numbers */}
        {metrics && (
          <div className="px-5 pb-4 select-none">
            <div className="grid grid-cols-3 gap-px rounded-xl overflow-hidden ring-1 ring-border bg-border">
              <Stat label="TCT Orbit" value={formatMB(orbitMB)} sub={`${orbitPercent}% of memory · ${metrics.processes.length} processes`} dot="bg-primary" />
              <Stat label="Available" value={formatMB(freeMB)} sub={`of ${formatMB(totalSystemMB)} installed`} dot="bg-emerald-500" />
              <Stat
                label="Open tabs"
                value={String(counts.tabs)}
                sub={`${allTabs.filter((t) => t.isSleeping).length} sleeping · ${counts.system} system processes`}
                dot="bg-amber-500"
              />
            </div>
            <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden flex" aria-hidden>
              <div className="h-full bg-primary transition-all duration-500" style={{ width: `${Math.max(1.5, orbitPercent)}%` }} title={`TCT Orbit: ${formatMB(orbitMB)}`} />
              <div className="h-full bg-muted-foreground/30 transition-all duration-500" style={{ width: `${otherPercent}%` }} title={`Other apps: ${formatMB(otherAppsMB)}`} />
              <div className="h-full bg-emerald-500/80 transition-all duration-500" style={{ width: `${freePercent}%` }} title={`Available: ${formatMB(freeMB)}`} />
            </div>
            <div className="mt-1.5 flex items-center gap-4 text-[11px] text-muted-foreground">
              <Legend dot="bg-primary" label="TCT Orbit" />
              <Legend dot="bg-muted-foreground/40" label={`Other apps ${formatMB(otherAppsMB)}`} />
              <Legend dot="bg-emerald-500" label="Available" />
            </div>
          </div>
        )}

        {/* Suggestions */}
        {(showIdleTip || showDupesTip) && (
          <div className="px-5 pb-4 space-y-2 select-none">
            {showIdleTip && (
              <Tip
                icon={Moon}
                tone="amber"
                title={`${suggestions.idle.length} tab${suggestions.idle.length === 1 ? '' : 's'} you haven't used in over an hour ${
                  suggestions.idle.length === 1 ? 'is' : 'are'
                } using ${formatMB(suggestions.idleMB)}`}
                detail={
                  suggestions.idle
                    .slice(0, 3)
                    .map((x) => `${x.tab.title || extractDomain(x.tab.url)} (${formatMB(x.mb)})`)
                    .join(' · ') + (suggestions.idle.length > 3 ? ` · +${suggestions.idle.length - 3} more` : '')
                }
                action="Sleep them"
                onAction={sleepIdleTabs}
                onDismiss={() => setDismissed((d) => ({ ...d, idle: true }))}
              />
            )}
            {showDupesTip && (
              <Tip
                icon={Copy}
                tone="primary"
                title={`${suggestions.dupes.length} duplicate tab${suggestions.dupes.length === 1 ? '' : 's'}: the same page is open more than once`}
                detail={Array.from(new Set(suggestions.dupes.map((t) => t.title || extractDomain(t.url)))).slice(0, 3).join(' · ')}
                action="Close duplicates"
                onAction={closeDuplicates}
                onDismiss={() => setDismissed((d) => ({ ...d, dupes: true }))}
              />
            )}
          </div>
        )}

        {/* Toolbar */}
        <div className="px-5 py-2.5 border-y border-border flex items-center gap-3 select-none">
          <Segmented
            size="sm"
            className="w-auto"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: 'all', label: 'All', hint: String(counts.all) },
              { value: 'tabs', label: 'Tabs', hint: String(counts.tabs) },
              { value: 'system', label: 'System', hint: String(counts.system) }
            ]}
          />
          <div className="relative flex-1 max-w-xs ml-auto">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by name, URL or PID"
              className="w-full h-8 pl-8 pr-7 text-xs rounded-lg bg-background ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/60 text-foreground placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="Clear filter"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Column headers */}
        <div className="px-5 h-8 flex items-center gap-4 text-[11px] font-medium text-muted-foreground border-b border-border bg-muted/20 select-none">
          <div className="flex-1 min-w-0">Name</div>
          {sortHeader('memory', 'Memory', 'right', 'w-36')}
          {sortHeader('cpu', 'CPU')}
          {sortHeader('pid', 'PID', 'right', 'w-16')}
          <div className="w-20 shrink-0" />
        </div>

        {/* Rows */}
        <div className="flex-1 min-h-0 overflow-y-auto" data-lenis-prevent>
          {filteredProcesses.length === 0 ? (
            <div className="py-14 text-center">
              <Activity className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">{searchQuery ? `Nothing matches "${searchQuery}"` : 'Loading processes…'}</p>
            </div>
          ) : (
            filteredProcesses.map((p) => {
              const isTerminating = terminatingPid === p.pid
              // Only web page tabs can be ended; everything else just restarts or crashes the browser
              // (An older main process doesn't send `killable`: fall back to "tabs can be ended")
              const isProtected = p.killable === undefined ? !p.isTab : !p.killable
              const hasHighMemory = p.memoryMB > 450
              const hasHighCpu = p.cpuPercent > 10
              const showFavicon = p.favicon && !faviconErrors[p.pid]
              const memShare = p.memoryMB / maxProcessMB

              return (
                <div key={p.pid} className="group px-5 h-[52px] flex items-center gap-4 border-b border-border/50 last:border-b-0 hover:bg-muted/40 transition-colors">
                  {/* Identity */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-7 h-7 rounded-lg bg-muted ring-1 ring-border/60 flex items-center justify-center shrink-0 overflow-hidden">
                      {p.isTab ? (
                        showFavicon ? (
                          <img
                            src={p.favicon!}
                            alt=""
                            onError={() => setFaviconErrors((prev) => ({ ...prev, [p.pid]: true }))}
                            className="w-4 h-4 object-contain"
                          />
                        ) : (
                          <Globe className="w-3.5 h-3.5 text-primary" />
                        )
                      ) : p.type === 'GPU' ? (
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                      ) : p.isAppUi ? (
                        <AppWindow className="w-3.5 h-3.5 text-primary" />
                      ) : p.type === 'Browser' ? (
                        <Shield className="w-3.5 h-3.5 text-primary" />
                      ) : (
                        <Sliders className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[13px] font-medium text-foreground truncate">{p.friendlyTitle}</span>
                        <span
                          className={`shrink-0 text-[10px] px-1.5 py-px rounded font-medium ${
                            p.isTab
                              ? 'bg-primary/10 text-primary'
                              : p.type === 'GPU'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {p.category}
                        </span>
                      </div>
                      {p.subtitle && <div className="text-[11px] text-muted-foreground truncate mt-0.5">{p.subtitle}</div>}
                    </div>
                  </div>

                  {/* Memory with a share bar (relative to the biggest process) */}
                  <div className="w-36 shrink-0 flex items-center gap-2 justify-end">
                    <div className="w-14 h-1 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${hasHighMemory ? 'bg-amber-500' : 'bg-primary/70'}`} style={{ width: `${Math.max(4, memShare * 100)}%` }} />
                    </div>
                    <span className={`w-[68px] text-right text-xs tabular-nums ${hasHighMemory ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-foreground'}`}>
                      {formatMB(p.memoryMB)}
                    </span>
                  </div>

                  <div className={`w-24 shrink-0 text-right text-xs tabular-nums ${hasHighCpu ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-foreground'}`}>
                    {p.cpuPercent}%
                  </div>

                  <div className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground font-mono">{p.pid}</div>

                  {/* Action: quiet until the row is hovered */}
                  <div className="w-20 shrink-0 flex justify-end">
                    {isProtected ? (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70"
                        title="Part of the browser itself: ending it would only restart it or close the window, and frees no memory"
                      >
                        <Lock className="w-3 h-3" /> Protected
                      </span>
                    ) : (
                      <button
                        onClick={() => handleEndTask(p)}
                        disabled={isTerminating}
                        title={p.isTab ? 'End this tab (it reloads when you open it)' : 'End this process'}
                        className="h-7 px-2.5 rounded-md text-xs font-medium text-muted-foreground opacity-60 group-hover:opacity-100 hover:text-white hover:bg-rose-600 ring-1 ring-border hover:ring-rose-600 transition-all flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                      >
                        {isTerminating ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                        End
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-border bg-muted/25 flex items-center justify-between text-[11px] text-muted-foreground select-none">
          <span>Ending a tab frees its memory; the tab reloads when you open it again.</span>
          <span className="tabular-nums">
            {filteredProcesses.length} of {enrichedProcesses.length} shown
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const Stat: React.FC<{ label: string; value: string; sub: string; dot: string }> = ({ label, value, sub, dot }) => (
  <div className="bg-popover px-4 py-3 min-w-0">
    <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </div>
    <div className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-foreground">{value}</div>
    <div className="text-[11px] text-muted-foreground truncate mt-0.5">{sub}</div>
  </div>
)

const Legend: React.FC<{ dot: string; label: string }> = ({ dot, label }) => (
  <span className="flex items-center gap-1.5">
    <span className={`w-2 h-2 rounded-full ${dot}`} />
    {label}
  </span>
)

const Tip: React.FC<{
  icon: React.ComponentType<{ className?: string }>
  tone: 'amber' | 'primary'
  title: string
  detail: string
  action: string
  onAction: () => void
  onDismiss: () => void
}> = ({ icon: Icon, tone, title, detail, action, onAction, onDismiss }) => (
  <div className={`flex items-center gap-3 pl-3 pr-2 py-2.5 rounded-xl ring-1 ${tone === 'amber' ? 'bg-amber-500/5 ring-amber-500/20' : 'bg-primary/5 ring-primary/20'}`}>
    <Icon className={`w-4 h-4 shrink-0 ${tone === 'amber' ? 'text-amber-500' : 'text-primary'}`} />
    <div className="flex-1 min-w-0">
      <p className="text-xs font-medium text-foreground truncate">{title}</p>
      <p className="text-[11px] text-muted-foreground truncate">{detail}</p>
    </div>
    <button
      onClick={onAction}
      className={`shrink-0 h-7 px-3 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
        tone === 'amber' ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-400' : 'bg-primary/15 hover:bg-primary/25 text-primary'
      }`}
    >
      {action}
    </button>
    <button onClick={onDismiss} className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer" aria-label="Dismiss">
      <X className="w-3.5 h-3.5" />
    </button>
  </div>
)
