import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import {
  Activity,
  Cpu,
  HardDrive,
  Search,
  RefreshCw,
  XCircle,
  Globe,
  Sliders,
  Sparkles,
  Layers,
  ArrowUpDown,
  X,
  Zap,
  Shield,
  Network,
  Lock,
  Loader2,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react'
import { api } from '@/lib/ipc'
import { useBrowserStore } from '@/store/useBrowserStore'
import { extractDomain } from '@/lib/domainZoom'
import { toast } from 'sonner'
import type { ProcessMetricInfo, SystemMetricsResult, Tab } from '@/types/api'

type CategoryFilter = 'all' | 'tabs' | 'system'
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

  // Calculations for system memory breakdown gauge
  const totalSystemMB = metrics?.systemTotalMemoryMB || 16384
  const orbitMB = metrics?.totalAppMemoryMB || 0
  const freeMB = metrics?.systemFreeMemoryMB || 0
  const otherAppsMB = Math.max(0, Math.round(totalSystemMB - orbitMB - freeMB))

  const orbitPercent = Math.min(100, Math.round((orbitMB / totalSystemMB) * 1000) / 10)
  const freePercent = Math.min(100, Math.round((freeMB / totalSystemMB) * 1000) / 10)
  const otherPercent = Math.max(0, Math.round((100 - orbitPercent - freePercent) * 10) / 10)

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-4xl bg-popover/95 dark:bg-[#111216]/95 backdrop-blur-2xl border border-border/80 text-foreground shadow-2xl p-0 overflow-hidden rounded-3xl flex flex-col max-h-[88vh]">
        {/* Header Strip with Dialog Close Protection */}
        <DialogHeader className="p-6 pb-4 border-b border-border/50 select-none">
          <div className="flex items-center justify-between pr-10">
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xs flex items-center justify-center">
                <Activity className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2.5">
                  <span>Orbit Task Manager</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-lg bg-accent text-accent-foreground font-mono font-medium border border-border/60">
                    Shift+Esc
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  <span>Real-time memory and CPU resource inspector</span>
                  <span className="inline-block w-1 h-1 rounded-full bg-emerald-500" />
                  <span className="text-emerald-500 font-medium">Live sync</span>
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleTrimMemory}
                disabled={cleaningRam}
                title="Flush Chromium caches and force V8 garbage collection across all tabs & processes"
                className="px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 text-xs font-semibold flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {cleaningRam ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                <span>Clean RAM</span>
              </button>

              <button
                onClick={() => {
                  setLoading(true)
                  fetchMetrics()
                }}
                title="Refresh process metrics"
                className="p-2 rounded-xl bg-accent/40 hover:bg-accent text-muted-foreground hover:text-foreground border border-border/50 transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-primary' : ''}`} />
              </button>
            </div>
          </div>

          {/* System Performance & RAM Architecture Strip */}
          {metrics && (
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {/* 1. Orbit Consumption */}
                <div className="p-3.5 rounded-2xl bg-accent/35 border border-border/50 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-semibold text-foreground">
                      <Layers className="w-4 h-4 text-primary" /> Orbit RAM
                    </span>
                    <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-md bg-primary/15 text-primary font-bold">
                      {orbitPercent}%
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-xl font-extrabold font-mono text-foreground">
                      {metrics.totalAppMemoryMB.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground font-medium">MB</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    across {metrics.processes.length} active processes
                  </div>
                </div>

                {/* 2. Free System RAM */}
                <div className="p-3.5 rounded-2xl bg-accent/35 border border-border/50 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-semibold text-foreground">
                      <HardDrive className="w-4 h-4 text-emerald-500" /> Available System RAM
                    </span>
                    <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-md bg-emerald-500/15 text-emerald-500 font-bold">
                      {freePercent}%
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-xl font-extrabold font-mono text-emerald-500">
                      {metrics.systemFreeMemoryMB.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground font-medium">MB</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    of {Math.round(totalSystemMB).toLocaleString()} MB total installed
                  </div>
                </div>

                {/* 3. Overall System Health */}
                <div className="p-3.5 rounded-2xl bg-accent/35 border border-border/50 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-semibold text-foreground">
                      <Cpu className="w-4 h-4 text-amber-500" /> System Status
                    </span>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
                      Optimal
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-xl font-extrabold font-mono text-foreground">
                      {counts.tabs}
                    </span>
                    <span className="text-xs text-muted-foreground font-medium">Tabs Open</span>
                    <span className="text-muted-foreground/40 text-xs">/</span>
                    <span className="text-xs font-mono font-semibold text-muted-foreground">
                      {counts.system} Core
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 truncate">
                    Hardware acceleration active
                  </div>
                </div>
              </div>

              {/* Segmented Memory Gauge Bar */}
              <div className="space-y-1.5 pt-1">
                <div className="w-full h-2 rounded-full bg-muted/60 overflow-hidden flex shadow-inner">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.max(2, orbitPercent)}%` }}
                    title={`Orbit RAM: ${orbitMB} MB (${orbitPercent}%)`}
                  />
                  <div
                    className="h-full bg-muted-foreground/30 transition-all duration-500"
                    style={{ width: `${Math.max(2, otherPercent)}%` }}
                    title={`Other Apps & OS: ${otherAppsMB} MB (${otherPercent}%)`}
                  />
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${Math.max(2, freePercent)}%` }}
                    title={`Available Free RAM: ${freeMB} MB (${freePercent}%)`}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground select-none px-0.5">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      <span>Orbit ({Math.round(orbitMB / 1024 * 10) / 10} GB)</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                      <span>Other Apps ({Math.round(otherAppsMB / 1024 * 10) / 10} GB)</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Available ({Math.round(freeMB / 1024 * 10) / 10} GB)</span>
                    </span>
                  </div>
                  <span className="font-mono text-muted-foreground/80">
                    Total: {Math.round(totalSystemMB / 1024 * 10) / 10} GB
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogHeader>

        {/* Toolbar: Category Filters, Search & Sorter */}
        <div className="px-6 py-3 border-b border-border/50 flex flex-wrap items-center justify-between gap-3 bg-accent/15 select-none">
          {/* Category Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-accent/40 border border-border/40">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                categoryFilter === 'all'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All Tasks ({counts.all})
            </button>
            <button
              onClick={() => setCategoryFilter('tabs')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                categoryFilter === 'tabs'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Tabs ({counts.tabs})
            </button>
            <button
              onClick={() => setCategoryFilter('system')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                categoryFilter === 'system'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              System Core ({counts.system})
            </button>
          </div>

          {/* Search Box */}
          <div className="flex items-center gap-3 flex-1 min-w-[200px] max-w-sm ml-auto">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by tab title, URL, or PID..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-background/80 border border-border/60 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded-full"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table Column Headers */}
        <div className="px-6 py-2 border-b border-border/40 bg-accent/25 text-[11px] font-semibold text-muted-foreground flex items-center select-none uppercase tracking-wider">
          <div className="flex-1 min-w-0">Task / Process Identity</div>
          <div
            onClick={() => handleSortToggle('pid')}
            className="w-20 text-center cursor-pointer hover:text-foreground flex items-center justify-center gap-1 transition-colors"
          >
            <span>PID</span>
            {sortBy === 'pid' && (
              <span className="text-primary font-mono">{sortAsc ? '↑' : '↓'}</span>
            )}
          </div>
          <div
            onClick={() => handleSortToggle('memory')}
            className="w-28 text-right cursor-pointer hover:text-foreground flex items-center justify-end gap-1 transition-colors"
          >
            <span>Memory</span>
            {sortBy === 'memory' && (
              <span className="text-primary font-mono">{sortAsc ? '↑' : '↓'}</span>
            )}
          </div>
          <div
            onClick={() => handleSortToggle('cpu')}
            className="w-20 text-right cursor-pointer hover:text-foreground flex items-center justify-end gap-1 transition-colors"
          >
            <span>CPU</span>
            {sortBy === 'cpu' && (
              <span className="text-primary font-mono">{sortAsc ? '↑' : '↓'}</span>
            )}
          </div>
          <div className="w-28 text-right">Action</div>
        </div>

        {/* Process Table Rows */}
        <div className="flex-1 overflow-y-auto px-6 py-2 divide-y divide-border/25">
          {filteredProcesses.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <Activity className="w-8 h-8 text-muted-foreground/40 mx-auto" />
              <p className="text-xs text-muted-foreground font-medium">
                No matching tasks or processes found for &quot;{searchQuery}&quot;
              </p>
            </div>
          ) : (
            filteredProcesses.map((p) => {
              const isTerminating = terminatingPid === p.pid
              const isMainProcess = p.type === 'Browser'
              const hasHighMemory = p.memoryMB > 450
              const hasHighCpu = p.cpuPercent > 10

              const showFavicon = p.favicon && !faviconErrors[p.pid]

              return (
                <div
                  key={p.pid}
                  className="py-2.5 flex items-center justify-between gap-4 group hover:bg-accent/40 -mx-2 px-3 rounded-2xl transition-all"
                >
                  {/* Task Identity */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-xl bg-accent/70 border border-border/60 flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
                      {p.isTab ? (
                        showFavicon ? (
                          <img
                            src={p.favicon!}
                            alt=""
                            onError={() => {
                              setFaviconErrors((prev) => ({ ...prev, [p.pid]: true }))
                            }}
                            className="w-4 h-4 object-contain"
                          />
                        ) : (
                          <Globe className="w-4 h-4 text-primary" />
                        )
                      ) : p.type === 'GPU' ? (
                        <Zap className="w-4 h-4 text-amber-500" />
                      ) : p.type === 'Browser' ? (
                        <Shield className="w-4 h-4 text-primary" />
                      ) : (
                        <Sliders className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-foreground truncate max-w-[340px]">
                          {p.friendlyTitle}
                        </span>

                        {/* Category Badge */}
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            p.isTab
                              ? 'bg-primary/15 text-primary border border-primary/20'
                              : p.type === 'GPU'
                              ? 'bg-amber-500/15 text-amber-500 border border-amber-500/20'
                              : p.type === 'Browser'
                              ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20'
                              : 'bg-muted text-muted-foreground border border-border/50'
                          }`}
                        >
                          {p.category}
                        </span>
                      </div>

                      {p.subtitle && (
                        <div className="text-[11px] text-muted-foreground truncate font-mono max-w-[380px] mt-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
                          {p.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* PID Column */}
                  <div className="w-20 text-center shrink-0">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-lg bg-accent/60 text-muted-foreground border border-border/40">
                      {p.pid}
                    </span>
                  </div>

                  {/* Memory (RAM) Column */}
                  <div className="w-28 text-right shrink-0">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs font-mono font-bold text-foreground tabular-nums">
                        {p.memoryMB.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-muted-foreground">MB</span>
                      {hasHighMemory && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 ml-0.5"
                          title="High memory usage"
                        />
                      )}
                    </div>
                  </div>

                  {/* CPU Column */}
                  <div className="w-20 text-right shrink-0">
                    <div className="flex items-center justify-end gap-1">
                      <span
                        className={`text-xs font-mono tabular-nums font-semibold ${
                          hasHighCpu ? 'text-amber-500 font-bold' : 'text-foreground'
                        }`}
                      >
                        {p.cpuPercent}%
                      </span>
                    </div>
                  </div>

                  {/* Action Column */}
                  <div className="w-28 text-right shrink-0">
                    {isMainProcess ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 px-2.5 py-1 rounded-xl bg-accent/20 border border-border/30">
                        <Lock className="w-3 h-3" />
                        <span>Protected</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => handleEndTask(p)}
                        disabled={isTerminating}
                        title={p.isTab ? 'Terminate unresponsive tab' : 'End process'}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-600 border border-rose-500/20 hover:border-rose-600 transition-all shadow-xs active:scale-95 disabled:opacity-50"
                      >
                        {isTerminating ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                        <span>{p.isTab ? 'End Tab' : 'End Task'}</span>
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer info strip */}
        <div className="px-6 py-2.5 border-t border-border/40 bg-accent/20 flex items-center justify-between text-[11.5px] text-muted-foreground select-none">
          <div className="flex items-center gap-2">
            <span className="text-emerald-500 font-bold">●</span>
            <span>Safely ends hanging tabs without restarting TCT Orbit or losing open workspaces.</span>
          </div>
          <div className="font-mono text-[11px] text-muted-foreground/80">
            {filteredProcesses.length} of {enrichedProcesses.length} tasks shown
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
