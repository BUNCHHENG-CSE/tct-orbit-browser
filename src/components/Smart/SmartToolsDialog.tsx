import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlarmClock,
  Eye,
  ShieldBan,
  FileSearch,
  Trash2,
  RefreshCw,
  ExternalLink,
  Plus,
  Loader2,
  Sparkles,
  X,
  GitCompare,
  Search
} from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/ipc'
import { reopenSnoozed } from '@/lib/snooze'
import { watchActivePage, WATCH_INTERVALS } from '@/lib/watchPage'
import { diffLines, toChunks } from '@/lib/textDiff'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useSmartStore, type SmartToolsTab } from '@/store/useSmartStore'
import { DISTRACTING_DOMAINS, normalizeDomain } from '@/store/usePomodoroStore'
import { openWatchedPage } from './SmartRuntime'
import { DiffView } from './DiffView'
import type { SnoozedTab, PageWatch, SpaceFocusRule, PageIndexStatus, PageSearchHit } from '@/types/smart'

const TABS: Array<{ id: SmartToolsTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'snoozed', label: 'Snoozed', icon: AlarmClock },
  { id: 'watching', label: 'Watching', icon: Eye },
  { id: 'focus', label: 'Focus rules', icon: ShieldBan },
  { id: 'search', label: 'Page search', icon: FileSearch }
]

function relTime(ms: number | null): string {
  if (!ms) return 'never'
  const diff = ms - Date.now()
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (abs < 60_000) return rtf.format(Math.round(diff / 1000), 'second')
  if (abs < 3600_000) return rtf.format(Math.round(diff / 60_000), 'minute')
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3600_000), 'hour')
  return rtf.format(Math.round(diff / 86_400_000), 'day')
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const Favicon: React.FC<{ url: string; src?: string | null }> = ({ url, src }) => {
  const [err, setErr] = useState(false)
  let icon = src || null
  if (!icon) {
    try {
      icon = `${new URL(url).origin}/favicon.ico`
    } catch {}
  }
  return (
    <div className="w-7 h-7 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
      {icon && !err ? <img src={icon} alt="" className="w-4 h-4 rounded-xs" onError={() => setErr(true)} /> : <span className="text-[10px] font-bold text-muted-foreground">{hostOf(url).charAt(0).toUpperCase()}</span>}
    </div>
  )
}

const Empty: React.FC<{ icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }> = ({ icon: Icon, title, children }) => (
  <div className="flex flex-col items-center justify-center text-center py-12 px-6">
    <div className="w-11 h-11 rounded-2xl bg-muted/60 border border-border flex items-center justify-center text-muted-foreground mb-3">
      <Icon className="w-5 h-5" />
    </div>
    <p className="text-sm font-semibold text-foreground mb-1">{title}</p>
    <div className="text-xs text-muted-foreground max-w-sm leading-relaxed">{children}</div>
  </div>
)

const iconBtn = 'w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50'

// ------------------------------------------------------------------ Snoozed

