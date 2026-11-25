import React, { useEffect, useMemo, useState } from 'react'
import { Keyboard, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useShortcutGroups } from '@/lib/shortcuts'
import { useT } from '@/lib/i18n'

/** Ctrl+/ (or "?" outside text fields): searchable keyboard shortcut cheat sheet */
export const ShortcutHelpDialog: React.FC = () => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const all = useShortcutGroups()
  const t = useT()

  useEffect(() => {
    const onOpen = () => {
      setQuery('')
      setOpen(true)
    }
    window.addEventListener('tct:open-shortcut-help', onOpen)
    return () => window.removeEventListener('tct:open-shortcut-help', onOpen)
  }, [])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return all
    return all.map((g) => ({
      ...g,
      items: g.items.filter((i) => i.description.toLowerCase().includes(q) || t(i.description).toLowerCase().includes(q) || i.keys.join(' ').toLowerCase().includes(q))
    })).filter((g) => g.items.length > 0)
  }, [query, all, t])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[92vw] max-w-3xl max-h-[80vh] p-0 overflow-hidden flex flex-col bg-card border border-border rounded-2xl">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Keyboard className="w-4 h-4 text-primary" /> Keyboard shortcuts
          </DialogTitle>
          <DialogDescription className="text-xs">Works everywhere, including while a web page has focus.</DialogDescription>
          <div className="mt-2 flex items-center gap-2 px-3 h-8 rounded-lg bg-muted border border-border">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter shortcuts..."
              className="flex-1 bg-transparent outline-none text-xs text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5" data-lenis-prevent>
          {groups.length === 0 && <p className="text-xs text-muted-foreground">No shortcut matches "{query}".</p>}
          {groups.map((g) => (
            <section key={g.title}>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{t(g.title)}</h4>
              <ul className="space-y-1">
                {g.items.map((item) => (
                  <li key={item.description} className="flex items-center justify-between gap-3 py-1 text-xs">
                    <span className="text-foreground">{t(item.description)}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {item.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="px-1.5 py-0.5 min-w-[22px] text-center rounded-md text-[11px] font-mono font-semibold bg-muted text-foreground border border-border shadow-xs"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
