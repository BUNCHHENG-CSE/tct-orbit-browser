import React from 'react'
import { Pin } from 'lucide-react'
import { TabItem } from './TabItem'
import type { Tab } from '@/types/api'

interface PinnedTabsProps {
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

export const PinnedTabs: React.FC<PinnedTabsProps> = ({
  tabs,
  activeTabId,
  accentColor,
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
  const pinnedTabs = tabs.filter((t) => t.isPinned)

  if (pinnedTabs.length === 0) return null

  return (
    <div className="mb-2">
      {!collapsed && (
        <div className="flex items-center gap-1.5 px-3 py-1 mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          <Pin className="w-2.5 h-2.5" />
          <span>Pinned</span>
        </div>
      )}
      <div className={`space-y-0.5 w-full min-w-0 ${collapsed ? 'flex flex-col items-center gap-1' : ''}`}>
        {pinnedTabs.map((tab) => (
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
        ))}
      </div>
      <div className={`my-2 border-b border-sidebar-border ${collapsed ? 'w-7 mx-auto' : 'mx-2'}`} />
    </div>
  )
}
