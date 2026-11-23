import React, { useEffect } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/ipc'
import { useBrowserStore } from '@/store/useBrowserStore'
import { openStartupTemplates } from '@/lib/spaceTemplates'
import { LEGAL_LAST_UPDATED } from '@/lib/legal'

function isTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
}

/** Reload spaces + tabs from the main process (after a session restore) */
async function reloadSpaces(): Promise<void> {
  const list = await api.spaces.list()
  useBrowserStore.getState().setSpaces(list)
}

/**
 * Headless component for app-level notices:
 * - crash / previous-session restore prompt
 * - HTTPS-Only fallback warning ("this site has no HTTPS")
 * - Focus Sprint block notice
 * - space templates flagged "open on startup"
 * - "?" opens the shortcut cheat sheet
 */
export const AppNotices: React.FC = () => {
  // Session restore (once, after the first spaces load)
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const info = await api.session?.getRestoreInfo()
        if (cancelled || !info) return
        if (info.restorableCount > 0) {
          toast(info.crashed ? "TCT Orbit didn't shut down correctly" : 'Restore your previous session?', {
            description: `${info.restorableCount} tab${info.restorableCount === 1 ? '' : 's'} from last time can be reopened.`,
            duration: 20000,
            action: {
              label: 'Restore',
              onClick: async () => {
                const n = await api.session.restore()
                await reloadSpaces()
                toast.success(`Restored ${n} tab${n === 1 ? '' : 's'}`, { description: 'They load when you open them.' })
              }
            },
            onDismiss: () => void api.session.dismiss(),
            onAutoClose: () => void api.session.dismiss()
          })
        } else if (info.crashed) {
          // Default "previous session" startup already reopened everything
          toast.info("TCT Orbit didn't shut down correctly", { description: 'Your tabs were restored.' })
          void api.session.dismiss()
        }
      } catch {}

      // Templates marked "open on startup"
      try {
        const opened = await openStartupTemplates()
        if (opened > 0) toast.success(`Opened ${opened} space template${opened === 1 ? '' : 's'}`)
      } catch {}
    }, 1200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [])

  // "Restore Previous Session" from the command bar
  useEffect(() => {
    const onRestore = async () => {
      try {
        const n = await api.session.restore()
        if (n > 0) {
          await reloadSpaces()
          toast.success(`Restored ${n} tab${n === 1 ? '' : 's'} from your previous session`)
        } else {
          toast.info('Nothing to restore', { description: 'All tabs from your previous session are already open.' })
        }
      } catch {
        toast.error('Could not restore the previous session')
      }
    }
    window.addEventListener('tct:restore-session', onRestore)
    return () => window.removeEventListener('tct:restore-session', onRestore)
  }, [])

  // Terms / Privacy Policy changed since the user last saw them: say so once
  useEffect(() => {
    const KEY = 'tct_legal_version_seen'
    try {
      const seen = localStorage.getItem(KEY)
      if (seen && seen !== LEGAL_LAST_UPDATED) {
        toast.info('Terms of Use and Privacy Policy updated', {
          description: `Changes effective ${LEGAL_LAST_UPDATED}.`,
          duration: 12000,
          action: {
            label: 'Read',
            onClick: () => window.dispatchEvent(new CustomEvent('tct:open-legal', { detail: { doc: 'privacy' } }))
          }
        })
      }
      localStorage.setItem(KEY, LEGAL_LAST_UPDATED)
    } catch {}
  }, [])

  // HTTPS-Only fallback notice
  useEffect(() => {
    if (!api.privacy?.onHttpsFallback) return
    return api.privacy.onHttpsFallback((info) => {
      toast.warning(`${info.host} doesn't support HTTPS`, {
        description: 'Loaded over an insecure connection. Avoid entering passwords or payment details.',
        duration: 6000
      })
    })
  }, [])

  // Focus Sprint block notice (deduped per host for a few seconds)
  useEffect(() => {
    if (!api.focus?.onBlocked) return
    let last = { host: '', time: 0 }
    return api.focus.onBlocked((info) => {
      const now = Date.now()
      if (last.host === info.host && now - last.time < 4000) return
      last = { host: info.host, time: now }
      toast.warning(`${info.host} is blocked during your Focus Sprint`, {
        description: 'Stay on track! It unblocks when the sprint ends or you pause the timer.',
        duration: 5000
      })
    })
  }, [])

  // "?" (outside text fields) opens the cheat sheet
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('tct:open-shortcut-help'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return null
}
