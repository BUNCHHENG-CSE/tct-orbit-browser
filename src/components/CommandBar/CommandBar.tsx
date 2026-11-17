import React, { useState, useEffect } from 'react'
import {
  CommandDialog,
  CommandList,
  CommandEmpty
} from '@/components/ui/command'
import { Command as CommandPrimitive } from 'cmdk'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { SearchResults } from './SearchResults'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useSpaces } from '@/hooks/useSpaces'
import { useTabs } from '@/hooks/useTabs'
import { useSettings } from '@/hooks/useSettings'
import {
  isUrl,
  normalizeUrl,
  buildSearchUrl,
  SEARCH_ENGINES,
  type SearchEngineId
} from '@/lib/searchEngines'
import { resolveIsDark } from '@/lib/theme'
import { ChevronDown, Globe, Search, X, Check } from 'lucide-react'

const ENGINE_META: Record<SearchEngineId, { name: string; dot: string }> = {
  duckduckgo: { name: 'DuckDuckGo', dot: 'bg-orange-500' },
  google: { name: 'Google', dot: 'bg-blue-500' },
  bing: { name: 'Bing', dot: 'bg-teal-500' }
}

export const CommandBar: React.FC = () => {
  const open = useBrowserStore((s) => s.commandBarOpen)
  const setOpen = useBrowserStore((s) => s.setCommandBarOpen)
  const initialQuery = useBrowserStore((s) => s.commandBarInitialQuery)
  const mode = useBrowserStore((s) => s.commandBarMode)

  const [query, setQuery] = useState('')
  const { spaces, activeSpace, activeSpaceId, setActive: setActiveSpace } = useSpaces()
  const { tabs, activeTab, createTab, updateTab, setActiveTab } = useTabs(activeSpaceId)
  const { settings, setDefaultSearchEngine } = useSettings()

  const currentEngine = (settings?.defaultSearchEngine as SearchEngineId) || 'duckduckgo'
  const trimmed = query.trim()
  const isInputUrl = isUrl(trimmed)

  // Update query when opening or initialQuery changes
  useEffect(() => {
    if (open) {
      setQuery(initialQuery || '')
    } else {
      setQuery('')
    }
  }, [open, initialQuery])

  const handleNavigate = async (rawInput: string) => {
    const trimmedInput = rawInput.trim()
    const engine = SEARCH_ENGINES[currentEngine] || SEARCH_ENGINES.duckduckgo

    let targetUrl: string
    let tabTitle: string

    if (!trimmedInput) {
      if (mode === 'new-tab') {
        targetUrl = engine.homeUrl
        tabTitle = `${engine.name} — Privacy, simplified.`
      } else {
        return
      }
    } else if (isUrl(trimmedInput)) {
      targetUrl = normalizeUrl(trimmedInput)
      tabTitle = trimmedInput
    } else {
      const isDark = resolveIsDark(settings?.theme)
      targetUrl = buildSearchUrl(trimmedInput, currentEngine, isDark)
      tabTitle = `${trimmedInput} - ${engine.name} Search`
    }

    setOpen(false)

    // In 'new-tab' mode (or if no active tab exists), CREATE A BRAND NEW TAB
    if (mode === 'new-tab' || !activeTab) {
      if (activeSpaceId) {
        const newTab = await createTab({
          spaceId: activeSpaceId,
          url: targetUrl,
          title: tabTitle
        })
        setActiveTab(newTab.id)
      }
    } else {
      // In 'navigate' mode (user clicked address bar / Ctrl+L), UPDATE current active tab
      await updateTab(activeTab.id, {
        url: targetUrl,
        title: tabTitle
      })
    }
  }

  const handleSwitchTab = (tabId: string, spaceId: string) => {
    setOpen(false)
    if (spaceId !== activeSpaceId) {
      setActiveSpace(spaceId)
    }
    setActiveTab(tabId)
  }

  const handleSwitchSpace = (spaceId: string) => {
    setOpen(false)
    setActiveSpace(spaceId)
  }

  const handleSelectEngine = async (engineId: SearchEngineId) => {
    await setDefaultSearchEngine(engineId)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Tab key cycles through search engines
    if (e.key === 'Tab') {
      e.preventDefault()
      const engineKeys = Object.keys(SEARCH_ENGINES) as SearchEngineId[]
      const currentIndex = engineKeys.indexOf(currentEngine)
      const nextIndex = (currentIndex + 1) % engineKeys.length
      handleSelectEngine(engineKeys[nextIndex])
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      handleNavigate(trimmed)
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      {/* Top Header with Dynamic Leading Icon, Search Input and Inline Engine Switcher */}
      <div className="relative flex items-center px-4 h-14 border-b border-border bg-popover/95 backdrop-blur-md gap-3">
        {/* Dynamic Leading Icon */}
        <div className="shrink-0 flex items-center justify-center">
          {trimmed ? (
            isInputUrl ? (
              <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/25 text-blue-500 dark:text-blue-400 flex items-center justify-center shadow-sm">
                <Globe className="w-4 h-4" />
              </div>
            ) : (
              <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/25 text-primary flex items-center justify-center shadow-sm">
                <Search className="w-4 h-4" />
              </div>
            )
          ) : (
            <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
              <Search className="w-4 h-4" />
            </div>
          )}
        </div>

        {/* Command Input Field */}
        <div className="flex-1 min-w-0">
          <CommandPrimitive.Input
            placeholder={
              mode === 'new-tab'
                ? `Search or enter URL for new tab...`
                : 'Search the web or enter URL...'
            }
            value={query}
            onValueChange={setQuery}
            onKeyDown={handleKeyDown}
            autoFocus
            className="w-full bg-transparent text-[15px] font-medium text-foreground placeholder:text-muted-foreground outline-none border-none focus:outline-none focus:ring-0 selection:bg-primary/30"
          />
        </div>

        {/* Clear query button */}
        {query.length > 0 && (
          <button
            onClick={() => setQuery('')}
            className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 outline-none focus:outline-none"
            title="Clear input"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Search Engine Switcher Pill Button */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 text-foreground transition-colors text-xs font-medium border border-border shadow-xs shrink-0 outline-none focus:outline-none select-none cursor-pointer"
              title="Click or press Tab to change search engine"
            >
              <span className={`w-2 h-2 rounded-full ${ENGINE_META[currentEngine]?.dot || 'bg-primary'}`} />
              <span className="tracking-tight">{SEARCH_ENGINES[currentEngine]?.name || 'DuckDuckGo'}</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-44 bg-popover text-popover-foreground border border-border backdrop-blur-xl shadow-2xl rounded-xl p-1 z-50"
          >
            {Object.values(SEARCH_ENGINES).map((eng) => {
              const isSelected = currentEngine === eng.id
              const meta = ENGINE_META[eng.id as SearchEngineId]
              return (
                <DropdownMenuItem
                  key={eng.id}
                  onClick={() => handleSelectEngine(eng.id as SearchEngineId)}
                  className="flex items-center justify-between px-2.5 py-2 text-xs rounded-lg cursor-pointer hover:bg-accent focus:bg-accent text-foreground transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${meta?.dot || 'bg-primary'}`} />
                    <span className="font-medium">{eng.name}</span>
                  </div>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                  )}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Results and suggestions */}
      <CommandList className="bg-popover text-popover-foreground max-h-[380px] p-2">
        <CommandEmpty className="py-8 text-center text-xs text-muted-foreground">
          Press <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-foreground font-mono">↵ Enter</kbd> to search with {SEARCH_ENGINES[currentEngine]?.name}
        </CommandEmpty>

        <SearchResults
          query={query}
          currentEngine={currentEngine}
          tabs={tabs}
          spaces={spaces}
          activeSpaceId={activeSpaceId}
          mode={mode}
          onNavigate={handleNavigate}
          onSelectTab={handleSwitchTab}
          onSelectSpace={handleSwitchSpace}
        />
      </CommandList>

      {/* Bottom Keyboard Hints & Space Indicator */}
      <div className="h-9 px-4 flex items-center justify-between border-t border-border bg-muted/40 text-[11px] text-muted-foreground font-medium select-none">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-background border border-border font-mono text-[10px] text-foreground shadow-xs">↵</kbd>
            <span>Open</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-background border border-border font-mono text-[10px] text-foreground shadow-xs">↑↓</kbd>
            <span>Navigate</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-background border border-border font-mono text-[10px] text-foreground shadow-xs">Tab</kbd>
            <span>Engine</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-background border border-border font-mono text-[10px] text-foreground shadow-xs">Esc</kbd>
            <span>Close</span>
          </span>
        </div>

        {activeSpace && (
          <div className="flex items-center gap-1.5 text-foreground text-[11px]">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: activeSpace.color }}
            />
            <span className="truncate max-w-[120px]">{activeSpace.name}</span>
          </div>
        )}
      </div>
      </div>
    </CommandDialog>
  )
}
