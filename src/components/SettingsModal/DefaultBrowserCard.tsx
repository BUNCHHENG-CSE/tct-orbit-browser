import React, { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Globe, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/ipc'
import { isWindows } from '@/lib/platform'
import type { DefaultBrowserStatus } from '@/types/api'

/** Settings > Startup: optional "Make default browser". Never prompted automatically. */
export const DefaultBrowserCard: React.FC = () => {
  const [status, setStatus] = useState<DefaultBrowserStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    api.defaultBrowser?.status().then(setStatus).catch(() => setStatus(null))
  }, [])

  useEffect(() => {
    refresh()
    // After the user changes it in Windows Settings and comes back
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])

  const handleSet = async () => {
    setBusy(true)
    try {
      const res = await api.defaultBrowser.set()
      if (!res.ok) toast.error('Could not change the default browser', { description: res.error })
      else if (res.openedSystemSettings) {
        toast('Windows Settings opened', {
          description: 'Choose TCT Orbit for HTTP and HTTPS (or click "Set default") to finish.',
          duration: 10_000
        })
      } else {
        toast.success('TCT Orbit is now your default browser')
      }
      refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-border bg-muted/20">
      <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
        {status?.isDefault ? <CheckCircle2 className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-foreground">Default browser</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {status === null
            ? 'Checking…'
            : status.isDefault
            ? 'TCT Orbit is your default browser. Links from other apps open here.'
            : status.canSet
            ? `Optional: open links from other apps in TCT Orbit.${isWindows ? ' Windows will ask you to confirm.' : ''}`
            : status.reason || 'Not available on this system'}
        </div>
      </div>
      {status && !status.isDefault && status.canSet && (
        <button
          onClick={() => void handleSet()}
          disabled={busy}
          className="h-8 px-3 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 disabled:opacity-50 shrink-0"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Make default
        </button>
      )}
    </div>
  )
}
