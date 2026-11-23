import React, { useState, useEffect } from 'react'
import { Globe, Search, Layers, ExternalLink, ArrowRight, Plus, History, Printer, FileDown, Download, Star, Sparkles, Activity, Maximize2, ZoomIn, AppWindow, EyeOff, LayoutTemplate, ShieldCheck, Keyboard, RotateCcw, FileText } from 'lucide-react'
import {
  CommandGroup,
  CommandItem,
  CommandSeparator
} from '@/components/ui/command'
import { isUrl, normalizeUrl, SEARCH_ENGINES, type SearchEngineId } from '@/lib/searchEngines'
import { api } from '@/lib/ipc'
import { modKey } from '@/lib/platform'
import { useBrowserStore } from '@/store/useBrowserStore'
import type { Tab, Space, HistoryEntry } from '@/types/api'

interface SearchResultsProps {
  query: string
  currentEngine: SearchEngineId
  tabs: Tab[]
  spaces: Space[]
  activeSpaceId: string | null
  mode?: 'new-tab' | 'navigate'
  onNavigate: (url: string) => void
  onSelectTab: (tabId: string, spaceId: string) => void
  onSelectSpace: (spaceId: string) => void
}

const TabFavicon: React.FC<{ tab: Tab }> = ({ tab }) => {
  const [error, setError] = useState(false)
  let src = tab.favicon
  if (!src && tab.url) {
    try {
      src = `${new URL(tab.url).origin}/favicon.ico`
    } catch {
      src = null
    }
  }

  if (src && !error) {
    return (
      <div className="w-5 h-5 shrink-0 flex items-center justify-center rounded-md p-0.5 dark:bg-white/[0.08] bg-transparent">
        <img
          src={src}
          alt=""
          className="w-3.5 h-3.5 object-contain rounded-xs"
          onError={() => setError(true)}
        />
      </div>
    )
  }

  return <Globe className="w-3.5 h-3.5 text-muted-foreground" />
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  query,
  currentEngine,
  tabs,
  spaces,
  activeSpaceId,
  mode = 'new-tab',
  onNavigate,
  onSelectTab,
  onSelectSpace
}) => {
  const trimmed = query.trim()
  const isInputUrl = isUrl(trimmed)

  const act = (fn: () => void) => () => {
    useBrowserStore.getState().setCommandBarOpen(false)
    setTimeout(fn, 0)
  }
  const engine = SEARCH_ENGINES[currentEngine] || SEARCH_ENGINES.duckduckgo

  const [historyResults, setHistoryResults] = useState<HistoryEntry[]>([])

  useEffect(() => {
    let active = true
    if (trimmed && api.history?.searchHistory) {
      api.history.searchHistory(trimmed, 4).then((res) => {
        if (active && Array.isArray(res)) {
          setHistoryResults(res)
        }
      }).catch(() => {})
    } else {
      setHistoryResults([])
    }
    return () => {
      active = false
    }
  }, [trimmed])

  // Filter tabs and spaces
  const matchingTabs = trimmed
    ? tabs.filter(
        (t) =>
          t.title.toLowerCase().includes(trimmed.toLowerCase()) ||
          t.url.toLowerCase().includes(trimmed.toLowerCase())
      )
    : tabs.slice(0, 5)

  const matchingSpaces = trimmed
    ? spaces.filter((s) =>
        s.name.toLowerCase().includes(trimmed.toLowerCase())
      )
    : spaces

  return (
    <>
      {/* Quick Action when in New Tab mode and query is empty */}
      {!trimmed && mode === 'new-tab' && (
        <CommandGroup heading="New Tab">
          <CommandItem
            onSelect={() => onNavigate(engine.homeUrl)}
            className="flex items-center gap-3 py-2.5 px-3 rounded-xl cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-primary/20 text-primary border border-primary/30 flex items-center justify-center shrink-0">
              <Plus className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground text-sm">
                  Open New Tab ({engine.name})
                </span>
                <span className="text-[11px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                  Default
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate font-mono mt-0.5">
                {engine.homeUrl}
              </p>
            </div>
            <kbd className="flex items-center gap-1 text-xs font-mono text-muted-foreground px-2 py-1 rounded-lg bg-muted border border-border shadow-xs shrink-0">
              ↵ Enter
            </kbd>
          </CommandItem>

          <CommandItem
            onSelect={act(() => window.dispatchEvent(new CustomEvent('open-history')))}
            className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-muted/60 text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <History className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-foreground text-xs">
                Open Browsing History
              </span>
              <p className="text-[11px] text-muted-foreground">
                View timeline of visited pages
              </p>
            </div>
            <kbd className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted border border-border">
              {modKey}+H
            </kbd>
          </CommandItem>

          <CommandItem
            onSelect={act(() => window.dispatchEvent(new CustomEvent('open-downloads')))}
            className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-muted/60 text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <Download className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-foreground text-xs">
                Downloads Manager
              </span>
              <p className="text-[11px] text-muted-foreground">
                Manage downloaded files and transfers
              </p>
            </div>
            <kbd className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted border border-border">
              {modKey}+J
            </kbd>
          </CommandItem>

          <CommandItem
            onSelect={act(() => window.dispatchEvent(new CustomEvent('tct:webview-print')))}
            className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-muted/60 text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <Printer className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-foreground text-xs">
                Print Current Page
              </span>
              <p className="text-[11px] text-muted-foreground">
                Send active page to system printer
              </p>
            </div>
            <kbd className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted border border-border">
              {modKey}+P
            </kbd>
          </CommandItem>

          <CommandItem
            onSelect={act(() => window.dispatchEvent(new CustomEvent('tct:webview-save-pdf')))}
            className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-muted/60 text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <FileDown className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-foreground text-xs">
                Save Page as PDF
              </span>
              <p className="text-[11px] text-muted-foreground">
                Export current webpage to a clean PDF document
              </p>
            </div>
          </CommandItem>

          <CommandItem
            onSelect={act(() => window.dispatchEvent(new CustomEvent('open-bookmarks')))}
            className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-muted/60 text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <Star className="w-4 h-4 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-foreground text-xs">
                Bookmarks & Reading List
              </span>
              <p className="text-[11px] text-muted-foreground">
                Browse saved pages and articles
              </p>
            </div>
          </CommandItem>

          <CommandItem
            onSelect={act(() => window.dispatchEvent(new CustomEvent('tct:toggle-find')))}
            className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-muted/60 text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <Search className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-foreground text-xs">
                Find in Page
              </span>
              <p className="text-[11px] text-muted-foreground">
                Search text on the active webpage
              </p>
            </div>
            <kbd className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted border border-border">
              {modKey}+F
            </kbd>
          </CommandItem>

          <CommandItem
            onSelect={() => {
              const store = useBrowserStore.getState()
              const next = !store.zenMode
              store.setZenMode(next)
              if (api.window?.setFullScreen) {
                api.window.setFullScreen(next)
              }
            }}
            className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-muted/60 text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-foreground text-xs">
                Zen / Pure Focus Mode
              </span>
              <p className="text-[11px] text-muted-foreground">
                100% screen browsing with edge-hover gliding
              </p>
            </div>
            <kbd className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted border border-border">
              F11
            </kbd>
          </CommandItem>

          <CommandItem
            value="Search Open Tabs Find any tab in any space"
            onSelect={act(() => window.dispatchEvent(new CustomEvent('tct:open-tab-search')))}
            className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-muted/60 text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <AppWindow className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-foreground text-xs">Search Open Tabs</span>
              <p className="text-[11px] text-muted-foreground">Find any tab in any space</p>
            </div>
            <kbd className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted border border-border">
              {modKey}+Shift+A
            </kbd>
          </CommandItem>

          <CommandItem
            value="New Private Tab No history, wiped when closed"
            onSelect={act(() => window.dispatchEvent(new CustomEvent('tct:new-private-tab')))}
            className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-muted/60 text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <EyeOff className="w-4 h-4 text-violet-500" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-foreground text-xs">New Private Tab</span>
              <p className="text-[11px] text-muted-foreground">No history, wiped when closed</p>
            </div>
            <kbd className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted border border-border">
              Alt+Shift+N
            </kbd>
          </CommandItem>

          <CommandItem
            value="Space Templates Save or reopen a set of tabs"
            onSelect={act(() => window.dispatchEvent(new CustomEvent('tct:open-space-templates')))}
            className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-muted/60 text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <LayoutTemplate className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-foreground text-xs">Space Templates</span>
              <p className="text-[11px] text-muted-foreground">Save or reopen a set of tabs</p>
            </div>
          </CommandItem>

          <CommandItem
            value="Privacy Report Trackers and ads blocked this week"
            onSelect={act(() => window.dispatchEvent(new CustomEvent('tct:open-privacy-report')))}
            className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-muted/60 text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-foreground text-xs">Privacy Report</span>
              <p className="text-[11px] text-muted-foreground">Trackers and ads blocked this week</p>
            </div>
          </CommandItem>

          <CommandItem
            value="Keyboard Shortcuts Every shortcut on one page"
            onSelect={act(() => window.dispatchEvent(new CustomEvent('tct:open-shortcut-help')))}
            className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-muted/60 text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <Keyboard className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-foreground text-xs">Keyboard Shortcuts</span>
              <p className="text-[11px] text-muted-foreground">Every shortcut on one page</p>
            </div>
            <kbd className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted border border-border">
              {modKey}+/
            </kbd>
          </CommandItem>

          <CommandItem
            value="Restore Previous Session Reopen tabs from last time"
            onSelect={act(() => window.dispatchEvent(new CustomEvent('tct:restore-session')))}
            className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-muted/60 text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-foreground text-xs">Restore Previous Session</span>
              <p className="text-[11px] text-muted-foreground">Reopen tabs from last time</p>
            </div>
          </CommandItem>

          <CommandItem
            value="Privacy Policy What TCT Orbit stores and connects to"
            onSelect={act(() => window.dispatchEvent(new CustomEvent('tct:open-legal', { detail: { doc: 'privacy' } })))}
            className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-muted/60 text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-foreground text-xs">Privacy Policy</span>
              <p className="text-[11px] text-muted-foreground">What TCT Orbit stores and connects to</p>
            </div>
          </CommandItem>

          <CommandItem
            value="Terms of Use The rules for using TCT Orbit"
            onSelect={act(() => window.dispatchEvent(new CustomEvent('tct:open-legal', { detail: { doc: 'terms' } })))}
            className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-muted/60 text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-foreground text-xs">Terms of Use</span>
              <p className="text-[11px] text-muted-foreground">The rules for using TCT Orbit</p>
            </div>
          </CommandItem>

          <CommandItem
            value="Welcome Tour Replay the quick introduction"
            onSelect={act(() => window.dispatchEvent(new CustomEvent('tct:open-onboarding')))}
            className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-muted/60 text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-foreground text-xs">Welcome Tour</span>
              <p className="text-[11px] text-muted-foreground">Replay the quick introduction</p>
            </div>
          </CommandItem>

          <CommandItem
            onSelect={act(() => useBrowserStore.getState().setTaskManagerOpen(true))}
            className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-muted/60 text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-foreground text-xs">
                Orbit Task Manager & RAM Monitor
              </span>
              <p className="text-[11px] text-muted-foreground">
                Inspect process CPU/RAM and end frozen tabs
              </p>
            </div>
            <kbd className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted border border-border">
              Shift+Esc
            </kbd>
          </CommandItem>

          <CommandItem
            onSelect={() => {
              window.dispatchEvent(new CustomEvent('tct:webview-zoom-reset'))
            }}
            className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-muted/60 text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <ZoomIn className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-foreground text-xs">
                Reset Zoom to 100%
              </span>
              <p className="text-[11px] text-muted-foreground">
                Restore default site magnification
              </p>
            </div>
            <kbd className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted border border-border">
              {modKey}+0
            </kbd>
          </CommandItem>
        </CommandGroup>
      )}

      {/* Primary Action: Go to URL or Search Web */}
      {trimmed && (
        <CommandGroup heading="Actions">
          {isInputUrl ? (
            <CommandItem
              onSelect={() => onNavigate(normalizeUrl(trimmed))}
              className="flex items-center gap-3 py-2.5 px-3 rounded-xl cursor-pointer"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border border-blue-500/30 text-blue-500 dark:text-blue-400 flex items-center justify-center shrink-0 shadow-sm">
                <Globe className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground text-sm">
                    {mode === 'new-tab' ? 'Open in New Tab' : 'Open URL'}
                  </span>
                  <span className="text-[11px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/25">
                    {mode === 'new-tab' ? 'New Tab' : 'Direct'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate font-mono mt-0.5">
                  {normalizeUrl(trimmed)}
                </p>
              </div>
              <kbd className="flex items-center gap-1 text-xs font-mono text-muted-foreground px-2 py-1 rounded-lg bg-muted border border-border shadow-xs shrink-0">
                ↵ Enter
              </kbd>
            </CommandItem>
          ) : (
            <CommandItem
              onSelect={() => onNavigate(trimmed)}
              className="flex items-center gap-3 py-2.5 px-3 rounded-xl cursor-pointer"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/25 to-purple-500/10 border border-primary/30 text-primary flex items-center justify-center shrink-0 shadow-xs">
                <Search className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground text-sm">
                    {mode === 'new-tab' ? `Search in New Tab (${engine.name})` : `Search with ${engine.name}`}
                  </span>
                  <span className="text-[11px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                    {mode === 'new-tab' ? 'New Tab' : 'Web'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  &ldquo;{trimmed}&rdquo;
                </p>
              </div>
              <kbd className="flex items-center gap-1 text-xs font-mono text-muted-foreground px-2 py-1 rounded-lg bg-muted border border-border shadow-xs shrink-0">
                ↵ Enter
              </kbd>
            </CommandItem>
          )}
        </CommandGroup>
      )}

      {/* Quick-Jump to Open Tabs */}
      {matchingTabs.length > 0 && (
        <>
          {trimmed && <CommandSeparator />}
          <CommandGroup heading={trimmed ? 'Open Tabs' : 'Switch Tab'}>
            {matchingTabs.slice(0, 5).map((tab) => {
              let hostname = tab.url
              try {
                hostname = new URL(tab.url).hostname
              } catch {
                // keep original
              }

              return (
                <CommandItem
                  key={tab.id}
                  onSelect={() => onSelectTab(tab.id, tab.spaceId)}
                  className="flex items-center gap-3 py-2.5 px-3 rounded-xl cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
                    <TabFavicon tab={tab} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {tab.title || 'New Tab'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate font-mono mt-0.5">
                      {hostname}
                    </p>
                  </div>
                  <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                    <ArrowRight className="w-2.5 h-2.5" /> Switch tab
                  </span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        </>
      )}

      {/* Matching History Results */}
      {historyResults.length > 0 && (
        <>
          <CommandSeparator />
          <CommandGroup heading="History">
            {historyResults.map((item) => (
              <CommandItem
                key={item.id}
                onSelect={() => onNavigate(item.url)}
                className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer"
              >
                <div className="w-5 h-5 shrink-0 flex items-center justify-center rounded-md text-muted-foreground">
                  <History className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{item.title || item.url}</p>
                  <p className="text-[11px] text-muted-foreground truncate font-mono">{item.url}</p>
                </div>
                <span className="text-[11px] text-muted-foreground flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                  <ArrowRight className="w-2.5 h-2.5" /> Open
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </>
      )}

      {/* Quick-Jump to Spaces */}
      {matchingSpaces.length > 0 && (
        <>
          <CommandSeparator />
          <CommandGroup heading="Spaces">
            {matchingSpaces.map((space) => {
              const isCurrent = space.id === activeSpaceId
              return (
                <CommandItem
                  key={space.id}
                  onSelect={() => onSelectSpace(space.id)}
                  className="flex items-center gap-3 py-2 px-3 rounded-xl cursor-pointer"
                >
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 shadow-xs"
                    style={{ backgroundColor: space.color }}
                  >
                    <Layers className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{space.name}</p>
                  </div>
                  {isCurrent ? (
                    <span className="text-[11px] text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">
                      Current space
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">
                      Switch space
                    </span>
                  )}
                </CommandItem>
              )
            })}
          </CommandGroup>
        </>
      )}
    </>
  )
}