const SnoozedPanel: React.FC = () => {
  const [items, setItems] = useState<SnoozedTab[] | null>(null)
  const spaces = useBrowserStore((s) => s.spaces)
  const load = useCallback(() => {
    api.smart.snoozeList().then(setItems).catch(() => setItems([]))
  }, [])
  useEffect(load, [load])

  if (!items) return <Loading />
  if (items.length === 0) {
    return (
      <Empty icon={AlarmClock} title="No snoozed tabs">
        Right-click any tab and choose <b>Snooze until…</b> to close it now and have it come back later: tomorrow morning, next week, or the next
        time you open its space.
      </Empty>
    )
  }
  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const space = spaces.find((s) => s.id === item.spaceId)
        return (
          <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-muted/20">
            <Favicon url={item.url} src={item.favicon} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {item.wakeAt
                  ? `Back ${new Date(item.wakeAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                  : 'Back when you open this space'}
                {space && (
                  <>
                    {' · '}
                    <span style={{ color: space.color }}>●</span> {space.name}
                  </>
                )}
              </p>
            </div>
            <button
              className="px-2.5 h-7 rounded-lg text-[11px] font-semibold text-primary hover:bg-primary/10 cursor-pointer"
              onClick={async () => {
                await api.smart.snoozeRemove(item.id)
                await reopenSnoozed([item], false)
                load()
              }}
            >
              Open now
            </button>
            <button
              className={iconBtn}
              title="Delete"
              onClick={async () => {
                await api.smart.snoozeRemove(item.id)
                load()
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------------ Watching

const WatchingPanel: React.FC = () => {
  const [items, setItems] = useState<PageWatch[] | null>(null)
  const [checking, setChecking] = useState<string | null>(null)
  const [diffFor, setDiffFor] = useState<PageWatch | null>(null)
  const load = useCallback(() => {
    api.smart.watchList().then(setItems).catch(() => setItems([]))
  }, [])
  useEffect(load, [load])
  useEffect(() => {
    window.addEventListener('tct:watch-updated', load)
    return () => window.removeEventListener('tct:watch-updated', load)
  }, [load])

  const diffOps = useMemo(() => (diffFor ? diffLines(toChunks(diffFor.previousText), toChunks(diffFor.lastText)) : []), [diffFor])

  if (!items) return <Loading />
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Pick a price, a stock status, exam results or a job post on any page. Orbit checks it in the background and notifies you when it
          changes.
        </p>
        <button
          onClick={() => void watchActivePage()}
          className="shrink-0 h-8 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 hover:bg-primary/90 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Watch current page
        </button>
      </div>

      {items.length === 0 ? (
        <Empty icon={Eye} title="Not watching any pages yet">
          Open a page, then choose <b>Watch current page</b> and click the part you care about.
        </Empty>
      ) : (
        <div className="space-y-1.5">
          {items.map((w) => (
            <div
              key={w.id}
              className={`flex items-center gap-3 p-2.5 rounded-xl border ${w.unseen ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/20'}`}
            >
              <Favicon url={w.url} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{w.title}</p>
                  {w.unseen && <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary/15 text-primary">Changed</span>}
                </div>
                <p className="text-[11px] text-muted-foreground truncate" title={w.label}>
                  {w.label || hostOf(w.url)}
                </p>
                <p className={`text-[10.5px] truncate ${w.error ? 'text-amber-500' : 'text-muted-foreground/80'}`}>
                  {w.error
                    ? w.error
                    : !w.lastCheckedAt
                    ? 'First check in progress…'
                    : `Checked ${relTime(w.lastCheckedAt)}${w.lastChangedAt ? ` · changed ${relTime(w.lastChangedAt)}` : ' · no changes yet'}`}
                </p>
              </div>
              <select
                value={w.intervalMin}
                onChange={async (e) => {
                  await api.smart.watchUpdate(w.id, { intervalMin: Number(e.target.value) })
                  load()
                }}
                className="h-7 text-[11px] rounded-lg bg-background border border-border px-1.5 text-foreground cursor-pointer"
                title="How often to check"
              >
                {WATCH_INTERVALS.map((i) => (
                  <option key={i.min} value={i.min}>
                    {i.label}
                  </option>
                ))}
              </select>
              {w.previousText && (
                <button className={iconBtn} title="What changed" onClick={() => setDiffFor(w)}>
                  <GitCompare className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                className={iconBtn}
                title="Check now"
                disabled={checking === w.id}
                onClick={async () => {
                  setChecking(w.id)
                  try {
                    const res = await api.smart.watchCheckNow(w.id)
                    if (res?.error) toast.error('Check failed', { description: res.error })
                    else toast(res?.unseen && res.lastChangedAt && Date.now() - res.lastChangedAt < 60_000 ? 'The page changed' : 'No change')
                  } finally {
                    setChecking(null)
                    load()
                  }
                }}
              >
                {checking === w.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              </button>
              <button
                className={iconBtn}
                title="Open page"
                onClick={() => {
                  useSmartStore.getState().setSmartToolsOpen(false)
                  void openWatchedPage(w).then(load)
                }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <button
                className={iconBtn}
                title="Stop watching"
                onClick={async () => {
                  await api.smart.watchRemove(w.id)
                  load()
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!diffFor} onOpenChange={(o) => !o && setDiffFor(null)}>
        <DialogContent className="max-w-3xl h-[70vh] flex flex-col rounded-2xl">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-sm">What changed</DialogTitle>
            <DialogDescription className="text-xs truncate">{diffFor?.title}</DialogDescription>
          </DialogHeader>
          {diffFor && <DiffView ops={diffOps} leftLabel="the previous check" rightLabel="the latest check" />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ------------------------------------------------------------------ Focus rules

const FocusPanel: React.FC = () => {
  const spaces = useBrowserStore((s) => s.spaces)
  const rules = useSmartStore((s) => s.focusRules)
  const saveRules = useSmartStore((s) => s.saveFocusRules)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const ruleFor = (spaceId: string): SpaceFocusRule =>
    rules.find((r) => r.spaceId === spaceId) || { spaceId, enabled: false, when: 'always', domains: [] }

  const update = (spaceId: string, patch: Partial<SpaceFocusRule>) => {
    const next = { ...ruleFor(spaceId), ...patch }
    void saveRules([...rules.filter((r) => r.spaceId !== spaceId), next])
  }

  const addDomains = (spaceId: string, raw: string) => {
    const added = raw
      .split(/[\s,]+/)
      .map(normalizeDomain)
      .filter((d): d is string => !!d)
    if (added.length === 0) {
      if (raw.trim()) toast.error('Enter a site like youtube.com')
      return
    }
    const rule = ruleFor(spaceId)
    update(spaceId, { domains: Array.from(new Set([...rule.domains, ...added])), enabled: true })
    setDrafts((d) => ({ ...d, [spaceId]: '' }))
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground leading-relaxed px-0.5">
        Keep distracting sites out of a space. In your <b>Work</b> space, YouTube can show a gentle &ldquo;Back to work?&rdquo; page while your Personal
        space is untouched. Choose <b>During focus sprints</b> to only block while the Focus Timer is running.
      </p>
      {spaces.map((space) => {
        const rule = ruleFor(space.id)
        return (
          <div key={space.id} className="rounded-xl border border-border bg-muted/20 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: space.color }} />
                <span className="text-xs font-semibold text-foreground truncate">{space.name}</span>
                {rule.enabled && rule.domains.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {rule.domains.length} site{rule.domains.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={rule.when}
                  disabled={!rule.enabled}
                  onChange={(e) => update(space.id, { when: e.target.value as SpaceFocusRule['when'] })}
                  className="h-7 text-[11px] rounded-lg bg-background border border-border px-1.5 text-foreground cursor-pointer disabled:opacity-50"
                >
                  <option value="always">Always</option>
                  <option value="sprint">During focus sprints</option>
                </select>
                <Switch checked={rule.enabled} onCheckedChange={(enabled) => update(space.id, { enabled })} />
              </div>
            </div>
            {rule.enabled && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {rule.domains.map((d) => (
                    <span key={d} className="flex items-center gap-1 pl-2 pr-1 h-6 rounded-md bg-background border border-border text-[11px] text-foreground">
                      {d}
                      <button
                        onClick={() => update(space.id, { domains: rule.domains.filter((x) => x !== d) })}
                        className="w-4 h-4 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                        aria-label={`Remove ${d}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {rule.domains.length === 0 && <span className="text-[11px] text-muted-foreground">No sites yet.</span>}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={drafts[space.id] || ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [space.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addDomains(space.id, drafts[space.id] || '')
                    }}
                    placeholder="Add sites, e.g. youtube.com reddit.com"
                    className="flex-1 h-8 px-2.5 text-xs rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={() => addDomains(space.id, drafts[space.id] || '')}
                    className="h-8 px-3 rounded-lg bg-muted hover:bg-muted/80 border border-border text-xs font-semibold cursor-pointer"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => update(space.id, { domains: Array.from(new Set([...rule.domains, ...DISTRACTING_DOMAINS])) })}
                    className="h-8 px-3 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 cursor-pointer flex items-center gap-1"
                    title="Add YouTube, Reddit, X, Instagram, TikTok…"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Common distractions
                  </button>
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------------ Page search

const SearchPanel: React.FC = () => {
  const [status, setStatus] = useState<PageIndexStatus | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<PageSearchHit[]>([])
  useEffect(() => {
    api.smart.pageIndexStatus().then(setStatus).catch(() => {})
  }, [])
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      return
    }
    const t = setTimeout(() => {
      api.smart.pageSearch(q, 20).then(setHits).catch(() => setHits([]))
    }, 150)
    return () => clearTimeout(t)
  }, [query])

  if (!status) return <Loading />
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-muted/20 divide-y divide-border">
        <label className="flex items-center justify-between gap-4 p-3 cursor-pointer">
          <div>
            <div className="text-xs font-semibold text-foreground">Remember what pages said</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              Search the text of pages you&apos;ve read from the command bar, e.g. &ldquo;that article about rust lifetimes&rdquo;. Stored only on this
              device. Never for private tabs, login or payment pages. Clearing History clears it too.
            </div>
          </div>
          <Switch checked={status.enabled} onCheckedChange={(v) => void api.smart.pageIndexSetEnabled(v).then(setStatus)} />
        </label>
        <div className="flex items-center justify-between gap-4 p-3">
          <div className="text-[11px] text-muted-foreground">
            {status.pages.toLocaleString()} page{status.pages === 1 ? '' : 's'} remembered · {status.sizeKB.toLocaleString()} KB
          </div>
          <button
            disabled={status.pages === 0}
            onClick={() => {
              if (window.confirm('Forget the text of every page you have read? Your History stays.')) {
                void api.smart.pageIndexClear().then((s) => {
                  setStatus(s)
                  setHits([])
                  toast.success('Page text cleared')
                })
              }
            }}
            className="h-7 px-3 rounded-lg text-[11px] font-semibold text-destructive hover:bg-destructive/10 cursor-pointer disabled:opacity-40"
          >
            Clear all
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search inside pages you've read…"
          className="w-full h-9 pl-8 pr-3 text-xs rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      {query.trim().length >= 2 && hits.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No pages mention that.</p>}
      <div className="space-y-1.5">
        {hits.map((h) => (
          <PageHitRow key={h.url} hit={h} query={query} />
        ))}
      </div>
    </div>
  )
}

/** Snippet with the query words highlighted */
export const HighlightedSnippet: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (words.length === 0) return <>{text}</>
  const re = new RegExp(`(${words.join('|')})`, 'gi')
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-primary/20 text-foreground rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  )
}

const PageHitRow: React.FC<{ hit: PageSearchHit; query: string }> = ({ hit, query }) => (
  <button
    onClick={async () => {
      useSmartStore.getState().setSmartToolsOpen(false)
      const store = useBrowserStore.getState()
      const spaceId = store.activeSpaceId || store.spaces[0]?.id
      if (!spaceId) return
      const tab = await api.tabs.create({ spaceId, url: hit.url, title: hit.title })
      store.insertTabNextTo(spaceId, tab, store.activeTabId, true)
    }}
    className="w-full text-left flex items-start gap-3 p-2.5 rounded-xl border border-border bg-muted/20 hover:bg-muted/50 transition-colors cursor-pointer"
  >
    <Favicon url={hit.url} src={hit.favicon} />
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground truncate">{hit.title}</p>
        <span className="text-[10.5px] text-muted-foreground shrink-0">{relTime(hit.visitedAt)}</span>
      </div>
      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
        <HighlightedSnippet text={hit.snippet} query={query} />
      </p>
      <p className="text-[10.5px] text-muted-foreground/70 truncate font-mono mt-0.5">{hostOf(hit.url)}</p>
    </div>
  </button>
)

const Loading: React.FC = () => (
  <div className="flex items-center justify-center py-12 text-muted-foreground">
    <Loader2 className="w-5 h-5 animate-spin" />
  </div>
)

// ------------------------------------------------------------------ Dialog

export const SmartToolsDialog: React.FC = () => {
  const open = useSmartStore((s) => s.smartToolsOpen)
  const tab = useSmartStore((s) => s.smartToolsTab)
  const setOpen = useSmartStore((s) => s.setSmartToolsOpen)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl h-[78vh] flex flex-col gap-0 p-0 overflow-hidden rounded-2xl">
        <DialogHeader className="p-5 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-primary" /> Smart Tools
          </DialogTitle>
          <DialogDescription className="text-xs">Snoozed tabs, watched pages, focus rules and page search. All kept on this device.</DialogDescription>
        </DialogHeader>
        <div className="px-5 pb-3 shrink-0">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border" role="tablist">
            {TABS.map((t) => {
              const Icon = t.icon
              const active = t.id === tab
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => useSmartStore.setState({ smartToolsTab: t.id })}
                  className={`flex-1 h-8 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
          {tab === 'snoozed' && <SnoozedPanel />}
          {tab === 'watching' && <WatchingPanel />}
          {tab === 'focus' && <FocusPanel />}
          {tab === 'search' && <SearchPanel />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
