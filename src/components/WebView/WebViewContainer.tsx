import React, { useRef, useEffect, useState, useCallback } from 'react'
import {
  Globe,
  AlertCircle,
  RefreshCw
} from 'lucide-react'
import { useTabs } from '@/hooks/useTabs'
import { useSettings } from '@/hooks/useSettings'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useThemeStore } from '@/store/useThemeStore'
import { modKey } from '@/lib/platform'
import { getThemeSyncScript, resolveIsDark } from '@/lib/theme'
import { api } from '@/lib/ipc'
import type { Tab } from '@/types/api'

interface SingleWebViewProps {
  tab: Tab
  isActive: boolean
  isDark: boolean
  defaultZoom?: number
  spaceId: string
  onUpdateTab: (id: string, data: { url?: string; title?: string; favicon?: string | null }) => void
  onOpenNewTab: (url: string) => void
  registerWebviewRef: (tabId: string, el: any) => void
  unregisterWebviewRef: (tabId: string) => void
}

const SingleWebView: React.FC<SingleWebViewProps> = ({
  tab,
  isActive,
  isDark,
  defaultZoom = 100,
  spaceId,
  onUpdateTab,
  onOpenNewTab,
  registerWebviewRef,
  unregisterWebviewRef
}) => {
  const webviewRef = useRef<any>(null)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const initialUrlRef = useRef(tab.url)
  const currentNavUrlRef = useRef(tab.url)
  const lastNavigatedFromWebviewUrlRef = useRef<string>('')

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

  // Apply default page zoom level
  useEffect(() => {
    const el = webviewRef.current
    if (!el) return
    try {
      const factor = (defaultZoom || 100) / 100
      if (typeof el.setZoomFactor === 'function') {
        el.setZoomFactor(factor)
      }
    } catch {
      // ignore
    }
  }, [defaultZoom])

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
      try {
        const factor = (defaultZoom || 100) / 100
        if (typeof el.setZoomFactor === 'function') {
          el.setZoomFactor(factor)
        }
      } catch {}
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
          onUpdateTab(tab.id, {
            url: currentUrl,
            title: currentTitle,
            favicon
          })
        }
      } catch (e) {
        console.error('Error on did-finish-load:', e)
      }
    }

    const handleFaviconUpdated = (e: any) => {
      if (e.favicons && e.favicons.length > 0) {
        onUpdateTab(tab.id, { favicon: e.favicons[0] })
      }
    }

    const handleTitleUpdated = (e: any) => {
      if (e.title) {
        const live = typeof el.getURL === 'function' ? el.getURL() : undefined
        if (live && live !== 'about:blank') {
          lastNavigatedFromWebviewUrlRef.current = live
          currentNavUrlRef.current = live
          onUpdateTab(tab.id, { title: e.title, url: live })
        } else {
          onUpdateTab(tab.id, { title: e.title })
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
        onOpenNewTab(e.url)
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
        onUpdateTab(tab.id, {
          url: navUrl,
          title: navTitle || tab.title
        })
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

    el.addEventListener('dom-ready', handleDomReady)
    el.addEventListener('focus', handleWebviewFocus)
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
  }, [tab.id, onUpdateTab, onOpenNewTab, registerWebviewRef, unregisterWebviewRef])

  const handleRetry = () => {
    setHasError(false)
    if (webviewRef.current) {
      webviewRef.current.reload()
    }
  }

  return (
    <div
      className="w-full h-full relative bg-background overflow-hidden flex flex-col"
      style={{ display: isActive ? 'flex' : 'none' }}
      onMouseDown={() => {
        window.dispatchEvent(new CustomEvent('tct:close-omnibox'))
      }}
    >
      <webview
        ref={webviewRef}
        src={initialUrlRef.current}
        partition="persist:browser-tabs"
        className="w-full h-full flex-1 bg-background border-none outline-none flex"
        {...({ allowpopups: 'true' } as any)}
        webpreferences="contextIsolation=yes, javascript=yes, sandbox=yes, backgroundThrottling=yes, spellcheck=no"
      />

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

  const resolvedTheme = useThemeStore((s) => s.resolved)
  const isDark = resolvedTheme === 'dark'
  const webviewsRef = useRef<Map<string, any>>(new Map())
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const activeTabRef = useRef(activeTab)
  activeTabRef.current = activeTab

  // Whenever the theme changes (e.g. user toggles dark/light in Settings), synchronize all open webviews live seamlessly
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

  // Listen to navigation and zoom events from top unified TitleBar and global shortcuts
  useEffect(() => {
    const onBack = () => handleBack()
    const onForward = () => handleForward()
    const onReload = () => handleReload()
    const onHardReload = () => handleHardReload()
    const onZoomIn = () => handleZoomIn()
    const onZoomOut = () => handleZoomOut()
    const onZoomReset = () => handleZoomReset()

    const onNavigate = (e: any) => {
      const { tabId, url } = e.detail || {}
      const targetId = tabId || activeTabId
      const targetEl = targetId ? webviewsRef.current.get(targetId) : null
      if (targetEl && url && typeof targetEl.loadURL === 'function') {
        targetEl.loadURL(url).catch(() => {})
      }
    }

    window.addEventListener('tct:webview-back', onBack)
    window.addEventListener('tct:webview-forward', onForward)
    window.addEventListener('tct:webview-reload', onReload)
    window.addEventListener('tct:webview-hard-reload', onHardReload)
    window.addEventListener('tct:webview-zoom-in', onZoomIn)
    window.addEventListener('tct:webview-zoom-out', onZoomOut)
    window.addEventListener('tct:webview-zoom-reset', onZoomReset)
    window.addEventListener('tct:webview-navigate', onNavigate)

    return () => {
      window.removeEventListener('tct:webview-back', onBack)
      window.removeEventListener('tct:webview-forward', onForward)
      window.removeEventListener('tct:webview-reload', onReload)
      window.removeEventListener('tct:webview-hard-reload', onHardReload)
      window.removeEventListener('tct:webview-zoom-in', onZoomIn)
      window.removeEventListener('tct:webview-zoom-out', onZoomOut)
      window.removeEventListener('tct:webview-zoom-reset', onZoomReset)
      window.removeEventListener('tct:webview-navigate', onNavigate)
    }
  }, [handleBack, handleForward, handleReload, handleHardReload, handleZoomIn, handleZoomOut, handleZoomReset])

  const lastOpenedUrlRef = useRef<{ url: string; time: number }>({ url: '', time: 0 })

  const handleNewTabFromUrl = async (url: string) => {
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
  }

  return (
    <div className="flex-1 relative w-full h-full overflow-hidden bg-background">
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
          tabs.map((tab) => (
            <SingleWebView
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              isDark={isDark}
              defaultZoom={settings?.defaultZoom || 100}
              spaceId={spaceId || tab.spaceId}
              onUpdateTab={updateTab}
              onOpenNewTab={handleNewTabFromUrl}
              registerWebviewRef={registerWebviewRef}
              unregisterWebviewRef={unregisterWebviewRef}
            />
          ))
        )}
    </div>
  )
}
