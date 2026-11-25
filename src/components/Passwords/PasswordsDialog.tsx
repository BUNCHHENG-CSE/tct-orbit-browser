import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { KeyRound, Search, Eye, EyeOff, Copy, Trash2, Pencil, Check, X, ShieldCheck, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/ipc'
import type { PasswordEntryInfo, PasswordSettings } from '@/types/api'

const host = (origin: string) => origin.replace(/^https?:\/\//, '')

const Row: React.FC<{ entry: PasswordEntryInfo; onChanged: () => void }> = ({ entry, onChanged }) => {
  const [revealed, setRevealed] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [user, setUser] = useState(entry.username)
  const [pass, setPass] = useState('')
  const [failed, setFailed] = useState(false)

  const reveal = async () => {
    if (revealed !== null) return setRevealed(null)
    const p = await api.passwords.reveal(entry.id)
    if (p === null || p === '') setFailed(true)
    setRevealed(p || '')
  }
  const copyPassword = async () => {
    const p = await api.passwords.reveal(entry.id)
    if (!p) return toast.error('Could not decrypt this password')
    await navigator.clipboard.writeText(p)
    toast.success('Password copied')
  }
  const saveEdit = async () => {
    await api.passwords.update(entry.id, { username: user, ...(pass ? { password: pass } : {}) })
    setEditing(false)
    setPass('')
    setRevealed(null)
    onChanged()
  }

  let favicon = ''
  try {
    favicon = `${new URL(entry.origin).origin}/favicon.ico`
  } catch {}

  return (
    <div className="p-3 rounded-xl border border-border bg-muted/20 space-y-2">
      <div className="flex items-center gap-3">
        <img src={favicon} alt="" className="w-5 h-5 rounded object-contain shrink-0" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-foreground truncate">{host(entry.origin)}</div>
          {!editing && <div className="text-[11px] text-muted-foreground truncate">{entry.username || '(no username)'}</div>}
        </div>
        {!editing && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => void reveal()} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" title={revealed !== null ? 'Hide' : 'Show password'}>
              {revealed !== null ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => void copyPassword()} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" title="Copy password">
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setEditing(true)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" title="Edit">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => void api.passwords.remove(entry.id).then(onChanged)}
              className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      {revealed !== null && !editing && (
        <div className="pl-8 font-mono text-xs text-foreground break-all select-text">
          {failed ? <span className="text-destructive">Could not decrypt (saved on another computer or account)</span> : revealed}
        </div>
      )}
      {editing && (
        <div className="pl-8 space-y-2">
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="Username"
            className="w-full h-8 px-2.5 rounded-lg bg-background border border-border focus:border-primary/60 text-xs outline-none"
          />
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="New password (leave empty to keep)"
            className="w-full h-8 px-2.5 rounded-lg bg-background border border-border focus:border-primary/60 text-xs outline-none"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="h-7 px-2.5 rounded-lg text-xs border border-border hover:bg-muted flex items-center gap-1">
              <X className="w-3 h-3" /> Cancel
            </button>
            <button onClick={() => void saveEdit()} className="h-7 px-2.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground flex items-center gap-1">
              <Check className="w-3 h-3" /> Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Tools > Passwords. Open with `tct:open-passwords`. */
export const PasswordsDialog: React.FC = () => {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<PasswordEntryInfo[]>([])
  const [settings, setSettings] = useState<PasswordSettings | null>(null)
  const [query, setQuery] = useState('')

  const refresh = useCallback(() => {
    api.passwords?.list().then(setList).catch(() => setList([]))
    api.passwords?.getSettings().then(setSettings).catch(() => {})
  }, [])

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('tct:open-passwords', onOpen)
    return () => window.removeEventListener('tct:open-passwords', onOpen)
  }, [])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? list.filter((e) => e.origin.toLowerCase().includes(q) || e.username.toLowerCase().includes(q)) : list
  }, [list, query])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            Passwords
          </DialogTitle>
        </DialogHeader>

        <label className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20 cursor-pointer">
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-semibold text-foreground">Offer to save passwords</span>
            <span className="block text-[11px] text-muted-foreground mt-0.5">
              When you sign in, TCT Orbit asks to save the login and fills it next time. Never in private tabs.
            </span>
          </span>
          <Switch checked={settings?.offerToSave ?? true} onCheckedChange={(v) => void api.passwords.setOfferToSave(v).then(setSettings)} />
        </label>

        {settings && (
          <p className={`text-[11px] flex items-center gap-1.5 ${settings.encrypted ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'}`}>
            {settings.encrypted ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            {settings.encrypted
              ? 'Passwords are encrypted with your system account and stay on this device.'
              : 'System encryption is not available, so new passwords are not saved.'}
          </p>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search passwords"
            className="w-full h-8 pl-8 pr-3 rounded-lg bg-background border border-border focus:border-primary/60 text-xs outline-none"
          />
        </div>

        <div className="max-h-[42vh] overflow-y-auto space-y-2 pr-1">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              {list.length === 0 ? 'No saved passwords yet. Sign in to a site and choose Save.' : 'No matches.'}
            </div>
          ) : (
            filtered.map((e) => <Row key={e.id} entry={e} onChanged={refresh} />)
          )}
        </div>

        {settings && settings.neverSave.length > 0 && (
          <div className="pt-2 border-t border-border">
            <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">Never saved for</div>
            <div className="flex flex-wrap gap-1.5">
              {settings.neverSave.map((o) => (
                <span key={o} className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full bg-muted text-[11px] text-foreground">
                  {host(o)}
                  <button onClick={() => void api.passwords.removeNeverSave(o).then(setSettings)} className="p-0.5 rounded-full hover:bg-background" aria-label={`Allow saving for ${host(o)}`}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
