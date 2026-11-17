import React, { useEffect } from 'react'
import { TitleBar } from '@/components/TitleBar/TitleBar'
import { Sidebar } from '@/components/Sidebar/Sidebar'
import { WebViewContainer } from '@/components/WebView/WebViewContainer'
import { CommandBar } from '@/components/CommandBar/CommandBar'
import { Toaster } from '@/components/ui/sonner'
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
    if (!api.onExternalUrl) return

    const unsub = api.onExternalUrl(async (url: string) => {
      if (!url || url === 'about:blank') return

      const now = Date.now()
      if (lastExternalUrlRef.current.url === url && now - lastExternalUrlRef.current.time < 600) {
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
        store.addTabToStore(targetSpace, newTab)
        store.setActiveTabId(newTab.id)
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

  // Initialize and synchronize unified theme engine
  useEffect(() => {
    useThemeStore.getState().initTheme()
  }, [])

  // Keyboard shortcuts listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey
      if (!isCmdOrCtrl) return

      const key = e.key.toLowerCase()

      // Cmd/Ctrl + Shift + T → reopen last closed tab
      if (key === 't' && e.shiftKey) {
        e.preventDefault()
        reopenLastClosedTab()
        return
      }

      // Cmd/Ctrl + T → new tab + open CommandBar
      if (key === 't' && !e.shiftKey) {
        e.preventDefault()
        setCommandBarOpen(true, '', 'new-tab')
        return
      }

      // Cmd/Ctrl + W → close active tab
      if (key === 'w') {
        e.preventDefault()
        if (activeTabId) {
          removeTab(activeTabId)
        }
        return
      }

      // Cmd/Ctrl + L → focus top Edge-style Address Bar Omnibox
      if (key === 'l') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('tct:focus-address-bar'))
        return
      }

      // Cmd/Ctrl + S → toggle sidebar collapsed
      if (key === 's') {
        e.preventDefault()
        if (settings) {
          setSidebarCollapsed(!settings.sidebarCollapsed)
        }
        return
      }

      // Cmd/Ctrl + 1..9 → switch to tab N
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault()
        const index = parseInt(e.key, 10) - 1
        if (tabs[index]) {
          setActiveTab(tabs[index].id)
        }
        return
      }

      // Cmd/Ctrl + R → reload active webview
      if (key === 'r') {
        e.preventDefault()
        const activeWebview = document.querySelector('webview[style*="display: flex"]') as any
        if (activeWebview && typeof activeWebview.reload === 'function') {
          activeWebview.reload()
        }
        return
      }

      // Cmd/Ctrl + , → open browser settings
      if (key === ',') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('open-settings'))
        return
      }

      // Cmd/Ctrl + [ / ] → back / forward
      if (e.key === '[') {
        e.preventDefault()
        const activeWebview = document.querySelector('webview[style*="display: flex"]') as any
        if (activeWebview && typeof activeWebview.goBack === 'function' && activeWebview.canGoBack()) {
          activeWebview.goBack()
        }
        return
      }

      if (e.key === ']') {
        e.preventDefault()
        const activeWebview = document.querySelector('webview[style*="display: flex"]') as any
        if (activeWebview && typeof activeWebview.goForward === 'function' && activeWebview.canGoForward()) {
          activeWebview.goForward()
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    activeTab,
    activeTabId,
    tabs,
    settings,
    reopenLastClosedTab,
    removeTab,
    setActiveTab,
    setCommandBarOpen,
    setSidebarCollapsed
  ])

  const resolvedTheme = useThemeStore((s) => s.resolved)

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground select-none font-sans">
      {/* Title bar strip with drag region and window controls */}
      <TitleBar
        spaceName={activeSpace?.name || 'Personal'}
        spaceColor={activeSpace?.color || '#6366f1'}
      />

      {/* Main browser frame: Sidebar + WebViews */}
      <div className="flex flex-1 w-full h-[calc(100vh-40px)] overflow-hidden">
        <Sidebar />
        <WebViewContainer spaceId={activeSpaceId} />
      </div>

      {/* TCT Orbit spotlight CommandBar overlay */}
      <CommandBar />

      {/* Sonner toast alerts */}
      <Toaster theme={resolvedTheme} />
    </div>
  )
}

export default App
