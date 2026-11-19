import React from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  MoreHorizontal,
  Timer,
  Activity,
  Columns2,
  BookOpen,
  Tv2,
  FileText,
  Download,
  Star,
  History,
  Sparkles,
  Search,
  ArrowLeftRight,
  X,
  Plus,
  Globe,
  SlidersHorizontal
} from 'lucide-react'
import { useBrowserStore } from '@/store/useBrowserStore'
import { usePomodoroStore } from '@/store/usePomodoroStore'
import { modKey } from '@/lib/platform'

interface ToolsMenuProps {
  hasActiveDownload?: boolean
}

export const ToolsMenu: React.FC<ToolsMenuProps> = ({ hasActiveDownload = false }) => {
  const setTaskManagerOpen = useBrowserStore((s) => s.setTaskManagerOpen)
  const setHistoryDialogOpen = useBrowserStore((s) => s.setHistoryDialogOpen)
  const setBookmarksDialogOpen = useBrowserStore((s) => s.setBookmarksDialogOpen)
  const setZenMode = useBrowserStore((s) => s.setZenMode)
  const zenMode = useBrowserStore((s) => s.zenMode)

  // Split View state from store
  const activeSpaceId = useBrowserStore((s) => s.activeSpaceId)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const tabsBySpace = useBrowserStore((s) => s.tabsBySpace)
  const splitTabId = useBrowserStore((s) => s.splitTabId)
  const splitRatio = useBrowserStore((s) => s.splitRatio)
  const setSplitTabId = useBrowserStore((s) => s.setSplitTabId)
  const setSplitRatio = useBrowserStore((s) => s.setSplitRatio)
  const closeSplitView = useBrowserStore((s) => s.closeSplitView)
  const setActiveTabId = useBrowserStore((s) => s.setActiveTabId)

  // Pomodoro state
  const isPomodoroRunning = usePomodoroStore((s) => s.isRunning)
  const pomodoroTimeLeft = usePomodoroStore((s) => s.timeLeft)
  const pomodoroMode = usePomodoroStore((s) => s.mode)
  const setPomodoroOpen = usePomodoroStore((s) => s.setIsOpen)

  const currentTabs = activeSpaceId ? tabsBySpace[activeSpaceId] || [] : []
  const otherTabs = currentTabs.filter((t) => t.id !== activeTabId)
  const isSplitActive = Boolean(splitTabId && currentTabs.some((t) => t.id === splitTabId))

  const pomodoroMinutes = Math.floor(pomodoroTimeLeft / 60)
  const pomodoroSeconds = pomodoroTimeLeft % 60
  const pomodoroFormatted = `${pomodoroMinutes.toString().padStart(2, '0')}:${pomodoroSeconds.toString().padStart(2, '0')}`

  const handleSwapSplit = () => {
    if (!splitTabId) return
    const currentActive = activeTabId
    setActiveTabId(splitTabId)
    setSplitTabId(currentActive)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          title="Tools & Features"
        >
          <MoreHorizontal className="w-4 h-4" />

          {/* Indicator badges */}
          {hasActiveDownload && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary ring-2 ring-background animate-pulse" />
          )}
          {isPomodoroRunning && !hasActiveDownload && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-background animate-pulse" />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-64 bg-popover/95 dark:bg-[#121316]/95 backdrop-blur-2xl border border-border/80 text-foreground shadow-2xl rounded-2xl p-1.5 z-50 text-xs font-medium select-none"
      >
        {/* Productivity & Focus */}
        <DropdownMenuLabel className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider px-2 py-1">
          Productivity & Focus
        </DropdownMenuLabel>

        <DropdownMenuItem
          onClick={() => setPomodoroOpen(true)}
          className="flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Timer className={`w-4 h-4 ${isPomodoroRunning ? 'text-primary animate-pulse' : 'text-primary'}`} />
            <span>Focus Sprint Timer</span>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground font-semibold">
            {isPomodoroRunning ? (
              <span className="text-primary font-bold">{pomodoroFormatted}</span>
            ) : (
              '25m'
            )}
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setTaskManagerOpen(true)}
          className="flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Activity className="w-4 h-4 text-emerald-500" />
            <span>Orbit Task Manager</span>
          </div>
          <kbd className="text-[10px] font-mono text-muted-foreground bg-accent/60 px-1.5 py-0.5 rounded border border-border/40">
            Shift+Esc
          </kbd>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setZenMode(!zenMode)}
          className="flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Zen / Pure Focus Mode</span>
          </div>
          <kbd className="text-[10px] font-mono text-muted-foreground bg-accent/60 px-1.5 py-0.5 rounded border border-border/40">
            F11
          </kbd>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1 bg-border/40" />

        {/* View & Dual-Pane Tools */}
        <DropdownMenuLabel className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider px-2 py-1">
          View & Panes
        </DropdownMenuLabel>

        {/* 1-Click Toggle Split View Dual-Pane */}
        <DropdownMenuItem
          onClick={() => window.dispatchEvent(new CustomEvent('tct:toggle-split-view'))}
          className="flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Columns2 className={`w-4 h-4 ${isSplitActive ? 'text-primary font-bold' : 'text-foreground'}`} />
            <span>Split View Dual-Pane</span>
          </div>
          {isSplitActive ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/20 text-primary font-bold">
              Active
            </span>
          ) : (
            <kbd className="text-[10px] font-mono text-muted-foreground bg-accent/60 px-1.5 py-0.5 rounded border border-border/40">
              {modKey}+\
            </kbd>
          )}
        </DropdownMenuItem>

        {/* If Split is Active: Controls for Swap, Ratio Presets, and Close */}
        {isSplitActive && (
          <div className="px-2.5 py-1.5 mx-1 my-1 space-y-1.5 rounded-xl bg-muted/40 border border-border/50 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Panes & Ratio</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleSwapSplit()
                }}
                className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer font-medium"
              >
                <ArrowLeftRight className="w-3 h-3" />
                <span>Swap</span>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setSplitRatio(0.5)
                }}
                className={`py-1 rounded-lg text-xs font-medium border text-center transition-colors cursor-pointer ${
                  Math.abs(splitRatio - 0.5) < 0.05
                    ? 'border-primary bg-primary/15 text-primary font-bold'
                    : 'border-border/60 hover:bg-accent text-foreground'
                }`}
              >
                50/50
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setSplitRatio(0.7)
                }}
                className={`py-1 rounded-lg text-xs font-medium border text-center transition-colors cursor-pointer ${
                  Math.abs(splitRatio - 0.7) < 0.05
                    ? 'border-primary bg-primary/15 text-primary font-bold'
                    : 'border-border/60 hover:bg-accent text-foreground'
                }`}
              >
                70/30
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setSplitRatio(0.3)
                }}
                className={`py-1 rounded-lg text-xs font-medium border text-center transition-colors cursor-pointer ${
                  Math.abs(splitRatio - 0.3) < 0.05
                    ? 'border-primary bg-primary/15 text-primary font-bold'
                    : 'border-border/60 hover:bg-accent text-foreground'
                }`}
              >
                30/70
              </button>
            </div>
          </div>
        )}

        {/* If multiple other tabs exist, optional sub-menu to pick a specific tab */}
        {!isSplitActive && otherTabs.length > 1 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="flex items-center justify-between px-2.5 py-1.5 rounded-xl cursor-pointer hover:bg-accent transition-colors text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Columns2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Split with Specific Tab</span>
              </div>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-60 bg-popover/95 dark:bg-[#121316]/95 backdrop-blur-2xl border border-border/80 text-foreground shadow-2xl rounded-2xl p-1.5 z-50 text-xs">
              <div className="px-2 py-1 text-[10px] uppercase font-bold text-muted-foreground">
                Select Tab to Split
              </div>
              {otherTabs.map((tab) => (
                <DropdownMenuItem
                  key={tab.id}
                  onClick={() => setSplitTabId(tab.id)}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl cursor-pointer hover:bg-accent"
                >
                  <Globe className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="truncate">{tab.title || 'Untitled Tab'}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuItem
          onClick={() => window.dispatchEvent(new CustomEvent('tct:toggle-reader-mode'))}
          className="flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-4 h-4 text-foreground" />
            <span>Reader Mode</span>
          </div>
          <kbd className="text-[10px] font-mono text-muted-foreground bg-accent/60 px-1.5 py-0.5 rounded border border-border/40">
            F9
          </kbd>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => window.dispatchEvent(new CustomEvent('tct:toggle-pip'))}
          className="flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Tv2 className="w-4 h-4 text-foreground" />
            <span>Picture-in-Picture</span>
          </div>
          <kbd className="text-[10px] font-mono text-muted-foreground bg-accent/60 px-1.5 py-0.5 rounded border border-border/40">
            {modKey}+Shift+P
          </kbd>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => window.dispatchEvent(new CustomEvent('tct:toggle-notes'))}
          className="flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <FileText className="w-4 h-4 text-foreground" />
            <span>Space Notes</span>
          </div>
          <kbd className="text-[10px] font-mono text-muted-foreground bg-accent/60 px-1.5 py-0.5 rounded border border-border/40">
            {modKey}+Shift+N
          </kbd>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1 bg-border/40" />

        {/* Management & Navigation */}
        <DropdownMenuLabel className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider px-2 py-1">
          Management
        </DropdownMenuLabel>

        <DropdownMenuItem
          onClick={() => window.dispatchEvent(new CustomEvent('open-downloads'))}
          className="flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Download className="w-4 h-4 text-foreground" />
            <span>Downloads</span>
          </div>
          <div className="flex items-center gap-1.5">
            {hasActiveDownload && (
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            )}
            <kbd className="text-[10px] font-mono text-muted-foreground bg-accent/60 px-1.5 py-0.5 rounded border border-border/40">
              {modKey}+J
            </kbd>
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setBookmarksDialogOpen(true)}
          className="flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Star className="w-4 h-4 text-amber-500" />
            <span>Bookmarks & Reading List</span>
          </div>
          <kbd className="text-[10px] font-mono text-muted-foreground bg-accent/60 px-1.5 py-0.5 rounded border border-border/40">
            {modKey}+D
          </kbd>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setHistoryDialogOpen(true)}
          className="flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <History className="w-4 h-4 text-foreground" />
            <span>Browsing History</span>
          </div>
          <kbd className="text-[10px] font-mono text-muted-foreground bg-accent/60 px-1.5 py-0.5 rounded border border-border/40">
            {modKey}+H
          </kbd>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => window.dispatchEvent(new CustomEvent('tct:toggle-find'))}
          className="flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Search className="w-4 h-4 text-foreground" />
            <span>Find in Page</span>
          </div>
          <kbd className="text-[10px] font-mono text-muted-foreground bg-accent/60 px-1.5 py-0.5 rounded border border-border/40">
            {modKey}+F
          </kbd>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
