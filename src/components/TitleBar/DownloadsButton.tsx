import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Download, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/ipc'

/** The button stays this long after the last download finished */
const KEEP_MS = 60_000

const openList = () => window.dispatchEvent(new CustomEvent('open-downloads'))

function size(bytes: number): string {
  if (bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/**
 * Tells the user that a download started (message + toolbar button with a progress ring) and how it
 * ended. The finished message (App.tsx) replaces the started one: they share the download's id.
 */
export const DownloadsButton: React.FC = () => {
  const [active, setActive] = useState<Record<string, { received: number; total: number }>>({})
  const [result, setResult] = useState<'done' | 'failed' | null>(null)
  const hideTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const finish = (id: string, outcome: 'done' | 'failed' | null) => {
      setActive((a) => {
        const { [id]: _gone, ...rest } = a
        return rest
      })
      if (!outcome) return
      setResult(outcome)
      window.clearTimeout(hideTimer.current)
      hideTimer.current = window.setTimeout(() => setResult(null), KEEP_MS)
    }
    const offs = [
      api.downloads.onStarted?.((d) => {
        window.clearTimeout(hideTimer.current)
        setResult(null)
        setActive((a) => ({ ...a, [d.id]: { received: 0, total: d.totalBytes } }))
        toast(`Downloading ${d.filename}`, {
          id: d.id,
          icon: <Download className="w-4 h-4 text-primary" />,
          description: size(d.totalBytes) || undefined,
          duration: 6000,
          action: { label: 'View', onClick: openList }
        })
      }),
      api.downloads.onProgress?.((d) => {
        setActive((a) => ({ ...a, [d.id]: { received: d.receivedBytes, total: d.totalBytes } }))
      }),
      api.downloads.onCompleted?.((d) => finish(d.id, 'done')),
      api.downloads.onFailed?.((d) => {
        // Cancelled by the user: nothing to report
        if (d.reason === 'Cancelled') {
          toast.dismiss(d.id)
          finish(d.id, null)
          return
        }
        toast.error(`Download failed: ${d.filename}`, { id: d.id, icon: undefined, description: undefined, duration: 8000, action: { label: 'View', onClick: openList } })
        finish(d.id, 'failed')
      })
    ]
    return () => {
      offs.forEach((off) => off?.())
      window.clearTimeout(hideTimer.current)
    }
  }, [])

  const list = useMemo(() => Object.values(active), [active])
  if (list.length === 0 && !result) return null

  const total = list.reduce((s, d) => s + d.total, 0)
  const received = list.reduce((s, d) => s + d.received, 0)
  const progress = total > 0 ? Math.min(1, received / total) : null
  const label =
    list.length > 0
      ? `${list.length} download${list.length === 1 ? '' : 's'} in progress${progress === null ? '' : `, ${Math.round(progress * 100)}%`}`
      : result === 'done'
      ? 'Download complete'
      : 'Download failed'
  const R = 11
  const C = 2 * Math.PI * R

  return (
    <button
      onClick={() => {
        setResult(null)
        openList()
      }}
      title={label}
      aria-label={label}
      className="relative w-7 h-7 flex items-center justify-center rounded-lg text-primary hover:bg-muted transition-colors animate-in fade-in zoom-in-75 duration-200"
    >
      {list.length > 0 && (
        <svg viewBox="0 0 28 28" className={`absolute inset-0 -rotate-90 ${progress === null ? 'animate-spin' : ''}`} aria-hidden>
          <circle cx="14" cy="14" r={R} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.2" />
          <circle
            cx="14"
            cy="14"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - (progress ?? 0.25))}
            style={{ transition: 'stroke-dashoffset .3s linear' }}
          />
        </svg>
      )}
      <Download className={`w-3.5 h-3.5 ${list.length > 0 ? 'animate-pulse' : ''}`} />
      {list.length === 0 && result && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-white ring-2 ring-background ${
            result === 'done' ? 'bg-emerald-500' : 'bg-destructive'
          }`}
        >
          {result === 'done' ? <Check className="w-2.5 h-2.5" strokeWidth={3} /> : <AlertCircle className="w-2.5 h-2.5" />}
        </span>
      )}
    </button>
  )
}
