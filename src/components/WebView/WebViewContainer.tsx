import React, { useRef, useEffect, useState, useCallback } from 'react'
import {
  Globe,
  AlertCircle,
  RefreshCw,
  ArrowLeftRight,
  X,
  Moon,
  Zap
} from 'lucide-react'
import { toast } from 'sonner'
import { useTabs } from '@/hooks/useTabs'
import { useSettings } from '@/hooks/useSettings'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useThemeStore } from '@/store/useThemeStore'
import { modKey } from '@/lib/platform'
import { getThemeSyncScript, resolveIsDark } from '@/lib/theme'
import { api } from '@/lib/ipc'
import { ReaderModeOverlay } from '@/components/ReaderMode/ReaderModeOverlay'
import { FindInPageBar } from '@/components/FindInPage/FindInPageBar'
import { READABILITY_EXTRACTION_SCRIPT, PICTURE_IN_PICTURE_SCRIPT } from '@/lib/readability'
import { getDomainZoom, setDomainZoom, getNextZoomIn, getNextZoomOut, extractDomain } from '@/lib/domainZoom'
import type { Tab } from '@/types/api'

interface SingleWebViewProps {
  tab: Tab
  isActive: boolean
  isDark: boolean
  defaultZoom?: number
  spaceId: string
  paneStyle?: React.CSSProperties
  splitRole?: 'primary' | 'secondary' | null
  onUpdateTab: (id: string, data: { url?: string; title?: string; favicon?: string | null }) => void
  onOpenNewTab: (url: string) => void
  registerWebviewRef: (tabId: string, el: any) => void
  unregisterWebviewRef: (tabId: string) => void
  onCloseSplit?: () => void
  onSwapSplit?: () => void
  onFocusPane?: () => void
}

