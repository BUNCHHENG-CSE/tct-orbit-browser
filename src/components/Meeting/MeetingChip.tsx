import React, { useEffect, useRef, useState } from 'react'
import { Video, X, ArrowUpRight } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { playFocusChime } from '@/lib/audioChime'
import { useMeetingStore } from '@/store/useMeetingStore'

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mmss = `${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`
  return h > 0 ? `${h}:${mmss}` : mmss
}

/** Title bar countdown: "Starts in 4:12" before the meeting, then "Live 12:03" */
export const MeetingChip: React.FC = () => {
  const active = useMeetingStore((s) => s.active)
  const focus = useMeetingStore((s) => s.focus)
  const end = useMeetingStore((s) => s.end)
  const [now, setNow] = useState(() => Date.now())
  const [open, setOpen] = useState(false)
  const notified = useRef<{ startAt: number; oneMinute: boolean; started: boolean }>({ startAt: 0, oneMinute: false, started: false })

  useEffect(() => {
    if (!active) return
    if (notified.current.startAt !== active.startAt) {
      // Meetings that already started don't announce themselves again
      const startedAlready = active.startAt <= Date.now()
      notified.current = { startAt: active.startAt, oneMinute: startedAlready, started: startedAlready }
    }
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])

  // One-minute warning and "starting now" alerts
  useEffect(() => {
    if (!active) return
    const remaining = active.startAt - now
    if (!notified.current.oneMinute && remaining <= 60_000 && remaining > 0) {
      notified.current.oneMinute = true
      toast(`${active.title} starts in 1 minute`, { action: { label: 'Join', onClick: focus } })
    }
    if (!notified.current.started && remaining <= 0) {
      notified.current.started = true
      playFocusChime('start')
      // Don't yank the user away from what they're doing: offer to join instead
      toast(`${active.title} is starting`, { action: { label: 'Join', onClick: focus }, duration: 15_000 })
    }
  }, [active, now, focus])

  if (!active) return null

  const remaining = active.startAt - now
  const upcoming = remaining > 0
  const label = upcoming ? `in ${formatDuration(remaining)}` : `Live ${formatDuration(-remaining)}`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`h-7 px-2 flex items-center gap-1.5 rounded-lg text-[11.5px] font-semibold tabular-nums transition-colors ${
            upcoming
              ? remaining <= 60_000
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25'
                : 'bg-primary/10 text-primary hover:bg-primary/20'
              : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25'
          }`}
          title={`${active.title}: ${upcoming ? 'starts' : 'started'} ${new Date(active.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
        >
          {upcoming ? <Video className="w-3.5 h-3.5" /> : <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
          <span>{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-64 p-3 rounded-2xl bg-popover border border-border shadow-2xl space-y-3 z-50">
        <div>
          <div className="text-xs font-bold text-foreground truncate">{active.title}</div>
          <div className="text-[11px] text-muted-foreground truncate">{active.meetingUrl.replace(/^https?:\/\//, '')}</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {upcoming ? 'Starts' : 'Started'} at{' '}
            {new Date(active.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              focus()
              setOpen(false)
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            Go to meeting
          </button>
          <button
            onClick={() => {
              end()
              setOpen(false)
            }}
            className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-muted hover:bg-muted/80 border border-border text-xs font-medium text-foreground"
          >
            <X className="w-3.5 h-3.5" />
            End
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
