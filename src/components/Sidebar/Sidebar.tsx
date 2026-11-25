import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Settings, UserRound } from 'lucide-react'
import { SpaceSwitcher } from './SpaceSwitcher'
import { TabList } from './TabList'
import { TabTidyPopover } from '../TabTidy/TabTidyPopover'
import { SettingsDialog } from '../SettingsModal/SettingsDialog'
import { useSpaces } from '@/hooks/useSpaces'
import { useTabs } from '@/hooks/useTabs'
import { useSettings } from '@/hooks/useSettings'
import { useBrowserStore } from '@/store/useBrowserStore'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { PRIVATE_START_URL, PRIVATE_START_TITLE } from '@/lib/startPage'
import { isPrivateWindow, openPrivateWindow } from '@/lib/privateWindow'
import { isMainWindow } from '@/lib/extraWindow'
import { PrivateWindowBadge } from '@/components/PrivateWindow/PrivateWindowBadge'
import type { Tab } from '@/types/api'

const SIDEBAR_EXPANDED_W = 260
const SIDEBAR_COLLAPSED_W = 60

export const Sidebar: React.FC<{ hideTabs?: boolean }> = ({ hideTabs = false }) => {
  const { spaces, activeSpace, activeSpaceId } = useSpaces()
  const {
    tabs,
    activeTabId,
    setActiveTab,
    removeTab,
    updateTab,
    createTab,
    closeOtherTabs,
    closeTabsToRight,
    createTabNextTo
  } = useTabs(activeSpaceId)
  const { settings, setSidebarCollapsed } = useSettings()
  const setCommandBarOpen = useBrowserStore((s) => s.setCommandBarOpen)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const targetCollapsed = settings?.sidebarCollapsed ?? false

  // Smooth toggle without resizing the webviews on every frame:
  // - `isCollapsed`      = which content layout is rendered (icons-only vs full)
  // - `spacerCollapsed`  = the width reserved in the page layout (what the webviews see)
  // The visible <aside> overlays the webviews and animates its own width. The layout spacer
  // (and therefore every webview) is resized exactly ONCE per toggle, at a moment where the
  // change is hidden under the sidebar.
  const [isCollapsed, setIsCollapsed] = useState(targetCollapsed)
  const [spacerCollapsed, setSpacerCollapsed] = useState(targetCollapsed)

  // Horizon → Rail switch: fade the rail in instead of popping it (skipped on app start)
  const prevHideTabs = React.useRef(hideTabs)
  // Read at render time: `initial` is only honoured on the render that mounts the rail
  const enterFromTopbar = prevHideTabs.current && !hideTabs

  const finishToggle = React.useCallback(() => {
    // Idempotent: called from onAnimationComplete and from a fallback timer
    setIsCollapsed(targetCollapsed)
    setSpacerCollapsed(targetCollapsed)
  }, [targetCollapsed])

  React.useLayoutEffect(() => {
    const cameFromTopbar = prevHideTabs.current && !hideTabs
    prevHideTabs.current = hideTabs

    // No rail mounted (Horizon layout) or the rail is just appearing: there is no width
    // animation to wait for, so sync both states immediately. Without this, toggling the
    // collapse flag while in Horizon left the rail at 60px with 260px content inside.
    if (hideTabs || cameFromTopbar) {
      setIsCollapsed(targetCollapsed)
      setSpacerCollapsed(targetCollapsed)
      return
    }

    if (targetCollapsed) {
      // Collapsing: page reclaims the space immediately (hidden under the still-wide sidebar),
      // content keeps its full layout until the shrink animation ends.
      setSpacerCollapsed(true)
    } else {
      // Expanding: render full content right away (clipped while the sidebar grows),
      // the page gives up the space when the animation ends.
      setIsCollapsed(false)
    }
    // Safety net: onAnimationComplete may not fire (animation interrupted / no-op target)
    const t = window.setTimeout(finishToggle, 260)
    return () => window.clearTimeout(t)
  }, [targetCollapsed, hideTabs, finishToggle])

  const handleWidthAnimationComplete = finishToggle

  // Private tab: in-memory session, no history, wiped when the last private tab closes
  const handleNewPrivateTab = React.useCallback(async () => {
    // Private browsing happens in its own window (Edge InPrivate style)
    if (!isPrivateWindow) return openPrivateWindow()
    try {
      await createTab({ url: PRIVATE_START_URL, title: PRIVATE_START_TITLE, isPrivate: true })
      toast('Private tab opened', { description: 'Nothing from this tab is saved after you close it.' })
    } catch {
      toast.error('Could not open a private tab')
    }
  }, [createTab])

  React.useEffect(() => {
    const onNewPrivate = () => void handleNewPrivateTab()
    window.addEventListener('tct:new-private-tab', onNewPrivate)
    return () => window.removeEventListener('tct:new-private-tab', onNewPrivate)
  }, [handleNewPrivateTab])

  const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>(undefined)
  React.useEffect(() => {
    const handleOpenSettings = (e: Event) => {
      setSettingsInitialTab((e as CustomEvent).detail?.tab)
      setSettingsOpen(true)
    }
    window.addEventListener('open-settings', handleOpenSettings)
    return () => window.removeEventListener('open-settings', handleOpenSettings)
  }, [])

  const handleTogglePin = async (tab: Tab) => {
    if (tab.isPrivate) {
      toast('Private tabs cannot be pinned', { description: 'Pinned tabs are restored after restart.' })
      return
    }
    const nextPinned = !tab.isPinned
    await updateTab(tab.id, { isPinned: nextPinned })
    toast.success(nextPinned ? 'Tab pinned (always saved across restarts)' : 'Tab unpinned')
  }

  const handleDuplicateTab = async (tab: Tab) => {
    if (activeSpaceId) {
      await createTab({
        spaceId: activeSpaceId,
        url: tab.url,
        title: tab.title,
        favicon: tab.favicon
      })
    }
  }

  // Top-bar tab layout: tabs live in <TabStrip />; keep only the dialogs and listeners
  if (hideTabs) {
    return (
      <>
        {/* Invisible: provides the create / edit space dialogs used by the tab strip's space menu */}
        <div className="hidden">
          <SpaceSwitcher collapsed />
        </div>
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} initialTab={settingsInitialTab} />
      </>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      {/* Layout spacer: the only element whose width affects the webview area */}
      <div className="relative h-full shrink-0" style={{ width: spacerCollapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_EXPANDED_W }}>
      <motion.aside
        initial={false}
        animate={{ width: targetCollapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_EXPANDED_W }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        onAnimationComplete={handleWidthAnimationComplete}
        style={{ willChange: 'width', contain: 'strict' }}
        className="absolute inset-y-0 left-0 overflow-hidden bg-sidebar text-sidebar-foreground border-r border-sidebar-border select-none z-30"
      >
      {/* Fixed-width content: does not re-layout while the aside width animates */}
      <motion.div
        initial={enterFromTopbar ? { opacity: 0, x: -12 } : false}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
        className="h-full flex flex-col"
        style={{ width: (isCollapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_EXPANDED_W) - 1 }}
      >
        {/* Space Switcher Top Header */}
        <div className={`pt-2 ${isCollapsed ? 'px-0 flex flex-col items-center' : 'px-1'}`}>
          {isPrivateWindow ? <PrivateWindowBadge collapsed={isCollapsed} /> : isMainWindow ? <SpaceSwitcher collapsed={isCollapsed} /> : null}
        </div>

        {/* Current Space Title & Active Indicator */}
        {!isCollapsed && activeSpace && (
          <div className="flex items-center justify-between px-3.5 py-1 text-xs font-semibold">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2 h-2 rounded-full shrink-0 shadow-xs"
                style={{ backgroundColor: activeSpace.color }}
              />
              <span className="truncate text-xs text-sidebar-foreground font-semibold tracking-tight">
                {activeSpace.name}
              </span>
              {activeSpace.isolated && (
                <span title="Separate profile: own logins and cookies" className="shrink-0 flex">
                  <UserRound className="w-3 h-3 text-primary" />
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] tracking-normal font-medium text-muted-foreground">
                {tabs.length} {tabs.length === 1 ? 'tab' : 'tabs'}
              </span>
              <TabTidyPopover collapsed={false} />
            </div>
          </div>
        )}

        <div className={`my-1.5 border-b border-sidebar-border ${isCollapsed ? 'w-7 mx-auto' : 'mx-2'}`} />

        {/* Scrollable Tab List */}
        <TabList
          tabs={tabs}
          activeTabId={activeTabId}
          accentColor={activeSpace?.color || settings?.accentColor || '#6366f1'}
          collapsed={isCollapsed}
          onSelectTab={setActiveTab}
          onCloseTab={removeTab}
          onTogglePin={handleTogglePin}
          onDuplicateTab={handleDuplicateTab}
          onNewTabToRight={(id) => createTabNextTo(id)}
          onReloadTab={() => window.dispatchEvent(new CustomEvent('tct:webview-reload'))}
          onCloseOthers={closeOtherTabs}
          onCloseToRight={closeTabsToRight}
        />

        {/* Bottom action: Settings (new tabs: + in the toolbar / tab list, Ctrl+T, ⋯ menu) */}
        <div className={`p-2 border-t border-sidebar-border ${isCollapsed ? 'flex flex-col items-center gap-1.5 px-0' : 'space-y-1'}`}>
          {/* Settings button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSettingsOpen(true)}
                className={
                  isCollapsed
                    ? 'w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors border border-transparent hover:border-sidebar-border'
                    : 'w-full flex items-center gap-2 py-1.5 px-3 rounded-xl hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors text-[13px] font-medium'
                }
              >
                <Settings className="w-4 h-4 shrink-0" />
                {!isCollapsed && <span>Settings</span>}
              </button>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right" sideOffset={10}>
                <p>Settings</p>
              </TooltipContent>
            )}
          </Tooltip>
        </div>

      </motion.div>
      </motion.aside>
      </div>
      {/* Settings Dialog (portaled; kept outside the clipped aside) */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} initialTab={settingsInitialTab} />
    </TooltipProvider>
  )
}