const SingleWebView: React.FC<SingleWebViewProps> = ({
  tab,
  isActive,
  isDark,
  defaultZoom = 100,
  spaceId,
  paneStyle,
  splitRole,
  onUpdateTab,
  onOpenNewTab,
  registerWebviewRef,
  unregisterWebviewRef,
  onCloseSplit,
  onSwapSplit,
  onFocusPane
}) => {
  const webviewRef = useRef<any>(null)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const initialUrlRef = useRef(tab.url)
  const currentNavUrlRef = useRef(tab.url)
  const lastNavigatedFromWebviewUrlRef = useRef<string>('')

  const onUpdateTabRef = useRef(onUpdateTab)
  onUpdateTabRef.current = onUpdateTab
  const onOpenNewTabRef = useRef(onOpenNewTab)
  onOpenNewTabRef.current = onOpenNewTab

  // Programmatic external navigation listener (from omnibox, history, etc.)
  useEffect(() => {
    const el = webviewRef.current
    if (!el || !tab.url || tab.url === 'about:blank') return

    // 1. If this exact URL was already set by the webview itself, skip loadURL
    if (lastNavigatedFromWebviewUrlRef.current === tab.url) {
      return
    }

    // 2. If currentNavUrlRef already matches tab.url, skip loadURL
    if (currentNavUrlRef.current === tab.url) {
      return
    }

    try {
      const live = typeof el.getURL === 'function' ? el.getURL() : null
      if (live && live !== 'about:blank') {
        const liveNorm = live.replace(/\/+$/, '')
        const targetNorm = tab.url.replace(/\/+$/, '')

        // 3. Webview is already on target URL (ignoring trailing slash)
        if (liveNorm === targetNorm) {
          currentNavUrlRef.current = tab.url
          return
        }

        // 4. SPA Route Protection:
        // If webview is already navigating or present on a subpath of the same origin
        // (e.g. live is 'https://www.youtube.com/shorts' and target is 'https://www.youtube.com'),
        // NEVER force loadURL to root origin due to a stale prop!
        try {
          const liveUrlObj = new URL(live)
          const targetUrlObj = new URL(tab.url)
          if (
            liveUrlObj.origin === targetUrlObj.origin &&
            targetUrlObj.pathname === '/' &&
            liveUrlObj.pathname.length > 1
          ) {
            currentNavUrlRef.current = live
            return
          }
        } catch {}
      }

      currentNavUrlRef.current = tab.url
      if (typeof el.loadURL === 'function') {
        el.loadURL(tab.url).catch(() => {})
      }
    } catch {}
  }, [tab.url])

  // Reactive theme and DevTools active tab synchronizer
  useEffect(() => {
    const el = webviewRef.current
    if (!el) return
    try {
      if (typeof el.executeJavaScript === 'function') {
        el.executeJavaScript(getThemeSyncScript(isDark)).catch(() => {})
      }
      if (isActive && typeof el.getWebContentsId === 'function') {
        const wcId = el.getWebContentsId()
        if (wcId && api.devtools?.syncActiveTab) {
          api.devtools.syncActiveTab(wcId).catch(() => {})
        }
      }
    } catch {
      // ignore
    }
  }, [isDark, isActive])

  // Apply persistent per-domain zoom level
  const applyDomainZoom = useCallback((targetUrl?: string) => {
    const el = webviewRef.current
    if (!el) return 100
    const urlToUse = targetUrl || tab.url
    const zoomPercent = getDomainZoom(urlToUse, defaultZoom || 100)
    try {
      if (typeof el.setZoomFactor === 'function') {
        el.setZoomFactor(zoomPercent / 100)
      }
    } catch {}
    return zoomPercent
  }, [tab.url, defaultZoom])

  useEffect(() => {
    applyDomainZoom()
  }, [tab.url, defaultZoom, applyDomainZoom])

  // Listen to zoom shortcuts when active
  useEffect(() => {
    if (!isActive) return

    const handleZoomIn = () => {
      const el = webviewRef.current
      if (!el) return
      const current = getDomainZoom(tab.url, defaultZoom || 100)
      const next = getNextZoomIn(current)
      try {
        if (typeof el.setZoomFactor === 'function') {
          el.setZoomFactor(next / 100)
        }
      } catch {}
      setDomainZoom(tab.url, next)
    }

    const handleZoomOut = () => {
      const el = webviewRef.current
      if (!el) return
      const current = getDomainZoom(tab.url, defaultZoom || 100)
      const prev = getNextZoomOut(current)
      try {
        if (typeof el.setZoomFactor === 'function') {
          el.setZoomFactor(prev / 100)
        }
      } catch {}
      setDomainZoom(tab.url, prev)
    }

    const handleZoomReset = () => {
      const el = webviewRef.current
      if (!el) return
      try {
        if (typeof el.setZoomFactor === 'function') {
          el.setZoomFactor(1.0)
        }
      } catch {}
      setDomainZoom(tab.url, 100)
    }

    window.addEventListener('tct:webview-zoom-in', handleZoomIn)
    window.addEventListener('tct:webview-zoom-out', handleZoomOut)
    window.addEventListener('tct:webview-zoom-reset', handleZoomReset)

    return () => {
      window.removeEventListener('tct:webview-zoom-in', handleZoomIn)
      window.removeEventListener('tct:webview-zoom-out', handleZoomOut)
      window.removeEventListener('tct:webview-zoom-reset', handleZoomReset)
    }
  }, [isActive, tab.url, defaultZoom])

  // Sync zoom changes from other tabs on same domain or from reset pill
  useEffect(() => {
    const handleZoomChanged = (e: any) => {
      const el = webviewRef.current
      if (!el || !tab.url) return
      if (e?.detail?.zoom !== undefined) {
        const currentDomain = extractDomain(tab.url)
        if (e.detail.domain === currentDomain) {
          try {
            if (typeof el.setZoomFactor === 'function') {
              el.setZoomFactor(e.detail.zoom / 100)
            }
          } catch {}
        }
      }
    }
    window.addEventListener('tct:domain-zoom-changed', handleZoomChanged)
    return () => window.removeEventListener('tct:domain-zoom-changed', handleZoomChanged)
  }, [tab.url])

  // Automatically focus active webview when switched so keyboard input goes directly to the tab
  useEffect(() => {
    if (isActive && webviewRef.current) {
      try {
        webviewRef.current.focus()
      } catch {}
    }
  }, [isActive])

  useEffect(() => {
    const el = webviewRef.current
    if (!el) return

    // Guarantee allowpopups attribute is present on DOM node for Chromium
    try {
      el.setAttribute('allowpopups', 'true')
    } catch {}

    registerWebviewRef(tab.id, el)

    const handleStartLoading = () => {
      setIsLoading(true)
      setHasError(false)
    }

    const handleStopLoading = () => {
      setIsLoading(false)
    }

    const syncTheme = () => {
      try {
        if (typeof el.executeJavaScript === 'function') {
          el.executeJavaScript(getThemeSyncScript(isDark)).catch(() => {})
        }
      } catch {
        // ignore
      }
    }

    const handleDidFinishLoad = () => {
      setIsLoading(false)
      setHasError(false)
      syncTheme()
      applyDomainZoom()
      try {
        const currentUrl = el.getURL()
        const currentTitle = el.getTitle() || tab.title
        let favicon: string | null = null
        try {
          const u = new URL(currentUrl)
          favicon = `${u.origin}/favicon.ico`
        } catch {
          // ignore
        }

        if (currentUrl && currentUrl !== 'about:blank') {
          lastNavigatedFromWebviewUrlRef.current = currentUrl
          currentNavUrlRef.current = currentUrl
          onUpdateTabRef.current(tab.id, {
            url: currentUrl,
            title: currentTitle,
            favicon
          })

          // Record to persistent browsing history
          applyDomainZoom(currentUrl)
          if (api.history?.recordVisit) {
            api.history.recordVisit({
              url: currentUrl,
              title: currentTitle,
              favicon,
              spaceId
            }).catch(() => {})
          }
        }
      } catch (e) {
        console.error('Error on did-finish-load:', e)
      }
    }

    const handleFaviconUpdated = (e: any) => {
      if (e.favicons && e.favicons.length > 0) {
        onUpdateTabRef.current(tab.id, { favicon: e.favicons[0] })
      }
    }

    const handleTitleUpdated = (e: any) => {
      if (e.title) {
        const live = typeof el.getURL === 'function' ? el.getURL() : undefined
        if (live && live !== 'about:blank') {
          lastNavigatedFromWebviewUrlRef.current = live
          currentNavUrlRef.current = live
          onUpdateTabRef.current(tab.id, { title: e.title, url: live })
        } else {
          onUpdateTabRef.current(tab.id, { title: e.title })
        }
      }
    }

    const handleDidFailLoad = (e: any) => {
      // errorCode -3 is ABORTED (e.g. user navigated before finish), ignore it
      if (e.isMainFrame && e.errorCode !== -3) {
        setIsLoading(false)
        setHasError(true)
        setErrorMessage(e.errorDescription || 'Failed to load webpage')
      }
    }

    const handleNewWindow = (e: any) => {
      if (e.preventDefault) e.preventDefault()
      if (e.url && e.url !== 'about:blank') {
        onOpenNewTabRef.current(e.url)
      }
    }

    const handleNavigation = (e: any) => {
      // Ignore subframe navigations (e.g. ad frames, widgets)
      if (e && e.isMainFrame === false) {
        return
      }

      const navUrl = e?.url || (typeof el.getURL === 'function' ? el.getURL() : null)
      if (navUrl && navUrl !== 'about:blank') {
        lastNavigatedFromWebviewUrlRef.current = navUrl
        currentNavUrlRef.current = navUrl
        const navTitle = typeof el.getTitle === 'function' ? el.getTitle() : tab.title
        useBrowserStore.getState().updateTabInStore(tab.id, {
          url: navUrl,
          title: navTitle || tab.title
        })
        onUpdateTabRef.current(tab.id, {
          url: navUrl,
          title: navTitle || tab.title
        })

        applyDomainZoom(navUrl)
        if (api.history?.recordVisit) {
          api.history.recordVisit({
            url: navUrl,
            title: navTitle || tab.title,
            favicon: tab.favicon,
            spaceId
          }).catch(() => {})
        }
      }
    }

    const handleDomReady = () => {
      syncTheme()
      try {
        // Link click interceptor in capture phase to guarantee target="_blank", Ctrl+click, and middle-click open tabs reliably
        el.executeJavaScript(`
          (function() {
            try {
              if (window.__tct_link_handler_installed) return;
              window.__tct_link_handler_installed = true;

              document.addEventListener('click', function(e) {
                var a = e.target && e.target.closest ? e.target.closest('a') : null;
                if (!a || !a.href) return;
                var href = a.href;
                if (!href.startsWith('http://') && !href.startsWith('https://')) return;

                var target = a.getAttribute('target');
                var isNewWindow = target === '_blank' || target === '_new' || e.ctrlKey || e.metaKey;

                if (isNewWindow) {
                  e.preventDefault();
                  e.stopPropagation();
                  window.open(href, '_blank');
                }
              }, true);

              document.addEventListener('auxclick', function(e) {
                if (e.button === 1) {
                  var a = e.target && e.target.closest ? e.target.closest('a') : null;
                  if (a && a.href && (a.href.startsWith('http://') || a.href.startsWith('https://'))) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(a.href, '_blank');
                  }
                }
              }, true);
            } catch(e) {}
          })();
        `).catch(() => {})

        el.insertCSS(`
          :root, html, body, * {
            scrollbar-width: thin !important;
            scrollbar-color: rgba(130, 130, 150, 0.4) transparent !important;
          }
          ::-webkit-scrollbar {
            width: 6px !important;
            height: 6px !important;
          }
          ::-webkit-scrollbar-track {
            background: transparent !important;
          }
          ::-webkit-scrollbar-thumb {
            background: rgba(130, 130, 150, 0.4) !important;
            border-radius: 9999px !important;
            border: 1px solid transparent !important;
            background-clip: padding-box !important;
          }
          ::-webkit-scrollbar-thumb:hover {
            background: rgba(150, 150, 180, 0.7) !important;
          }
          ::-webkit-scrollbar-corner {
            background: transparent !important;
          }
          ::-webkit-scrollbar-button {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
          }
        `).catch(() => {})
      } catch {
        // ignore
      }
    }

    const handleWebviewFocus = () => {
      window.dispatchEvent(new CustomEvent('tct:close-omnibox'))
    }

    const handleFoundInPage = (e: any) => {
      window.dispatchEvent(
        new CustomEvent('tct:found-in-page', {
          detail: {
            tabId: tab.id,
            activeMatchOrdinal: e.result?.activeMatchOrdinal || 0,
            matches: e.result?.matches || 0
          }
        })
      )
    }

    const handleMediaPlaying = () => {
      useBrowserStore.getState().setTabAudible(tab.id, true)
    }

    const handleMediaPaused = () => {
      setTimeout(() => {
        if (el && typeof el.isCurrentlyAudible === 'function') {
          useBrowserStore.getState().setTabAudible(tab.id, el.isCurrentlyAudible())
        } else {
          useBrowserStore.getState().setTabAudible(tab.id, false)
        }
      }, 300)
    }

    el.addEventListener('dom-ready', handleDomReady)
    el.addEventListener('focus', handleWebviewFocus)
    el.addEventListener('found-in-page', handleFoundInPage)
    el.addEventListener('media-started-playing', handleMediaPlaying)
    el.addEventListener('media-paused', handleMediaPaused)
    el.addEventListener('did-start-loading', handleStartLoading)
    el.addEventListener('did-stop-loading', handleStopLoading)
    el.addEventListener('did-finish-load', handleDidFinishLoad)
    el.addEventListener('did-navigate', handleNavigation)
    el.addEventListener('did-navigate-in-page', handleNavigation)
    el.addEventListener('page-favicon-updated', handleFaviconUpdated)
    el.addEventListener('page-title-updated', handleTitleUpdated)
    el.addEventListener('did-fail-load', handleDidFailLoad)
    el.addEventListener('new-window', handleNewWindow)

    return () => {
      unregisterWebviewRef(tab.id)
      el.removeEventListener('dom-ready', handleDomReady)
      el.removeEventListener('focus', handleWebviewFocus)
      el.removeEventListener('found-in-page', handleFoundInPage)
      el.removeEventListener('media-started-playing', handleMediaPlaying)
      el.removeEventListener('media-paused', handleMediaPaused)
      el.removeEventListener('did-start-loading', handleStartLoading)
      el.removeEventListener('did-stop-loading', handleStopLoading)
      el.removeEventListener('did-finish-load', handleDidFinishLoad)
      el.removeEventListener('did-navigate', handleNavigation)
      el.removeEventListener('did-navigate-in-page', handleNavigation)
      el.removeEventListener('page-favicon-updated', handleFaviconUpdated)
      el.removeEventListener('page-title-updated', handleTitleUpdated)
      el.removeEventListener('did-fail-load', handleDidFailLoad)
      el.removeEventListener('new-window', handleNewWindow)
    }
  }, [tab.id, registerWebviewRef, unregisterWebviewRef])

  // Wake up sleeping tab when it becomes active
  useEffect(() => {
    if (isActive && tab.isSleeping) {
      useBrowserStore.getState().setTabSleeping(tab.id, false)
    }
  }, [isActive, tab.isSleeping, tab.id])

  // Free unreferenced DOM & JS memory when tab transitions to background
  useEffect(() => {
    if (!isActive) {
      try {
        if (webviewRef.current && typeof webviewRef.current.executeJavaScript === 'function') {
          webviewRef.current.executeJavaScript('if (window.gc) window.gc();', true).catch(() => {})
        }
      } catch {}
    }
  }, [isActive])

  const handleRetry = () => {
    setHasError(false)
    if (webviewRef.current) {
      webviewRef.current.reload()
    }
  }

  return (
    <div
      className="bg-background overflow-hidden flex flex-col"
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
        if (onFocusPane) onFocusPane()
        window.dispatchEvent(new CustomEvent('tct:close-omnibox'))
      }}
    >
      {/* Split Pane Header Indicator */}
      {splitRole && (
        <div className="h-7 px-3 bg-muted/60 border-b border-border flex items-center justify-between text-xs shrink-0 select-none z-20">
          <div className="flex items-center gap-2 truncate">
            {tab.favicon ? (
              <img src={tab.favicon} alt="" className="w-3.5 h-3.5 rounded-xs shrink-0" />
            ) : (
              <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            )}
            <span className="font-medium text-foreground truncate max-w-[200px]">
              {tab.title || tab.url || 'Tab'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {splitRole === 'secondary' && onSwapSplit && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onSwapSplit()
                }}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Swap Left / Right"
              >
                <ArrowLeftRight className="w-3 h-3" />
              </button>
            )}
            {onCloseSplit && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseSplit()
                }}
                className="p-1 rounded-md hover:bg-destructive/20 hover:text-destructive text-muted-foreground transition-colors"
                title="Close Split View"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* If tab is sleeping and inactive, unmount webview to completely destroy renderer RAM */}
      {(!tab.isSleeping || isActive) && (
        <webview
          ref={webviewRef}
          src={currentNavUrlRef.current || tab.url || initialUrlRef.current}
          partition="persist:browser-tabs"
          className="w-full h-full flex-1 bg-background border-none outline-none flex"
          {...({ allowpopups: 'true' } as any)}
          webpreferences="contextIsolation=yes, javascript=yes, sandbox=yes, backgroundThrottling=yes, spellcheck=no"
        />
      )}

      {/* Sleeping tab placeholder */}
      {tab.isSleeping && isActive && (
        <div className="absolute inset-0 bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-10 select-none">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4 ring-1 ring-primary/20">
            <Moon className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">
            Tab is Sleeping
          </h3>
          <p className="text-xs text-muted-foreground max-w-xs mb-4">
            Hibernated to conserve memory. Click below to wake and restore.
          </p>
          <button
            onClick={() => useBrowserStore.getState().setTabSleeping(tab.id, false)}
            className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:bg-primary/90 transition-all shadow-sm flex items-center gap-2 cursor-pointer hover:scale-105 active:scale-95"
          >
            <Zap className="w-3.5 h-3.5" />
            Wake Tab
          </button>
        </div>
      )}

      {/* Loading bar */}
      {isLoading && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary/20 overflow-hidden z-20">
          <div className="h-full bg-primary animate-pulse w-2/3" />
        </div>
      )}

      {/* Error overlay on did-fail-load */}
      {hasError && (
        <div className="absolute inset-0 bg-background flex flex-col items-center justify-center p-6 text-center z-10">
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">
            Unable to reach webpage
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mb-4">
            {errorMessage || 'Check your internet connection or the URL.'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRetry}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium flex items-center gap-2 transition-colors shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
            <button
              onClick={() => onOpenNewTab('https://duckduckgo.com')}
              className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-medium flex items-center gap-2 transition-colors border border-border"
            >
              <span>Go to Home</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface WebViewContainerProps {
  spaceId: string | null
}

export const WebViewContainer: React.FC<WebViewContainerProps> = ({ spaceId }) => {
  const { tabs, activeTab, activeTabId, updateTab, createTab, setActiveTab } = useTabs(spaceId)
  const { settings } = useSettings()
  const setCommandBarOpen = useBrowserStore((s) => s.setCommandBarOpen)

  // Split View Store Accessors
  const splitTabId = useBrowserStore((s) => s.splitTabId)
  const splitRatio = useBrowserStore((s) => s.splitRatio)
  const setSplitRatio = useBrowserStore((s) => s.setSplitRatio)
  const setSplitTabId = useBrowserStore((s) => s.setSplitTabId)
  const closeSplitView = useBrowserStore((s) => s.closeSplitView)

  const resolvedTheme = useThemeStore((s) => s.resolved)
  const isDark = resolvedTheme === 'dark'
  const webviewsRef = useRef<Map<string, any>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [isDraggingSplit, setIsDraggingSplit] = useState(false)
  const activeTabRef = useRef(activeTab)
  activeTabRef.current = activeTab
  const [matchesCount, setMatchesCount] = useState<{ activeMatchOrdinal: number; matches: number }>({
    activeMatchOrdinal: 0,
    matches: 0
  })

  // Split view dragging handler
  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingSplit(true)
  }

  useEffect(() => {
    if (!isDraggingSplit) return

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const newRatio = (e.clientX - rect.left) / rect.width
      setSplitRatio(newRatio)
    }

    const handleMouseUp = () => {
      setIsDraggingSplit(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDraggingSplit, setSplitRatio])

  // Global listeners for Reader Mode, PiP, and Split View shortcuts
  useEffect(() => {
    const handleToggleReader = async () => {
      const store = useBrowserStore.getState()
      if (store.readerMode.isOpen) {
        store.closeReaderMode()
        return
      }
      const el = store.activeTabId ? webviewsRef.current.get(store.activeTabId) : null
      if (!el || typeof el.executeJavaScript !== 'function') return

      try {
        const res = await el.executeJavaScript(READABILITY_EXTRACTION_SCRIPT)
        if (res && res.success && res.contentHtml) {
          store.openReaderMode({
            tabId: store.activeTabId!,
            url: typeof el.getURL === 'function' ? el.getURL() : '',
            title: res.title,
            byline: res.byline,
            contentHtml: res.contentHtml,
            readingTime: res.readingTime
          })
        } else {
          toast.info('No readable article found on this page.')
        }
      } catch (err) {
        console.warn('[ReaderMode] Error extracting content:', err)
        toast.error('Unable to parse article.')
      }
    }

    const handleTogglePip = async () => {
      const store = useBrowserStore.getState()
      const el = store.activeTabId ? webviewsRef.current.get(store.activeTabId) : null
      if (!el || typeof el.executeJavaScript !== 'function') return

      try {
        const res = await el.executeJavaScript(PICTURE_IN_PICTURE_SCRIPT)
        if (res && res.success) {
          toast.success(res.active ? 'Picture-in-Picture active' : 'Picture-in-Picture closed')
        } else {
          toast.info(res?.reason || 'No video found on this page.')
        }
      } catch (err) {
        console.warn('[PiP] Error:', err)
      }
    }

    const handleToggleSplit = async (e: any) => {
      const store = useBrowserStore.getState()
      if (store.splitTabId) {
        store.closeSplitView()
        toast.info('Split View closed')
        return
      }
      const targetTabId = e.detail?.targetTabId
      if (targetTabId && targetTabId !== store.activeTabId) {
        store.setSplitTabId(targetTabId)
        return
      }
      const spaceIdToUse = store.activeSpaceId || spaceId
      const curTabs = spaceIdToUse ? store.tabsBySpace[spaceIdToUse] || [] : []
      const other = curTabs.find((t) => t.id !== store.activeTabId)
      if (other) {
        store.setSplitTabId(other.id)
        toast.info(`Split with "${other.title || 'Tab'}"`)
      } else if (spaceIdToUse) {
        try {
          const newTab = await createTab({
            spaceId: spaceIdToUse,
            url: 'https://duckduckgo.com',
            title: 'New Tab'
          })
          store.setSplitTabId(newTab.id)
          toast.success('Split View active with new tab')
        } catch (err) {
          console.error('[SplitView] Failed to create secondary tab:', err)
        }
      }
    }

    window.addEventListener('tct:toggle-reader-mode', handleToggleReader)
    window.addEventListener('tct:toggle-pip', handleTogglePip)
    window.addEventListener('tct:toggle-split-view', handleToggleSplit as any)

    return () => {
      window.removeEventListener('tct:toggle-reader-mode', handleToggleReader)
      window.removeEventListener('tct:toggle-pip', handleTogglePip)
      window.removeEventListener('tct:toggle-split-view', handleToggleSplit as any)
    }
  }, [])

  // Whenever the theme changes, synchronize all open webviews live seamlessly
  const prevIsDarkRef = useRef(isDark)
  useEffect(() => {
    const script = getThemeSyncScript(isDark)
    prevIsDarkRef.current = isDark

    webviewsRef.current.forEach((el) => {
      try {
        if (el && typeof el.executeJavaScript === 'function') {
          el.executeJavaScript(script).catch(() => {})
        }
      } catch {
        // ignore
      }
    })
  }, [isDark])

  const registerWebviewRef = useCallback((tabId: string, el: any) => {
    webviewsRef.current.set(tabId, el)
  }, [])

  const unregisterWebviewRef = useCallback((tabId: string) => {
    webviewsRef.current.delete(tabId)
  }, [])

  // Poll navigation state for active webview
  useEffect(() => {
    const activeEl = activeTabId ? webviewsRef.current.get(activeTabId) : null
    if (!activeEl) {
      setCanGoBack(false)
      setCanGoForward(false)
      useBrowserStore.getState().setNavState(false, false)
      return
    }

    const updateNavState = () => {
      try {
        const canBack = typeof activeEl.canGoBack === 'function' ? activeEl.canGoBack() : false
        const canFwd = typeof activeEl.canGoForward === 'function' ? activeEl.canGoForward() : false
        setCanGoBack(canBack)
        setCanGoForward(canFwd)
        useBrowserStore.getState().setNavState(canBack, canFwd)

        // Live URL synchronization (e.g. user submitted search, dynamic scroll hash, pushState, replaceState)
        if (typeof activeEl.getURL === 'function') {
          const liveUrl = activeEl.getURL()
          const currentTab = activeTabRef.current
          if (liveUrl && liveUrl !== 'about:blank' && currentTab && liveUrl !== currentTab.url) {
            // Immediately update ref to avoid re-triggering and hammering state on subsequent ticks
            activeTabRef.current = { ...currentTab, url: liveUrl }
            const liveTitle = typeof activeEl.getTitle === 'function' ? activeEl.getTitle() : currentTab.title
            useBrowserStore.getState().updateTabInStore(currentTab.id, {
              url: liveUrl,
              title: liveTitle || currentTab.title
            })
            updateTab(currentTab.id, {
              url: liveUrl,
              title: liveTitle || currentTab.title
            })
          }
        }
      } catch {
        // ignore
      }
    }

    updateNavState()
    const interval = setInterval(updateNavState, 200)
    return () => clearInterval(interval)
  }, [activeTabId, updateTab])

  const handleBack = useCallback(() => {
    const el = activeTabId ? webviewsRef.current.get(activeTabId) : null
    if (el && typeof el.goBack === 'function' && el.canGoBack()) {
      el.goBack()
    }
  }, [activeTabId])

  const handleForward = useCallback(() => {
    const el = activeTabId ? webviewsRef.current.get(activeTabId) : null
    if (el && typeof el.goForward === 'function' && el.canGoForward()) {
      el.goForward()
    }
  }, [activeTabId])

  const handleReload = useCallback(() => {
    const el = activeTabId ? webviewsRef.current.get(activeTabId) : null
    if (el && typeof el.reload === 'function') {
      el.reload()
    }
  }, [activeTabId])

  const handleHardReload = useCallback(() => {
    const el = activeTabId ? webviewsRef.current.get(activeTabId) : null
    if (el && typeof el.reloadIgnoringCache === 'function') {
      el.reloadIgnoringCache()
    } else if (el && typeof el.reload === 'function') {
      el.reload()
    }
  }, [activeTabId])

  const handleZoomIn = useCallback(() => {
    const el = activeTabId ? webviewsRef.current.get(activeTabId) : null
    if (el && typeof el.getZoomLevel === 'function' && typeof el.setZoomLevel === 'function') {
      el.getZoomLevel((level: number) => {
        el.setZoomLevel(Math.min(level + 0.5, 9.0))
      })
    }
  }, [activeTabId])

  const handleZoomOut = useCallback(() => {
    const el = activeTabId ? webviewsRef.current.get(activeTabId) : null
    if (el && typeof el.getZoomLevel === 'function' && typeof el.setZoomLevel === 'function') {
      el.getZoomLevel((level: number) => {
        el.setZoomLevel(Math.max(level - 0.5, -8.0))
      })
    }
  }, [activeTabId])

  const handleZoomReset = useCallback(() => {
    const el = activeTabId ? webviewsRef.current.get(activeTabId) : null
    if (el && typeof el.setZoomLevel === 'function') {
      el.setZoomLevel(0)
    }
  }, [activeTabId])

  const handlePrint = useCallback(() => {
    const el = activeTabId ? webviewsRef.current.get(activeTabId) : null
    if (el) {
      if (typeof el.print === 'function') {
        el.print()
      } else if (typeof el.getWebContentsId === 'function') {
        const wcId = el.getWebContentsId()
        api.webview?.print(wcId)
      }
    }
  }, [activeTabId])

  const handleFind = useCallback((text: string, options: any) => {
    const el = activeTabId ? webviewsRef.current.get(activeTabId) : null
    if (el && typeof el.findInPage === 'function') {
      el.findInPage(text, options)
    }
  }, [activeTabId])

  const handleStopFind = useCallback((action: any) => {
    const el = activeTabId ? webviewsRef.current.get(activeTabId) : null
    if (el && typeof el.stopFindInPage === 'function') {
      el.stopFindInPage(action)
    }
    setMatchesCount({ activeMatchOrdinal: 0, matches: 0 })
  }, [activeTabId])

  const handleSavePdf = useCallback(async () => {
    const el = activeTabId ? webviewsRef.current.get(activeTabId) : null
    if (el && typeof el.getWebContentsId === 'function') {
      const wcId = el.getWebContentsId()
      try {
        const res = await api.webview?.saveAsPdf(wcId)
        if (res?.success && res.filePath) {
          toast.success('Page saved as PDF', {
            description: res.filePath,
            action: {
              label: 'Show in Folder',
              onClick: () => {
                api.downloads?.showInFolder(res.filePath!)
              }
            }
          })
        } else if (res?.error) {
          toast.error(res.error)
        }
      } catch {
        toast.error('Failed to export PDF')
      }
    }
  }, [activeTabId])

  // Listen to navigation, zoom, and print events from top unified TitleBar and global shortcuts
  useEffect(() => {
    const onBack = () => handleBack()
    const onForward = () => handleForward()
    const onReload = () => handleReload()
    const onHardReload = () => handleHardReload()
    const onZoomIn = () => handleZoomIn()
    const onZoomOut = () => handleZoomOut()
    const onZoomReset = () => handleZoomReset()
    const onPrint = () => handlePrint()
    const onSavePdf = () => handleSavePdf()

    const onNavigate = (e: any) => {
      const { tabId, url } = e.detail || {}
      const targetId = tabId || activeTabId
      const targetEl = targetId ? webviewsRef.current.get(targetId) : null
      if (targetEl && url && typeof targetEl.loadURL === 'function') {
        targetEl.loadURL(url).catch(() => {})
      }
    }

    const onToggleFind = () => {
      const store = useBrowserStore.getState()
      store.setFindBarOpen(!store.findBarOpen)
    }

    const onFoundInPage = (e: any) => {
      const { tabId, activeMatchOrdinal, matches } = e.detail || {}
      if (tabId === activeTabId) {
        setMatchesCount({ activeMatchOrdinal, matches })
      }
    }

    const onToggleMuteTab = (e: any) => {
      const { tabId } = e.detail || {}
      if (!tabId) return
      const el = webviewsRef.current.get(tabId)
      const currentTabs = spaceId ? useBrowserStore.getState().tabsBySpace[spaceId] || [] : []
      const targetTab = currentTabs.find((t) => t.id === tabId)
      if (el && targetTab) {
        const nextMuted = !targetTab.isMuted
        if (typeof el.setAudioMuted === 'function') {
          el.setAudioMuted(nextMuted)
        }
        useBrowserStore.getState().setTabMuted(tabId, nextMuted)
        toast.info(nextMuted ? `Muted "${targetTab.title || 'Tab'}"` : `Unmuted "${targetTab.title || 'Tab'}"`)
      }
    }

    window.addEventListener('tct:webview-back', onBack)
    window.addEventListener('tct:webview-forward', onForward)
    window.addEventListener('tct:webview-reload', onReload)
    window.addEventListener('tct:webview-hard-reload', onHardReload)
    window.addEventListener('tct:webview-zoom-in', onZoomIn)
    window.addEventListener('tct:webview-zoom-out', onZoomOut)
    window.addEventListener('tct:webview-zoom-reset', onZoomReset)
    window.addEventListener('tct:webview-print', onPrint)
    window.addEventListener('tct:webview-save-pdf', onSavePdf)
    window.addEventListener('tct:webview-navigate', onNavigate)
    window.addEventListener('tct:toggle-find', onToggleFind)
    window.addEventListener('tct:found-in-page', onFoundInPage)
    window.addEventListener('tct:toggle-mute-tab', onToggleMuteTab)

    return () => {
      window.removeEventListener('tct:webview-back', onBack)
      window.removeEventListener('tct:webview-forward', onForward)
      window.removeEventListener('tct:webview-reload', onReload)
      window.removeEventListener('tct:webview-hard-reload', onHardReload)
      window.removeEventListener('tct:webview-zoom-in', onZoomIn)
      window.removeEventListener('tct:webview-zoom-out', onZoomOut)
      window.removeEventListener('tct:webview-zoom-reset', onZoomReset)
      window.removeEventListener('tct:webview-print', onPrint)
      window.removeEventListener('tct:webview-save-pdf', onSavePdf)
      window.removeEventListener('tct:webview-navigate', onNavigate)
      window.removeEventListener('tct:toggle-find', onToggleFind)
      window.removeEventListener('tct:found-in-page', onFoundInPage)
      window.removeEventListener('tct:toggle-mute-tab', onToggleMuteTab)
    }
  }, [handleBack, handleForward, handleReload, handleHardReload, handleZoomIn, handleZoomOut, handleZoomReset, handlePrint, handleSavePdf])

  // Memory Saver: hibernate inactive background tabs after 30 minutes
  useEffect(() => {
    const memorySaverEnabled = settings?.memorySaverEnabled ?? true
    if (!memorySaverEnabled || !spaceId) return

    const interval = setInterval(() => {
      const store = useBrowserStore.getState()
      const currentTabs = store.tabsBySpace[spaceId] || []
      const timeoutMs = (settings?.sleepTimeoutMinutes || 30) * 60 * 1000
      const now = Date.now()

      currentTabs.forEach((t) => {
        if (
          t.id !== store.activeTabId &&
          !t.isPinned &&
          !t.isAudible &&
          !t.isSleeping
        ) {
          const lastVisitedTime = new Date(t.lastVisited || t.createdAt).getTime()
          if (now - lastVisitedTime > timeoutMs) {
            store.setTabSleeping(t.id, true)
          }
        }
      })
    }, 60000)

    return () => clearInterval(interval)
  }, [spaceId, settings?.memorySaverEnabled, settings?.sleepTimeoutMinutes])

  const lastOpenedUrlRef = useRef<{ url: string; time: number }>({ url: '', time: 0 })

  const handleNewTabFromUrl = useCallback(async (url: string) => {
    if (!url || url === 'about:blank') return
    const now = Date.now()
    if (lastOpenedUrlRef.current.url === url && now - lastOpenedUrlRef.current.time < 800) {
      return
    }
    lastOpenedUrlRef.current = { url, time: now }

    const targetSpace = spaceId || useBrowserStore.getState().activeSpaceId
    if (targetSpace) {
      try {
        const store = useBrowserStore.getState()
        const currentActive = store.activeTabId ? store.tabsBySpace[targetSpace]?.find((t) => t.id === store.activeTabId) : null
        const insertOrder = currentActive ? currentActive.order + 1 : undefined

        const newTab = await createTab({
          spaceId: targetSpace,
          url,
          title: 'Loading...',
          order: insertOrder
        })
        setActiveTab(newTab.id)
      } catch (err) {
        console.error('Failed to create tab from webview:', err)
      }
    }
  }, [spaceId, createTab, setActiveTab])

    const isSplitActive = Boolean(
      splitTabId &&
      splitTabId !== activeTabId &&
      tabs.some((t) => t.id === splitTabId)
    )

    return (
      <div ref={containerRef} className="flex-1 relative w-full h-full overflow-hidden bg-background">
        {tabs.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center select-none bg-background">
            <div className="w-12 h-12 rounded-2xl bg-muted/60 border border-border flex items-center justify-center text-muted-foreground mb-3">
              <Globe className="w-6 h-6" />
            </div>
            <h2 className="text-sm font-semibold text-foreground mb-1">No Open Tabs</h2>
            <p className="text-xs text-muted-foreground mb-4 max-w-xs">
              Press {modKey}+T or click below to search the web or enter a URL.
            </p>
            <button
              onClick={() => setCommandBarOpen(true, '', 'new-tab')}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium transition-colors shadow-sm"
            >
              Open New Tab
            </button>
          </div>
        ) : (
          tabs.map((tab) => {
            const effectiveActiveId = activeTabId || activeTab?.id || tabs[0]?.id
            const isPrimary = tab.id === effectiveActiveId
            const isSecondary = isSplitActive && tab.id === splitTabId
            const isPaneActive = isPrimary || isSecondary

            let paneStyle: React.CSSProperties | undefined
            let splitRole: 'primary' | 'secondary' | null = null

            if (isSplitActive) {
              if (isPrimary) {
                splitRole = 'primary'
                paneStyle = {
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `calc(${splitRatio * 100}% - 3px)`,
                  borderRight: '1px solid var(--border)'
                }
              } else if (isSecondary) {
                splitRole = 'secondary'
                paneStyle = {
                  left: `calc(${splitRatio * 100}% + 3px)`,
                  top: 0,
                  bottom: 0,
                  width: `calc(${(1 - splitRatio) * 100}% - 3px)`
                }
              }
            }

            return (
              <SingleWebView
                key={tab.id}
                tab={tab}
                isActive={isPaneActive}
                isDark={isDark}
                defaultZoom={settings?.defaultZoom || 100}
                spaceId={spaceId || tab.spaceId}
                paneStyle={paneStyle}
                splitRole={splitRole}
                onUpdateTab={updateTab}
                onOpenNewTab={handleNewTabFromUrl}
                registerWebviewRef={registerWebviewRef}
                unregisterWebviewRef={unregisterWebviewRef}
                onCloseSplit={closeSplitView}
                onSwapSplit={() => {
                  if (splitTabId) {
                    const oldActive = activeTabId
                    setActiveTab(splitTabId)
                    setSplitTabId(oldActive)
                  }
                }}
                onFocusPane={() => {
                  if (splitRole === 'secondary' && splitTabId) {
                    useBrowserStore.getState().setSplitActivePane('secondary')
                  } else {
                    useBrowserStore.getState().setSplitActivePane('primary')
                  }
                }}
              />
            )
          })
        )}

        {/* Resizable Draggable Splitter Bar */}
        {isSplitActive && (
          <div
            onMouseDown={handleSplitterMouseDown}
            onDoubleClick={() => setSplitRatio(0.5)}
            style={{
              left: `calc(${splitRatio * 100}% - 3px)`,
              width: '6px'
            }}
            className="absolute top-0 bottom-0 z-30 cursor-col-resize hover:bg-primary/50 transition-colors select-none group flex items-center justify-center"
            title="Drag to resize, double-click to reset (50/50)"
          >
            <div className="w-[2px] h-8 rounded-full bg-border group-hover:bg-primary transition-colors" />
          </div>
        )}

        {/* Overlay while dragging splitter to keep mouse tracking over webviews */}
        {isDraggingSplit && (
          <div className="fixed inset-0 z-50 cursor-col-resize select-none" />
        )}

        {/* In-Page Search Bar (Ctrl+F) */}
        <FindInPageBar
          onFind={handleFind}
          onStop={handleStopFind}
          matchesCount={matchesCount}
        />

        {/* Reader Mode Full-Surface Distraction-Free Overlay */}
        <ReaderModeOverlay />
      </div>
    )
}
