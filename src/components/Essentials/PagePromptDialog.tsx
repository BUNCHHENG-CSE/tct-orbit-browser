import React, { useEffect, useState } from 'react'
import { MessageSquareText } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ToolFooter, ToolHeader, toolDialogClass } from '@/components/ui/tool-dialog'
import { api } from '@/lib/ipc'
import { useT } from '@/lib/i18n'
import type { PagePromptRequest } from '@/types/essentials'

/** window.prompt() of web pages. The page waits for the answer. */
export const PagePromptDialog: React.FC = () => {
  const t = useT()
  const [queue, setQueue] = useState<PagePromptRequest[]>([])
  const [value, setValue] = useState('')
  const [mute, setMute] = useState(false)
  const current = queue[0]

  useEffect(() => {
    const offReq = api.essentials.pagePrompts.onRequest((req) => setQueue((q) => [...q, req]))
    const offDismiss = api.essentials.pagePrompts.onDismiss((id) => setQueue((q) => q.filter((r) => r.id !== id)))
    return () => {
      offReq()
      offDismiss()
    }
  }, [])

  useEffect(() => {
    setValue(current?.value ?? '')
    setMute(false)
  }, [current?.id, current?.value])

  if (!current) return null

  const answer = (v: string | null) => {
    void api.essentials.pagePrompts.respond(current.id, v, mute)
    setQueue((q) => q.filter((r) => r.id !== current.id))
  }

  return (
    <Dialog open onOpenChange={(open) => !open && answer(null)}>
      <DialogContent className={`${toolDialogClass} max-w-md`}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            answer(value)
          }}
        >
          <ToolHeader
            icon={MessageSquareText}
            title={`${current.host} asks`}
            description={<span className="whitespace-pre-wrap break-words select-text">{current.message}</span>}
            TitleAs={DialogTitle}
            DescriptionAs={DialogDescription}
          />
          <div className="px-5 pb-4 space-y-3">
            <input
              autoFocus
              aria-label={current.message || `${current.host} asks`}
              value={value}
              maxLength={2000}
              onChange={(e) => setValue(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="w-full h-9 px-3 rounded-lg bg-background border border-border focus:border-primary/60 text-xs outline-none"
            />
            <label className="flex items-center gap-2 text-[11.5px] text-muted-foreground cursor-pointer select-none">
              <input type="checkbox" checked={mute} onChange={(e) => setMute(e.target.checked)} className="accent-[hsl(var(--primary))]" />
              Don’t let this page ask again
            </label>
          </div>
          <ToolFooter className="flex justify-end gap-2">
            <button type="button" onClick={() => answer(null)} className="h-8 px-4 rounded-lg text-xs font-medium border border-border hover:bg-muted">
              {t('Cancel')}
            </button>
            <button type="submit" className="h-8 px-4 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
              OK
            </button>
          </ToolFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
