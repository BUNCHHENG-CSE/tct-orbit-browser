import React, { useEffect, useState } from 'react'
import { Download, Globe2, Languages, RefreshCw, RotateCcw, Route, ShieldAlert, SpellCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/hooks/useSettings'
import { useBrowserStore } from '@/store/useBrowserStore'
import { api } from '@/lib/ipc'
import { useT } from '@/lib/i18n'
import { LANGUAGES } from '@/lib/locales'
import { modKey } from '@/lib/platform'
import { useRoutes } from '@/lib/routes'
import { shortcutRecording } from '@/lib/shortcuts'
import { TRANSLATE_LANGUAGES } from '@/lib/translatePage'
import { SHORTCUT_ACTIONS, RESERVED_COMBOS, combosFor, comboFromInput, displayCombo, isAssignableCombo } from '@shared/shortcuts'
import type { SafeBrowsingStatus, UpdateState } from '@/types/essentials'

const card = 'rounded-2xl border border-border bg-muted/20 divide-y divide-border'
const row = 'flex items-center justify-between gap-4 p-4'
const selectCls = 'h-8 px-2 rounded-lg bg-background border border-border text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer shrink-0 max-w-[180px]'
const heading = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground'

const RowText: React.FC<{ icon: React.ComponentType<{ className?: string }>; title: string; children?: React.ReactNode }> = ({ icon: Icon, title, children }) => (
  <div className="flex items-center gap-3 min-w-0">
    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
    <div className="min-w-0">
      <div className="text-xs font-medium text-foreground">{title}</div>
      {children && <div className="text-[11px] text-muted-foreground mt-0.5">{children}</div>}
    </div>
  </div>
)

/** Settings > Languages */
export const LanguageSettings: React.FC = () => {
  const t = useT()
  const { settings, updateSettings } = useSettings()
  return (
    <div className="space-y-2.5">
      <h4 className={heading}>{t('Languages')}</h4>
      <div className={card}>
        <div className={row}>
          <RowText icon={Globe2} title={t('Interface language')}>
            Menus, settings and prompts. Some screens are still in English.
          </RowText>
          <select aria-label={t('Interface language')} className={selectCls} value={settings?.language ?? 'en'} onChange={(e) => void updateSettings({ language: e.target.value })}>
            <option value="system">{t('Same as system')}</option>
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <label className={`${row} cursor-pointer`}>
          <RowText icon={SpellCheck} title={t('Check spelling as you type')}>
            {t('Words are checked on this computer. The dictionary is downloaded once per language.')}
          </RowText>
          <Switch checked={settings?.spellcheck !== false} onCheckedChange={(v) => void updateSettings({ spellcheck: v })} />
        </label>
        <div className={row}>
          <RowText icon={Languages} title={t('Translate pages to')}>
            “{t('Translate page')}” uses Google Translate, which sees the page address. “{t('Ask this page')}” translates on this computer.
          </RowText>
          <select aria-label={t('Translate pages to')} className={selectCls} value={settings?.translateTo ?? ''} onChange={(e) => void updateSettings({ translateTo: e.target.value })}>
            <option value="">{t('Same as interface')}</option>
            {TRANSLATE_LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

/** Settings > Shortcuts */
export const ShortcutSettings: React.FC = () => {
  const t = useT()
  const { settings, updateSettings } = useSettings()
  const [recording, setRecording] = useState<string | null>(null)
  const overrides = settings?.shortcuts ?? {}

  useEffect(() => {
    if (!recording) return
    shortcutRecording.active = true
    void api.essentials.shortcuts.setRecording(true)
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') return setRecording(null)
      const combo = comboFromInput({ key: e.key, code: e.code, control: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey, alt: e.altKey })
      if (!combo) return
      if (!isAssignableCombo(combo)) {
        toast.info(`Use ${modKey}, Alt or a function key`)
        return
      }
      if (RESERVED_COMBOS.has(combo) || /^Mod\+[1-8]$/.test(combo)) {
        toast.error(`${displayCombo(combo, modKey).join('+')} is needed for something else`)
        return
      }
      const taken = SHORTCUT_ACTIONS.find((a) => a.id !== recording && combosFor(a.id, overrides).includes(combo))
      const next: Record<string, string[]> = { ...overrides, [recording]: [combo] }
      if (taken) {
        next[taken.id] = combosFor(taken.id, overrides).filter((c) => c !== combo)
        toast.info(`${displayCombo(combo, modKey).join('+')} no longer does “${t(taken.label)}”`)
      }
      void updateSettings({ shortcuts: next })
      setRecording(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      shortcutRecording.active = false
      void api.essentials.shortcuts.setRecording(false)
    }
  }, [recording, overrides, updateSettings, t])

  const groups = [...new Set(SHORTCUT_ACTIONS.map((a) => a.group))]
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11.5px] text-muted-foreground">{t('Click a shortcut to change it.')}</p>
        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={Object.keys(overrides).length === 0} onClick={() => void updateSettings({ shortcuts: {} })}>
          {t('Reset all')}
        </Button>
      </div>
      {groups.map((g) => (
        <section key={g} className="space-y-1.5">
          <h4 className={heading}>{t(g)}</h4>
          {SHORTCUT_ACTIONS.filter((a) => a.group === g).map((a) => {
            const combos = combosFor(a.id, overrides)
            const label = t(a.label)
            return (
              <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-xl bg-muted/40 border border-border text-xs">
                <span>{label}</span>
                <span className="flex items-center gap-1.5">
                  {overrides[a.id] && (
                    <button
                      title={t('Reset')}
                      aria-label={`${t('Reset')}: ${label}`}
                      onClick={() => {
                        const { [a.id]: _removed, ...rest } = overrides
                        void updateSettings({ shortcuts: rest })
                      }}
                      className="p-1 rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => setRecording(recording === a.id ? null : a.id)}
                    aria-label={`${label}: ${combos[0] ? displayCombo(combos[0], modKey).join(' ') : t('None')}`}
                    className={`min-h-[28px] px-2 rounded-lg border flex items-center gap-1 ${recording === a.id ? 'border-primary bg-primary/10 text-primary' : 'border-transparent hover:border-border hover:bg-background'}`}
                  >
                    {recording === a.id ? (
                      <span className="text-[11px]">{t('Press the new keys…')}</span>
                    ) : combos[0] ? (
                      displayCombo(combos[0], modKey).map((k, i) => (
                        <kbd key={i} className="px-1.5 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-muted border border-border">
                          {k}
                        </kbd>
                      ))
                    ) : (
                      <span className="text-[11px] text-muted-foreground">{t('None')}</span>
                    )}
                  </button>
                </span>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}

/** Settings > Tabs & Spaces: links that always open in one Space */
export const LinkRoutingSettings: React.FC = () => {
  const t = useT()
  const routes = useRoutes((s) => s.routes)
  const spaces = useBrowserStore((s) => s.spaces)
  const [site, setSite] = useState('')
  const [spaceId, setSpaceId] = useState('')
  const target = spaceId || spaces[0]?.id || ''

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!site.trim() || !target) return
    try {
      await api.essentials.routes.save(site, target)
      setSite('')
    } catch {
      toast.error('Enter a web address, like github.com')
    }
  }

  return (
    <div className="space-y-2.5">
      <h4 className={heading}>Link routing</h4>
      <div className={card}>
        <div className="p-4">
          <RowText icon={Route} title="Open certain sites in a Space">
            Links from other apps and new tabs on these sites open in the Space you choose, whichever Space you are in. Links opened inside a Space with its own profile stay there.
          </RowText>
        </div>
        {routes.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
            <span className="flex-1 min-w-0 truncate font-mono">{r.pattern}</span>
            <span className="text-muted-foreground">→</span>
            <select
              aria-label={`Space for ${r.pattern}`}
              value={r.spaceId}
              onChange={(e) => void api.essentials.routes.save(r.pattern, e.target.value)}
              className={selectCls}
            >
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button aria-label={`${t('Delete')}: ${r.pattern}`} title={t('Delete')} onClick={() => void api.essentials.routes.remove(r.id)} className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <form onSubmit={add} className="flex items-center gap-2 p-4">
          <input
            aria-label="Site"
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="github.com"
            className="flex-1 min-w-0 h-8 px-2.5 rounded-lg bg-background border border-border focus:border-primary/60 text-xs outline-none"
          />
          <select aria-label="Space" value={target} onChange={(e) => setSpaceId(e.target.value)} className={selectCls}>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" className="h-8 text-xs" disabled={!site.trim()}>
            {t('Add')}
          </Button>
        </form>
      </div>
    </div>
  )
}

/** Settings > Privacy: phishing and malware protection */
export const SafeBrowsingCard: React.FC = () => {
  const { settings, updateSettings } = useSettings()
  const [status, setStatus] = useState<SafeBrowsingStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.essentials.safeBrowsing.status().then(setStatus).catch(() => {})
  }, [settings?.safeBrowsing])

  const refresh = async () => {
    setBusy(true)
    try {
      setStatus(await api.essentials.safeBrowsing.refresh())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={card}>
      <label className={`${row} cursor-pointer`}>
        <RowText icon={ShieldAlert} title="Warn about dangerous sites">
          Checks addresses against lists of phishing and malware sites on this computer. The sites you visit are never sent anywhere.
        </RowText>
        <Switch checked={settings?.safeBrowsing !== false} onCheckedChange={(v) => void updateSettings({ safeBrowsing: v })} />
      </label>
      {settings?.safeBrowsing !== false && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-[11px] text-muted-foreground">
          <span>
            {status && status.entries > 0
              ? `${status.entries.toLocaleString()} sites${status.updatedAt ? `, updated ${new Date(status.updatedAt).toLocaleString()}` : ''}`
              : 'The lists have not been downloaded yet.'}
          </span>
          <button onClick={() => void refresh()} disabled={busy} className="inline-flex items-center gap-1.5 hover:text-foreground disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} /> Update now
          </button>
        </div>
      )}
    </div>
  )
}

function updateText(s: UpdateState | null): string {
  switch (s?.phase) {
    case 'unsupported':
      return s.reason ?? 'This version does not update itself'
    case 'checking':
      return 'Checking for updates…'
    case 'available':
      return `Version ${s.version} found`
    case 'downloading':
      return `Downloading ${s.version ?? 'the update'}… ${s.percent ?? 0}%`
    case 'ready':
      return `Version ${s.version} is ready to install`
    case 'none':
      return 'You have the latest version'
    case 'error':
      return s.error ?? 'The update check failed'
    default:
      return 'Not checked yet'
  }
}

/** Settings > About: updates */
export const UpdateCard: React.FC = () => {
  const { settings, updateSettings } = useSettings()
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => {
    api.essentials.updates.state().then(setState).catch(() => {})
    return api.essentials.updates.onState(setState)
  }, [])
  const busy = ['checking', 'available', 'downloading'].includes(state?.phase ?? '')

  return (
    <div className={card}>
      <div className={row}>
        <RowText icon={Download} title="Updates">
          <span aria-live="polite">{updateText(state)}</span>
        </RowText>
        {state?.phase === 'ready' ? (
          <Button size="sm" className="h-8 text-xs" onClick={() => void api.essentials.updates.install()}>
            Restart to update
          </Button>
        ) : (
          state?.phase !== 'unsupported' && (
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={busy} onClick={() => void api.essentials.updates.check()}>
              Check now
            </Button>
          )
        )}
      </div>
      {state?.phase !== 'unsupported' && (
        <label className={`${row} cursor-pointer`}>
          <RowText icon={RefreshCw} title="Update automatically">
            Looks for a new version on GitHub every few hours and installs it when you restart.
          </RowText>
          <Switch checked={settings?.autoUpdate !== false} onCheckedChange={(v) => void updateSettings({ autoUpdate: v })} />
        </label>
      )}
    </div>
  )
}
