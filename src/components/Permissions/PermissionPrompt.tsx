import React, { useEffect, useState } from 'react'
import { Camera, Mic, MapPin, Bell, ClipboardPaste, Music, ShieldQuestion } from 'lucide-react'
import { api } from '@/lib/ipc'
import type { PermissionPromptRequest, SitePermission } from '@/types/api'

export const PERMISSION_META: Record<SitePermission, { label: string; icon: React.ElementType }> = {
  camera: { label: 'Use your camera', icon: Camera },
  microphone: { label: 'Use your microphone', icon: Mic },
  geolocation: { label: 'Know your location', icon: MapPin },
  notifications: { label: 'Show notifications', icon: Bell },
  'clipboard-read': { label: 'See text and images copied to the clipboard', icon: ClipboardPaste },
  midi: { label: 'Use your MIDI devices', icon: Music }
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

/**
 * Chrome-style permission bubble under the address bar. Requests are queued; the oldest is shown.
 * The main process denies automatically after 60 s without an answer.
 */
export const PermissionPrompt: React.FC = () => {
  const [queue, setQueue] = useState<PermissionPromptRequest[]>([])
  const [remember, setRemember] = useState(true)

  useEffect(() => {
    if (!api.permissions) return
    const offReq = api.permissions.onRequest((req) => {
      setQueue((q) => (q.some((r) => r.id === req.id) ? q : [...q, req]))
    })
    const offDismiss = api.permissions.onDismiss((id) => {
      setQueue((q) => q.filter((r) => r.id !== id))
    })
    return () => {
      offReq()
      offDismiss()
    }
  }, [])

  const current = queue[0]

  useEffect(() => {
    // Private-tab answers are never remembered across sessions; default the box accordingly
    setRemember(!current?.isPrivate)
  }, [current?.id, current?.isPrivate])

  if (!current) return null

  const answer = (allow: boolean) => {
    void api.permissions.respond(current.id, allow, remember)
    setQueue((q) => q.slice(1))
  }

  return (
    <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[60] w-[min(420px,calc(100vw-32px))] rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl p-4 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <ShieldQuestion className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-foreground break-all">{hostOf(current.origin)} wants to</p>
          <ul className="mt-1.5 space-y-1">
            {current.permissions.map((p) => {
              const meta = PERMISSION_META[p]
              const Icon = meta?.icon || ShieldQuestion
              return (
                <li key={p} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{meta?.label || p}</span>
                </li>
              )
            })}
          </ul>
          <label className="mt-3 flex items-center gap-2 text-[11.5px] text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="accent-[hsl(var(--primary))]"
            />
            {current.isPrivate ? 'Remember until private tabs are closed' : 'Remember my choice for this site'}
          </label>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        {queue.length > 1 && <span className="mr-auto text-[11px] text-muted-foreground">+{queue.length - 1} more</span>}
        <button
          onClick={() => answer(false)}
          className="px-4 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-muted transition-colors"
        >
          Block
        </button>
        <button
          onClick={() => answer(true)}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Allow
        </button>
      </div>
    </div>
  )
}
