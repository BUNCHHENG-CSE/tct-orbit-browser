import React, { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useBrowserStore } from '@/store/useBrowserStore'
import { api } from '@/lib/ipc'
import browserLogo from '@/assets/logo.png'
import type { AboutInfo } from '@/types/api'

/** Help > About TCT Orbit. Open with `tct:open-about`. */
export const AboutDialog: React.FC = () => {
  const [open, setOpen] = useState(false)
  const [info, setInfo] = useState<AboutInfo | null>(null)
  const appInfo = useBrowserStore((s) => s.appInfo)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('tct:open-about', onOpen)
    return () => window.removeEventListener('tct:open-about', onOpen)
  }, [])

  useEffect(() => {
    if (open) api.app?.about?.().then(setInfo).catch(() => {})
  }, [open])

  const rows: Array<[string, string]> = info
    ? [
        ['Version', `${info.version} (${appInfo.channel})`],
        ['Chromium', info.chrome],
        ['App runtime', info.electron],
        ['V8', info.v8],
        ['Node.js', info.node],
        ['Platform', info.platform]
      ]
    : []

  const copy = () => {
    navigator.clipboard.writeText(`${appInfo.name}\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}`)
    toast.success('Version info copied')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="sr-only">About {appInfo.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center text-center gap-2 -mt-2">
          <img src={browserLogo} alt="" className="w-16 h-16" />
          <div className="text-lg font-bold text-foreground">{appInfo.name}</div>
          <div className="text-xs text-muted-foreground">A fast, private browser for focused work</div>
        </div>
        <div className="rounded-xl border border-border bg-muted/30 divide-y divide-border mt-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between px-3 py-1.5 text-xs">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-mono text-foreground">{v}</span>
            </div>
          ))}
        </div>
        <button
          onClick={copy}
          disabled={!info}
          className="mx-auto mt-1 h-8 px-3 rounded-lg text-xs font-medium border border-border hover:bg-muted flex items-center gap-1.5"
        >
          <Copy className="w-3.5 h-3.5" /> Copy version info
        </button>
      </DialogContent>
    </Dialog>
  )
}
