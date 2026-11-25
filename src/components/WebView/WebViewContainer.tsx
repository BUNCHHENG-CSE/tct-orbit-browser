import React, { useRef, useEffect, useState, useCallback } from 'react'
import {
  Globe,
  AlertCircle,
  RefreshCw,
  ArrowLeftRight,
  X,
  Moon,
  Zap,
  BookOpen,
  ShieldBan,
  ShieldAlert,
  Frown
} from 'lucide-react'
import { toast } from 'sonner'
import { useTabs } from '@/hooks/useTabs'
import { useSettings } from '@/hooks/useSettings'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useThemeStore } from '@/store/useThemeStore'
import { useThumbnailStore } from '@/store/useThumbnailStore'
import { modKey } from '@/lib/platform'
import { getThemeSyncScript, resolveIsDark } from '@/lib/theme'
import { api } from '@/lib/ipc'
import { isStartPageUrl, isPrivateStartUrl, openNewTab } from '@/lib/startPage'
import { groupForNewTab } from '@/lib/tabGroups'
import { StartPage } from '@/components/StartPage/StartPage'
import { PrivateStartPage } from '@/components/StartPage/PrivateStartPage'
import { ReaderModeOverlay } from '@/components/ReaderMode/ReaderModeOverlay'
import { FindInPageBar } from '@/components/FindInPage/FindInPageBar'
import { READABILITY_EXTRACTION_SCRIPT, PICTURE_IN_PICTURE_SCRIPT } from '@/lib/readability'
import { getDomainZoom, setDomainZoom, getNextZoomIn, getNextZoomOut, extractDomain } from '@/lib/domainZoom'
import { PROGRESS_SCRIPT, PROGRESS_MSG, PAGE_TEXT_SCRIPT, PAGE_BASE_SCRIPT, scrollToRatioScript } from '@/lib/pageScripts'
import { saveReadingPosition, getReadingPosition } from '@/lib/readingProgress'
import { webviewRegistry } from '@/lib/webviewRegistry'
import { useSmartStore, focusBlockFor } from '@/store/useSmartStore'
import { useMeetingStore } from '@/store/useMeetingStore'
import { CompareToolbar } from '@/components/Smart/CompareToolbar'
import { installTabDragGuard } from '@/lib/tabDragGuard'
import { safeImageUrl } from '@/lib/sanitizeHtml'
import { describeLoadError, type LoadError } from '@/lib/netErrors'
import { START_PAGE_URL, START_PAGE_TITLE, PRIVATE_START_URL, PRIVATE_START_TITLE } from '@/lib/startPage'
import { useT } from '@/lib/i18n'
import type { UnsafeSiteInfo } from '@/types/essentials'

// Drag overlays (split-view drop zone, sidebar drop zones) must never get stuck after a drag
installTabDragGuard()
import type { Tab } from '@/types/api'

/** URL -> last time its text was sent to the "pages you've read" index (this session) */
const indexedThisSession = new Map<string, number>()
const REINDEX_MS = 6 * 3600_000

/** Send the page's readable text to the local full-text index (never for private tabs) */
function indexPageText(el: any, url: string, title: string, favicon: string | null, spaceId: string) {
  const last = indexedThisSession.get(url)
  if (last && Date.now() - last < REINDEX_MS) return
  indexedThisSession.set(url, Date.now())
  if (indexedThisSession.size > 2000) indexedThisSession.clear()
  // Give dynamic pages a moment to render their content
  setTimeout(() => {
    try {
      if (typeof el.getURL !== 'function' || el.getURL() !== url) return
      el.executeJavaScript(PAGE_TEXT_SCRIPT)
        .then((text: unknown) => {
          if (typeof text === 'string' && text.length >= 200) {
            api.smart?.pageIndex({ url, title, favicon, spaceId, text }).catch(() => {})
          }
        })
        .catch(() => {})
    } catch {}
  }, 2500)
}

interface SingleWebViewProps {
  tab: Tab
  /** Session partition: shared, private, or the space's own profile. Fixed for the webview's life. */
  partition: string
  isActive: boolean
  isDark: boolean
  defaultZoom?: number
  spaceId: string
  paneStyle?: React.CSSProperties
  splitRole?: 'primary' | 'secondary' | null
  onUpdateTab: (id: string, data: { url?: string; title?: string; favicon?: string | null }) => void
  onOpenNewTab: (url: string) => void
  onGuestClose: (tabId: string, wasBlank: boolean) => void
  registerWebviewRef: (tabId: string, el: any) => void
  unregisterWebviewRef: (tabId: string) => void
  onCloseSplit?: () => void
  onSwapSplit?: () => void
  onFocusPane?: () => void
}


/**
 * webview.loadURL with one retry for transient network failures (ERR_FAILED -2, connection
 * resets/closes). Previously failures were swallowed and the tab silently stayed on the old page.
 * ERR_ABORTED (-3) means the load was superseded by another navigation: never retry that.
 */
const TRANSIENT_NET_ERRORS = new Set([-2, -100, -101, -102, -103, -104, -105, -106, -118, -137, -356])
function loadUrlWithRetry(el: any, url: string, attempt = 0): void {
  if (!el || typeof el.loadURL !== 'function') return
  try {
    el.loadURL(url).catch((err: any) => {
      const errno = typeof err?.errno === 'number' ? err.errno : undefined
      if (attempt === 0 && errno !== undefined && TRANSIENT_NET_ERRORS.has(errno)) {
        setTimeout(() => loadUrlWithRetry(el, url, 1), 400)
      }
    })
  } catch {}
}

