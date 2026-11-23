import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Settings, History, Download, Star, EyeOff } from 'lucide-react'
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
import { api } from '@/lib/ipc'
import { modKey } from '@/lib/platform'
import type { Tab } from '@/types/api'

const SIDEBAR_EXPANDED_W = 260
const SIDEBAR_COLLAPSED_W = 60

export const Sidebar: React.FC = () => {
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

  React.useLayoutEffect(() => {
    if (targetCollapsed) {
      // Collapsing: page reclaims the space immediately (hidden under the still-wide sidebar),
      // content keeps its full layout until the shrink animation ends.
      setSpacerCollapsed(true)
    } else {
      // Expanding: render full content right away (clipped while the sidebar grows),
      // the page gives up the space when the animation ends.
      setIsCollapsed(false)
    }
  }, [targetCollapsed])

  const handleWidthAnimationComplete = () => {
    if (targetCollapsed) {
      setIsCollapsed(true)
    } else {
      setSpacerCollapsed(false)
    }
  }

  // Private tab: in-memory session, no history, wiped when the last private tab closes
  const handleNewPrivateTab = React.useCallback(async () => {
    try {
      await createTab({ url: 'https://duckduckgo.com/', title: 'Private Tab', isPrivate: true })
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

  // Active downloads count for the badge on the Downloads button
  const [activeDownloads, setActiveDownloads] = useState(0)
  React.useEffect(() => {
    const refresh = () => {
      api.downloads
        ?.list()
        .then((list) => setActiveDownloads(list?.filter((d) => d.state === 'progressing').length ?? 0))
        .catch(() => {})
    }
    refresh()
    const unsubs = [api.downloads?.onStarted?.(refresh), api.downloads?.onCompleted?.(refresh), api.downloads?.onFailed?.(refresh)]
    return () => unsubs.forEach((u) => u?.())
  }, [])

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

  const handleOpenCommandBar = () => {
    setCommandBarOpen(true, '', 'new-tab')
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
      <div
        className="h-full flex flex-col"
        style={{ width: (isCollapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_EXPANDED_W) - 1 }}
      >
        {/* Space Switcher Top Header */}
        <div className={`pt-2 ${isCollapsed ? 'px-0 flex flex-col items-center' : 'px-1'}`}>
          <SpaceSwitcher collapsed={isCollapsed} />
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

        {/* Bottom Actions: New Tab + Settings Gear */}
        <div className={`p-2 border-t border-sidebar-border ${isCollapsed ? 'flex flex-col items-center gap-1.5 px-0' : 'space-y-1'}`}>
          {/* + New Tab button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleOpenCommandBar}
                className={
                  isCollapsed
                    ? 'w-9 h-9 rounded-xl flex items-center justify-center bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 hover:border-primary/50 shadow-sm transition-all hover:scale-105 active:scale-95'
                    : 'w-full flex items-center gap-2 py-2 px-3 rounded-xl bg-sidebar-accent hover:bg-sidebar-accent/80 text-sidebar-foreground transition-colors text-[13.5px] font-semibold border border-sidebar-border shadow-2xs'
                }
              >
                <Plus className="w-4 h-4 shrink-0 text-primary" />
                {!isCollapsed && <span>New Tab</span>}
              </button>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right" sideOffset={10}>
                <p>New Tab ({modKey}+T)</p>
              </TooltipContent>
            )}
          </Tooltip>

          {/* New Private Tab button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => void handleNewPrivateTab()}
                className={
                  isCollapsed
                    ? 'w-9 h-9 rounded-xl flex items-center justify-center text-violet-500 hover:bg-violet-500/10 transition-colors border border-transparent hover:border-violet-500/30'
                    : 'w-full flex items-center gap-2 py-1.5 px-3 rounded-xl hover:bg-violet-500/10 text-muted-foreground hover:text-sidebar-foreground transition-colors text-[13px] font-medium'
                }
              >
                <EyeOff className="w-4 h-4 shrink-0 text-violet-500" />
                {!isCollapsed && <span>New Private Tab</span>}
              </button>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right" sideOffset={10}>
                <p>New Private Tab (Alt+Shift+N)</p>
              </TooltipContent>
            )}
          </Tooltip>

          {/* History button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-history'))}
                className={
                  isCollapsed
                    ? 'w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors border border-transparent hover:border-sidebar-border'
                    : 'w-full flex items-center gap-2 py-1.5 px-3 rounded-xl hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors text-[13px] font-medium'
                }
              >
                <History className="w-4 h-4 shrink-0" />
                {!isCollapsed && <span>History</span>}
              </button>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right" sideOffset={10}>
                <p>History ({modKey}+H)</p>
              </TooltipContent>
            )}
          </Tooltip>

          {/* Downloads button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-downloads'))}
                className={
                  isCollapsed
                    ? 'w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors border border-transparent hover:border-sidebar-border'
                    : 'w-full flex items-center gap-2 py-1.5 px-3 rounded-xl hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors text-[13px] font-medium'
                }
              >
                <span className="relative shrink-0 flex">
                  <Download className="w-4 h-4" />
                  {activeDownloads > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold leading-[14px] text-center">
                      {activeDownloads}
                    </span>
                  )}
                </span>
                {!isCollapsed && <span>Downloads</span>}
                {!isCollapsed && activeDownloads > 0 && (
                  <span className="ml-auto text-[10.5px] text-primary font-semibold">{activeDownloads} active</span>
                )}
              </button>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right" sideOffset={10}>
                <p>Downloads ({modKey}+J)</p>
              </TooltipContent>
            )}
          </Tooltip>

          {/* Bookmarks & Reading List button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-bookmarks'))}
                className={
                  isCollapsed
                    ? 'w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors border border-transparent hover:border-sidebar-border'
                    : 'w-full flex items-center gap-2 py-1.5 px-3 rounded-xl hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors text-[13px] font-medium'
                }
              >
                <Star className="w-4 h-4 shrink-0" />
                {!isCollapsed && <span>Bookmarks</span>}
              </button>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right" sideOffset={10}>
                <p>Bookmarks & Reading List</p>
              </TooltipContent>
            )}
          </Tooltip>

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

        {/* Settings Dialog */}
      </div>
      </motion.aside>
      </div>
      {/* Settings Dialog (portaled; kept outside the clipped aside) */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} initialTab={settingsInitialTab} />
    </TooltipProvider>
  )
}
