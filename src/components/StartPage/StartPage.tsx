import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  Columns2,
  FileText,
  Download,
  Video,
  X,
  History as HistoryIcon,
  Settings2,
  ArrowRight,
  Star
} from 'lucide-react'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useSavedSplits } from '@/hooks/useSavedSplits'
import { api } from '@/lib/ipc'
import { SEARCH_ENGINES, type SearchEngineId } from '@/lib/searchEngines'
import { navigateFromStartPage } from '@/lib/startPage'
import { useSearchSuggestions } from '@/hooks/useSearchSuggestions'
import { openSavedSplit, removeSavedSplit } from '@/lib/savedSplits'
import { useMeetingStore } from '@/store/useMeetingStore'
import type { DownloadRecord, HistoryEntry, Tab } from '@/types/api'

interface StartPageProps {
  tab: Tab
  isActive: boolean
  paneStyle?: React.CSSProperties
  onFocusPane?: () => void
}

interface Shortcut {
  origin: string
  host: string
  title: string
  url: string
  favicon?: string | null
  score: number
}

function greeting(hour: number): string {
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6']
function avatarColor(text: string): string {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

/** Site icon: the page's favicon, else a colored letter avatar */
const SiteIcon: React.FC<{ origin: string; host: string; favicon?: string | null; size?: number }> = ({ origin, host, favicon, size = 22 }) => {
  // Deduplicated: if the stored favicon IS /favicon.ico, retrying the same URL would never fire
  // another error and the tile would stay a broken image
  const sources = useMemo(
    () => [...new Set([favicon, `${origin}/favicon.ico`].filter((s): s is string => !!s && /^https?:|^data:/.test(s)))],
    [favicon, origin]
  )
  const [idx, setIdx] = useState(0)
  if (idx >= sources.length) {
    return (
      <span
        className="flex items-center justify-center rounded-md text-white font-bold"
        style={{ width: size, height: size, backgroundColor: avatarColor(host), fontSize: size * 0.5 }}
      >
        {host.charAt(0).toUpperCase()}
      </span>
    )
  }
  return <img key={sources[idx]} src={sources[idx]} alt="" style={{ width: size, height: size }} className="object-contain" onError={() => setIdx((i) => i + 1)} />
}

const HIDDEN_KEY = 'tct_start_hidden_shortcuts'

function loadHidden(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function saveHidden(list: string[]) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(list.slice(-200)))
  } catch {}
}

/** "youtube.com" from "m.youtube.com"; hosts like localhost / IPs stay as they are */
function baseDomain(host: string): string {
  if (/^[\d.]+$/.test(host) || !host.includes('.')) return host
  return host.split('.').slice(-2).join('.')
}

/**
 * History can store a favicon that belongs to another site (e.g. a search result page that
 * showed YouTube's icon). Only trust a favicon served from the same site as the shortcut.
 */
