import React, { useEffect, useState } from 'react'
import { Video, FileText, Globe, Ban, Link2, Check, Clock } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ToolHeader, ToolFooter, Segmented, FieldLabel, toolDialogClass } from '@/components/ui/tool-dialog'
import { normalizeUrl, isUrl } from '@/lib/searchEngines'
import { useMeetingStore, meetingProvider, type MeetingNotesMode } from '@/store/useMeetingStore'

/** "HH:MM" for <input type="time">, rounded up to the next 5 minutes */
function defaultStartTime(): string {
  const d = new Date(Date.now() + 5 * 60_000)
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Next occurrence of HH:MM (today, or tomorrow if that time already passed more than 1h ago) */
function timeToTimestamp(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10))
  const d = new Date()
  d.setHours(h || 0, m || 0, 0, 0)
  if (d.getTime() < Date.now() - 3600_000) d.setDate(d.getDate() + 1)
  return d.getTime()
}

const NOTES_OPTIONS: Array<{ id: MeetingNotesMode; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'drawer', label: 'Space notes', hint: 'Notes drawer', icon: FileText },
  { id: 'url', label: 'A page', hint: 'Doc side by side', icon: Globe },
  { id: 'none', label: 'No notes', hint: 'Just the call', icon: Ban }
]

const inputCls =
  'w-full h-10 rounded-xl bg-background ring-1 ring-border px-3 text-[13px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:ring-2 focus:ring-primary/60 transition-shadow'

export const MeetingDialog: React.FC = () => {
  const open = useMeetingStore((s) => s.dialogOpen)
  const setOpen = useMeetingStore((s) => s.setDialogOpen)
  const start = useMeetingStore((s) => s.start)
  const recentUrls = useMeetingStore((s) => s.recentUrls)

  const [meetingUrl, setMeetingUrl] = useState('')
  const [title, setTitle] = useState('')
  const [notesMode, setNotesMode] = useState<MeetingNotesMode>('drawer')
  const [notesUrl, setNotesUrl] = useState('')
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [startTime, setStartTime] = useState(defaultStartTime)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setStartTime(defaultStartTime())
      setSubmitting(false)
    }
  }, [open])

  const meetingValid = isUrl(meetingUrl.trim())
  const notesValid = notesMode !== 'url' || isUrl(notesUrl.trim())
  const provider = meetingValid ? meetingProvider(normalizeUrl(meetingUrl.trim())) : null
  const canSubmit = meetingValid && notesValid && !submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    await start({
      title,
      meetingUrl: normalizeUrl(meetingUrl.trim()),
      notesMode,
      notesUrl: notesMode === 'url' ? normalizeUrl(notesUrl.trim()) : undefined,
      startAt: when === 'now' ? Date.now() : timeToTimestamp(startTime)
    })
    setSubmitting(false)
    setMeetingUrl('')
    setTitle('')
    setNotesUrl('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={`max-w-[460px] ${toolDialogClass}`}>
        <ToolHeader
          icon={Video}
          tone="rose"
          title="Meeting mode"
          description="Opens the call next to your notes, with a countdown in the title bar."
          TitleAs={DialogTitle}
          DescriptionAs={DialogDescription}
        />

        <form onSubmit={handleSubmit}>
          <div className="px-5 pb-5 space-y-4">
            {/* Link */}
            <div>
              <FieldLabel htmlFor="meeting-url">Meeting link</FieldLabel>
              <div className="relative">
                <Link2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  id="meeting-url"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  placeholder="Paste a Meet, Zoom or Teams link"
                  autoFocus
                  required
                  className={`${inputCls} pl-9 ${provider ? 'pr-32' : ''}`}
                />
                {provider && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 h-6 px-2 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium max-w-[120px]">
                    <Check className="w-3 h-3 shrink-0" />
                    <span className="truncate">{provider}</span>
                  </span>
                )}
              </div>
              {recentUrls.length > 0 && !meetingUrl && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {recentUrls.slice(0, 4).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setMeetingUrl(u)}
                      className="h-6 px-2 rounded-md bg-muted/60 hover:bg-muted ring-1 ring-border/60 text-[11px] text-muted-foreground hover:text-foreground truncate max-w-[200px] cursor-pointer"
                      title={u}
                    >
                      {meetingProvider(u)} · {u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 24)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Title */}
            <div>
              <FieldLabel htmlFor="meeting-title" hint="optional">
                Title
              </FieldLabel>
              <input
                id="meeting-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={provider || 'Weekly sync'}
                maxLength={80}
                className={inputCls}
              />
            </div>

            {/* Notes */}
            <div>
              <FieldLabel>Notes</FieldLabel>
              <div className="grid grid-cols-3 gap-2" role="radiogroup">
                {NOTES_OPTIONS.map((opt) => {
                  const Icon = opt.icon
                  const selected = notesMode === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setNotesMode(opt.id)}
                      className={`relative flex flex-col items-start gap-1.5 p-3 rounded-xl text-left transition-colors cursor-pointer ${
                        selected ? 'bg-primary/10 ring-2 ring-primary/70' : 'bg-muted/40 ring-1 ring-border hover:bg-muted/70'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="text-xs font-semibold text-foreground leading-none">{opt.label}</span>
                      <span className="text-[11px] text-muted-foreground leading-tight">{opt.hint}</span>
                      {selected && (
                        <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                          <Check className="w-2.5 h-2.5" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              {notesMode === 'url' && (
                <input
                  className={`${inputCls} mt-2`}
                  value={notesUrl}
                  onChange={(e) => setNotesUrl(e.target.value)}
                  placeholder="https://docs.google.com/document/…"
                  required
                />
              )}
            </div>

            {/* Start */}
            <div>
              <FieldLabel>Starts</FieldLabel>
              <div className="flex items-center gap-2">
                <Segmented
                  className="flex-1"
                  value={when}
                  onChange={setWhen}
                  options={[
                    { value: 'now', label: 'Now' },
                    { value: 'later', label: 'At a time' }
                  ]}
                />
                {when === 'later' && (
                  <div className="relative animate-in fade-in slide-in-from-left-1 duration-150">
                    <Clock className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="h-10 w-[118px] pl-8 pr-2 rounded-xl bg-background ring-1 ring-border text-[13px] text-foreground outline-none focus:ring-2 focus:ring-primary/60 [color-scheme:light] dark:[color-scheme:dark]"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <ToolFooter className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 px-4 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="h-9 px-4 rounded-lg text-[13px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer flex items-center gap-1.5 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
            >
              <Video className="w-4 h-4" />
              {when === 'now' ? 'Join meeting' : 'Schedule'}
            </button>
          </ToolFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
