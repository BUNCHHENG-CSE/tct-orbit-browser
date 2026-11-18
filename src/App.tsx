import React, { useEffect } from 'react'
import { TitleBar } from '@/components/TitleBar/TitleBar'
import { Sidebar } from '@/components/Sidebar/Sidebar'
import { WebViewContainer } from '@/components/WebView/WebViewContainer'
import { CommandBar } from '@/components/CommandBar/CommandBar'
import { DockedDevToolsPane } from '@/components/DevTools/DockedDevToolsPane'
import { BrowserContextMenu, QrCodeModal } from '@/components/ContextMenu/BrowserContextMenu'
import { SmoothScroll } from '@/components/SmoothScroll'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import { useSpaces } from '@/hooks/useSpaces'
import { useTabs } from '@/hooks/useTabs'
import { useSettings } from '@/hooks/useSettings'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useThemeStore } from '@/store/useThemeStore'
import { api } from '@/lib/ipc'

export const App: React.FC = () => {
  const { spaces, activeSpace, activeSpaceId } = useSpaces()
  const { tabs, activeTab, activeTabId, createTab, removeTab, setActiveTab, reopenLastClosedTab } = useTabs(activeSpaceId)
  const { settings, setSidebarCollapsed } = useSettings()
  const setCommandBarOpen = useBrowserStore((s) => s.setCommandBarOpen)
  const setDevToolsOpen = useBrowserStore((s) => s.setDevToolsOpen)
  const devtoolsOpen = useBrowserStore((s) => s.devtoolsOpen)
  const appInfo = useBrowserStore((s) => s.appInfo)
  const setAppInfo = useBrowserStore((s) => s.setAppInfo)

  // Initialize dynamic app channel and version metadata
  useEffect(() => {
    if (api.app?.getInfo) {
      api.app.getInfo().then((info) => {
        if (info) setAppInfo(info)
      }).catch(() => {})
    }
  }, [setAppInfo])

  // External & Link URL listener (target="_blank", window.open, CLI launch arguments, macOS open-url)
  const lastExternalUrlRef = React.useRef<{ url: string; time: number }>({ url: '', time: 0 })

  useEffect(() => {
    if (!api.onOpenUrl) return

    const unsub = api.onOpenUrl(async (payload) => {
      const url = typeof payload === 'string' ? payload : payload.url
      const isActive = typeof payload === 'object' && payload.active !== undefined ? payload.active : true

      if (!url || url === 'about:blank') return

      const now = Date.now()
      if (lastExternalUrlRef.current.url === url && now - lastExternalUrlRef.current.time < 500) {
        return
      }
      lastExternalUrlRef.current = { url, time: now }

      try {
        const store = useBrowserStore.getState()
        const targetSpace = store.activeSpaceId || store.spaces[0]?.id
        if (!targetSpace) return

        const currentActive = store.activeTabId ? store.tabsBySpace[targetSpace]?.find((t) => t.id === store.activeTabId) : null
        const insertOrder = currentActive ? currentActive.order + 1 : undefined

        const newTab = await api.tabs.create({
          spaceId: targetSpace,
          url,
          title: 'Loading...',
          order: insertOrder
        })

        store.insertTabNextTo(targetSpace, newTab, store.activeTabId, isActive)
      } catch (err) {
        console.error('[App] Failed to open external URL:', err)
      }
    })

    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  useEffect(() => {
    if (!api.onExternalUrl) return

    const unsub = api.onExternalUrl(async (url) => {
      if (!url || url === 'about:blank') return

      const now = Date.now()
      if (lastExternalUrlRef.current.url === url && now - lastExternalUrlRef.current.time < 500) {
        return
      }
      lastExternalUrlRef.current = { url, time: now }

      try {
        const store = useBrowserStore.getState()
        const targetSpace = store.activeSpaceId || store.spaces[0]?.id
        if (!targetSpace) return

        const newTab = await api.tabs.create({
          spaceId: targetSpace,
          url,
          title: 'Loading...'
        })

        store.insertTabNextTo(targetSpace, newTab, store.activeTabId, true)
      } catch (err) {
        console.error('[App] Failed to open external URL:', err)
      }
    })

    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  // Responsive layout: auto-collapse sidebar when window width is constrained (< 720px) to maximize browsing area
  useEffect(() => {
    let wasAutoCollapsed = false
    const handleResize = () => {
      const width = window.innerWidth
      if (width < 720 && settings && !settings.sidebarCollapsed) {
        setSidebarCollapsed(true)
        wasAutoCollapsed = true
      } else if (width >= 860 && wasAutoCollapsed && settings && settings.sidebarCollapsed) {
        setSidebarCollapsed(false)
        wasAutoCollapsed = false
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [settings, setSidebarCollapsed])

  // Dynamic Windows / macOS / Linux taskbar hover & window title sync
  useEffect(() => {
    const appName = appInfo?.name || 'TCT Orbit'
    let title = appName

    if (activeTab && activeTab.title) {
      const activeTitle = activeTab.title.trim()
      const otherTabsCount = Math.max(0, tabs.length - 1)

      if (otherTabsCount > 0) {
        title = `${activeTitle} and ${otherTabsCount} other tab${otherTabsCount === 1 ? '' : 's'} - ${appName}`
      } else {
        title = `${activeTitle} - ${appName}`
      }
    }

    document.title = title
    if (api.window && typeof api.window.setTitle === 'function') {
      api.window.setTitle(title).catch(() => {})
    }
  }, [activeTab?.title, tabs.length, appInfo?.name])

  // Download notifications listener
  useEffect(() => {
    if (!api.downloads?.onCompleted) return
    const unsub = api.downloads.onCompleted((data) => {
      toast.success(`Download complete: ${data.filename}`, {
        description: data.savePath ? `Saved to ${data.savePath}` : undefined,
        action: data.savePath
          ? {
              label: 'Show in Folder',
              onClick: () => {
                api.downloads?.showInFolder(data.savePath)
              }
            }
          : undefined,
        duration: 5000
      })
    })
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  // Initialize and synchronize unified theme engine
  useEffect(() => {
    useThemeStore.getState().initTheme()
  }, [])

  // Synchronized refs for fresh state in shortcut handlers without rebinding listeners
  const tabsRef = React.useRef(tabs)
  tabsRef.current = tabs
  const activeTabIdRef = React.useRef(activeTabId)
  activeTabIdRef.current = activeTabId
  const settingsRef = React.useRef(settings)
  settingsRef.current = settings

  // Unified shortcut executor shared by renderer DOM keydown and main-process webview before-input-event
  const executeShortcutAction = React.useCallback(
    (action: string) => {
      switch (action) {
        case 'new-tab':
          setCommandBarOpen(true, '', 'new-tab')
          break
        case 'close-tab': {
          const store = useBrowserStore.getState()
          const targetId = store.activeTabId || activeTabIdRef.current
          if (targetId) {
            removeTab(targetId)
          }
          break
        }
        case 'reopen-tab':
          reopenLastClosedTab()
          break
        case 'next-tab': {
          const store = useBrowserStore.getState()
          const spaceId = store.activeSpaceId
          const currentTabs = spaceId ? store.tabsBySpace[spaceId] || [] : tabsRef.current
          if (currentTabs.length > 1) {
            const activeId = store.activeTabId || activeTabIdRef.current
            const curIdx = currentTabs.findIndex((t) => t.id === activeId)
            const nextIdx = (curIdx + 1) % currentTabs.length
            setActiveTab(currentTabs[nextIdx].id)
          }
          break
        }
        case 'prev-tab': {
          const store = useBrowserStore.getState()
          const spaceId = store.activeSpaceId
          const currentTabs = spaceId ? store.tabsBySpace[spaceId] || [] : tabsRef.current
          if (currentTabs.length > 1) {
            const activeId = store.activeTabId || activeTabIdRef.current
            const curIdx = currentTabs.findIndex((t) => t.id === activeId)
            const prevIdx = (curIdx - 1 + currentTabs.length) % currentTabs.length
            setActiveTab(currentTabs[prevIdx].id)
          }
          break
        }
        case 'switch-tab-1':
        case 'switch-tab-2':
        case 'switch-tab-3':
        case 'switch-tab-4':
        case 'switch-tab-5':
        case 'switch-tab-6':
        case 'switch-tab-7':
        case 'switch-tab-8': {
          const store = useBrowserStore.getState()
          const spaceId = store.activeSpaceId
          const currentTabs = spaceId ? store.tabsBySpace[spaceId] || [] : tabsRef.current
          const targetIndex = parseInt(action.replace('switch-tab-', ''), 10) - 1
          if (currentTabs[targetIndex]) {
            setActiveTab(currentTabs[targetIndex].id)
          }
          break
        }
        case 'switch-tab-last': {
          const store = useBrowserStore.getState()
          const spaceId = store.activeSpaceId
          const currentTabs = spaceId ? store.tabsBySpace[spaceId] || [] : tabsRef.current
          if (currentTabs.length > 0) {
            setActiveTab(currentTabs[currentTabs.length - 1].id)
          }
          break
        }
        case 'focus-address-bar':
          window.dispatchEvent(new CustomEvent('tct:focus-address-bar'))
          break
        case 'open-command-bar':
          setCommandBarOpen(true, '', 'navigate')
          break
        case 'toggle-sidebar': {
          const cur = settingsRef.current
          if (cur) {
            setSidebarCollapsed(!cur.sidebarCollapsed)
          }
          break
        }
        case 'open-settings':
          window.dispatchEvent(new CustomEvent('open-settings'))
          break
        case 'reload':
          window.dispatchEvent(new CustomEvent('tct:webview-reload'))
          break
        case 'hard-reload':
          window.dispatchEvent(new CustomEvent('tct:webview-hard-reload'))
          break
        case 'back':
          window.dispatchEvent(new CustomEvent('tct:webview-back'))
          break
        case 'forward':
          window.dispatchEvent(new CustomEvent('tct:webview-forward'))
          break
        case 'zoom-in':
          window.dispatchEvent(new CustomEvent('tct:webview-zoom-in'))
          break
        case 'zoom-out':
          window.dispatchEvent(new CustomEvent('tct:webview-zoom-out'))
          break
        case 'zoom-reset':
          window.dispatchEvent(new CustomEvent('tct:webview-zoom-reset'))
          break
        case 'toggle-devtools': {
          const nextState = !useBrowserStore.getState().devtoolsOpen
          setDevToolsOpen(nextState)
          if (nextState) {
            const activeWebview = document.querySelector('div[style*="display: flex"] webview') as any
            const wcId = activeWebview?.getWebContentsId ? activeWebview.getWebContentsId() : undefined
            api.devtools?.open(wcId)
          } else {
            api.devtools?.close()
          }
          break
        }
        case 'take-screenshot': {
          const activeWebview = document.querySelector('div[style*="display: flex"] webview') as any
          const wcId = activeWebview?.getWebContentsId ? activeWebview.getWebContentsId() : undefined
          if (wcId && api.webview?.captureScreenshot) {
            api.webview.captureScreenshot(wcId)
          }
          break
        }
      }
    },
    [removeTab, setActiveTab, reopenLastClosedTab, setCommandBarOpen, setSidebarCollapsed, setDevToolsOpen]
  )

  // Listen to shortcuts forwarded from webview before-input-event via IPC
  useEffect(() => {
    if (!api.shortcuts?.onTrigger) return
    const unsub = api.shortcuts.onTrigger((action) => {
      executeShortcutAction(action)
    })
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [executeShortcutAction])

  // Keyboard shortcuts listener when focus is on browser chrome
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey
      const key = (e.key || '').toLowerCase()
      const code = e.code || ''
      const shift = e.shiftKey
      const alt = e.altKey

      // 1. DevTools: F12 or Ctrl+Shift+I
      if (key === 'f12' || (isCmdOrCtrl && shift && !alt && key === 'i')) {
        e.preventDefault()
        executeShortcutAction('toggle-devtools')
        return
      }

      // 2. Screenshot: Ctrl+Shift+S
      if (isCmdOrCtrl && shift && !alt && key === 's') {
        e.preventDefault()
        executeShortcutAction('take-screenshot')
        return
      }

      // 3. Reopen closed tab: Ctrl+Shift+T
      if (isCmdOrCtrl && shift && !alt && key === 't') {
        e.preventDefault()
        executeShortcutAction('reopen-tab')
        return
      }

      // 4. Hard reload (ignore cache): Ctrl+Shift+R or Ctrl+F5
      if ((isCmdOrCtrl && shift && key === 'r') || (isCmdOrCtrl && (key === 'f5' || code === 'F5'))) {
        e.preventDefault()
        executeShortcutAction('hard-reload')
        return
      }

      // 5. Normal reload: Ctrl+R or F5
      if ((isCmdOrCtrl && !shift && !alt && key === 'r') || (!isCmdOrCtrl && !shift && !alt && (key === 'f5' || code === 'F5'))) {
        e.preventDefault()
        executeShortcutAction('reload')
        return
      }

      // 6. Next tab: Ctrl+Tab or Ctrl+PageDown
      if (isCmdOrCtrl && !shift && !alt && (key === 'tab' || code === 'Tab' || key === 'pagedown' || code === 'PageDown')) {
        e.preventDefault()
        executeShortcutAction('next-tab')
        return
      }

      // 7. Previous tab: Ctrl+Shift+Tab or Ctrl+PageUp
      if (isCmdOrCtrl && shift && !alt && (key === 'tab' || code === 'Tab' || key === 'pageup' || code === 'PageUp')) {
        e.preventDefault()
        executeShortcutAction('prev-tab')
        return
      }

      // 8. New tab: Ctrl+T or Ctrl+N
      if (isCmdOrCtrl && !shift && !alt && (key === 't' || key === 'n')) {
        e.preventDefault()
        executeShortcutAction('new-tab')
        return
      }

      // 9. Close tab: Ctrl+W or Ctrl+F4
      if ((isCmdOrCtrl && !shift && !alt && key === 'w') || (isCmdOrCtrl && (key === 'f4' || code === 'F4'))) {
        e.preventDefault()
        executeShortcutAction('close-tab')
        return
      }

      // 10. Focus Address Bar / Omnibox: Ctrl+L, Alt+D, or F6
      if (
        (isCmdOrCtrl && !shift && !alt && key === 'l') ||
        (alt && !isCmdOrCtrl && !shift && key === 'd') ||
        (!isCmdOrCtrl && !shift && !alt && (key === 'f6' || code === 'F6'))
      ) {
        e.preventDefault()
        executeShortcutAction('focus-address-bar')
        return
      }

      // 11. Open Command Bar: Ctrl+K
      if (isCmdOrCtrl && !shift && !alt && key === 'k') {
        e.preventDefault()
        executeShortcutAction('open-command-bar')
        return
      }

      // 12. Toggle Sidebar: Ctrl+S or Ctrl+B
      if (isCmdOrCtrl && !shift && !alt && (key === 's' || key === 'b')) {
        e.preventDefault()
        executeShortcutAction('toggle-sidebar')
        return
      }

      // 13. Open Settings: Ctrl+,
      if (isCmdOrCtrl && !shift && !alt && (key === ',' || code === 'Comma')) {
        e.preventDefault()
        executeShortcutAction('open-settings')
        return
      }

      // 14. Switch to tab 1..8: Ctrl+1..8
      if (isCmdOrCtrl && !shift && !alt && /^[1-8]$/.test(e.key)) {
        e.preventDefault()
        executeShortcutAction(`switch-tab-${e.key}`)
        return
      }

      // 15. Switch to last tab: Ctrl+9
      if (isCmdOrCtrl && !shift && !alt && e.key === '9') {
        e.preventDefault()
        executeShortcutAction('switch-tab-last')
        return
      }

      // 16. Back: Alt+Left or Ctrl+[
      if (
        (alt && !isCmdOrCtrl && !shift && (key === 'arrowleft' || code === 'ArrowLeft')) ||
        (isCmdOrCtrl && !shift && !alt && (key === '[' || code === 'BracketLeft'))
      ) {
        e.preventDefault()
        executeShortcutAction('back')
        return
      }

      // 17. Forward: Alt+Right or Ctrl+]
      if (
        (alt && !isCmdOrCtrl && !shift && (key === 'arrowright' || code === 'ArrowRight')) ||
        (isCmdOrCtrl && !shift && !alt && (key === ']' || code === 'BracketRight'))
      ) {
        e.preventDefault()
        executeShortcutAction('forward')
        return
      }

      // 18. Zoom In: Ctrl+=, Ctrl++, or Ctrl+NumpadAdd
      if (isCmdOrCtrl && !alt && (key === '=' || key === '+' || code === 'Equal' || code === 'NumpadAdd')) {
        e.preventDefault()
        executeShortcutAction('zoom-in')
        return
      }

      // 19. Zoom Out: Ctrl+- or Ctrl+NumpadSubtract
      if (isCmdOrCtrl && !alt && (key === '-' || code === 'Minus' || code === 'NumpadSubtract')) {
        e.preventDefault()
        executeShortcutAction('zoom-out')
        return
      }

      // 20. Zoom Reset: Ctrl+0 or Ctrl+Numpad0
      if (isCmdOrCtrl && !alt && (key === '0' || code === 'Digit0' || code === 'Numpad0')) {
        e.preventDefault()
        executeShortcutAction('zoom-reset')
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [executeShortcutAction])

  const resolvedTheme = useThemeStore((s) => s.resolved)

  return (
    <SmoothScroll enabled={settings?.smoothScrolling ?? true}>
      <div className="flex flex-col h-full w-full overflow-hidden bg-background text-foreground select-none font-sans">
        {/* Title bar strip with drag region and window controls */}
        <TitleBar
          spaceName={activeSpace?.name || 'Personal'}
          spaceColor={activeSpace?.color || '#6366f1'}
        />

        {/* Main browser frame: Sidebar + WebViews + Docked DevTools */}
        <div className="flex flex-1 w-full min-h-0 overflow-hidden">
          <Sidebar />
          <WebViewContainer spaceId={activeSpaceId} />
          <DockedDevToolsPane />
        </div>

        {/* TCT Orbit spotlight CommandBar overlay */}
        <CommandBar />

        {/* Edge-Style Right-Click Context Menu */}
        <BrowserContextMenu />

        {/* QR Code generator modal */}
        <QrCodeModal />

        {/* Sonner toast alerts */}
        <Toaster theme={resolvedTheme} />
      </div>
    </SmoothScroll>
  )
}

export default App
