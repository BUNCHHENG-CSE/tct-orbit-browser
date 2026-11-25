import React, { useEffect, useState } from 'react'
import { AppWindow, Monitor, ScreenShare } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Segmented, ToolFooter, ToolHeader, toolDialogClass } from '@/components/ui/tool-dialog'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/ipc'
import { useT } from '@/lib/i18n'
import type { ScreenShareRequest } from '@/types/essentials'

const hostOf = (origin: string) => {
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

/** Shown every time a page wants to share the screen. Nothing is captured before a choice. */
export const ScreenSharePicker: React.FC = () => {
  const t = useT()
  const [queue, setQueue] = useState<ScreenShareRequest[]>([])
  const [kind, setKind] = useState<'screen' | 'window'>('screen')
  const [selected, setSelected] = useState<string | null>(null)
  const [audio, setAudio] = useState(false)
  const current = queue[0]

  useEffect(() => {
    const offReq = api.essentials.screenShare.onRequest((req) => setQueue((q) => [...q, req]))
    const offDismiss = api.essentials.screenShare.onDismiss((id) => setQueue((q) => q.filter((r) => r.id !== id)))
    return () => {
      offReq()
      offDismiss()
    }
  }, [])

  useEffect(() => {
    setSelected(null)
    setAudio(false)
    setKind('screen')
  }, [current?.id])

  if (!current) return null

  const answer = (sourceId: string | null) => {
    void api.essentials.screenShare.respond(current.id, sourceId, audio)
    setQueue((q) => q.filter((r) => r.id !== current.id))
  }
  const sources = current.sources.filter((s) => s.kind === kind)

  return (
    <Dialog open onOpenChange={(open) => !open && answer(null)}>
      <DialogContent className={`${toolDialogClass} w-[92vw] max-w-2xl`}>
        <ToolHeader
          icon={ScreenShare}
          title={t('Choose what to share')}
          description={`${hostOf(current.origin)} wants to see your screen.`}
          TitleAs={DialogTitle}
          DescriptionAs={DialogDescription}
        />
        <div className="px-5 pb-4 space-y-3">
          <Segmented
            value={kind}
            onChange={(k) => {
              setKind(k)
              setSelected(null)
            }}
            options={[
              { value: 'screen', label: <><Monitor className="w-3.5 h-3.5" /> {t('Screens')}</> },
              { value: 'window', label: <><AppWindow className="w-3.5 h-3.5" /> {t('Windows')}</> }
            ]}
          />
          <div role="listbox" aria-label={t('Choose what to share')} className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[46vh] overflow-y-auto p-0.5" data-lenis-prevent>
            {sources.map((s) => (
              <button
                key={s.id}
                role="option"
                aria-selected={selected === s.id}
                onClick={() => setSelected(s.id)}
                onDoubleClick={() => answer(s.id)}
                className={`text-left rounded-xl border-2 p-1.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  selected === s.id ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground/50'
                }`}
              >
                <div className="aspect-[16/10] rounded-lg bg-muted overflow-hidden flex items-center justify-center">
                  {s.thumbnail ? <img src={s.thumbnail} alt="" className="w-full h-full object-contain" /> : <AppWindow className="w-6 h-6 text-muted-foreground" />}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 px-0.5">
                  {s.icon && <img src={s.icon} alt="" className="w-3.5 h-3.5 shrink-0" />}
                  <span className="text-[11.5px] truncate">{s.name}</span>
                </div>
              </button>
            ))}
            {sources.length === 0 && <p className="col-span-full py-8 text-center text-xs text-muted-foreground">{t('None')}</p>}
          </div>
        </div>
        <ToolFooter className="flex items-center justify-between gap-3">
          {current.audioAvailable ? (
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Switch checked={audio} onCheckedChange={setAudio} /> {t('Share system audio')}
            </label>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={() => answer(null)} className="h-8 px-4 rounded-lg text-xs font-medium border border-border hover:bg-muted">
              {t('Cancel')}
            </button>
            <button
              disabled={!selected}
              onClick={() => answer(selected)}
              className="h-8 px-4 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              {t('Share')}
            </button>
          </div>
        </ToolFooter>
      </DialogContent>
    </Dialog>
  )
}
