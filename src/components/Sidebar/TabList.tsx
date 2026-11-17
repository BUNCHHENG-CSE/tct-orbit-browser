import React from 'react'
import { Plus } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { modKey } from '@/lib/platform'
import { useBrowserStore } from '@/store/useBrowserStore'
import { PinnedTabs } from './PinnedTabs'
import { TabItem } from './TabItem'
import type { Tab } from '@/types/api'

interface TabListProps {
  tabs: Tab[]
  activeTabId: string | null
  accentColor?: string
  collapsed?: boolean
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onTogglePin: (tab: Tab) => void
  onDuplicateTab?: (tab: Tab) => void
  onNewTabToRight?: (tabId: string) => void
  onReloadTab?: (tabId: string) => void
  onCloseOthers?: (tabId: string) => void
  onCloseToRight?: (tabId: string) => void
}

export const TabList: React.FC<TabListProps> = ({
  tabs,
  activeTabId,
  accentColor = '#6366f1',
  collapsed = false,
  onSelectTab,
  onCloseTab,
  onTogglePin,
  onDuplicateTab,
  onNewTabToRight,
  onReloadTab,
  onCloseOthers,
  onCloseToRight
}) => {
  const unpinnedTabs = tabs.filter((t) => !t.isPinned)
  const setCommandBarOpen = useBrowserStore((s) => s.setCommandBarOpen)

  return (
    <ScrollArea className="flex-1 w-full min-w-0" data-lenis-prevent>
      <div className={`w-full min-w-0 ${collapsed ? 'px-1' : 'px-2'}`}>
        {/* Pinned tabs section */}
        <PinnedTabs
          tabs={tabs}
          activeTabId={activeTabId}
          accentColor={accentColor}
          collapsed={collapsed}
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
          onTogglePin={onTogglePin}
          onDuplicateTab={onDuplicateTab}
          onNewTabToRight={onNewTabToRight}
          onReloadTab={onReloadTab}
          onCloseOthers={onCloseOthers}
          onCloseToRight={onCloseToRight}
        />

        {/* Normal unpinned tabs */}
        <div className={`space-y-0.5 pb-4 w-full min-w-0 ${collapsed ? 'flex flex-col items-center gap-1' : ''}`}>
          {unpinnedTabs.length === 0 && tabs.filter((t) => t.isPinned).length === 0 ? (
            collapsed ? (
              <div className="flex flex-col items-center justify-center py-4">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setCommandBarOpen(true, '', 'new-tab')}
                        className="w-9 h-9 rounded-xl border border-dashed border-border hover:border-primary/50 text-muted-foreground hover:text-primary flex items-center justify-center transition-colors group"
                        aria-label="Open new tab"
                      >
                        <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>No tabs open • Click to open ({modKey}+T)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            ) : (
              <div className="text-center py-6 px-2 text-muted-foreground text-xs">
                No open tabs
              </div>
            )
          ) : (
            unpinnedTabs.map((tab) => (
              <TabItem
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                accentColor={accentColor}
                collapsed={collapsed}
                onSelect={() => onSelectTab(tab.id)}
                onClose={() => onCloseTab(tab.id)}
                onTogglePin={() => onTogglePin(tab)}
                onDuplicate={onDuplicateTab ? () => onDuplicateTab(tab) : undefined}
                onNewTabToRight={onNewTabToRight ? () => onNewTabToRight(tab.id) : undefined}
                onReload={onReloadTab ? () => onReloadTab(tab.id) : undefined}
                onCloseOthers={onCloseOthers ? () => onCloseOthers(tab.id) : undefined}
                onCloseToRight={onCloseToRight ? () => onCloseToRight(tab.id) : undefined}
              />
            ))
          )}
        </div>
      </div>
    </ScrollArea>
  )
}
