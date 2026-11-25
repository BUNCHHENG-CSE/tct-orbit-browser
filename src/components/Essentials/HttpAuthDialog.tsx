import React, { useEffect, useState } from 'react'
import { AlertTriangle, KeyRound } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { FieldLabel, ToolFooter, ToolHeader, toolDialogClass } from '@/components/ui/tool-dialog'
import { api } from '@/lib/ipc'
import { useT } from '@/lib/i18n'
import type { AuthRequest } from '@/types/essentials'

const inputCls = 'w-full h-9 px-3 rounded-lg bg-background border border-border focus:border-primary/60 text-xs outline-none'

/** Sign-in box for sites and proxies that use HTTP authentication */
export const HttpAuthDialog: React.FC = () => {
  const t = useT()
  const [queue, setQueue] = useState<AuthRequest[]>([])
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const current = queue[0]

  useEffect(() => {
    const offReq = api.essentials.auth.onRequest((req) => setQueue((q) => [...q, req]))
    const offDismiss = api.essentials.auth.onDismiss((id) => setQueue((q) => q.filter((r) => r.id !== id)))
    return () => {
      offReq()
      offDismiss()
    }
  }, [])

  useEffect(() => {
    setUser('')
    setPass('')
  }, [current?.id])

  if (!current) return null

  const answer = (username: string | null) => {
    void api.essentials.auth.respond(current.id, username, username === null ? '' : pass)
    setQueue((q) => q.filter((r) => r.id !== current.id))
  }

  return (
    <Dialog open onOpenChange={(open) => !open && answer(null)}>
      <DialogContent className={`${toolDialogClass} max-w-sm`}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            answer(user)
          }}
        >
          <ToolHeader
            icon={KeyRound}
            title={t('Sign in')}
            description={
              <>
                {current.isProxy ? `The proxy ${current.host} needs a username and password.` : `${current.host} needs a username and password.`}
                {current.realm && <span className="block mt-1 break-words">The site says: “{current.realm}”</span>}
              </>
            }
            TitleAs={DialogTitle}
            DescriptionAs={DialogDescription}
          />
          <div className="px-5 pb-4 space-y-3">
            {current.insecure && (
              <p className="flex items-start gap-2 text-[11.5px] text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                This connection is not encrypted. Others on the network could read your password.
              </p>
            )}
            <div>
              <FieldLabel htmlFor="http-auth-user">{t('Username')}</FieldLabel>
              <input id="http-auth-user" autoFocus autoComplete="off" spellCheck={false} maxLength={300} value={user} onChange={(e) => setUser(e.target.value)} className={inputCls} />
            </div>
            <div>
              <FieldLabel htmlFor="http-auth-pass">{t('Password')}</FieldLabel>
              <input id="http-auth-pass" type="password" autoComplete="off" maxLength={1000} value={pass} onChange={(e) => setPass(e.target.value)} className={inputCls} />
            </div>
          </div>
          <ToolFooter className="flex justify-end gap-2">
            <button type="button" onClick={() => answer(null)} className="h-8 px-4 rounded-lg text-xs font-medium border border-border hover:bg-muted">
              {t('Cancel')}
            </button>
            <button type="submit" className="h-8 px-4 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
              {t('Sign in')}
            </button>
          </ToolFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
