import React, { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import {
  Timer,
  Play,
  Pause,
  RotateCcw,
  Coffee,
  Brain,
  ShieldAlert,
  X,
  Plus
} from 'lucide-react'
import { usePomodoroStore, WORK_TIME, BREAK_TIME, normalizeDomain } from '@/store/usePomodoroStore'
import { api } from '@/lib/ipc'
import { useBrowserStore } from '@/store/useBrowserStore'
import { extractDomain } from '@/lib/domainZoom'
import { toast } from 'sonner'

export const PomodoroDialog: React.FC = () => {
  const isOpen = usePomodoroStore((s) => s.isOpen)
  const setIsOpen = usePomodoroStore((s) => s.setIsOpen)
  const mode = usePomodoroStore((s) => s.mode)
  const setMode = usePomodoroStore((s) => s.setMode)
  const timeLeft = usePomodoroStore((s) => s.timeLeft)
  const isRunning = usePomodoroStore((s) => s.isRunning)
  const toggleRunning = usePomodoroStore((s) => s.toggleRunning)
  const resetTimer = usePomodoroStore((s) => s.resetTimer)
  const tick = usePomodoroStore((s) => s.tick)
  const blockDistractions = usePomodoroStore((s) => s.blockDistractions)
  const setBlockDistractions = usePomodoroStore((s) => s.setBlockDistractions)
  const blockedDomains = usePomodoroStore((s) => s.blockedDomains)
  const setBlockedDomains = usePomodoroStore((s) => s.setBlockedDomains)
  const [newDomain, setNewDomain] = useState('')

  const activeSpaceId = useBrowserStore((s) => s.activeSpaceId)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const tabsBySpace = useBrowserStore((s) => s.tabsBySpace)
  const activeTab = activeSpaceId ? tabsBySpace[activeSpaceId]?.find((t) => t.id === activeTabId) : null

  // Global background timer tick
  useEffect(() => {
    if (!isRunning) return
    const interval = setInterval(() => {
      tick()
    }, 1000)
    return () => clearInterval(interval)
  }, [isRunning, tick])

  // Focus Sprint blocking: the network layer refuses navigations to listed sites during a work sprint
  const focusActive = isRunning && mode === 'work' && blockDistractions && blockedDomains.length > 0
  useEffect(() => {
    api.focus?.setBlock(focusActive ? blockedDomains : null).catch(() => {})
  }, [focusActive, blockedDomains])

  // Already on a blocked site when the sprint starts: nudge (the page is not torn down mid-task)
  const lastWarnedDomainRef = useRef<string>('')
  useEffect(() => {
    if (!focusActive || !activeTab?.url) return
    const domain = extractDomain(activeTab.url)
    if (!domain) return
    const isDistracting = blockedDomains.some((d) => domain === d || domain.endsWith('.' + d))
    if (isDistracting && lastWarnedDomainRef.current !== domain) {
      lastWarnedDomainRef.current = domain
      toast.warning('Focus Sprint in progress', {
        description: `${domain} is on your block list. New visits are blocked until the sprint ends.`,
        duration: 4000
      })
    }
  }, [activeTab?.url, focusActive, blockedDomains])

  const addDomain = () => {
    const d = normalizeDomain(newDomain)
    if (!d) {
      toast.error('Enter a site like reddit.com')
      return
    }
    setBlockedDomains([...blockedDomains, d])
    setNewDomain('')
  }

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const timeFormatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-md bg-popover/95 dark:bg-[#12141a]/95 backdrop-blur-2xl border border-border shadow-2xl rounded-3xl p-6 text-foreground z-50 select-none">
        <DialogHeader className="pb-3 border-b border-border/50">
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Timer className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">Focus Sprint Timer</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Deep work sprints with automated rest intervals
                </DialogDescription>
              </div>
            </div>
            <span
              className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                mode === 'work'
                  ? 'bg-primary/15 text-primary border border-primary/25'
                  : 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/25'
              }`}
            >
              {mode === 'work' ? 'Deep Work' : 'Break'}
            </span>
          </div>
        </DialogHeader>

        {/* Big Countdown Display */}
        <div className="py-6 text-center">
          <div className="text-5xl font-extrabold font-mono tracking-tight text-foreground tabular-nums">
            {timeFormatted}
          </div>
          <div className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1.5">
            {mode === 'work' ? (
              <>
                <Brain className="w-3.5 h-3.5 text-primary" /> 25-minute sprint
              </>
            ) : (
              <>
                <Coffee className="w-3.5 h-3.5 text-emerald-500" /> 5-minute recovery
              </>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-center gap-2 pb-2">
          <button
            onClick={() => setMode('work')}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              mode === 'work'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'hover:bg-accent text-muted-foreground hover:text-foreground border border-border/50'
            }`}
          >
            25m Work Sprint
          </button>
          <button
            onClick={() => setMode('break')}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              mode === 'break'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'hover:bg-accent text-muted-foreground hover:text-foreground border border-border/50'
            }`}
          >
            5m Rest Break
          </button>
        </div>

        <div className="flex items-center justify-center gap-2.5 mt-2 pt-4 border-t border-border/40">
          <button
            onClick={toggleRunning}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
              isRunning
                ? 'bg-accent hover:bg-accent/80 text-foreground border border-border'
                : 'bg-primary hover:bg-primary/90 text-primary-foreground'
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="w-4 h-4" />
                <span>Pause Sprint</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Start Focus Sprint</span>
              </>
            )}
          </button>

          <button
            onClick={resetTimer}
            title="Reset timer"
            className="p-2.5 rounded-xl hover:bg-accent text-muted-foreground hover:text-foreground border border-border/60 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Distraction Blocker Setting */}
        <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
          <label htmlFor="tct-focus-block" className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground select-none">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
            <span>Block distracting sites during focus sprints</span>
          </label>
          <input
            id="tct-focus-block"
            type="checkbox"
            checked={blockDistractions}
            onChange={(e) => setBlockDistractions(e.target.checked)}
            className="rounded border-border text-primary focus:ring-primary cursor-pointer w-4 h-4"
          />
        </div>
        {blockDistractions && (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto" data-lenis-prevent>
              {blockedDomains.map((d) => (
                <span key={d} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md bg-muted border border-border text-[11px] text-foreground">
                  {d}
                  <button
                    onClick={() => setBlockedDomains(blockedDomains.filter((x) => x !== d))}
                    className="p-0.5 rounded hover:bg-background text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${d}`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addDomain()}
                placeholder="Add a site, e.g. news.ycombinator.com"
                className="flex-1 h-7 px-2 rounded-md bg-background border border-border text-[11px] outline-none focus:border-primary"
              />
              <button onClick={addDomain} className="h-7 px-2 rounded-md bg-muted hover:bg-accent text-[11px] flex items-center gap-1 border border-border">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
