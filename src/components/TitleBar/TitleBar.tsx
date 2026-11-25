import React, { useEffect, useState, useRef } from 'react'
import {
  Minus,
  Square,
  Copy,
  X,
  PanelLeftClose,
  PanelLeft,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Plus,
  Lock,
  EyeOff,
  Globe,
  Search,
  Star,
  History as HistoryIcon,
  AppWindow,
  PictureInPicture2
} from 'lucide-react'
import type { BookmarkItem } from '@/types/api'
import { api } from '@/lib/ipc'
import { isPrivateWindow } from '@/lib/privateWindow'
import { placeNewTab } from '@/lib/tabPlacement'
import { DownloadsButton } from './DownloadsButton'
import { PrivatePill } from '@/components/PrivateWindow/PrivateWindowBadge'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useSettings } from '@/hooks/useSettings'
import { isMac, modKey } from '@/lib/platform'
import {
  isUrl,
  normalizeUrl,
  buildSearchUrl,
  getDisplayUrlInfo,
  SEARCH_ENGINES,
  type SearchEngineId
} from '@/lib/searchEngines'
import { resolveIsDark } from '@/lib/theme'
import { SiteShieldPopover } from './SiteShieldPopover'
import { SiteInfoPopover } from './SiteInfoPopover'
import { BookmarkPopover } from './BookmarkPopover'
import { SplitViewPopover } from './SplitViewPopover'
import { ToolsMenu } from './ToolsMenu'
import { BrandMark } from './BrandMark'
import { FavoritesPopover } from '@/components/Favorites/FavoritesPopover'
import { PinnedHeaderTools } from './PinnedHeaderTools'
import { ExtensionsPopover, PinnedExtensions } from './ExtensionsPopover'
import { getDomainZoom, setDomainZoom } from '@/lib/domainZoom'
import { openNewTab, isStartPageUrl } from '@/lib/startPage'
import { MeetingChip } from '../Meeting/MeetingChip'
import { Puzzle as PuzzleIcon } from 'lucide-react'
import { useSearchSuggestions } from '@/hooks/useSearchSuggestions'
import { isStoreDetailUrl } from '@/lib/extensionStores'

/** The start page is internal: show an empty address bar instead of its orbit:// URL */
const addressFor = (url: string | undefined): string => (url && !isStartPageUrl(url) ? url : '')

interface TitleBarProps {
  spaceName?: string
  spaceColor?: string
}