function faviconFor(favicon: string | null | undefined, u: URL): string | null {
  if (!favicon) return null
  if (favicon.startsWith('data:')) return favicon
  try {
    return baseDomain(new URL(favicon).hostname) === baseDomain(u.hostname) ? favicon : null
  } catch {
    return null
  }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const Card: React.FC<{ icon: React.ComponentType<{ className?: string }>; title: string; action?: React.ReactNode; children: React.ReactNode }> = ({
  icon: Icon,
  title,
  action,
  children
}) => (
  <section className="rounded-2xl border border-border/70 bg-card/60 backdrop-blur-xl p-4 shadow-sm">
    <header className="flex items-center justify-between mb-3">
      <h2 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {title}
      </h2>
      {action}
    </header>
    {children}
  </section>
)

/**
 * Orbit start page: the default page for new tabs and new spaces. Everything shown here comes
 * from local data (history, bookmarks, notes, downloads, saved layouts). Nothing is fetched
 * except the sites' own favicons.
 */
export const StartPage: React.FC<StartPageProps> = ({ tab, isActive, paneStyle, onFocusPane }) => {
  const settings = useBrowserStore((s) => s.settings)
  const space = useBrowserStore((s) => s.spaces.find((sp) => sp.id === tab.spaceId))
  const [now, setNow] = useState(() => new Date())
  const [query, setQuery] = useState('')
  const [allShortcuts, setAllShortcuts] = useState<Shortcut[]>([])
  const [hidden, setHidden] = useState<string[]>(loadHidden)
  const shortcuts = useMemo(() => allShortcuts.filter((s) => !hidden.includes(s.origin)).slice(0, 10), [allShortcuts, hidden])
  const [recent, setRecent] = useState<HistoryEntry[]>([])
  const [notes, setNotes] = useState('')
  const [downloads, setDownloads] = useState<DownloadRecord[]>([])
  const { splits } = useSavedSplits(isActive)
  const setMeetingOpen = useMeetingStore((s) => s.setDialogOpen)
  const inputRef = useRef<HTMLInputElement>(null)
  const [searchFocused, setSearchFocused] = useState(false)
  const [selected, setSelected] = useState(-1)

  const engine = (settings?.defaultSearchEngine as SearchEngineId) || 'duckduckgo'
  const engineName = SEARCH_ENGINES[engine]?.name || 'the web'
  const accent = space?.color || settings?.accentColor || '#6366f1'

  // Clock: only ticks while visible
  useEffect(() => {
    if (!isActive) return
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(id)
  }, [isActive])

  // Focus the search box when the page is shown, and on "/"
  useEffect(() => {
    if (!isActive) return
    const t = setTimeout(() => inputRef.current?.focus(), 60)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [isActive])

  // Local data, refreshed each time the page is shown
  useEffect(() => {
    if (!isActive) return
    let cancelled = false
    Promise.all([
      api.history?.getHistory({ limit: 600 }).catch(() => ({ entries: [] as HistoryEntry[], total: 0 })),
      api.bookmarks?.list().catch(() => [])
    ]).then(([hist, bookmarks]) => {
      if (cancelled) return
      const entries = hist?.entries || []
      const byOrigin = new Map<string, Shortcut>()
      const add = (url: string, title: string, favicon: string | null | undefined, score: number) => {
        let u: URL
        try {
          u = new URL(url)
        } catch {
          return
        }
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return
        const icon = faviconFor(favicon, u)
        const cur = byOrigin.get(u.origin)
        if (cur) {
          cur.score += score
          if (!cur.favicon && icon) cur.favicon = icon
        } else {
          // u.host keeps the port, so localhost:5173 and localhost:3000 are told apart
          byOrigin.set(u.origin, { origin: u.origin, host: u.host.replace(/^www\./, ''), title: title || u.host, url: u.origin, favicon: icon, score })
        }
      }
      for (const e of entries) add(e.url, e.title, e.favicon, e.visitCount || 1)
      // Bookmarks count as strong signals so a new profile still gets useful shortcuts
      for (const b of (bookmarks || []).filter((b) => !b.isReadingList).slice(0, 40)) add(b.url, b.title, b.favicon, 5)
      setAllShortcuts([...byOrigin.values()].sort((a, b) => b.score - a.score).slice(0, 40))

      const seen = new Set<string>()
      setRecent(
        entries
          .filter((e) => /^https?:/.test(e.url) && !seen.has(e.url) && seen.add(e.url))
          .slice(0, 5)
      )
    })
    api.notes
      ?.get(tab.spaceId)
      .then((n) => !cancelled && setNotes(n || ''))
      .catch(() => {})
    api.downloads
      ?.list()
      .then((list) => !cancelled && setDownloads((list || []).filter((d) => d.state === 'completed').slice(0, 4)))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isActive, tab.spaceId])

  const navigate = (raw: string) => navigateFromStartPage(tab.id, raw)

  const hideShortcut = (origin: string) => {
    const next = [...hidden.filter((h) => h !== origin), origin]
    setHidden(next)
    saveHidden(next)
  }
  const restoreShortcuts = () => {
    setHidden([])
    saveHidden([])
  }
  /** Remove a page from "Jump back in" by deleting it from history */
  const removeRecent = (entry: HistoryEntry) => {
    setRecent((list) => list.filter((e) => e.url !== entry.url))
    void api.history?.deleteByUrl(entry.url).catch(() => {})
  }
  const hiddenCount = allShortcuts.filter((s) => hidden.includes(s.origin)).length
  const searchSuggestions = useSearchSuggestions(query, engine, { enabled: isActive && searchFocused })
  const showSuggestions = searchFocused && searchSuggestions.length > 0

  useEffect(() => setSelected(-1), [query])

  const notesPreview = useMemo(() => notes.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240), [notes])
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div
      className="bg-background overflow-y-auto overflow-x-hidden flex flex-col"
      style={{
        display: 'flex',
        visibility: isActive ? 'visible' : 'hidden',
        opacity: isActive ? 1 : 0,
        pointerEvents: isActive ? 'auto' : 'none',
        zIndex: isActive ? 10 : 0,
        position: 'absolute',
        inset: paneStyle ? undefined : 0,
        ...paneStyle
      }}
      onMouseDown={() => {
        onFocusPane?.()
        window.dispatchEvent(new CustomEvent('tct:close-omnibox'))
      }}
      data-lenis-prevent
    >
      {/* Ambient glow in the space's color */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[520px] rounded-full blur-3xl opacity-[0.18] dark:opacity-[0.22]"
          style={{ background: `radial-gradient(closest-side, ${accent}, transparent)` }}
        />
        <div
          className="absolute -bottom-48 -right-32 w-[520px] h-[520px] rounded-full blur-3xl opacity-[0.08]"
          style={{ background: `radial-gradient(closest-side, ${accent}, transparent)` }}
        />
      </div>

      <button
        onClick={() => window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'startup' } }))}
        className="absolute top-4 right-4 z-10 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
        title="Start page settings"
        aria-label="Start page settings"
      >
        <Settings2 className="w-4 h-4" />
      </button>

      <div className="relative w-full max-w-[860px] mx-auto px-6 pt-[9vh] pb-14 select-none">
        {/* Greeting */}
        <header className="text-center mb-8">
          <p className="text-sm font-medium text-muted-foreground tabular-nums">
            {date} · {time}
          </p>
          <h1 className="mt-2 text-4xl md:text-5xl font-semibold tracking-tight text-foreground">
            {greeting(now.getHours())}
          </h1>
          {space && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground px-2.5 py-1 rounded-full bg-muted/50 border border-border/60">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
              {space.name} space
            </p>
          )}
        </header>

        {/* Search */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void navigate(selected >= 0 && searchSuggestions[selected] ? searchSuggestions[selected] : query)
          }}
          className="relative mb-10 group z-20"
        >
          <div
            className="absolute -inset-px rounded-[22px] opacity-0 group-focus-within:opacity-100 transition-opacity"
            style={{ background: `linear-gradient(120deg, ${accent}80, transparent 60%)` }}
            aria-hidden
          />
          <div className="relative flex items-center h-14 rounded-[21px] bg-card/80 backdrop-blur-xl border border-border shadow-lg">
            <Search className="ml-5 w-[18px] h-[18px] text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={(e) => {
                if (!showSuggestions) return
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  const max = searchSuggestions.length - 1
                  setSelected((i) => (e.key === 'ArrowDown' ? (i >= max ? -1 : i + 1) : i <= -1 ? max : i - 1))
                } else if (e.key === 'Escape') {
                  setSelected(-1)
                  setSearchFocused(false)
                }
              }}
              placeholder={`Search with ${engineName} or type a URL`}
              className="flex-1 min-w-0 h-full px-3 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground outline-none select-text"
            />
            {query ? (
              <button type="submit" className="mr-2 h-10 px-4 rounded-2xl text-xs font-semibold text-white flex items-center gap-1.5" style={{ backgroundColor: accent }}>
                Go <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <kbd className="mr-4 text-[11px] font-mono text-muted-foreground px-1.5 py-0.5 rounded border border-border bg-muted/60">/</kbd>
            )}
          </div>

          {/* Search suggestions from the search engine */}
          {showSuggestions && (
            <div className="absolute left-0 right-0 top-full mt-2 py-1.5 rounded-2xl bg-popover/95 backdrop-blur-xl border border-border shadow-2xl overflow-hidden">
              {searchSuggestions.map((text, i) => {
                const typed = query.trim()
                const startsWith = text.toLowerCase().startsWith(typed.toLowerCase())
                return (
                  <button
                    key={text}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      void navigate(text)
                    }}
                    onMouseEnter={() => setSelected(i)}
                    className={`w-full flex items-center gap-3 px-5 py-2 text-left text-sm transition-colors ${
                      i === selected ? 'bg-accent' : 'hover:bg-accent'
                    }`}
                  >
                    <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="truncate text-foreground">
                      {startsWith ? (
                        <>
                          {text.slice(0, typed.length)}
                          <strong className="font-semibold">{text.slice(typed.length)}</strong>
                        </>
                      ) : (
                        text
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </form>

        {/* Shortcuts */}
        {(shortcuts.length > 0 || hiddenCount > 0) && (
          <section className="mb-10">
            <div className="grid grid-cols-5 gap-2">
              {shortcuts.map((s) => (
                <div
                  key={s.origin}
                  role="button"
                  tabIndex={0}
                  onClick={() => void navigate(s.url)}
                  onKeyDown={(e) => e.key === 'Enter' && void navigate(s.url)}
                  className="group relative flex flex-col items-center gap-2 py-3 px-2 rounded-2xl hover:bg-card/70 hover:backdrop-blur-xl border border-transparent hover:border-border/70 transition-all min-w-0 cursor-pointer"
                  title={`${s.title}\n${s.url}`}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      hideShortcut(s.origin)
                    }}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center bg-muted/90 text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove shortcut"
                    aria-label={`Remove ${s.host}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <span className="w-12 h-12 rounded-2xl bg-card border border-border/70 shadow-sm flex items-center justify-center group-hover:-translate-y-0.5 group-hover:shadow-md transition-all">
                    <SiteIcon origin={s.origin} host={s.host} favicon={s.favicon} />
                  </span>
                  <span className="text-[11.5px] text-foreground/90 truncate w-full text-center">{s.host}</span>
                </div>
              ))}
            </div>
            {hiddenCount > 0 && (
              <div className="mt-2 text-center">
                <button onClick={restoreShortcuts} className="text-[11px] text-muted-foreground hover:text-foreground">
                  Restore {hiddenCount} removed shortcut{hiddenCount === 1 ? '' : 's'}
                </button>
              </div>
            )}
          </section>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Jump back in */}
          <Card icon={HistoryIcon} title="Jump back in">
            {recent.length === 0 ? (
              <p className="text-xs text-muted-foreground">Pages you visit show up here.</p>
            ) : (
              <div className="space-y-0.5">
                {recent.map((e) => {
                  const host = hostOf(e.url)
                  let origin = ''
                  try {
                    origin = new URL(e.url).origin
                  } catch {}
                  let icon: string | null = null
                  try {
                    icon = faviconFor(e.favicon, new URL(e.url))
                  } catch {}
                  return (
                    <div key={e.id} className="group flex items-center gap-1 rounded-xl hover:bg-muted/70 pr-1">
                      <button
                        onClick={() => void navigate(e.url)}
                        className="flex-1 min-w-0 flex items-center gap-2.5 px-2 py-1.5 text-left"
                        title={e.url}
                      >
                        <SiteIcon origin={origin} host={host} favicon={icon} size={16} />
                        <span className="text-xs text-foreground truncate flex-1">{e.title || host}</span>
                        <span className="text-[10.5px] text-muted-foreground truncate max-w-[35%] group-hover:hidden">{host}</span>
                      </button>
                      <button
                        onClick={() => removeRecent(e)}
                        className="hidden group-hover:flex w-5 h-5 rounded-md items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                        title="Remove from history"
                        aria-label={`Remove ${e.title || host} from history`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Split layouts */}
          <Card icon={Columns2} title="Split layouts">
            {splits.length === 0 ? (
              <p className="text-xs text-muted-foreground leading-relaxed">
                Put two tabs side by side, then choose <span className="font-medium text-foreground">Save layout</span> in the split menu. Your layouts
                appear here, one click to reopen.
              </p>
            ) : (
              <div className="space-y-0.5">
                {splits.slice(0, 5).map((split) => (
                  <div key={split.id} className="group flex items-center gap-2 rounded-xl hover:bg-muted/70 px-2 py-1.5">
                    <button onClick={() => void openSavedSplit(split)} className="flex-1 min-w-0 flex items-center gap-2.5 text-left">
                      <Columns2 className="w-4 h-4 shrink-0" style={{ color: accent }} />
                      <span className="text-xs font-medium text-foreground truncate">{split.name}</span>
                    </button>
                    <button
                      onClick={() => void removeSavedSplit(split.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-destructive"
                      aria-label={`Delete layout ${split.name}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Space notes */}
          <Card icon={FileText} title={`Notes${space ? ` · ${space.name}` : ''}`}>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('tct:toggle-notes'))}
              className="w-full text-left text-xs text-muted-foreground hover:text-foreground line-clamp-4 leading-relaxed"
            >
              {notesPreview || 'Nothing here yet. Click to jot something down for this space.'}
            </button>
          </Card>

          {/* Meetings + downloads */}
          <Card icon={Video} title="Meetings">
            <button
              onClick={() => setMeetingOpen(true)}
              className="w-full flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
              style={{ backgroundColor: accent }}
            >
              <Video className="w-4 h-4" />
              Start meeting mode
            </button>
            <p className="text-[11px] text-muted-foreground mt-2">Opens the call next to your notes with a countdown.</p>
          </Card>

          {downloads.length > 0 && (
            <Card
              icon={Download}
              title="Recent downloads"
              action={
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('open-downloads'))}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  See all
                </button>
              }
            >
              <div className="space-y-0.5">
                {downloads.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => void api.downloads.showInFolder(d.savePath)}
                    className="w-full flex items-center gap-2.5 rounded-xl hover:bg-muted/70 px-2 py-1.5 text-left"
                  >
                    <Download className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-foreground truncate">{d.filename}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Library links (moved out of the sidebar) */}
        <nav className="mt-8 flex items-center justify-center gap-1 text-xs">
          {[
            { label: 'History', icon: HistoryIcon, event: 'open-history' },
            { label: 'Bookmarks', icon: Star, event: 'open-bookmarks' },
            { label: 'Downloads', icon: Download, event: 'open-downloads' }
          ].map(({ label, icon: Icon, event }) => (
            <button
              key={label}
              onClick={() => window.dispatchEvent(new CustomEvent(event))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
