import React, { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Timer, Play, Pause, RotateCcw, ShieldBan, X, Plus, ChevronDown, Layers } from 'lucide-react'
import { usePomodoroStore, WORK_TIME, BREAK_TIME, normalizeDomain } from '@/store/usePomodoroStore'
import { api } from '@/lib/ipc'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useSmartStore } from '@/store/useSmartStore'
import { extractDomain } from '@/lib/domainZoom'
import { Switch } from '@/components/ui/switch'
import { ToolHeader, ToolFooter, Segmented, toolDialogClass } from '@/components/ui/tool-dialog'
import { toast } from 'sonner'

const RING_SIZE = 208
const RING_STROKE = 8
const RING_R = (RING_SIZE - RING_STROKE) / 2
const RING_C = 2 * Math.PI * RING_R

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
  const [editingSites, setEditingSites] = useState(false)

  const activeSpaceId = useBrowserStore((s) => s.activeSpaceId)
  const activeTab = useBrowserStore((s) => (activeSpaceId ? s.tabsBySpace[activeSpaceId]?.find((t) => t.id === s.activeTabId) ?? null : null))

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
      toast.warning('Focus sprint in progress', {
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

  const total = mode === 'work' ? WORK_TIME : BREAK_TIME
  const progress = Math.min(1, Math.max(0, 1 - timeLeft / total))
  const started = timeLeft < total
  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const timeFormatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  const isWork = mode === 'work'
  const ringColor = isWork ? 'hsl(var(--primary))' : 'rgb(16 185 129)'
  const status = isRunning ? (isWork ? 'Focusing' : 'On a break') : started ? 'Paused' : isWork ? 'Ready to focus' : 'Ready for a break'

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className={`max-w-[400px] ${toolDialogClass}`}>
        <ToolHeader
          icon={Timer}
          tone={isWork ? 'primary' : 'emerald'}
          title="Focus Timer"
          description="Work in focused sprints with short breaks in between."
          TitleAs={DialogTitle}
          DescriptionAs={DialogDescription}
        />

        <div className="px-5 pb-5 select-none">
          <Segmented
            value={mode}
            onChange={(m) => setMode(m)}
            options={[
              { value: 'work', label: 'Focus', hint: '25 min' },
              { value: 'break', label: 'Break', hint: '5 min' }
            ]}
          />

          {/* Countdown ring */}
          <div className="relative mx-auto my-6" style={{ width: RING_SIZE, height: RING_SIZE }}>
            <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90" aria-hidden>
              <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} fill="none" stroke="hsl(var(--muted))" strokeWidth={RING_STROKE} />
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_R}
                fill="none"
                stroke={ringColor}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - progress)}
                style={{ transition: 'stroke-dashoffset 1s linear, stroke 200ms' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-[52px] leading-none font-semibold tabular-nums tracking-tight text-foreground font-mono">{timeFormatted}</div>
              <div className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${isRunning ? (isWork ? 'bg-primary animate-pulse' : 'bg-emerald-500 animate-pulse') : 'bg-muted-foreground/50'}`}
                />
                {status}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleRunning}
              className={`flex-1 h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold transition-colors cursor-pointer ${
                isRunning
                  ? 'bg-muted hover:bg-muted/80 text-foreground ring-1 ring-border'
                  : isWork
                  ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  : 'bg-emerald-500 hover:bg-emerald-500/90 text-white'
              }`}
            >
              {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
              {isRunning ? 'Pause' : started ? 'Resume' : isWork ? 'Start focus' : 'Start break'}
            </button>
            <button
              onClick={resetTimer}
              disabled={!started}
              title="Reset timer"
              aria-label="Reset timer"
              className="w-11 h-11 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted ring-1 ring-border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Distraction blocking */}
        <ToolFooter className="space-y-3">
          <div className="flex items-center gap-3">
            <ShieldBan className="w-4 h-4 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-foreground">Block distracting sites</div>
              <button
                onClick={() => setEditingSites((v) => !v)}
                disabled={!blockDistractions}
                className="text-[11.5px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer disabled:cursor-default disabled:hover:text-muted-foreground"
              >
                {blockedDomains.length} site{blockedDomains.length === 1 ? '' : 's'} during focus sprints
                {blockDistractions && <ChevronDown className={`w-3 h-3 transition-transform ${editingSites ? 'rotate-180' : ''}`} />}
              </button>
            </div>
            <Switch checked={blockDistractions} onCheckedChange={setBlockDistractions} aria-label="Block distracting sites" />
          </div>

          {blockDistractions && editingSites && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto" data-lenis-prevent>
                {blockedDomains.map((d) => (
                  <span key={d} className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-md bg-background ring-1 ring-border text-[11.5px] text-foreground">
                    {d}
                    <button
                      onClick={() => setBlockedDomains(blockedDomains.filter((x) => x !== d))}
                      className="w-4 h-4 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                      aria-label={`Remove ${d}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addDomain()}
                  placeholder="Add a site, e.g. news.ycombinator.com"
                  className="flex-1 h-8 px-2.5 rounded-lg bg-background ring-1 ring-border text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-primary"
                />
                <button
                  onClick={addDomain}
                  className="h-8 px-3 rounded-lg bg-background hover:bg-muted ring-1 ring-border text-xs font-medium flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>
          )}

          <button
            onClick={() => {
              setIsOpen(false)
              useSmartStore.getState().openSmartTools('focus')
            }}
            className="w-full flex items-center gap-2 text-[11.5px] text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5" />
            Different rules for each space…
          </button>
        </ToolFooter>
      </DialogContent>
    </Dialog>
  )
}
