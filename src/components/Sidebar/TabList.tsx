import React, { useMemo, useState } from 'react'
import { Plus, FolderPlus } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { modKey } from '@/lib/platform'
import { openNewTab } from '@/lib/startPage'
import { groupById } from '@/lib/tabGroups'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useTabGroups } from '@/hooks/useTabGroups'
import { PinnedTabs } from './PinnedTabs'
import { TabItem } from './TabItem'
import { TabGroupNode } from './TabGroupNode'
import { GROUP_DRAG_TYPE, TAB_DRAG_TYPE, TabGroupContext, type TabGroupActions } from './TabGroupContext'
import { ReorderSlot, useDraggingTabId, useClearOnDragEnd, type DropPosition } from './TabReorder'
import { api } from '@/lib/ipc'
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
  const activeSpaceId = useBrowserStore((s) => s.activeSpaceId)
  // The other tab of a visible split view is highlighted too
  const splitTabId = useBrowserStore((s) => s.splitTabId)
  const { groups, createGroup, moveTabToGroup, moveGroup } = useTabGroups(activeSpaceId, true)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [ungroupDragOver, setUngroupDragOver] = useState(false)

  const byId = useMemo(() => groupById(groups), [groups])
  // Tabs whose group no longer exists are shown as ungrouped
  const isGrouped = (t: Tab) => !!t.groupId && byId.has(t.groupId)
  const topGroups = useMemo(
    () => groups.filter((g) => !g.parentId || !byId.has(g.parentId)).sort((a, b) => a.order - b.order),
    [groups, byId]
  )
  const pinnedUngrouped = tabs.filter((t) => t.isPinned && !isGrouped(t))
  const unpinnedUngrouped = tabs.filter((t) => !t.isPinned && !isGrouped(t))

  const groupActions: TabGroupActions = useMemo(
    () => ({ groups, createGroup, moveTabToGroup, editingGroupId, setEditingGroupId }),
    [groups, createGroup, moveTabToGroup, editingGroupId]
  )

  // Drag a tab onto another tab to move it there
  const draggingId = useDraggingTabId()
  const draggingTab = draggingId ? tabs.find((t) => t.id === draggingId) ?? null : null
  useClearOnDragEnd(ungroupDragOver, setUngroupDragOver)

  const reorderTab = (dragId: string, targetId: string, position: DropPosition) => {
    const store = useBrowserStore.getState()
    const spaceId = activeSpaceId
    if (!spaceId) return
    const all = [...(store.tabsBySpace[spaceId] || [])]
    const dragged = all.find((t) => t.id === dragId)
    const target = all.find((t) => t.id === targetId)
    if (!dragged || !target || dragged.id === target.id) return

    // Dropping next to a tab in another group moves it into that group (or out of its group)
    const targetGroup = target.groupId && byId.has(target.groupId) ? target.groupId : null
    const draggedGroup = dragged.groupId && byId.has(dragged.groupId) ? dragged.groupId : null
    if (targetGroup !== draggedGroup) void moveTabToGroup(dragId, targetGroup)

    const rest = all.filter((t) => t.id !== dragId)
    const at = rest.findIndex((t) => t.id === targetId) + (position === 'after' ? 1 : 0)
    const next = [...rest.slice(0, at), { ...dragged, groupId: targetGroup }, ...rest.slice(at)].map((t, order) => ({
      ...t,
      order
    }))
    store.setTabsForSpace(spaceId, next)
    api.tabs.reorder(spaceId, next.map((t) => t.id)).catch((err) => console.error('[TabList] Reorder failed:', err))
  }

  const renderTab = (tab: Tab) => (
    <ReorderSlot key={tab.id} tab={tab} draggingTab={draggingTab} onReorder={reorderTab}>
      {renderTabItem(tab)}
    </ReorderSlot>
  )

  const renderTabItem = (tab: Tab) => (
    <TabItem
      key={tab.id}
      tab={tab}
      isActive={tab.id === activeTabId || tab.id === splitTabId}
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
  )

  const handleNewGroup = async () => {
    const created = await createGroup({ name: 'New Group' })
    if (created) setEditingGroupId(created.id)
  }

  // Dropping a tab or group on the ungrouped area takes it out of its group
  const acceptsDrop = (e: React.DragEvent) =>
    e.dataTransfer.types.includes(TAB_DRAG_TYPE) || e.dataTransfer.types.includes(GROUP_DRAG_TYPE)
  const ungroupDropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (!acceptsDrop(e)) return
      // Only a tab that IS in a group can be removed from one: no highlight for ungrouped tabs
      if (draggingTab && !draggingTab.groupId) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (!ungroupDragOver) setUngroupDragOver(true)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setUngroupDragOver(false)
    },
    onDrop: (e: React.DragEvent) => {
      setUngroupDragOver(false)
      if (!acceptsDrop(e)) return
      e.preventDefault()
      const tabId = e.dataTransfer.getData(TAB_DRAG_TYPE)
      const groupId = e.dataTransfer.getData(GROUP_DRAG_TYPE)
      if (tabId) {
        const tab = tabs.find((t) => t.id === tabId)
        if (tab?.groupId) void moveTabToGroup(tabId, null)
      } else if (groupId && byId.get(groupId)?.parentId) {
        void moveGroup(groupId, null)
      }
    }
  }

  const isEmpty = tabs.length === 0 && groups.length === 0

  return (
    <TabGroupContext.Provider value={groupActions}>
      <ScrollArea
        className="flex-1 w-full min-w-0"
        data-lenis-prevent
        onDoubleClick={(e) => {
          // Empty space below the tabs
          if (!(e.target as Element).closest('[data-orbit-tab], button, input, a')) void openNewTab()
        }}
      >
        <div className={`w-full min-w-0 ${collapsed ? 'px-1' : 'px-2'}`}>
          {/* Pinned tabs section (pinned tabs inside a group render with their group) */}
          <PinnedTabs
            tabs={pinnedUngrouped}
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
            renderTab={renderTab}
          />

          {/* Nested tab groups */}
          {topGroups.length > 0 && (
            <div className={`space-y-0.5 mb-1 w-full min-w-0 ${collapsed ? 'flex flex-col items-center gap-1' : ''}`}>
              {topGroups.map((group) => (
                <TabGroupNode
                  key={group.id}
                  group={group}
                  depth={1}
                  tabs={tabs}
                  byId={byId}
                  activeTabId={activeTabId}
                  collapsedSidebar={collapsed}
                  renderTab={renderTab}
                />
              ))}
            </div>
          )}

          {/* Normal unpinned, ungrouped tabs (also the drop zone for "remove from group") */}
          <div
            {...ungroupDropProps}
            className={`space-y-0.5 pb-4 w-full min-w-0 rounded-xl transition-colors ${
              collapsed ? 'flex flex-col items-center gap-1' : ''
            } ${ungroupDragOver ? 'bg-primary/10 ring-1 ring-primary/40' : ''}`}
          >
            {!collapsed && (
              <div className="flex items-center justify-end px-1 h-5">
                <button
                  onClick={() => void handleNewGroup()}
                  className="flex items-center gap-1 text-[10.5px] font-medium text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded-md hover:bg-tab-hover transition-colors"
                  title="New tab group (drag tabs onto it)"
                >
                  <FolderPlus className="w-3 h-3" />
                  <span>New group</span>
                </button>
              </div>
            )}
            {isEmpty ? (
              collapsed ? (
                <div className="flex flex-col items-center justify-center py-4">
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => void openNewTab()}
                          className="w-9 h-9 rounded-xl border border-dashed border-border hover:border-primary/50 text-muted-foreground hover:text-primary flex items-center justify-center transition-colors group"
                          aria-label="Open new tab"
                        >
                          <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={10}>
                        <p>No tabs open • Click to open ({modKey}+T)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              ) : (
                <div className="text-center py-6 px-2 text-muted-foreground text-xs">No open tabs</div>
              )
            ) : (
              unpinnedUngrouped.map(renderTab)
            )}
            {ungroupDragOver && !collapsed && (
              <div className="text-center text-[11px] text-primary py-1.5">Drop to remove from group</div>
            )}
          </div>
        </div>
      </ScrollArea>
    </TabGroupContext.Provider>
  )
}
