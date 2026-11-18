import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Settings, ChevronLeft, ChevronRight } from 'lucide-react'
import { SpaceSwitcher } from './SpaceSwitcher'
import { TabList } from './TabList'
import { SettingsDialog } from '../SettingsModal/SettingsDialog'
import { useSpaces } from '@/hooks/useSpaces'
import { useTabs } from '@/hooks/useTabs'
import { useSettings } from '@/hooks/useSettings'
import { useBrowserStore } from '@/store/useBrowserStore'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { modKey } from '@/lib/platform'
import type { Tab } from '@/types/api'

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
  const isCollapsed = settings?.sidebarCollapsed ?? false

  React.useEffect(() => {
    const handleOpenSettings = () => setSettingsOpen(true)
    window.addEventListener('open-settings', handleOpenSettings)
    return () => window.removeEventListener('open-settings', handleOpenSettings)
  }, [])

  const handleTogglePin = async (tab: Tab) => {
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
      <motion.aside
        animate={{ width: isCollapsed ? 60 : 260 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="h-full flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border select-none relative z-20 shrink-0"
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
            <span className="text-[11px] tracking-normal font-medium text-muted-foreground shrink-0">
              {tabs.length} {tabs.length === 1 ? 'tab' : 'tabs'}
            </span>
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
              <TooltipContent side="right">
                <p>New Tab ({modKey}+T)</p>
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
              <TooltipContent side="right">
                <p>Settings</p>
              </TooltipContent>
            )}
          </Tooltip>
        </div>

        {/* Settings Dialog */}
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </motion.aside>
    </TooltipProvider>
  )
}
