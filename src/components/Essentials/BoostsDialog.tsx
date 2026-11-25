import React, { useCallback, useEffect, useState } from 'react'
import { EyeOff, MousePointerClick, Paintbrush, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { FieldLabel, ToolFooter, ToolHeader, toolDialogClass } from '@/components/ui/tool-dialog'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/ipc'
import { useT } from '@/lib/i18n'
import { HIDE_PICKER_SCRIPT } from '@/lib/pageScripts'
import { runInTab } from '@/lib/webviewRegistry'
import { hostOf } from '@shared/siteRules'
import type { Boost } from '@/types/essentials'
import { activeTab } from './EssentialsRuntime'

const emptyBoost = (host: string): Boost => ({ id: '', host, enabled: true, css: '', hidden: [], updatedAt: 0 })

async function loadBoost(host: string): Promise<{ boost: Boost; all: Boost[] }> {
  const all = await api.essentials.boosts.list()
  return { all, boost: all.find((b) => b.host === host) ?? emptyBoost(host) }
}

/** Click an element on the page to hide it on this site from now on */
export async function hideElementOnPage(): Promise<void> {
  const tab = activeTab()
  const host = tab ? hostOf(tab.url) : null
  if (!tab || !host) {
    toast.info('Open a web page first')
    return
  }
  const picked = await runInTab<{ selector: string } | null>(tab.id, HIDE_PICKER_SCRIPT, true)
  // The page could navigate or answer with anything: only a plain selector counts
  const selector = typeof picked?.selector === 'string' ? picked.selector : ''
  if (!selector) return
  const { boost } = await loadBoost(host)
  if (boost.hidden.includes(selector)) return
  await api.essentials.boosts.save({ host, css: boost.css, hidden: [...boost.hidden, selector], enabled: true })
  toast.success('Element hidden', {
    description: `It stays hidden on ${host}.`,
    action: {
      label: 'Undo',
      onClick: () => {
        void loadBoost(host).then(({ boost: b }) =>
          api.essentials.boosts.save({ host, css: b.css, hidden: b.hidden.filter((s) => s !== selector), enabled: b.enabled })
        )
      }
    }
  })
}

/** Custom CSS and hidden elements per site. Open with `tct:open-boosts`. */
export const BoostsDialog: React.FC = () => {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [boost, setBoost] = useState<Boost | null>(null)
  const [all, setAll] = useState<Boost[]>([])

  const show = useCallback(async (host: string | null) => {
    if (!host) {
      const list = await api.essentials.boosts.list()
      setAll(list)
      setBoost(list[0] ?? null)
    } else {
      const r = await loadBoost(host)
      setAll(r.all)
      setBoost(r.boost)
    }
    setOpen(true)
  }, [])

  useEffect(() => {
    const onOpen = () => {
      const tab = activeTab()
      void show(tab ? hostOf(tab.url) : null)
    }
    const onHide = () => void hideElementOnPage()
    window.addEventListener('tct:open-boosts', onOpen)
    window.addEventListener('tct:hide-element', onHide)
    return () => {
      window.removeEventListener('tct:open-boosts', onOpen)
      window.removeEventListener('tct:hide-element', onHide)
    }
  }, [show])

  const save = async (next: Boost, close = false) => {
    try {
      const list = await api.essentials.boosts.save({ host: next.host, css: next.css, hidden: next.hidden, enabled: next.enabled })
      setAll(list)
      setBoost(list.find((b) => b.host === next.host) ?? { ...next, id: '' })
      if (close) setOpen(false)
    } catch {
      toast.error('Could not save')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={`${toolDialogClass} w-[92vw] max-w-xl`}>
        <ToolHeader
          icon={Paintbrush}
          title={t('Boost this site')}
          description={boost ? boost.host : 'Open a website to customize how it looks.'}
          TitleAs={DialogTitle}
          DescriptionAs={DialogDescription}
          actions={
            boost ? <Switch checked={boost.enabled} aria-label="Boost on" onCheckedChange={(enabled) => void save({ ...boost, enabled })} /> : undefined
          }
        />
        {boost && (
          <div className="px-5 pb-4 space-y-4">
            <div>
              <FieldLabel htmlFor="boost-css" hint="Changes only how the site looks on this computer">
                Custom CSS
              </FieldLabel>
              <textarea
                id="boost-css"
                value={boost.css}
                spellCheck={false}
                maxLength={50_000}
                onChange={(e) => setBoost({ ...boost, css: e.target.value })}
                placeholder={'body { font-family: Georgia, serif !important; }'}
                className="w-full h-40 p-3 rounded-xl bg-background border border-border focus:border-primary/60 font-mono text-xs outline-none resize-y"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium">Hidden elements</span>
                <button
                  onClick={() => {
                    setOpen(false)
                    void hideElementOnPage()
                  }}
                  className="h-7 px-2.5 rounded-lg text-[11.5px] border border-border hover:bg-muted inline-flex items-center gap-1.5"
                >
                  <MousePointerClick className="w-3.5 h-3.5" /> {t('Hide an element')}
                </button>
              </div>
              {boost.hidden.length === 0 ? (
                <p className="text-[11.5px] text-muted-foreground">{t('None')}</p>
              ) : (
                <ul className="space-y-1 max-h-36 overflow-y-auto" data-lenis-prevent>
                  {boost.hidden.map((s) => (
                    <li key={s} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border">
                      <EyeOff className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <code className="flex-1 min-w-0 truncate text-[11px]" title={s}>
                        {s}
                      </code>
                      <button
                        aria-label={`Show ${s} again`}
                        title="Show again"
                        onClick={() => void save({ ...boost, hidden: boost.hidden.filter((x) => x !== s) })}
                        className="p-1 rounded hover:bg-background"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {all.length > 0 && (
              <div className="pt-3 border-t border-border">
                <span className="text-xs font-medium">All boosts</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {all.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setBoost(b)}
                      className={`h-6 px-2.5 rounded-full text-[11px] border ${b.host === boost.host ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'} ${b.enabled ? '' : 'opacity-50'}`}
                    >
                      {b.host}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <ToolFooter className="flex items-center justify-between gap-2">
          {boost?.id ? (
            <button
              onClick={() =>
                void api.essentials.boosts.remove(boost.id).then((list) => {
                  setAll(list)
                  setBoost(emptyBoost(boost.host))
                })
              }
              className="h-8 px-3 rounded-lg text-xs text-destructive hover:bg-destructive/10 inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> {t('Delete')}
            </button>
          ) : (
            <span />
          )}
          <button
            disabled={!boost}
            onClick={() => boost && void save(boost, true)}
            className="h-8 px-4 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {t('Save')}
          </button>
        </ToolFooter>
      </DialogContent>
    </Dialog>
  )
}