export const TitleBar: React.FC<TitleBarProps> = ({ spaceName = 'Personal', spaceColor = '#6366f1' }) => {
  const [isMaximized, setIsMaximized] = useState(false)
  const { settings, setSidebarCollapsed } = useSettings()
  const sidebarCollapsed = settings?.sidebarCollapsed ?? false

  const canGoBack = useBrowserStore((s) => s.canGoBack)
  const canGoForward = useBrowserStore((s) => s.canGoForward)
  const activeSpaceId = useBrowserStore((s) => s.activeSpaceId)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const setCommandBarOpen = useBrowserStore((s) => s.setCommandBarOpen)

  // Only the active tab: re-renders when it changes, not when any tab anywhere changes
  const activeTab = useBrowserStore((s) => (activeSpaceId ? s.tabsBySpace[activeSpaceId]?.find((t) => t.id === s.activeTabId) ?? null : null))
  const urlInfo = getDisplayUrlInfo(addressFor(activeTab?.url))
  // Private tabs always search with DuckDuckGo (no account, no search history profiling)
  const isPrivateTab = !!activeTab?.isPrivate
  const isSecure = urlInfo.isSecure

  // Edge-style inline omnibox state
  const [inputValue, setInputValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [hasActiveDownload, setHasActiveDownload] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // --- Omnibox suggestions: open tabs, bookmarks, history ---
  type Suggestion = {
    kind: 'search' | 'url' | 'tab' | 'bookmark' | 'history'
    title: string
    url: string
    spaceId?: string
    tabId?: string
  }
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const bookmarksCacheRef = useRef<BookmarkItem[] | null>(null)
  const suggestReqRef = useRef(0)

  const suggestionsEnabled = (() => {
    try {
      const v = localStorage.getItem('tct_pref_search_suggestions')
      return v === null ? true : JSON.parse(v) !== false
    } catch {
      return true
    }
  })()

  useEffect(() => {
    if (!isFocused) {
      bookmarksCacheRef.current = null
      setSuggestions([])
      setSelectedIndex(-1)
      return
    }
    const q = inputValue.trim()
    // Typing resets the keyboard selection
    setSelectedIndex(-1)
    if (!q || !suggestionsEnabled || q === activeTab?.url) {
      setSuggestions([])
      return
    }
    const reqId = ++suggestReqRef.current
    const timer = setTimeout(async () => {
      const ql = q.toLowerCase()
      const matches = (title: string, url: string) => title.toLowerCase().includes(ql) || url.toLowerCase().includes(ql)
      const seen = new Set<string>()
      const out: Suggestion[] = []
      const push = (sug: Suggestion, limit: number, countKind: Suggestion['kind']) => {
        if (seen.has(sug.url) || out.filter((o) => o.kind === countKind).length >= limit) return
        seen.add(sug.url)
        out.push(sug)
      }

      // 1. Open tabs (all spaces): switch instead of opening a duplicate
      const store = useBrowserStore.getState()
      for (const [spaceId, list] of Object.entries(store.tabsBySpace)) {
        for (const t of list) {
          if (t.id !== store.activeTabId && t.url && matches(t.title || '', t.url)) {
            push({ kind: 'tab', title: t.title || t.url, url: t.url, spaceId, tabId: t.id }, 3, 'tab')
          }
        }
      }

      // 2. Bookmarks (loaded once per focus)
      try {
        if (!bookmarksCacheRef.current) bookmarksCacheRef.current = (await api.bookmarks?.list()) || []
        for (const b of bookmarksCacheRef.current) {
          if (matches(b.title || '', b.url)) push({ kind: 'bookmark', title: b.title || b.url, url: b.url }, 3, 'bookmark')
        }
      } catch {}

      // 3. History
      try {
        const hist = (await api.history?.searchHistory(q, 8)) || []
        for (const h of hist) push({ kind: 'history', title: h.title || h.url, url: h.url }, 5, 'history')
      } catch {}

      if (reqId === suggestReqRef.current) setSuggestions(out.slice(0, 8))
    }, 70)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, isFocused])

  // Track active downloads for badge pulse in titlebar
  useEffect(() => {
    const unsubs: (() => void)[] = []
    if (api.downloads?.onStarted) {
      unsubs.push(api.downloads.onStarted(() => setHasActiveDownload(true)))
    }
    if (api.downloads?.onCompleted) {
      unsubs.push(api.downloads.onCompleted(() => {
        // Check if other downloads still active
        api.downloads?.list().then((list) => {
          setHasActiveDownload(list?.some((d) => d.state === 'progressing') ?? false)
        }).catch(() => setHasActiveDownload(false))
      }))
    }
    if (api.downloads?.onFailed) {
      unsubs.push(api.downloads.onFailed(() => {
        api.downloads?.list().then((list) => {
          setHasActiveDownload(list?.some((d) => d.state === 'progressing') ?? false)
        }).catch(() => setHasActiveDownload(false))
      }))
    }
    return () => {
      unsubs.forEach((u) => u())
    }
  }, [])

  // Keep input synchronized with active tab URL when not editing
  useEffect(() => {
    if (!isFocused) {
      setInputValue(addressFor(activeTab?.url))
    }
  }, [activeTab?.url, isFocused])

  // Persistent domain zoom state & sync
  const [currentZoom, setCurrentZoom] = useState(100)
  useEffect(() => {
    setCurrentZoom(getDomainZoom(activeTab?.url, 100))
    const handleZoomChanged = (e: any) => {
      if (e?.detail?.zoom !== undefined) {
        setCurrentZoom(e.detail.zoom)
      }
    }
    window.addEventListener('tct:domain-zoom-changed', handleZoomChanged)
    return () => window.removeEventListener('tct:domain-zoom-changed', handleZoomChanged)
  }, [activeTab?.url])

  const handleResetZoom = (e: React.MouseEvent) => {
    e.stopPropagation()
    window.dispatchEvent(new CustomEvent('tct:webview-zoom-reset'))
    setDomainZoom(activeTab?.url, 100)
    setCurrentZoom(100)
  }

  // Window maximized state sync
  useEffect(() => {
    let mounted = true
    const checkMaximized = async () => {
      try {
        const max = await api.window.isMaximized()
        if (mounted) setIsMaximized(max)
      } catch {
        // ignore
      }
    }
    checkMaximized()
    window.addEventListener('resize', checkMaximized)
    return () => {
      mounted = false
      window.removeEventListener('resize', checkMaximized)
    }
  }, [])

  // Listen for Ctrl+L to focus address bar
  useEffect(() => {
    const handleFocusBar = () => {
      setIsFocused(true)
      window.focus()
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.select()
        }
      }, 15)
    }
    window.addEventListener('tct:focus-address-bar', handleFocusBar)
    return () => window.removeEventListener('tct:focus-address-bar', handleFocusBar)
  }, [])

  // Close dropdown when clicking outside, clicking the webview site, pressing Esc, or window blur
  useEffect(() => {
    const handleCloseOmnibox = () => {
      setIsFocused(false)
      inputRef.current?.blur()
    }

    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleCloseOmnibox()
      }
    }

    window.addEventListener('mousedown', handleOutsideClick)
    window.addEventListener('pointerdown', handleOutsideClick)
    window.addEventListener('tct:close-omnibox', handleCloseOmnibox)
    window.addEventListener('blur', handleCloseOmnibox)

    // Listen to IPC event from main process when webview gains focus or receives clicks
    const unsubscribeOmnibox = api.omnibox?.onClose ? api.omnibox.onClose(handleCloseOmnibox) : undefined

    return () => {
      window.removeEventListener('mousedown', handleOutsideClick)
      window.removeEventListener('pointerdown', handleOutsideClick)
      window.removeEventListener('tct:close-omnibox', handleCloseOmnibox)
      window.removeEventListener('blur', handleCloseOmnibox)
      if (unsubscribeOmnibox) unsubscribeOmnibox()
    }
  }, [])

  // Window buttons don't take the keyboard focus from the page (and show no outline after a click)
  const keepPageFocus = (e: React.MouseEvent) => e.preventDefault()
  const handleMinimize = () => api.window.minimize()
  const handleMaximize = async () => {
    await api.window.maximize()
    const max = await api.window.isMaximized()
    setIsMaximized(max)
  }
  const handleClose = () => api.window.close()

  const handleBack = () => window.dispatchEvent(new CustomEvent('tct:webview-back'))
  const handleForward = () => window.dispatchEvent(new CustomEvent('tct:webview-forward'))
  const isLoading = useBrowserStore((s) => !!activeTab && !!s.loadingTabs[activeTab.id])
  const handleReload = () => window.dispatchEvent(new CustomEvent(isLoading ? 'tct:webview-stop' : 'tct:webview-reload'))
  const handleNewTab = () => void openNewTab()
  const topBarTabs = settings?.tabLayout === 'topbar'


  // Direct navigation handler (Enter key or suggestion click)
  const handleNavigateTo = async (targetUrl: string, title?: string) => {
    if (!targetUrl || targetUrl === 'about:blank') return
    setIsFocused(false)
    if (inputRef.current) inputRef.current.blur()

    if (activeTab) {
      if (activeTab.url === targetUrl) {
        window.dispatchEvent(new CustomEvent('tct:webview-reload'))
      } else {
        window.dispatchEvent(
          new CustomEvent('tct:webview-navigate', {
            detail: { tabId: activeTab.id, url: targetUrl }
          })
        )

        useBrowserStore.getState().updateTabInStore(activeTab.id, {
          url: targetUrl,
          title: title || targetUrl
        })

        try {
          await api.tabs.update(activeTab.id, {
            url: targetUrl,
            title: title || targetUrl
          })
        } catch {}
      }
    } else if (activeSpaceId) {
      try {
        const newTab = await api.tabs.create({
          spaceId: activeSpaceId,
          url: targetUrl,
          title: title || 'New Tab'
        })
        useBrowserStore.getState().addTabToStore(activeSpaceId, newTab)
        useBrowserStore.getState().setActiveTabId(newTab.id)
      } catch {}
    }
  }

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = inputValue.trim()
    if (!trimmed) return

    let targetUrl = ''
    if (isUrl(trimmed)) {
      targetUrl = normalizeUrl(trimmed)
    } else {
      const isDark = resolveIsDark(settings?.theme)
      targetUrl = buildSearchUrl(trimmed, currentEngine, isDark)
    }

    handleNavigateTo(targetUrl, trimmed)
  }

  const activateSuggestion = (sug: Suggestion) => {
    if (sug.kind === 'tab' && sug.tabId && sug.spaceId) {
      setIsFocused(false)
      inputRef.current?.blur()
      const store = useBrowserStore.getState()
      if (store.activeSpaceId !== sug.spaceId) {
        store.setActiveSpaceId(sug.spaceId)
        for (const sp of store.spaces) store.updateSpaceInStore(sp.id, { isActive: sp.id === sug.spaceId })
        api.spaces.setActive(sug.spaceId).catch(() => {})
      }
      useBrowserStore.getState().setActiveTabId(sug.tabId)
      return
    }
    handleNavigateTo(sug.url, sug.title)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (allSuggestions.length === 0) return
      e.preventDefault()
      setSelectedIndex((i) => {
        const max = allSuggestions.length - 1
        if (e.key === 'ArrowDown') return i >= max ? -1 : i + 1
        return i <= -1 ? max : i - 1
      })
      return
    }
    if (e.key === 'Enter' && (e.altKey || e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      const sug = selectedIndex >= 0 ? allSuggestions[selectedIndex] : undefined
      let text = inputValue.trim()
      if (!text) return
      // Ctrl+Enter: "example" -> www.example.com
      if (!e.altKey && !sug && /^[a-z0-9-]+$/i.test(text)) text = `https://www.${text}.com/`
      const url = sug ? sug.url : isUrl(text) ? normalizeUrl(text) : buildSearchUrl(text, currentEngine, resolveIsDark(settings?.theme))
      if (!e.altKey) {
        handleNavigateTo(url, text)
        return
      }
      // Alt+Enter: in a new tab
      setIsFocused(false)
      inputRef.current?.blur()
      if (activeSpaceId) {
        void api.tabs
          .create({ spaceId: activeSpaceId, url, title: text, isPrivate: isPrivateTab })
          .then((tab) => placeNewTab(activeSpaceId, tab))
          .catch(() => {})
      }
      return
    }
    if (e.key === 'Enter') {
      if (selectedIndex >= 0 && allSuggestions[selectedIndex]) {
        activateSuggestion(allSuggestions[selectedIndex])
      } else {
        handleSubmit()
      }
    } else if (e.key === 'Escape') {
      setIsFocused(false)
      setInputValue(addressFor(activeTab?.url))
      inputRef.current?.blur()
    }
  }

  const currentEngine: SearchEngineId = isPrivateTab
    ? 'duckduckgo'
    : (settings?.defaultSearchEngine as SearchEngineId) || 'duckduckgo'
  const engineMeta = SEARCH_ENGINES[currentEngine] || SEARCH_ENGINES.duckduckgo

  // Live search-engine suggestions first (like Chrome/Edge), then open tabs, bookmarks, history
  const engineSuggestions = useSearchSuggestions(inputValue, currentEngine, { enabled: isFocused, isPrivate: isPrivateTab })
  const allSuggestions: Suggestion[] = [
    ...engineSuggestions.map((text) => ({
      kind: 'search' as const,
      title: text,
      url: buildSearchUrl(text, currentEngine, resolveIsDark(settings?.theme))
    })),
    ...suggestions
  ]

  return (
    <div
      onDoubleClick={handleMaximize}
      className="relative h-10 w-full flex items-center justify-between select-none app-drag bg-chrome border-b border-border text-xs text-muted-foreground z-50 px-2 gap-2"
    >
      {/* Left: macOS traffic lights space + Sidebar toggle + App logo + Space badge + Navigation */}
      <div className="flex items-center gap-1.5 h-full app-no-drag shrink-0">
        {/* On macOS: Reserve traffic lights zone so sidebar collapse button doesn't collide */}
        {isMac && !topBarTabs && <div className="w-[74px] h-full shrink-0 app-drag" />}

        {/* Sidebar Collapse Toggle (not used when tabs are in the top bar) */}
        <div className={`flex items-center justify-center w-7 ${settings?.tabLayout === 'topbar' ? 'hidden' : ''}`}>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-colors outline-none focus:outline-none"
            title={sidebarCollapsed ? `Expand Sidebar (${modKey}+S)` : `Collapse Sidebar (${modKey}+S)`}
          >
            {sidebarCollapsed ? <PanelLeft className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Logo (shown in the tab row instead when tabs are on top) */}
        {!topBarTabs && <BrandMark />}

        {/* Space indicator (the tab row shows the space when tabs are on top) */}
        <div
          className={`items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted border border-border shrink-0 max-w-[110px] ${
            topBarTabs ? 'hidden' : 'hidden sm:flex'
          }`}
        >
          <div
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: spaceColor }}
          />
          <span className="text-xs font-medium text-foreground truncate">{spaceName}</span>
        </div>

        {/* Divider */}
        <div className={`w-px h-3.5 bg-border mx-0.5 shrink-0 ${topBarTabs ? 'hidden' : 'hidden md:block'}`} />

        {/* Navigation buttons: Back, Forward, Reload */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={handleBack}
            disabled={!canGoBack}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title={`Back (${modKey}+[)`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleForward}
            disabled={!canGoForward}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title={`Forward (${modKey}+])`}
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleReload}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={isLoading ? 'Stop (Esc)' : `Reload (${modKey}+R)`}
          >
            {isLoading ? <X className="w-3.5 h-3.5" /> : <RotateCw className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Center: Full MS Edge Style Omnibox Address & Search Bar */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center min-w-0 max-w-4xl px-1 relative app-no-drag"
      >
        <div
          onClick={(e) => {
            // Buttons inside the address bar (star, shield, site info…) and their popups must not
            // focus the input: focusing hides those buttons and closes what they just opened
            const target = e.target as HTMLElement
            if (target.closest('button, a, select, [role="dialog"], [role="menu"], [data-no-omnibox-focus]')) return
            if (!isFocused && inputRef.current) {
              inputRef.current.focus()
              inputRef.current.select()
            }
          }}
          className={`w-full h-8 flex items-center px-3 rounded-full border transition-colors shadow-2xs group cursor-text ${
            isPrivateTab
              ? isFocused
                ? 'bg-background border-violet-500 ring-2 ring-violet-500/25 shadow-sm'
                : 'bg-violet-500/[0.07] hover:bg-violet-500/10 border-violet-500/40'
              : isFocused
              ? 'bg-background border-primary ring-2 ring-primary/25 shadow-sm'
              : 'bg-omnibox hover:bg-muted/70 border-omnibox-border'
          }`}
        >
          {/* Security / Search Icon on the left */}
          {isPrivateTab && (
            <span
              title="Private tab: no history, cookies wiped when the last private tab closes"
              className="shrink-0 flex items-center gap-1 mr-2 px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 text-[10.5px] font-semibold select-none"
            >
              <EyeOff className="w-3 h-3" />
              <span className="hidden md:inline">Private</span>
            </span>
          )}
          {isFocused ? (
            <div className="shrink-0 flex items-center mr-2">
              <Search className={`w-3.5 h-3.5 ${isPrivateTab ? 'text-violet-500' : 'text-primary'}`} />
            </div>
          ) : (
            <SiteInfoPopover url={activeTab?.url} />
          )}

          {/* Interactive Native Omnibox Input */}
          <input
            ref={inputRef}
            type="text"
            value={
              isFocused
                ? selectedIndex >= 0 && allSuggestions[selectedIndex]
                  ? allSuggestions[selectedIndex].kind === 'search'
                    ? allSuggestions[selectedIndex].title
                    : allSuggestions[selectedIndex].url
                  : inputValue
                : urlInfo.displayText || inputValue
            }
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => {
              setIsFocused(true)
              setInputValue(addressFor(activeTab?.url))
              setTimeout(() => inputRef.current?.select(), 10)
            }}
            onBlur={(e) => {
              // Only blur if not clicking inside container or suggestions
              if (containerRef.current && containerRef.current.contains(e.relatedTarget as Node)) {
                return
              }
              setIsFocused(false)
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              isPrivateTab
                ? `Search privately with ${engineMeta.name} or enter address...`
                : `Search with ${engineMeta.name} or enter address...`
            }
            spellCheck={false}
            autoComplete="off"
            className="w-full h-full bg-transparent border-none outline-none text-foreground text-[13.5px] font-normal placeholder:text-muted-foreground select-text truncate"
          />

          {/* Clear button when editing */}
          {isFocused && inputValue && (
            <button
              onMouseDown={(e) => {
                e.preventDefault()
                setInputValue('')
                inputRef.current?.focus()
              }}
              className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-1"
              title="Clear input"
            >
              <X className="w-3 h-3" />
            </button>
          )}

          {/* Per-Domain Zoom Reset Pill */}
          {!isFocused && currentZoom !== 100 && (
            <button
              onClick={handleResetZoom}
              title="Click to reset zoom to 100% (Ctrl+0)"
              className="px-2 py-0.5 rounded-full bg-primary/10 hover:bg-primary/25 text-primary border border-primary/30 text-[11px] font-mono font-bold flex items-center gap-1 transition-all mr-1"
            >
              <span>{currentZoom}%</span>
              <X className="w-2.5 h-2.5" />
            </button>
          )}

          {/* Picture-in-picture shortcut while the tab is playing media */}
          {!isFocused && activeTab?.isAudible && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                window.dispatchEvent(new CustomEvent('tct:toggle-pip'))
              }}
              title={`Picture-in-picture (${modKey}+Shift+P)`}
              className="p-1 mr-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
            >
              <PictureInPicture2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Per-site Privacy & Adblock Shield Control */}
          {/* On an extension's store page: install it here (the store's own button only works in Chrome/Edge) */}
          {!isFocused && isStoreDetailUrl(activeTab?.url) && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('tct:install-extension', { detail: { url: activeTab?.url } }))}
              className="h-6 px-2 mr-1 flex items-center gap-1 rounded-md bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 shrink-0 shadow-sm"
              title="Install this extension in TCT Orbit"
            >
              <PuzzleIcon className="w-3 h-3" />
              Add to TCT Orbit
            </button>
          )}
          {!isFocused && <SiteShieldPopover url={activeTab?.url} />}

          {/* Bookmark Tab Control */}
          {!isFocused && (
            <BookmarkPopover
              url={activeTab?.url}
              title={activeTab?.title}
              favicon={activeTab?.favicon}
            />
          )}

          {/* Search Engine Badge when showing search query */}
          {!isFocused && urlInfo.isSearch && urlInfo.searchEngineName && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium ml-2 shrink-0 hidden lg:inline-block select-none">
              {urlInfo.searchEngineName}
            </span>
          )}

          {/* Shortcut hint */}
          {!isFocused && (
            <span className="text-[11px] text-muted-foreground/70 ml-2 font-mono group-hover:text-muted-foreground hidden md:inline-block shrink-0 select-none">
              {modKey}+L
            </span>
          )}
        </div>

        {/* MS Edge Style Search Suggestions Dropdown */}
        {isFocused && inputValue.trim() && (
          <div className="absolute top-full left-1 right-1 mt-1.5 py-1.5 rounded-2xl bg-popover text-popover-foreground border border-border shadow-2xl z-50 overflow-hidden text-xs">
            {/* Suggestion 1: Search */}
            <div
              onMouseDown={(e) => {
                e.preventDefault()
                const isDark = resolveIsDark(settings?.theme)
                handleNavigateTo(buildSearchUrl(inputValue.trim(), currentEngine, isDark), inputValue.trim())
              }}
              className="flex items-center gap-2.5 px-3.5 py-2 cursor-pointer hover:bg-accent transition-colors"
            >
              <Search className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="truncate flex-1">
                Search with {engineMeta.name} for <strong className="font-semibold text-primary">{inputValue.trim()}</strong>
              </span>
              <span className="text-[11.5px] text-muted-foreground shrink-0">Press Enter</span>
            </div>

            {/* Suggestion 2: Direct URL if formatted like one */}
            {isUrl(inputValue.trim()) && (
              <div
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleNavigateTo(normalizeUrl(inputValue.trim()), inputValue.trim())
                }}
                className="flex items-center gap-2.5 px-3.5 py-2 cursor-pointer hover:bg-accent transition-colors border-t border-border"
              >
                <Globe className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="truncate flex-1 font-mono text-emerald-600 dark:text-emerald-400">
                  Go to {normalizeUrl(inputValue.trim())}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">Direct URL</span>
              </div>
            )}

            {/* Search-engine suggestions, then open tabs, bookmarks & history matches */}
            {allSuggestions.length > 0 && <div className="my-1 border-t border-border" />}
            {allSuggestions.map((sug, i) => {
              if (sug.kind === 'search') {
                const typed = inputValue.trim()
                const startsWith = sug.title.toLowerCase().startsWith(typed.toLowerCase())
                return (
                  <div
                    key={`search-${sug.title}`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      activateSuggestion(sug)
                    }}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className={`flex items-center gap-2.5 px-3.5 py-1.5 cursor-pointer transition-colors ${
                      i === selectedIndex ? 'bg-accent' : 'hover:bg-accent'
                    }`}
                  >
                    <Search className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate flex-1 text-foreground">
                      {startsWith ? (
                        <>
                          {sug.title.slice(0, typed.length)}
                          <strong className="font-semibold">{sug.title.slice(typed.length)}</strong>
                        </>
                      ) : (
                        sug.title
                      )}
                    </span>
                    {i === selectedIndex && <span className="text-[10.5px] text-muted-foreground shrink-0">{engineMeta.name}</span>}
                  </div>
                )
              }
              const Icon = sug.kind === 'tab' ? AppWindow : sug.kind === 'bookmark' ? Star : HistoryIcon
              const firstLocal = i === engineSuggestions.length && engineSuggestions.length > 0
              return (
                <div
                  key={`${sug.kind}-${sug.url}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    activateSuggestion(sug)
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`flex items-center gap-2.5 px-3.5 py-1.5 cursor-pointer transition-colors ${
                    i === selectedIndex ? 'bg-accent' : 'hover:bg-accent'
                  } ${firstLocal ? 'mt-1 border-t border-border pt-2' : ''}`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      sug.kind === 'bookmark' ? 'text-amber-500' : sug.kind === 'tab' ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  />
                  <span className="truncate text-foreground max-w-[45%]">{sug.title}</span>
                  <span className="truncate flex-1 text-muted-foreground text-[11px]">{sug.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
                  {sug.kind === 'tab' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary shrink-0">Switch to tab</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Right: Actions (Add New Tab, Tools Dropdown Menu) & Window Controls */}
      <div className="flex items-center gap-1 app-no-drag shrink-0">
        <button
          onClick={handleNewTab}
          className={`w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer ${
            topBarTabs ? 'hidden' : ''
          }`}
          title={`New Tab (${modKey}+T)`}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        <PinnedExtensions />
        <PinnedHeaderTools />

        <DownloadsButton />
        <MeetingChip />
        <FavoritesPopover />
        <ExtensionsPopover />
        <SplitViewPopover />
        {isPrivateWindow && <PrivatePill />}
        <ToolsMenu hasActiveDownload={hasActiveDownload} />

        {!isMac && !topBarTabs && (
          <div className="flex items-center gap-0.5 pl-1">
            <button
              onMouseDown={keepPageFocus}
              onClick={handleMinimize}
              className="w-8 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Minimize"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onMouseDown={keepPageFocus}
              onClick={handleMaximize}
              className="w-8 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
            </button>
            <button
              onMouseDown={keepPageFocus}
              onClick={handleClose}
              className="w-8 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive-foreground hover:bg-destructive transition-colors"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
