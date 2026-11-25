import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Highlighter, Search, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ToolHeader, toolDialogClass } from '@/components/ui/tool-dialog'
import { api } from '@/lib/ipc'
import { useT } from '@/lib/i18n'
import { webContentsIdOf } from '@/lib/tabLifecycle'
import { pageKey } from '@shared/siteRules'
import type { HighlightColor, PageHighlight } from '@/types/essentials'
import { activeTab, openInNewTab } from './EssentialsRuntime'

export const HIGHLIGHT_SWATCH: Record<HighlightColor, string> = { yellow: '#facc15', green: '#4ade80', blue: '#60a5fa', pink: '#f472b6' }

/** Every highlight, newest first, grouped by page. Open with `tct:open-highlights`. */
export const HighlightsDialog: React.FC = () => {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<PageHighlight[]>([])
  const [query, setQuery] = useState('')

  const refresh = useCallback(() => {
    api.essentials.highlights
      .list()
      .then(setItems)
      .catch(() => setItems([]))
  }, [])

  useEffect(() => {
    const onOpen = () => {
      setQuery('')
      refresh()
      setOpen(true)
    }
    window.addEventListener('tct:open-highlights', onOpen)
    return () => window.removeEventListener('tct:open-highlights', onOpen)
  }, [refresh])

  const pages = useMemo(() => {
    const q = query.trim().toLowerCase()
    const map = new Map<string, PageHighlight[]>()
    for (const h of items) {
      if (q && !`${h.text} ${h.title} ${h.url}`.toLowerCase().includes(q)) continue
      map.set(h.url, [...(map.get(h.url) ?? []), h])
    }
    return [...map.entries()]
  }, [items, query])

  const goTo = (h: PageHighlight) => {
    const tab = activeTab()
    const wcId = webContentsIdOf(tab?.id)
    setOpen(false)
    if (tab && wcId !== null && pageKey(tab.url) === h.url) void api.essentials.highlights.scrollTo(wcId, h.id)
    else void openInNewTab(h.url, h.title)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={`${toolDialogClass} w-[92vw] max-w-xl`}>
        <ToolHeader
          icon={Highlighter}
          tone="amber"
          title={t('Highlights')}
          description="Select text on a page, right-click and choose Highlight. Kept on this computer."
          TitleAs={DialogTitle}
          DescriptionAs={DialogDescription}
        />
        <div className="px-5 pb-5 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={query}
              aria-label="Search highlights"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search highlights"
              className="w-full h-8 pl-8 pr-3 rounded-lg bg-background border border-border focus:border-primary/60 text-xs outline-none"
            />
          </div>
          <div className="max-h-[56vh] overflow-y-auto space-y-4 pr-1" data-lenis-prevent>
            {pages.length === 0 && <p className="py-10 text-center text-xs text-muted-foreground">{items.length === 0 ? 'No highlights yet.' : 'No matches.'}</p>}
            {pages.map(([url, list]) => (
              <section key={url}>
                <div className="flex items-center gap-2 mb-1.5">
                  <h4 className="flex-1 min-w-0 truncate text-xs font-semibold" title={url}>
                    {list[0].title || url}
                  </h4>
                  <button
                    title="Open page"
                    aria-label={`Open ${list[0].title || url}`}
                    onClick={() => {
                      setOpen(false)
                      void openInNewTab(url, list[0].title)
                    }}
                    className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
                <ul className="space-y-1.5">
                  {list.map((h) => (
                    <li key={h.id} className="group flex items-start gap-2 rounded-lg bg-muted/30 border border-border">
                      <button onClick={() => goTo(h)} className="flex-1 min-w-0 text-left p-2.5 pl-3 border-l-4 rounded-l-lg text-xs leading-relaxed line-clamp-4" style={{ borderColor: HIGHLIGHT_SWATCH[h.color] }}>
                        {h.text}
                      </button>
                      <button
                        title={t('Delete')}
                        aria-label={t('Delete')}
                        onClick={() => void api.essentials.highlights.remove(h.id).then(refresh)}
                        className="m-1.5 p-1.5 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
