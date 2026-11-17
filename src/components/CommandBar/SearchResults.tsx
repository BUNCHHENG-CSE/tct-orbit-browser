import React, { useState } from 'react'
import { Globe, Search, Layers, ExternalLink, ArrowRight, Plus } from 'lucide-react'
import {
  CommandGroup,
  CommandItem,
  CommandSeparator
} from '@/components/ui/command'
import { isUrl, normalizeUrl, SEARCH_ENGINES, type SearchEngineId } from '@/lib/searchEngines'
import type { Tab, Space } from '@/types/api'

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
  const engine = SEARCH_ENGINES[currentEngine] || SEARCH_ENGINES.duckduckgo

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
