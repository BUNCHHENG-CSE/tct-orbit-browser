import React, { useEffect, useRef, useState } from 'react'
import { TitleBar } from '@/components/TitleBar/TitleBar'
import { Sidebar } from '@/components/Sidebar/Sidebar'
import { WebViewContainer } from '@/components/WebView/WebViewContainer'
import { CommandBar } from '@/components/CommandBar/CommandBar'
import { HistoryDialog } from '@/components/HistoryModal/HistoryDialog'
import { DownloadsDialog } from '@/components/DownloadsModal/DownloadsDialog'
import { BookmarksDialog } from '@/components/Bookmarks/BookmarksDialog'
import { NotesDrawer } from '@/components/Notes/NotesDrawer'
import { DockedDevToolsPane } from '@/components/DevTools/DockedDevToolsPane'
import { BrowserContextMenu, QrCodeModal } from '@/components/ContextMenu/BrowserContextMenu'
import { ZenControls } from '@/components/ZenMode/ZenControls'
import { TaskManagerDialog } from '@/components/TaskManager/TaskManagerDialog'
import { PomodoroDialog } from '@/components/TitleBar/PomodoroDialog'
import { SmoothScroll } from '@/components/SmoothScroll'
import { PermissionPrompt } from '@/components/Permissions/PermissionPrompt'
import { TabSearchDialog } from '@/components/TabSearch/TabSearchDialog'
import { ShortcutHelpDialog } from '@/components/ShortcutHelp/ShortcutHelpDialog'
import { OnboardingDialog } from '@/components/Onboarding/OnboardingDialog'
import { PrivacyReportDialog } from '@/components/PrivacyReport/PrivacyReportDialog'
import { SpaceTemplatesDialog } from '@/components/SpaceTemplates/SpaceTemplatesDialog'
import { AppNotices } from '@/components/AppNotices/AppNotices'
import { LegalDialog } from '@/components/Legal/LegalDialog'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import { useSpaces } from '@/hooks/useSpaces'
import { useTabActions, useLoadSpaceTabs } from '@/hooks/useTabs'
import { useSettings } from '@/hooks/useSettings'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useThemeStore } from '@/store/useThemeStore'
import { api } from '@/lib/ipc'
import { openNewTab } from '@/lib/startPage'
import { groupForNewTab } from '@/lib/tabGroups'
import { MeetingDialog } from '@/components/Meeting/MeetingDialog'
import { SmartRuntime } from '@/components/Smart/SmartRuntime'
import { SmartToolsDialog } from '@/components/Smart/SmartToolsDialog'
import { ExtensionsDialog } from '@/components/Extensions/ExtensionsDialog'
import { AboutDialog } from '@/components/Help/AboutDialog'
import { PasswordSavePrompt } from '@/components/Passwords/PasswordSavePrompt'
import { PasswordsDialog } from '@/components/Passwords/PasswordsDialog'
import { useDevtoolsOverlayGuard } from '@/hooks/useDevtoolsOverlayGuard'
import { useDismissOverlaysOnBlur } from '@/hooks/useDismissOverlaysOnBlur'
import { placeNewTab } from '@/lib/tabPlacement'
import { isPrivateWindow, PRIVATE_WINDOW_SPACE_ID } from '@/lib/privateWindow'
import { useFavoritesButton } from '@/lib/favorites'
import { TabStrip } from '@/components/TabStrip/TabStrip'
import { FavoritesBar } from '@/components/Favorites/FavoritesBar'
import { isStartPageUrl } from '@/lib/startPage'
import { matchShortcut } from '@shared/shortcuts'
import { currentKeymap, shortcutRecording } from '@/lib/shortcuts'
import { webviewRegistry } from '@/lib/webviewRegistry'
import { EXTRA_SPACE_ID, isExtraWindow, isMainWindow } from '@/lib/extraWindow'
import { spaceForLink, switchToSpace } from '@/lib/routes'
import { EssentialsRuntime } from '@/components/Essentials/EssentialsRuntime'
import { ScreenSharePicker } from '@/components/Essentials/ScreenSharePicker'
import { HttpAuthDialog } from '@/components/Essentials/HttpAuthDialog'
import { CaptureDialog } from '@/components/Essentials/CaptureDialog'
import { BoostsDialog } from '@/components/Essentials/BoostsDialog'
import { HighlightsDialog } from '@/components/Essentials/HighlightsDialog'
import { AskPagePanel } from '@/components/Essentials/AskPagePanel'
import { AddressesDialog } from '@/components/Essentials/AddressesDialog'
import { PagePromptDialog } from '@/components/Essentials/PagePromptDialog'
import { webContentsIdOf } from '@/lib/tabLifecycle'

