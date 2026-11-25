import React, { useEffect, useState } from 'react'
import { KeyRound, X } from 'lucide-react'
import { api } from '@/lib/ipc'
import type { PasswordSaveOffer } from '@/types/api'

/** "Save password for example.com?" card under the address bar (like Chrome's key bubble) */
export const PasswordSavePrompt: React.FC = () => {
  const [offer, setOffer] = useState<PasswordSaveOffer | null>(null)
  const [username, setUsername] = useState('')

  useEffect(() => {
    if (!api.passwords?.onOffer) return
    return api.passwords.onOffer((o) => {
      setOffer((prev) => {
        // A newer offer replaces an unanswered one
        if (prev) void api.passwords.respond(prev.token, 'dismiss')
        return o
      })
      setUsername(o.username)
    })
  }, [])

  if (!offer) return null

  const host = offer.origin.replace(/^https?:\/\//, '')
  const respond = (action: 'save' | 'never' | 'dismiss') => {
    void api.passwords.respond(offer.token, action, action === 'save' ? username : undefined)
    setOffer(null)
  }

  return (
    <div className="fixed top-12 right-4 z-[60] w-80 rounded-2xl bg-popover text-popover-foreground border border-border shadow-2xl p-4 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <KeyRound className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">{offer.isUpdate ? 'Update password?' : 'Save password?'}</div>
          <div className="text-[11px] text-muted-foreground truncate">{host}</div>
        </div>
        <button onClick={() => respond('dismiss')} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" aria-label="Close">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mt-3 space-y-2">
        <label className="block">
          <span className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground">Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="(none)"
            className="mt-1 w-full h-8 px-2.5 rounded-lg bg-background border border-border focus:border-primary/60 text-xs text-foreground outline-none"
          />
        </label>
        <div>
          <span className="text-[10.5px] uppercase tracking-wider font-semibold text-muted-foreground">Password</span>
          <div className="mt-1 h-8 px-2.5 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground flex items-center tracking-widest">
            ••••••••••
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button onClick={() => respond('never')} className="text-[11px] text-muted-foreground hover:text-foreground">
          Never for this site
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => respond('dismiss')} className="h-8 px-3 rounded-lg text-xs font-medium border border-border hover:bg-muted">
            Not now
          </button>
          <button
            onClick={() => respond('save')}
            className="h-8 px-3 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {offer.isUpdate ? 'Update' : 'Save'}
          </button>
        </div>
      </div>
      <p className="mt-3 text-[10.5px] text-muted-foreground">Encrypted on this device with your system account.</p>
    </div>
  )
}
