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
  Globe,
  Search
} from 'lucide-react'
import { api } from '@/lib/ipc'
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
import browserLogo from '@/assets/logo-sm.png'
import { SiteShieldPopover } from './SiteShieldPopover'
import { SiteInfoPopover } from './SiteInfoPopover'
import { BookmarkPopover } from './BookmarkPopover'
import { ToolsMenu } from './ToolsMenu'
import { getDomainZoom, setDomainZoom } from '@/lib/domainZoom'

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
  const tabsBySpace = useBrowserStore((s) => s.tabsBySpace)
  const setCommandBarOpen = useBrowserStore((s) => s.setCommandBarOpen)
  const appInfo = useBrowserStore((s) => s.appInfo)

  const activeTab = activeSpaceId ? tabsBySpace[activeSpaceId]?.find((t) => t.id === activeTabId) : null
  const urlInfo = getDisplayUrlInfo(activeTab?.url || '')
  const isSecure = urlInfo.isSecure

  // Edge-style inline omnibox state
  const [inputValue, setInputValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [hasActiveDownload, setHasActiveDownload] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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
      setInputValue(activeTab?.url || '')
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

  // Window maximized polling
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
    const timer = setInterval(checkMaximized, 1000)
    return () => {
      mounted = false
      clearInterval(timer)
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

  const handleMinimize = () => api.window.minimize()
  const handleMaximize = async () => {
    await api.window.maximize()
    const max = await api.window.isMaximized()
    setIsMaximized(max)
  }
  const handleClose = () => api.window.close()

  const handleBack = () => window.dispatchEvent(new CustomEvent('tct:webview-back'))
  const handleForward = () => window.dispatchEvent(new CustomEvent('tct:webview-forward'))
  const handleReload = () => window.dispatchEvent(new CustomEvent('tct:webview-reload'))
  const handleNewTab = () => setCommandBarOpen(true, '', 'new-tab')

  // Direct navigation handler (Enter key or suggestion click)
  const handleNavigateTo = async (targetUrl: string, title?: string) => {
    if (!targetUrl || targetUrl === 'about:blank') return
    setIsFocused(false)
    if (inputRef.current) inputRef.current.blur()

    if (activeTab) {
      if (activeTab.url === targetUrl) {
        window.dispatchEvent(new CustomEvent('tct:webview-reload'))
      } else {
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
      const engine = (settings?.defaultSearchEngine as SearchEngineId) || 'duckduckgo'
      targetUrl = buildSearchUrl(trimmed, engine, isDark)
    }

    handleNavigateTo(targetUrl, trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit()
    } else if (e.key === 'Escape') {
      setIsFocused(false)
      setInputValue(activeTab?.url || '')
      inputRef.current?.blur()
    }
  }

  const currentEngine = (settings?.defaultSearchEngine as SearchEngineId) || 'duckduckgo'
  const engineMeta = SEARCH_ENGINES[currentEngine] || SEARCH_ENGINES.duckduckgo

  return (
    <div
      onDoubleClick={handleMaximize}
      className="h-10 w-full flex items-center justify-between select-none app-drag bg-chrome border-b border-border text-xs text-muted-foreground z-50 px-2 gap-2"
    >
      {/* Left: macOS traffic lights space + Sidebar toggle + App logo + Space badge + Navigation */}
      <div className="flex items-center gap-1.5 h-full app-no-drag shrink-0">
        {/* On macOS: Reserve traffic lights zone so sidebar collapse button doesn't collide */}
        {isMac && <div className="w-[74px] h-full shrink-0 app-drag" />}

        {/* Sidebar Collapse Toggle */}
        <div className="flex items-center justify-center w-7">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-colors outline-none focus:outline-none"
            title={sidebarCollapsed ? `Expand Sidebar (${modKey}+S)` : `Collapse Sidebar (${modKey}+S)`}
          >
            {sidebarCollapsed ? <PanelLeft className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Logo */}
        <div className="flex items-center gap-1.5 font-semibold text-foreground shrink-0">
          <img
            src={browserLogo}
            alt="TCT Orbit"
            className="w-4 h-4 rounded-md object-contain shadow-xs"
          />
          <span className="tracking-wide hidden xl:inline text-[13px] font-semibold">TCT Orbit</span>
          {appInfo?.channel && appInfo.channel !== 'stable' && (
            <span
              className={`h-3.5 px-1.5 rounded-full text-[8px] font-semibold uppercase tracking-wider inline-flex items-center justify-center leading-none shrink-0 ${
                appInfo.channel === 'nova'
                  ? 'bg-purple-500/15 text-purple-400 border border-purple-500/25'
                  : appInfo.channel === 'deep'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/25'
                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
              }`}
            >
              {appInfo.channel}
            </span>
          )}
        </div>

        {/* Space indicator */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted border border-border shrink-0 max-w-[110px] hidden sm:flex">
          <div
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: spaceColor }}
          />
          <span className="text-xs font-medium text-foreground truncate">{spaceName}</span>
        </div>

        {/* Divider */}
        <div className="w-px h-3.5 bg-border mx-0.5 shrink-0 hidden md:block" />

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
            title={`Reload (${modKey}+R)`}
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Center: Full MS Edge Style Omnibox Address & Search Bar */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center min-w-0 max-w-4xl px-1 relative app-no-drag"
      >
        <div
          onClick={() => {
            if (!isFocused && inputRef.current) {
              inputRef.current.focus()
              inputRef.current.select()
            }
          }}
          className={`w-full h-8 flex items-center px-3 rounded-full border transition-colors shadow-2xs group cursor-text ${
            isFocused
              ? 'bg-background border-primary ring-2 ring-primary/25 shadow-sm'
              : 'bg-omnibox hover:bg-muted/70 border-omnibox-border'
          }`}
        >
          {/* Security / Search Icon on the left */}
          {isFocused ? (
            <div className="shrink-0 flex items-center mr-2">
              <Search className="w-3.5 h-3.5 text-primary" />
            </div>
          ) : (
            <SiteInfoPopover url={activeTab?.url} />
          )}

          {/* Interactive Native Omnibox Input */}
          <input
            ref={inputRef}
            type="text"
            value={isFocused ? inputValue : (urlInfo.displayText || inputValue)}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => {
              setIsFocused(true)
              setInputValue(activeTab?.url || '')
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
            placeholder={`Search with ${engineMeta.name} or enter address...`}
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

          {/* Per-site Privacy & Adblock Shield Control */}
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
          </div>
        )}
      </div>

      {/* Right: Actions (Add New Tab, Tools Dropdown Menu) & Window Controls */}
      <div className="flex items-center gap-1 app-no-drag shrink-0">
        <button
          onClick={handleNewTab}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          title={`New Tab (${modKey}+T)`}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        <ToolsMenu hasActiveDownload={hasActiveDownload} />

        {!isMac && (
          <div className="flex items-center gap-0.5 pl-1">
            <button
              onClick={handleMinimize}
              className="w-8 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Minimize"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleMaximize}
              className="w-8 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
            </button>
            <button
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