/** Active tab of a space (falls back to its first tab, like useTabs) */
function activeTabOf(s: ReturnType<typeof useBrowserStore.getState>, spaceId: string | null) {
  const tabs = spaceId ? s.tabsBySpace[spaceId] : undefined
  if (!tabs || tabs.length === 0) return undefined
  return tabs.find((t) => t.id === s.activeTabId) || tabs[0]
}

export const App: React.FC = () => {
  const { spaces, activeSpace, activeSpaceId } = useSpaces()
  // The root component must not subscribe to the tab list: it would re-render the whole UI on
  // every title / favicon / URL change. It only needs the count and the active tab's title + URL.
  const { removeTab, setActiveTab, reopenLastClosedTab } = useTabActions(activeSpaceId)
  const tabsLoading = useLoadSpaceTabs(activeSpaceId)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const tabCount = useBrowserStore((s) => (activeSpaceId ? s.tabsBySpace[activeSpaceId]?.length ?? 0 : 0))
  const activeTabTitle = useBrowserStore((s) => activeTabOf(s, activeSpaceId)?.title)
  const activeTabUrl = useBrowserStore((s) => activeTabOf(s, activeSpaceId)?.url)

  // Private window: its first tab is created by the main process; close the window when its
  // last tab is closed (like Edge InPrivate)
  const privateHadTabs = useRef(false)
  useEffect(() => {
    if (!isPrivateWindow) return
    document.documentElement.classList.add('private-window')
    document.title = 'TCT Orbit — Private'
  }, [])
  useEffect(() => {
    const ownSpace = isPrivateWindow ? PRIVATE_WINDOW_SPACE_ID : isExtraWindow ? EXTRA_SPACE_ID : null
    if (!ownSpace || activeSpaceId !== ownSpace || tabsLoading) return
    if (tabCount > 0) privateHadTabs.current = true
    else if (privateHadTabs.current) void api.window.close()
  }, [tabCount, activeSpaceId, tabsLoading])
  const { settings, setSidebarCollapsed } = useSettings()
  const setCommandBarOpen = useBrowserStore((s) => s.setCommandBarOpen)
  const setDevToolsOpen = useBrowserStore((s) => s.setDevToolsOpen)
  const devtoolsOpen = useBrowserStore((s) => s.devtoolsOpen)
  useDevtoolsOverlayGuard(devtoolsOpen)
  useDismissOverlaysOnBlur()
  const appInfo = useBrowserStore((s) => s.appInfo)
  const setAppInfo = useBrowserStore((s) => s.setAppInfo)
  const zenMode = useBrowserStore((s) => s.zenMode)
  // A page is showing something in full screen: nothing else may be visible
  const pageFullscreen = useBrowserStore((s) => s.htmlFullscreenTabId !== null)
  const [topHovered, setTopHovered] = useState(false)
  const [leftHovered, setLeftHovered] = useState(false)

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
      const isPrivate = typeof payload === 'object' && !!payload.isPrivate

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

        // Link routing: this site always opens in another Space
        const routed = isPrivate ? targetSpace : spaceForLink(url, targetSpace)
        if (routed !== targetSpace) {
          const tab = await api.tabs.create({ spaceId: routed, url, title: 'Loading...' })
          if (isActive) switchToSpace(routed)
          useBrowserStore.getState().insertTabNextTo(routed, tab, null, isActive)
          return
        }

        const currentActive = store.activeTabId ? store.tabsBySpace[targetSpace]?.find((t) => t.id === store.activeTabId) : null
        const insertOrder = currentActive ? currentActive.order + 1 : undefined

        const newTab = await api.tabs.create({
          spaceId: targetSpace,
          url,
          title: 'Loading...',
          order: insertOrder,
          isPrivate,
          // "Open links in this group": the new tab joins the opener's group
          groupId: groupForNewTab(currentActive, store.groupsBySpace[targetSpace] || [])
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
        const currentSpace = store.activeSpaceId || store.spaces[0]?.id
        if (!currentSpace) return
        const targetSpace = spaceForLink(url, currentSpace)

        const newTab = await api.tabs.create({
          spaceId: targetSpace,
          url,
          title: 'Loading...'
        })

        switchToSpace(targetSpace)
        placeNewTab(targetSpace, newTab)
      } catch (err) {
        console.error('[App] Failed to open external URL:', err)
      }
    })

    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  // Links the OS asked us to open at launch (Orbit as default browser): open once spaces are loaded
  const spacesLoaded = spaces.length > 0
  useEffect(() => {
    // Launch links belong to the main window, never the private one
    if (!isMainWindow || !spacesLoaded || !api.app?.takePendingUrls) return
    api.app
      .takePendingUrls()
      .then(async (urls) => {
        const store = useBrowserStore.getState()
        const currentSpace = store.activeSpaceId || store.spaces[0]?.id
        if (!currentSpace) return
        for (const url of urls) {
          const targetSpace = spaceForLink(url, currentSpace)
          const tab = await api.tabs.create({ spaceId: targetSpace, url, title: 'Loading...' })
          switchToSpace(targetSpace)
          placeNewTab(targetSpace, tab)
        }
      })
      .catch(() => {})
  }, [spacesLoaded])

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

    if (activeTabTitle) {
      const activeTitle = activeTabTitle.trim()
      const otherTabsCount = Math.max(0, tabCount - 1)

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
  }, [activeTabTitle, tabCount, appInfo?.name])

  // Download notifications listener
  useEffect(() => {
    if (!api.downloads?.onCompleted) return
    const unsub = api.downloads.onCompleted((data) => {
      toast.success(`Download complete: ${data.filename}`, {
        // Replaces the "Downloading ..." message
        id: data.id,
        icon: undefined,
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
  const activeTabIdRef = React.useRef(activeTabId)
  activeTabIdRef.current = activeTabId
  const settingsRef = React.useRef(settings)
  settingsRef.current = settings

  // Unified shortcut executor shared by renderer DOM keydown and main-process webview before-input-event
  const executeShortcutAction = React.useCallback(
    (action: string) => {
      switch (action) {
        case 'new-tab':
          void openNewTab()
          break
        case 'new-window':
          void api.essentials.windows.open()
          break
        case 'find-next':
          window.dispatchEvent(new CustomEvent('tct:find-next'))
          break
        case 'find-prev':
          window.dispatchEvent(new CustomEvent('tct:find-prev'))
          break
        case 'clear-data':
          window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'privacy' } }))
          break
        case 'view-source': {
          const store = useBrowserStore.getState()
          const tab = activeTabOf(store, store.activeSpaceId)
          if (!tab || !/^https?:/i.test(tab.url)) break
          void api.tabs
            .create({ spaceId: tab.spaceId, url: `view-source:${tab.url}`, title: `Source of ${tab.title || 'page'}`, isPrivate: !!tab.isPrivate })
            .then((created) => placeNewTab(tab.spaceId, created))
            .catch(() => {})
          break
        }
        case 'ask-page':
          window.dispatchEvent(new CustomEvent('tct:ask-page'))
          break
        case 'open-favorites':
          if (useFavoritesButton.getState().show) window.dispatchEvent(new CustomEvent('tct:open-favorites'))
          else useBrowserStore.getState().setBookmarksDialogOpen(true)
          break
        case 'toggle-favorites-bar': {
          const cur = useBrowserStore.getState().settings?.favoritesBar ?? 'always'
          void api.settings?.update?.({ favoritesBar: cur === 'never' ? 'always' : 'never' }).then((next: any) => {
            if (next) useBrowserStore.getState().setSettings(next)
          })
          break
        }
        case 'new-private-tab':
          window.dispatchEvent(new CustomEvent('tct:new-private-tab'))
          break
        case 'tab-search':
          window.dispatchEvent(new CustomEvent('tct:open-tab-search'))
          break
        case 'shortcut-help':
          window.dispatchEvent(new CustomEvent('tct:open-shortcut-help'))
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
          const currentTabs = spaceId ? store.tabsBySpace[spaceId] || [] : []
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
          const currentTabs = spaceId ? store.tabsBySpace[spaceId] || [] : []
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
          const currentTabs = spaceId ? store.tabsBySpace[spaceId] || [] : []
          const targetIndex = parseInt(action.replace('switch-tab-', ''), 10) - 1
          if (currentTabs[targetIndex]) {
            setActiveTab(currentTabs[targetIndex].id)
          }
          break
        }
        case 'switch-tab-last': {
          const store = useBrowserStore.getState()
          const spaceId = store.activeSpaceId
          const currentTabs = spaceId ? store.tabsBySpace[spaceId] || [] : []
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
          // Horizon layout has no rail: don't silently flip its hidden collapse state
          if (cur && cur.tabLayout !== 'topbar') {
            setSidebarCollapsed(!cur.sidebarCollapsed)
          }
          break
        }
        case 'open-settings':
          window.dispatchEvent(new CustomEvent('open-settings'))
          break
        case 'open-history':
          window.dispatchEvent(new CustomEvent('open-history'))
          break
        case 'open-downloads':
          window.dispatchEvent(new CustomEvent('open-downloads'))
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
            api.devtools?.open(webContentsIdOf(useBrowserStore.getState().activeTabId) ?? undefined)
          } else {
            api.devtools?.close()
          }
          break
        }
        case 'take-screenshot':
          window.dispatchEvent(new CustomEvent('tct:web-capture'))
          break
        case 'toggle-split-view':
          window.dispatchEvent(new CustomEvent('tct:toggle-split-view'))
          break
        case 'toggle-reader-mode':
          window.dispatchEvent(new CustomEvent('tct:toggle-reader-mode'))
          break
        case 'toggle-pip':
          window.dispatchEvent(new CustomEvent('tct:toggle-pip'))
          break
        case 'toggle-notes':
          window.dispatchEvent(new CustomEvent('tct:toggle-notes'))
          break
        case 'save-page': {
          const tabId = useBrowserStore.getState().activeTabId
          const el = webviewRegistry.get(tabId)
          try {
            if (el) void api.webview.saveAs(el.getWebContentsId())
          } catch {
            // The page is not loaded yet
          }
          break
        }
        case 'print-page': {
          const store = useBrowserStore.getState()
          if (store.readerMode?.isOpen) {
            window.print()
          } else {
            window.dispatchEvent(new CustomEvent('tct:webview-print'))
          }
          break
        }
        case 'toggle-find':
          window.dispatchEvent(new CustomEvent('tct:toggle-find'))
          break
        case 'toggle-bookmark':
          window.dispatchEvent(new CustomEvent('tct:toggle-bookmark'))
          break
        case 'open-bookmarks':
          window.dispatchEvent(new CustomEvent('open-bookmarks'))
          break
        case 'toggle-zen-mode': {
          const store = useBrowserStore.getState()
          const next = !store.zenMode
          store.setZenMode(next)
          if (api.window?.setFullScreen) {
            api.window.setFullScreen(next)
          }
          break
        }
        case 'open-task-manager':
          useBrowserStore.getState().setTaskManagerOpen(true)
          break
      }
    },
    [removeTab, setActiveTab, reopenLastClosedTab, setCommandBarOpen, setSidebarCollapsed, setDevToolsOpen]
  )

  // Menus (View, Help ...) run the same actions as keyboard shortcuts
  useEffect(() => {
    const onAction = (e: Event) => {
      const action = (e as CustomEvent).detail
      if (typeof action === 'string') executeShortcutAction(action)
    }
    window.addEventListener('tct:shortcut-action', onAction)
    return () => window.removeEventListener('tct:shortcut-action', onAction)
  }, [executeShortcutAction])

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
      if (shortcutRecording.active) return
      const action = matchShortcut(
        { key: e.key, code: e.code, control: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey, alt: e.altKey },
        currentKeymap()
      )
      if (!action) return
      e.preventDefault()
      executeShortcutAction(action)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [executeShortcutAction])

  const resolvedTheme = useThemeStore((s) => s.resolved)

  return (
    <SmoothScroll enabled={settings?.smoothScrolling ?? true}>
      <div className="flex flex-col h-full w-full overflow-hidden bg-background text-foreground select-none font-sans relative">
        {/* Zen Mode Edge-Hover Gliding Triggers */}
        {zenMode && (
          <>
            {/* Top edge trigger corridor (hovering smoothly glides TitleBar into view) */}
            <div
              onMouseEnter={() => setTopHovered(true)}
              className="fixed top-0 left-0 right-0 h-3 z-40 pointer-events-auto"
            />
            {/* Left edge trigger corridor (hovering smoothly glides Sidebar into view) */}
            <div
              onMouseEnter={() => setLeftHovered(true)}
              className="fixed top-0 bottom-0 left-0 w-3 z-40 pointer-events-auto"
            />
          </>
        )}

        {/* Title bar strip with drag region and window controls */}
        <div
          onMouseEnter={() => zenMode && setTopHovered(true)}
          onMouseLeave={() => zenMode && setTopHovered(false)}
          className={`${
            zenMode
              ? `fixed top-0 left-0 right-0 z-50 transition-transform duration-300 ease-out shadow-2xl ${
                  topHovered ? 'translate-y-0 pointer-events-auto' : '-translate-y-full pointer-events-none'
                }`
              : 'relative z-20 shrink-0'
          } ${pageFullscreen ? 'hidden' : ''}`}
        >
          {settings?.tabLayout === 'topbar' && <TabStrip />}
          <TitleBar
            spaceName={activeSpace?.name || 'Personal'}
            spaceColor={activeSpace?.color || '#6366f1'}
          />
          {(() => {
            // Favorites bar: always / never / only on new tabs (start page)
            const mode = settings?.favoritesBar ?? 'always'
            const show = mode === 'always' || (mode === 'new-tab' && (!activeTabUrl || isStartPageUrl(activeTabUrl)))
            return show ? <FavoritesBar /> : null
          })()}
        </div>

        {/* Main browser frame: Sidebar + WebViews + Docked DevTools */}
        <div className="flex flex-1 w-full min-h-0 overflow-hidden relative">
          <div
            onMouseEnter={() => zenMode && setLeftHovered(true)}
            onMouseLeave={() => zenMode && setLeftHovered(false)}
            className={`${
              zenMode
                ? `fixed top-0 bottom-0 left-0 z-50 transition-transform duration-300 ease-out shadow-2xl ${
                    leftHovered ? 'translate-x-0 pointer-events-auto' : '-translate-x-full pointer-events-none'
                  }`
                : 'relative z-30 flex shrink-0 h-full'
            } ${pageFullscreen ? '!hidden' : ''}`}
          >
            <Sidebar hideTabs={settings?.tabLayout === 'topbar'} />
          </div>

          <WebViewContainer spaceId={activeSpaceId} />
          <DockedDevToolsPane />
          <NotesDrawer />
          <AskPagePanel />
        </div>

        {/* Zen Mode Ambient Soundscapes & Exit Controls */}
        <ZenControls />

        {/* Orbit Task Manager & RAM Monitor Dialog (Shift+Esc) */}
        <TaskManagerDialog />

        {/* Focus Sprint Pomodoro Dialog */}
        <PomodoroDialog />

        {/* Meeting mode: meeting + notes side by side with a countdown */}
        <MeetingDialog />

        {/* Snoozed tabs, page watchers, focus rules per space, page search */}
        <SmartRuntime />
        <SmartToolsDialog />

        {/* Tools > Extensions, Help > About */}
        <ExtensionsDialog />
        <AboutDialog />

        {/* Password manager: save prompt + manager */}
        <PasswordSavePrompt />
        <PasswordsDialog />

        {/* Routes, updates, window moves; screen sharing, sign-in, capture, boosts, highlights */}
        <EssentialsRuntime />
        <ScreenSharePicker />
        <HttpAuthDialog />
        <CaptureDialog />
        <BoostsDialog />
        <HighlightsDialog />
        <AddressesDialog />
        <PagePromptDialog />

        {/* TCT Orbit spotlight CommandBar overlay */}
        <CommandBar />

        {/* Full Browsing History Timeline Modal (Ctrl+H) */}
        <HistoryDialog />

        {/* Downloads Manager Dashboard (Ctrl+J) */}
        <DownloadsDialog />

        {/* Bookmarks & Reading List Dashboard */}
        <BookmarksDialog />

        {/* Edge-Style Right-Click Context Menu */}
        <BrowserContextMenu />

        {/* QR Code generator modal */}
        <QrCodeModal />

        {/* Site permission prompts (camera, mic, location, notifications ...) */}
        <PermissionPrompt />

        {/* Tab search (Ctrl+Shift+A), shortcut cheat sheet (Ctrl+/), first-run tour */}
        <TabSearchDialog />
        <ShortcutHelpDialog />
        <OnboardingDialog />

        {/* Privacy report & space templates */}
        <PrivacyReportDialog />
        <SpaceTemplatesDialog />

        {/* Terms of Use & Privacy Policy viewer */}
        <LegalDialog />

        {/* Session restore, HTTPS fallback & focus-block notices */}
        <AppNotices />

        {/* Sonner toast alerts */}
        <Toaster theme={resolvedTheme} />
      </div>
    </SmoothScroll>
  )
}

export default App
