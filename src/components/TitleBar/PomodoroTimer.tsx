import React, { useState, useEffect, useRef } from 'react'
import {
  Timer,
  Play,
  Pause,
  RotateCcw,
  Coffee,
  Brain,
  ShieldAlert,
  Bell
} from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import { playFocusChime } from '@/lib/audioChime'
import { useBrowserStore } from '@/store/useBrowserStore'
import { extractDomain } from '@/lib/domainZoom'
import { toast } from 'sonner'

const WORK_TIME = 25 * 60 // 25 minutes
const BREAK_TIME = 5 * 60 // 5 minutes

const DISTRACTING_DOMAINS = new Set([
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'reddit.com',
  'tiktok.com',
  'youtube.com',
  'netflix.com',
  'twitch.tv',
  'threads.net',
  '9gag.com',
  'pinterest.com'
])

export const PomodoroTimer: React.FC = () => {
  const [mode, setMode] = useState<'work' | 'break'>('work')
  const [timeLeft, setTimeLeft] = useState<number>(WORK_TIME)
  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [blockDistractions, setBlockDistractions] = useState<boolean>(true)
  const [isOpen, setIsOpen] = useState(false)

  const activeSpaceId = useBrowserStore((s) => s.activeSpaceId)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const tabsBySpace = useBrowserStore((s) => s.tabsBySpace)
  const activeTab = activeSpaceId ? tabsBySpace[activeSpaceId]?.find((t) => t.id === activeTabId) : null

  // Interval timer tick
  useEffect(() => {
    if (!isRunning) return

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (mode === 'work') {
            playFocusChime('complete')
            toast.success('Sprint complete! Time for a well-deserved 5-minute break.')
            setMode('break')
            return BREAK_TIME
          } else {
            playFocusChime('break')
            toast.info('Break finished! Ready to begin your next focus sprint?')
            setMode('work')
            return WORK_TIME
          }
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isRunning, mode])

  // Distraction alert on navigating to distracting site while running sprint
  const lastWarnedDomainRef = useRef<string>('')
  useEffect(() => {
    if (!isRunning || mode !== 'work' || !blockDistractions || !activeTab?.url) return

    const domain = extractDomain(activeTab.url)
    if (!domain) return

    const isDistracting = Array.from(DISTRACTING_DOMAINS).some(
      (d) => domain === d || domain.endsWith('.' + d)
    )

    if (isDistracting && lastWarnedDomainRef.current !== domain) {
      lastWarnedDomainRef.current = domain
      toast.warning(`Focus Sprint in progress!`, {
        description: `${domain} might distract you from your sprint.`,
        duration: 4000
      })
    }
  }, [activeTab?.url, isRunning, mode, blockDistractions])

  const toggleRunning = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (!isRunning) {
      playFocusChime('start')
    }
    setIsRunning(!isRunning)
  }

  const resetTimer = () => {
    setIsRunning(false)
    setTimeLeft(mode === 'work' ? WORK_TIME : BREAK_TIME)
  }

  const switchMode = (newMode: 'work' | 'break') => {
    setIsRunning(false)
    setMode(newMode)
    setTimeLeft(newMode === 'work' ? WORK_TIME : BREAK_TIME)
  }

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const timeFormatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={`h-7 px-2 flex items-center gap-1.5 rounded-lg text-xs font-mono transition-all ${
            isRunning
              ? mode === 'work'
                ? 'bg-primary/15 text-primary border border-primary/30 font-bold'
                : 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 font-bold'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
          title="Pomodoro Focus Timer"
        >
          {isRunning ? (
            <span
              className={`w-2 h-2 rounded-full animate-pulse ${
                mode === 'work' ? 'bg-primary' : 'bg-emerald-500'
              }`}
            />
          ) : (
            <Timer className="w-3.5 h-3.5" />
          )}
          {isRunning && <span>{timeFormatted}</span>}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-72 bg-popover/95 backdrop-blur-xl border border-border shadow-2xl rounded-2xl p-4 text-foreground z-50 select-none animate-in fade-in-50 zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm">Focus Sprint Timer</span>
          </div>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
              mode === 'work'
                ? 'bg-primary/10 text-primary'
                : 'bg-emerald-500/10 text-emerald-500'
            }`}
          >
            {mode === 'work' ? 'Deep Work' : 'Break'}
          </span>
        </div>

        {/* Big Countdown Display */}
        <div className="py-4 text-center">
          <div className="text-4xl font-extrabold font-mono tracking-tight text-foreground">
            {timeFormatted}
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
            {mode === 'work' ? (
              <>
                <Brain className="w-3.5 h-3.5 text-primary" /> 25-minute sprint
              </>
            ) : (
              <>
                <Coffee className="w-3.5 h-3.5 text-emerald-500" /> 5-minute break
              </>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-center gap-2 py-1">
          <button
            onClick={() => switchMode('work')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              mode === 'work'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'hover:bg-accent text-muted-foreground hover:text-foreground'
            }`}
          >
            25m Work
          </button>
          <button
            onClick={() => switchMode('break')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              mode === 'break'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'hover:bg-accent text-muted-foreground hover:text-foreground'
            }`}
          >
            5m Rest
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-border/40">
          <button
            onClick={() => toggleRunning()}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
              isRunning
                ? 'bg-accent hover:bg-accent/80 text-foreground border border-border'
                : 'bg-primary hover:bg-primary/90 text-primary-foreground'
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Start Sprint</span>
              </>
            )}
          </button>

          <button
            onClick={resetTimer}
            title="Reset timer"
            className="p-2 rounded-xl hover:bg-accent text-muted-foreground hover:text-foreground border border-border/60 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Distraction Blocker Setting */}
        <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
            <span>Warn on distracting sites</span>
          </label>
          <input
            type="checkbox"
            checked={blockDistractions}
            onChange={(e) => setBlockDistractions(e.target.checked)}
            className="rounded border-border text-primary focus:ring-primary cursor-pointer"
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