const SingleWebView: React.FC<SingleWebViewProps> = React.memo(({
  tab,
  partition,
  isActive,
  isDark,
  defaultZoom = 100,
  spaceId,
  paneStyle,
  splitRole,
  onUpdateTab,
  onOpenNewTab,
  onGuestClose,
  registerWebviewRef,
  unregisterWebviewRef,
  onCloseSplit,
  onSwapSplit,
  onFocusPane
}) => {
  const webviewRef = useRef<any>(null)
  /** A sleeping tab has no page view until it is opened again */
  const hasPageView = !tab.isSleeping || isActive
  const [loadError, setLoadError] = useState<LoadError | null>(null)
  const hasError = loadError !== null
  /** Address that failed, until the next navigation. Chromium "finishes loading" its own error page. */
  const failedUrlRef = useRef<string | null>(null)
  // Address of the link under the pointer
  const [hoverUrl, setHoverUrl] = useState('')
  const isFullscreen = useBrowserStore((s) => s.htmlFullscreenTabId === tab.id)
  const [isLoading, setIsLoading] = useState(false)
  const t = useT()
  // The page's process ended unexpectedly
  const [crashed, setCrashed] = useState<'crash' | 'memory' | null>(null)
  // Known phishing / malware site
  const [danger, setDanger] = useState<UnsafeSiteInfo | null>(null)
  // Focus rule for this space blocked a navigation: { domain, url }
  const [blocked, setBlocked] = useState<{ domain: string; url: string } | null>(null)
  // Saved reading position offered as "Continue reading"
  const [resumeAt, setResumeAt] = useState<number | null>(null)
  const resumeAtRef = useRef<number | null>(null)
  resumeAtRef.current = resumeAt
  const tabRef = useRef(tab)
  tabRef.current = tab
  const initialUrlRef = useRef(tab.url)
  // A webview's partition can never change after it navigates (Electron throws, which would
  // crash the whole UI). Freeze it at mount; the parent remounts us (new key) when it changes.
  const partitionRef = useRef(partition)
  const currentNavUrlRef = useRef(tab.url)
  const lastNavigatedFromWebviewUrlRef = useRef<string>(tab.url)

  const onUpdateTabRef = useRef(onUpdateTab)
  onUpdateTabRef.current = onUpdateTab
  const onOpenNewTabRef = useRef(onOpenNewTab)
  onOpenNewTabRef.current = onOpenNewTab
  const onGuestCloseRef = useRef(onGuestClose)
  onGuestCloseRef.current = onGuestClose

  // If the tab is sleeping, keep initialUrlRef updated so waking up loads the current URL
  useEffect(() => {
    if (tab.isSleeping) {
      initialUrlRef.current = tab.url
    }
  }, [tab.isSleeping, tab.url])

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
          lastNavigatedFromWebviewUrlRef.current = tab.url
          return
        }

        // 4. SPA Route & In-Page Navigation Protection:
        // When scrolling down on YouTube Shorts, Instagram Reels, TikTok, Twitter, Reddit, etc.,
        // the page updates the URL in-page via history.replaceState/pushState.
        // NEVER force loadURL to refresh the page on scroll!
        try {
          const liveUrlObj = new URL(live)
          const targetUrlObj = new URL(tab.url)
          if (liveUrlObj.origin === targetUrlObj.origin) {
            if (
              liveUrlObj.pathname === targetUrlObj.pathname ||
              (targetUrlObj.pathname === '/' && liveUrlObj.pathname.length > 1) ||
              (liveUrlObj.pathname.startsWith('/shorts') && targetUrlObj.pathname.startsWith('/shorts')) ||
              (liveUrlObj.pathname.startsWith('/reel') && targetUrlObj.pathname.startsWith('/reel')) ||
              (liveUrlObj.pathname.startsWith('/watch') && targetUrlObj.pathname.startsWith('/watch'))
            ) {
              currentNavUrlRef.current = live
              lastNavigatedFromWebviewUrlRef.current = live
              return
            }
          }
        } catch {}
      }

      currentNavUrlRef.current = tab.url
      lastNavigatedFromWebviewUrlRef.current = tab.url
      if (typeof el.loadURL === 'function') {
        loadUrlWithRetry(el, tab.url)
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
      setLoadError(null)
      setCrashed(null)
      useBrowserStore.getState().setTabLoading(tab.id, true)
    }

    const handleProcessGone = (e: any) => {
      const reason = e?.details?.reason ?? e?.reason
      if (reason === 'clean-exit') return
      setIsLoading(false)
      setCrashed(reason === 'oom' ? 'memory' : 'crash')
    }

    const offUnsafe = api.essentials?.safeBrowsing.onBlocked((info) => {
      try {
        if (info.webContentsId === el.getWebContentsId()) setDanger(info)
      } catch {}
    })

    const handleStopLoading = () => {
      setIsLoading(false)
      useBrowserStore.getState().setTabLoading(tab.id, false)
    }

    const handleEnterFullscreen = () => useBrowserStore.getState().setHtmlFullscreen(tab.id)
    const handleLeaveFullscreen = () => {
      if (useBrowserStore.getState().htmlFullscreenTabId === tab.id) useBrowserStore.getState().setHtmlFullscreen(null)
    }

    const handleTargetUrl = (e: any) => setHoverUrl(typeof e?.url === 'string' ? e.url.slice(0, 500) : '')

    // window.close(): the page is gone, so is its tab
    const handleGuestClose = () => {
      let url = ''
      try {
        url = el.getURL()
      } catch {}
      onGuestCloseRef.current(tab.id, !url || url === 'about:blank')
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
      // This was Chromium's blank error page, not the site
      if (failedUrlRef.current) return
      setLoadError(null)
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
          if (!tab.isPrivate && api.history?.recordVisit) {
            api.history.recordVisit({
              url: currentUrl,
              title: currentTitle,
              favicon,
              spaceId
            }).catch(() => {})
          }

          if (!tab.isPrivate) {
            // Search pages you've read, Meeting mode link catcher, "Continue reading"
            indexPageText(el, currentUrl, currentTitle, favicon, spaceId)
            useMeetingStore.getState().captureLink(currentUrl, currentTitle, tab.id)
            setResumeAt(getReadingPosition(currentUrl))
          }
        }
      } catch (e) {
        console.error('Error on did-finish-load:', e)
      }
    }

    const handleFaviconUpdated = (e: any) => {
      // The page picks these addresses: never let the UI load file: or network-share icons
      const favicon = (Array.isArray(e.favicons) ? e.favicons : []).map(safeImageUrl).find(Boolean)
      if (favicon) onUpdateTabRef.current(tab.id, { favicon })
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
        failedUrlRef.current = e.validatedURL || currentNavUrlRef.current
        setLoadError(describeLoadError(e.errorCode, e.errorDescription || '', failedUrlRef.current || ''))
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
        // Full navigations are recorded in did-finish-load (with the real page title);
        // only record SPA in-page navigations here to avoid double IPC + double visit counts.
        if (e?.type === 'did-navigate-in-page' && !tab.isPrivate && api.history?.recordVisit) {
          api.history.recordVisit({
            url: navUrl,
            title: navTitle || tab.title,
            favicon: tab.favicon,
            spaceId
          }).catch(() => {})
        }
      }
    }

    // Per-space focus rules: stop blocked sites before they load
    const handleStartNavigation = (e: any) => {
      if (!e || e.isMainFrame === false || e.isInPlace) return
      failedUrlRef.current = null
      setHoverUrl('')
      const domain = focusBlockFor(tabRef.current.spaceId, e.url)
      if (domain) {
        try {
          el.stop()
        } catch {}
        setBlocked({ domain, url: e.url })
        setIsLoading(false)
        return
      }
      setBlocked(null)
      setDanger(null)
      setResumeAt(null)
      useSmartStore.getState().setProgress(tab.id, null)
    }

    // Reading progress reported by PROGRESS_SCRIPT (console.debug from the page)
    const handleConsoleMessage = (e: any) => {
      const msg: unknown = e?.message
      if (typeof msg !== 'string' || !msg.startsWith(PROGRESS_MSG)) return
      const ratio = Number(msg.slice(PROGRESS_MSG.length))
      if (!Number.isFinite(ratio)) return
      useSmartStore.getState().setProgress(tab.id, ratio < 0 ? null : ratio)
      if (ratio < 0) return
      window.dispatchEvent(new CustomEvent('tct:page-scrolled', { detail: { tabId: tab.id, ratio } }))
      const pending = resumeAtRef.current
      if (pending !== null) {
        // Reached the saved spot on their own: drop the offer
        if (ratio >= pending - 0.02) setResumeAt(null)
        return
      }
      if (!tab.isPrivate && ratio >= 0.05) {
        try {
          saveReadingPosition(el.getURL(), ratio)
        } catch {}
      }
    }

    // Pages without a background of their own are drawn on white, like in any browser
    const updateBase = () => {
      el.executeJavaScript(PAGE_BASE_SCRIPT)
        .then((kind: unknown) => {
          el.style.backgroundColor = kind === 'light' && !failedUrlRef.current ? '#ffffff' : ''
        })
        .catch(() => {})
    }

    const handleDomReady = () => {
      syncTheme()
      updateBase()
      try {
        el.executeJavaScript(PROGRESS_SCRIPT).catch(() => {})
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
        // Scrollbar / overscroll CSS is injected once by the main process (electron/main.ts)
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
    el.addEventListener('did-start-navigation', handleStartNavigation)
    el.addEventListener('console-message', handleConsoleMessage)
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
    el.addEventListener('render-process-gone', handleProcessGone)
    el.addEventListener('enter-html-full-screen', handleEnterFullscreen)
    el.addEventListener('leave-html-full-screen', handleLeaveFullscreen)
    el.addEventListener('update-target-url', handleTargetUrl)
    el.addEventListener('close', handleGuestClose)

    return () => {
      unregisterWebviewRef(tab.id)
      useSmartStore.getState().setProgress(tab.id, null)
      el.removeEventListener('did-start-navigation', handleStartNavigation)
      el.removeEventListener('console-message', handleConsoleMessage)
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
      el.removeEventListener('render-process-gone', handleProcessGone)
      el.removeEventListener('enter-html-full-screen', handleEnterFullscreen)
      el.removeEventListener('leave-html-full-screen', handleLeaveFullscreen)
      el.removeEventListener('update-target-url', handleTargetUrl)
      el.removeEventListener('close', handleGuestClose)
      handleLeaveFullscreen()
      useBrowserStore.getState().setTabLoading(tab.id, false)
      offUnsafe?.()
    }
    // A tab that slept gets a new page view: everything above must move to it
  }, [tab.id, hasPageView, registerWebviewRef, unregisterWebviewRef])

  // Wake up sleeping tab when it becomes active
  useEffect(() => {
    if (isActive && tab.isSleeping) {
      useBrowserStore.getState().setTabSleeping(tab.id, false)
    }
  }, [isActive, tab.isSleeping, tab.id])

  // "Continue reading" offer disappears on its own after a while
  useEffect(() => {
    if (resumeAt === null) return
    const t = setTimeout(() => setResumeAt(null), 12000)
    return () => clearTimeout(t)
  }, [resumeAt])

  const handleResume = () => {
    const el = webviewRef.current
    const at = resumeAt
    setResumeAt(null)
    if (el && at !== null) el.executeJavaScript(scrollToRatioScript(at, true)).catch(() => {})
  }

  const handleAllowBlocked = (minutes: number) => {
    if (!blocked) return
    useSmartStore.getState().allowTemporarily(blocked.domain, minutes)
    const url = blocked.url
    setBlocked(null)
    loadUrlWithRetry(webviewRef.current, url)
  }

  const handleLeaveBlocked = () => {
    const el = webviewRef.current
    setBlocked(null)
    try {
      if (el && el.canGoBack()) {
        el.goBack()
        return
      }
    } catch {}
    // Nothing to go back to (the tab was opened on the blocked site): close it
    useBrowserStore.getState().removeTabFromStore(tab.id)
    api.tabs.remove(tab.id).catch(() => {})
  }

  const handleLeaveDanger = () => {
    const el = webviewRef.current
    setDanger(null)
    setLoadError(null)
    failedUrlRef.current = null
    try {
      // The blocked page was never shown: the previous page is still there
      const live = el?.getURL()
      if (live && live !== 'about:blank' && live !== danger?.url) return
      if (el?.canGoBack()) return el.goBack()
    } catch {}
    useBrowserStore.getState().removeTabFromStore(tab.id)
    api.tabs.remove(tab.id).catch(() => {})
  }

  const handleOpenDanger = async () => {
    if (!danger) return
    await api.essentials.safeBrowsing.allow(danger.host)
    const url = danger.url
    setDanger(null)
    setLoadError(null)
    loadUrlWithRetry(webviewRef.current, url)
  }

  const handleRetry = () => {
    const failed = failedUrlRef.current
    setCrashed(null)
    setLoadError(null)
    if (failed) loadUrlWithRetry(webviewRef.current, failed)
    else webviewRef.current?.reload()
  }
  const handleRetryRef = useRef(handleRetry)
  handleRetryRef.current = handleRetry

  // Back online: load the page that could not be reached
  useEffect(() => {
    if (!hasError || !isActive) return
    const retry = () => handleRetryRef.current()
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [hasError, isActive])

  // Another tab was selected: full screen ends
  useEffect(() => {
    if (isFullscreen && !isActive) webviewRef.current?.executeJavaScript('document.exitFullscreen && document.exitFullscreen()').catch(() => {})
  }, [isFullscreen, isActive])

  // Stop button
  useEffect(() => {
    if (!isActive) return
    const stop = () => {
      try {
        webviewRef.current?.stop()
      } catch {}
    }
    window.addEventListener('tct:webview-stop', stop)
    return () => window.removeEventListener('tct:webview-stop', stop)
  }, [isActive])

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
        ...paneStyle,
        // Full-screen video: over the other split pane too
        ...(isFullscreen ? { left: 0, right: 0, top: 0, bottom: 0, width: '100%', zIndex: 50, border: 'none' } : {})
      }}
      onMouseDown={() => {
        if (onFocusPane) onFocusPane()
        window.dispatchEvent(new CustomEvent('tct:close-omnibox'))
      }}
    >
      {/* Split Pane Header Indicator */}
      {splitRole && !isFullscreen && (
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
      {hasPageView && (
        <webview
          ref={webviewRef}
          src={initialUrlRef.current}
          partition={partitionRef.current}
          // flex-1 + min-h-0/min-w-0: let the webview SHRINK with the window. Without min-h-0 a flex
          // item keeps its previous (larger) size, so the page thinks it fits and won't scroll,
          // while the bottom is clipped. (h-full also overflowed by the split-pane header height.)
          className="w-full flex-1 min-h-0 min-w-0 bg-background border-none outline-none flex"
          {...({ allowpopups: 'true' } as any)}
          webpreferences="contextIsolation=yes, javascript=yes, sandbox=yes, backgroundThrottling=yes"
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

      {/* Focus rule for this space blocked the site */}
      {blocked && (
        <div className="absolute inset-0 bg-background flex flex-col items-center justify-center p-6 text-center z-20 select-none">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4 ring-1 ring-amber-500/20">
            <ShieldBan className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">Back to work?</h3>
          <p className="text-xs text-muted-foreground max-w-sm mb-4">
            <span className="font-semibold text-foreground">{blocked.domain}</span> is on this space&apos;s focus list. You can change
            that in Tools &rsaquo; Smart Tools &rsaquo; Focus rules.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLeaveBlocked}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition-colors shadow-sm cursor-pointer"
            >
              Take me back
            </button>
            <button
              onClick={() => handleAllowBlocked(10)}
              className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors border border-border cursor-pointer"
            >
              Allow for 10 minutes
            </button>
          </div>
        </div>
      )}

      {/* Continue where you left off */}
      {resumeAt !== null && isActive && !blocked && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-popover/95 backdrop-blur border border-border shadow-xl text-xs animate-in fade-in slide-in-from-bottom-2 duration-200 select-none">
          <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
          <button onClick={handleResume} className="px-2 py-1 font-semibold text-foreground hover:text-primary cursor-pointer">
            Continue reading at {Math.round(resumeAt * 100)}%
          </button>
          <button
            onClick={() => setResumeAt(null)}
            className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
            aria-label="Dismiss"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Loading bar */}
      {isLoading && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary/20 overflow-hidden z-20">
          <div className="h-full bg-primary animate-pulse w-2/3" />
        </div>
      )}

      {/* Address of the link under the pointer */}
      {hoverUrl && isActive && (
        <div className="pointer-events-none absolute bottom-0 left-0 z-20 max-w-[60%] truncate rounded-tr-lg border-t border-r border-border bg-popover px-2.5 py-1 text-[11.5px] text-popover-foreground shadow-md">
          {hoverUrl}
        </div>
      )}

      {/* Known phishing / malware site */}
      {danger && (
        <div role="alertdialog" aria-label={t('Dangerous site')} className="absolute inset-0 bg-background flex flex-col items-center justify-center p-6 text-center z-20">
          <div className="w-14 h-14 rounded-2xl bg-destructive text-destructive-foreground flex items-center justify-center mb-4">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">{t('Dangerous site')}</h3>
          <p className="text-xs font-mono text-muted-foreground mb-3 break-all max-w-md">{danger.host}</p>
          <p className="text-xs text-muted-foreground max-w-sm mb-5">
            {danger.kind === 'phishing'
              ? t('This site is on a list of phishing sites. It may try to steal your passwords or card details.')
              : t('This site is on a list of sites that spread malware. It may try to harm your computer.')}
          </p>
          <div className="flex items-center gap-2">
            <button autoFocus onClick={handleLeaveDanger} className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold">
              {t('Back to safety')}
            </button>
            <button onClick={() => void handleOpenDanger()} className="px-4 py-2 rounded-xl text-muted-foreground hover:bg-muted text-xs">
              {t('Open anyway')}
            </button>
          </div>
        </div>
      )}

      {/* The page's process crashed */}
      {crashed && !danger && (
        <div role="alert" className="absolute inset-0 bg-background flex flex-col items-center justify-center p-6 text-center z-[15]">
          <div className="w-12 h-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center mb-4">
            <Frown className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">{t('This tab crashed')}</h3>
          <p className="text-xs text-muted-foreground max-w-sm mb-4">
            {crashed === 'memory'
              ? t('This page used too much memory and was stopped. Reload it to continue.')
              : t('Something went wrong while showing this page. Reload it to continue.')}
          </p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" /> {t('Reload')}
          </button>
        </div>
      )}

      {/* Error overlay on did-fail-load */}
      {hasError && !danger && (
        <div className="absolute inset-0 bg-background flex flex-col items-center justify-center p-6 text-center z-10">
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">
            {loadError ? loadError.title : t('Unable to reach webpage')}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mb-4">
            {loadError?.text}
            <span className="block mt-2 font-mono text-[10.5px] opacity-60">{loadError?.code}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRetry}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium flex items-center gap-2 transition-colors shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t('Retry')}</span>
            </button>
            <button
              onClick={() => void openNewTab()}
              className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-medium flex items-center gap-2 transition-colors border border-border"
            >
              <span>{t('Go to Home')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
})

interface WebViewContainerProps {
  spaceId: string | null
}

export const WebViewContainer: React.FC<WebViewContainerProps> = ({ spaceId }) => {
  const { tabs, activeTab, activeTabId, updateTab, createTab, setActiveTab } = useTabs(spaceId)
  const { settings } = useSettings()
  // Isolated space = separate profile: its own cookies, logins and storage
  const spaceIsolated = useBrowserStore((s) => !!s.spaces.find((sp) => sp.id === spaceId)?.isolated)
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
  const currentRatioRef = useRef(splitRatio)
  const rafIdRef = useRef<number | null>(null)
  const activeTabRef = useRef(activeTab)
  activeTabRef.current = activeTab
  const [matchesCount, setMatchesCount] = useState<{ activeMatchOrdinal: number; matches: number }>({
    activeMatchOrdinal: 0,
    matches: 0
  })

  // Synchronize CSS variable when splitRatio changes from outside (e.g. presets 50/50, 70/30)
  useEffect(() => {
    currentRatioRef.current = splitRatio
    if (containerRef.current) {
      containerRef.current.style.setProperty('--split-ratio', `${splitRatio}`)
    }
  }, [splitRatio])

  // Split view dragging handler (60fps hardware-accelerated with requestAnimationFrame)
  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingSplit(true)
    currentRatioRef.current = splitRatio
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    if (!isDraggingSplit) return

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      if (rect.width <= 0) return
      const rawRatio = (e.clientX - rect.left) / rect.width
      const clamped = Math.min(0.85, Math.max(0.15, rawRatio))
      currentRatioRef.current = clamped

      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.style.setProperty('--split-ratio', `${clamped}`)
        }
      })
    }

    const handleMouseUp = () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      setIsDraggingSplit(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setSplitRatio(currentRatioRef.current)
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
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
            // Returned by the page's own world: force plain strings (objects would crash React)
            title: String(res.title ?? '').slice(0, 1000),
            byline: String(res.byline ?? '').slice(0, 500),
            contentHtml: String(res.contentHtml),
            readingTime: String(res.readingTime ?? '').slice(0, 50)
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
          toast.info(String(res?.reason || 'No video found on this page.').slice(0, 300))
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

  // Counts page views as they mount: a tab can get its page view long after it became active
  // (opened from the Start page, woken from sleep), and Back / Forward must follow the new one
  const [webviewMounts, setWebviewMounts] = useState(0)
  const registerWebviewRef = useCallback((tabId: string, el: any) => {
    setWebviewMounts((n) => n + 1)
    webviewsRef.current.set(tabId, el)
    webviewRegistry.set(tabId, el)
  }, [])

  // Tabs opened from the Start page: Back leads there again
  const fromStartRef = useRef(new Map<string, string>())
  const lastUrlsRef = useRef(new Map<string, string>())
  for (const t of tabs) {
    const before = lastUrlsRef.current.get(t.id)
    if (before !== t.url) {
      if (isStartPageUrl(before) && /^https?:/i.test(t.url)) fromStartRef.current.set(t.id, before!)
      else if (isStartPageUrl(t.url)) fromStartRef.current.delete(t.id)
      lastUrlsRef.current.set(t.id, t.url)
    }
  }

  // A page closed itself. A tab that only started a download (nothing was ever shown) goes back to
  // its Start page if it came from there, and the last tab always stays.
  const handleGuestClose = useCallback((tabId: string, wasBlank: boolean) => {
    const store = useBrowserStore.getState()
    const siblings = Object.values(store.tabsBySpace).find((list) => list.some((t) => t.id === tabId))
    const tab = siblings?.find((t) => t.id === tabId)
    const start = fromStartRef.current.get(tabId)
    if (wasBlank && tab && (start || siblings!.length === 1)) {
      const url = start || (tab.isPrivate ? PRIVATE_START_URL : START_PAGE_URL)
      void updateTab(tabId, { url, title: url === PRIVATE_START_URL ? PRIVATE_START_TITLE : START_PAGE_TITLE, favicon: null })
      return
    }
    store.removeTabFromStore(tabId)
    api.tabs.remove(tabId).catch(() => {})
  }, [updateTab])

  const unregisterWebviewRef = useCallback((tabId: string) => {
    setWebviewMounts((n) => n + 1)
    webviewRegistry.delete(tabId, webviewsRef.current.get(tabId))
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

    const prevNavRef = { canBack: false, canFwd: false }
    const updateNavState = () => {
      try {
        const canBack = (typeof activeEl.canGoBack === 'function' ? activeEl.canGoBack() : false) || fromStartRef.current.has(activeTabId!)
        const canFwd = typeof activeEl.canGoForward === 'function' ? activeEl.canGoForward() : false
        if (canBack !== prevNavRef.canBack || canFwd !== prevNavRef.canFwd) {
          prevNavRef.canBack = canBack
          prevNavRef.canFwd = canFwd
          setCanGoBack(canBack)
          setCanGoForward(canFwd)
          useBrowserStore.getState().setNavState(canBack, canFwd)
        }

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
    activeEl.addEventListener('did-navigate', updateNavState)
    activeEl.addEventListener('did-navigate-in-page', updateNavState)
    activeEl.addEventListener('did-stop-loading', updateNavState)

    const interval = setInterval(updateNavState, 1000)
    return () => {
      clearInterval(interval)
      try {
        activeEl.removeEventListener('did-navigate', updateNavState)
        activeEl.removeEventListener('did-navigate-in-page', updateNavState)
        activeEl.removeEventListener('did-stop-loading', updateNavState)
      } catch {}
    }
  }, [activeTabId, updateTab, webviewMounts])

  const handleBack = useCallback(() => {
    const el = activeTabId ? webviewsRef.current.get(activeTabId) : null
    if (el && typeof el.goBack === 'function' && el.canGoBack()) {
      el.goBack()
      return
    }
    const start = activeTabId ? fromStartRef.current.get(activeTabId) : undefined
    if (activeTabId && start) {
      const title = start === PRIVATE_START_URL ? PRIVATE_START_TITLE : START_PAGE_TITLE
      void updateTab(activeTabId, { url: start || START_PAGE_URL, title, favicon: null })
    }
  }, [activeTabId, updateTab])

  const handleForward = useCallback(() => {
    const el = activeTabId ? webviewsRef.current.get(activeTabId) : null
    if (el && typeof el.goForward === 'function' && el.canGoForward()) {
      el.goForward()
    }
  }, [activeTabId])

  const reloadTab = useCallback((tabId: string | null | undefined, hard = false) => {
    if (!tabId) return
    const store = useBrowserStore.getState()
    const target = Object.values(store.tabsBySpace).flat().find((t) => t.id === tabId)
    const el = webviewsRef.current.get(tabId)
    if (!el) {
      if (target?.isSleeping) store.setTabSleeping(tabId, false)
      return
    }
    try {
      const live = el.getURL()
      // Stopped before anything was shown: there is nothing to reload yet
      if ((!live || live === 'about:blank') && target && /^https?:/i.test(target.url)) {
        loadUrlWithRetry(el, target.url)
        return
      }
      void api.webview.call(el.getWebContentsId(), hard ? 'reloadIgnoringCache' : 'reload')
    } catch {
      // The page view is not ready yet: it is loading anyway
    }
  }, [])

  const handleReload = useCallback((tabId?: string) => reloadTab(tabId ?? activeTabId), [activeTabId, reloadTab])
  const handleHardReload = useCallback(() => reloadTab(activeTabId, true), [activeTabId, reloadTab])

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
      // Throws if the webview hasn't attached / fired dom-ready yet (e.g. a brand-new tab)
      try {
        el.findInPage(text, options)
      } catch {}
    }
  }, [activeTabId])

  const handleStopFind = useCallback((action: any) => {
    const el = activeTabId ? webviewsRef.current.get(activeTabId) : null
    if (el && typeof el.stopFindInPage === 'function') {
      try {
        el.stopFindInPage(action)
      } catch {}
    }
    setMatchesCount({ activeMatchOrdinal: 0, matches: 0 })
  }, [activeTabId])

  const handleSavePdf = useCallback(async () => {
    const el = activeTabId ? webviewsRef.current.get(activeTabId) : null
    if (el && typeof el.getWebContentsId === 'function') {
      try {
        const wcId = el.getWebContentsId()
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
    const onReload = (e: Event) => handleReload((e as CustomEvent).detail?.tabId)
    const onHardReload = () => handleHardReload()
    const onPrint = () => handlePrint()
    const onSavePdf = () => handleSavePdf()

    const onNavigate = (e: any) => {
      const { tabId, url } = e.detail || {}
      const targetId = tabId || activeTabId
      const targetEl = targetId ? webviewsRef.current.get(targetId) : null
      if (targetEl && url && typeof targetEl.loadURL === 'function') {
        loadUrlWithRetry(targetEl, url)
      }
    }

    const onToggleFind = () => {
      const store = useBrowserStore.getState()
      // Already open: just put the cursor there
      if (store.findBarOpen) window.dispatchEvent(new CustomEvent('tct:focus-find'))
      else store.setFindBarOpen(true)
    }

    const onFoundInPage = (e: any) => {
      const { tabId, activeMatchOrdinal, matches } = e.detail || {}
      if (tabId === activeTabId) {
        setMatchesCount({ activeMatchOrdinal, matches })
      }
    }

    // Extension toolbar click (no popup): run it against the active tab's page
    const onExtensionAction = (e: any) => {
      const { id, name } = e.detail || {}
      const targetId = useBrowserStore.getState().activeTabId
      const el = targetId ? webviewsRef.current.get(targetId) : null
      if (!id || !el || typeof el.getWebContentsId !== 'function') return
      let wcId: number
      try {
        wcId = el.getWebContentsId()
      } catch {
        return
      }
      void api.extensions?.click(id, wcId).then((res) => {
        if (!res.ok) toast.error(`${name || 'Extension'} could not run on this page`, { description: res.error })
      })
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
    window.addEventListener('tct:webview-print', onPrint)
    window.addEventListener('tct:webview-save-pdf', onSavePdf)
    window.addEventListener('tct:webview-navigate', onNavigate)
    window.addEventListener('tct:toggle-find', onToggleFind)
    window.addEventListener('tct:found-in-page', onFoundInPage)
    window.addEventListener('tct:toggle-mute-tab', onToggleMuteTab)
    window.addEventListener('tct:extension-action', onExtensionAction)

    return () => {
      window.removeEventListener('tct:extension-action', onExtensionAction)
      window.removeEventListener('tct:webview-back', onBack)
      window.removeEventListener('tct:webview-forward', onForward)
      window.removeEventListener('tct:webview-reload', onReload)
      window.removeEventListener('tct:webview-hard-reload', onHardReload)
      window.removeEventListener('tct:webview-print', onPrint)
      window.removeEventListener('tct:webview-save-pdf', onSavePdf)
      window.removeEventListener('tct:webview-navigate', onNavigate)
      window.removeEventListener('tct:toggle-find', onToggleFind)
      window.removeEventListener('tct:found-in-page', onFoundInPage)
      window.removeEventListener('tct:toggle-mute-tab', onToggleMuteTab)
    }
  }, [handleBack, handleForward, handleReload, handleHardReload, handlePrint, handleSavePdf])

  // "Last used" bookkeeping: lastVisited is stamped when a tab becomes active AND when it is left,
  // otherwise Memory Saver would put a tab to sleep based on when it was created.
  useEffect(() => {
    if (!activeTabId) return
    const store = useBrowserStore.getState()
    store.updateTabInStore(activeTabId, { lastVisited: new Date().toISOString() })
    const leftId = activeTabId
    return () => {
      useBrowserStore.getState().updateTabInStore(leftId, { lastVisited: new Date().toISOString() })
    }
  }, [activeTabId])

  // Hover-preview thumbnails: capture the visible tab shortly after it shows and then periodically
  useEffect(() => {
    if (!activeTabId) return
    const capture = () => {
      const el = webviewsRef.current.get(activeTabId)
      if (!el || typeof el.getWebContentsId !== 'function' || !api.thumbnails?.capture) return
      let id: number
      try {
        id = el.getWebContentsId()
      } catch {
        return
      }
      api.thumbnails
        .capture(id)
        .then((dataUrl) => {
          if (dataUrl) useThumbnailStore.getState().setThumb(activeTabId, dataUrl)
        })
        .catch(() => {})
    }
    const first = setTimeout(capture, 1500)
    // Thumbnails are data URLs held in memory: refresh rarely, and never while the window is hidden
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') capture()
    }, 60000)
    return () => {
      clearTimeout(first)
      clearInterval(interval)
    }
  }, [activeTabId])

  // Drag a tab from the sidebar onto the page area to open it in split view
  const [tabDragActive, setTabDragActive] = useState(false)
  const [dropHover, setDropHover] = useState(false)
  useEffect(() => {
    const onStart = () => setTabDragActive(true)
    const onEnd = () => {
      setTabDragActive(false)
      setDropHover(false)
    }
    window.addEventListener('tct:tab-drag-start', onStart)
    window.addEventListener('tct:tab-drag-end', onEnd)
    return () => {
      window.removeEventListener('tct:tab-drag-start', onStart)
      window.removeEventListener('tct:tab-drag-end', onEnd)
    }
  }, [])

  const handleSplitDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const tabId = e.dataTransfer.getData('application/x-tct-tab-id')
    setTabDragActive(false)
    setDropHover(false)
    const store = useBrowserStore.getState()
    if (!tabId) return
    if (tabId === store.activeTabId) {
      toast.info('Drop a different tab to view it side by side')
      return
    }
    store.setSplitTabId(tabId)
    store.setSplitActivePane('secondary')
    toast.success('Opened in split view')
  }

  // Memory Saver: hibernate idle background tabs, and on low/medium RAM devices also cap how many
  // background tabs stay awake (least-recently-used go to sleep first). A sleeping tab's webview is
  // unmounted, which frees its whole renderer process.
  useEffect(() => {
    const memorySaverEnabled = settings?.memorySaverEnabled ?? true
    if (!memorySaverEnabled || !spaceId) return

    const deviceGb = (navigator as any).deviceMemory as number | undefined
    const maxAwakeBackground = !deviceGb ? 8 : deviceGb <= 2 ? 2 : deviceGb <= 4 ? 4 : deviceGb < 8 ? 6 : 10
    const lowRam = !!deviceGb && deviceGb <= 4

    const check = () => {
      const store = useBrowserStore.getState()
      const currentTabs = store.tabsBySpace[spaceId] || []
      let timeoutMs = (settings?.sleepTimeoutMinutes || 30) * 60 * 1000
      if (lowRam) timeoutMs = Math.min(timeoutMs, 10 * 60 * 1000)
      const now = Date.now()

      const candidates = currentTabs
        .filter(
          (t) =>
            t.id !== store.activeTabId &&
            t.id !== store.splitTabId &&
            !t.isPinned &&
            !t.isAudible &&
            !t.isSleeping
        )
        .map((t) => ({ t, last: new Date(t.lastVisited || t.createdAt).getTime() || 0 }))
        .sort((a, b) => b.last - a.last)

      candidates.forEach(({ t, last }, i) => {
        if (now - last > timeoutMs || i >= maxAwakeBackground) store.setTabSleeping(t.id, true)
      })
    }

    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [spaceId, settings?.memorySaverEnabled, settings?.sleepTimeoutMinutes, activeTabId])

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
          order: insertOrder,
          isPrivate: !!currentActive?.isPrivate,
          groupId: groupForNewTab(currentActive, store.groupsBySpace[targetSpace] || [])
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

    const handleSwapSplit = useCallback(() => {
      useBrowserStore.getState().swapSplit()
    }, [])

    const handleFocusPrimary = useCallback(() => {
      useBrowserStore.getState().setSplitActivePane('primary')
    }, [])

    const handleFocusSecondary = useCallback(() => {
      useBrowserStore.getState().setSplitActivePane('secondary')
    }, [])

    return (
      <div
        ref={containerRef}
        style={{ '--split-ratio': `${splitRatio}` } as React.CSSProperties}
        className={`flex-1 min-w-0 min-h-0 relative w-full h-full overflow-hidden bg-background ${
          isDraggingSplit ? 'is-split-resizing select-none' : ''
        }`}
      >
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
              onClick={() => void openNewTab()}
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
                  width: 'calc(var(--split-ratio, 0.5) * 100% - 3px)',
                  borderRight: '1px solid var(--border)'
                }
              } else if (isSecondary) {
                splitRole = 'secondary'
                paneStyle = {
                  left: 'calc(var(--split-ratio, 0.5) * 100% + 3px)',
                  top: 0,
                  bottom: 0,
                  width: 'calc((1 - var(--split-ratio, 0.5)) * 100% - 3px)'
                }
              }
            }

            // Start page is rendered by the UI itself, never inside a webview
            if (isPrivateStartUrl(tab.url)) {
              return (
                <PrivateStartPage
                  key={`${tab.id}:private-start`}
                  tab={tab}
                  isActive={isPaneActive}
                  paneStyle={paneStyle}
                  onFocusPane={splitRole === 'secondary' ? handleFocusSecondary : handleFocusPrimary}
                />
              )
            }
            if (isStartPageUrl(tab.url)) {
              return (
                <StartPage
                  key={`${tab.id}:start`}
                  tab={tab}
                  isActive={isPaneActive}
                  paneStyle={paneStyle}
                  onFocusPane={splitRole === 'secondary' ? handleFocusSecondary : handleFocusPrimary}
                />
              )
            }

            const partition = tab.isPrivate
              ? 'private-tabs'
              : spaceIsolated
              ? `persist:space-${tab.spaceId}`
              : 'persist:browser-tabs'

            return (
              <SingleWebView
                key={`${tab.id}:${partition}`}
                tab={tab}
                partition={partition}
                isActive={isPaneActive}
                isDark={isDark}
                defaultZoom={settings?.defaultZoom || 100}
                spaceId={spaceId || tab.spaceId}
                paneStyle={paneStyle}
                splitRole={splitRole}
                onUpdateTab={updateTab}
                onOpenNewTab={handleNewTabFromUrl}
                onGuestClose={handleGuestClose}
                registerWebviewRef={registerWebviewRef}
                unregisterWebviewRef={unregisterWebviewRef}
                onCloseSplit={closeSplitView}
                onSwapSplit={handleSwapSplit}
                onFocusPane={splitRole === 'secondary' ? handleFocusSecondary : handleFocusPrimary}
              />
            )
          })
        )}

        {/* Resizable Draggable Splitter Bar */}
        {isSplitActive && (
          <div
            onMouseDown={handleSplitterMouseDown}
            onDoubleClick={() => {
              setSplitRatio(0.5)
              if (containerRef.current) {
                containerRef.current.style.setProperty('--split-ratio', '0.5')
              }
            }}
            style={{
              left: 'calc(var(--split-ratio, 0.5) * 100% - 4px)',
              width: '8px'
            }}
            className={`absolute top-0 bottom-0 z-30 cursor-col-resize select-none flex items-center justify-center transition-colors group ${
              isDraggingSplit ? 'bg-primary/20' : 'hover:bg-primary/20'
            }`}
            title="Drag to resize, double-click to reset (50/50)"
          >
            <div
              className={`w-[3px] h-10 rounded-full transition-all duration-150 ${
                isDraggingSplit
                  ? 'bg-primary h-14 shadow-[0_0_8px_rgba(99,102,241,0.6)]'
                  : 'bg-border/80 group-hover:bg-primary group-hover:h-12'
              }`}
            />
          </div>
        )}

        {/* Split view: sync scroll + compare the two pages */}
        {isSplitActive && <CompareToolbar hidden={isDraggingSplit} />}

        {/* Overlay while dragging splitter to keep mouse tracking over webviews */}
        {isDraggingSplit && (
          <div className="fixed inset-0 z-50 cursor-col-resize select-none bg-transparent" />
        )}

        {/* Drop zone while a sidebar tab is being dragged (webviews swallow drag events, so
            this overlay covers them for the duration of the drag) */}
        {tabDragActive && (
          <div
            className="absolute inset-0 z-40 flex"
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
            }}
          >
            <div className="flex-1" />
            <div
              onDragEnter={() => setDropHover(true)}
              onDragLeave={() => setDropHover(false)}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }}
              onDrop={handleSplitDrop}
              className={`w-1/2 m-3 rounded-2xl border-2 border-dashed flex items-center justify-center text-sm font-semibold transition-colors ${
                dropHover ? 'border-primary bg-primary/15 text-primary' : 'border-primary/40 bg-background/60 text-muted-foreground'
              }`}
            >
              Drop to open in split view
            </div>
          </div>
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
