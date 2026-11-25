import React, { useContext, useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Palette,
  Plus,
  Link2,
  Ungroup,
  X,
  Check
} from 'lucide-react'
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useTabGroups } from '@/hooks/useTabGroups'
import { api } from '@/lib/ipc'
import { SEARCH_ENGINES, type SearchEngineId } from '@/lib/searchEngines'
import { START_PAGE_TITLE, START_PAGE_URL } from '@/lib/startPage'
import { GROUP_COLORS, MAX_GROUP_DEPTH, resolveGroupColor, tabsInGroupTree } from '@/lib/tabGroups'
import { GROUP_DRAG_TYPE, TAB_DRAG_TYPE, TabGroupContext } from './TabGroupContext'
import { useClearOnDragEnd } from './TabReorder'
import type { Tab, TabGroup } from '@/types/api'

interface TabGroupNodeProps {
  group: TabGroup
  depth: number
  tabs: Tab[]
  byId: Map<string, TabGroup>
  activeTabId: string | null
  collapsedSidebar: boolean
  renderTab: (tab: Tab) => React.ReactNode
}

export const TabGroupNode: React.FC<TabGroupNodeProps> = ({
  group,
  depth,
  tabs,
  byId,
  activeTabId,
  collapsedSidebar,
  renderTab
}) => {
  const ctx = useContext(TabGroupContext)
  const { groups, updateGroup, moveGroup, removeGroup } = useTabGroups(group.spaceId)
  const [dragOver, setDragOver] = useState(false)
  useClearOnDragEnd(dragOver, setDragOver)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(group.name)
  const inputRef = useRef<HTMLInputElement>(null)

  const color = resolveGroupColor(group, byId)
  const childGroups = groups.filter((g) => g.parentId === group.id).sort((a, b) => a.order - b.order)
  const directTabs = tabs.filter((t) => t.groupId === group.id).sort((a, b) => a.order - b.order)
  const allTabs = tabsInGroupTree(group.id, groups, tabs)
  const containsActive = allTabs.some((t) => t.id === activeTabId)
  const canNest = depth < MAX_GROUP_DEPTH

  // A group created a moment ago opens straight into rename mode
  useEffect(() => {
    if (ctx?.editingGroupId === group.id) {
      setNameDraft(group.name)
      setRenaming(true)
      ctx.setEditingGroupId(null)
    }
  }, [ctx, group.id, group.name])

  useEffect(() => {
    if (renaming) setTimeout(() => inputRef.current?.select(), 10)
  }, [renaming])

  const commitRename = () => {
    setRenaming(false)
    const next = nameDraft.trim()
    if (next && next !== group.name) void updateGroup(group.id, { name: next })
  }

  const toggleCollapsed = () => void updateGroup(group.id, { collapsed: !group.collapsed })

  const newTabInGroup = async () => {
    const store = useBrowserStore.getState()
    const engine = (store.settings?.defaultSearchEngine as SearchEngineId) || 'duckduckgo'
    const useStart = store.settings?.newTabPage !== 'command-bar'
    try {
      const tab = await api.tabs.create({
        spaceId: group.spaceId,
        url: useStart ? START_PAGE_URL : (SEARCH_ENGINES[engine] || SEARCH_ENGINES.duckduckgo).homeUrl,
        title: useStart ? START_PAGE_TITLE : 'New Tab',
        groupId: group.id
      })
      store.addTabToStore(group.spaceId, tab, directTabs[directTabs.length - 1]?.id ?? null, true)
      if (group.collapsed) void updateGroup(group.id, { collapsed: false })
    } catch (err) {
      console.error('[TabGroup] New tab failed:', err)
    }
  }

  const newNestedGroup = async () => {
    const created = await ctx?.createGroup({ name: 'New Group', parentId: group.id })
    if (created) {
      ctx?.setEditingGroupId(created.id)
      if (group.collapsed) void updateGroup(group.id, { collapsed: false })
    }
  }

  // --- Drag & drop: drop a tab to add it, drop a group to nest it ---
  const accepts = (e: React.DragEvent) =>
    e.dataTransfer.types.includes(TAB_DRAG_TYPE) || e.dataTransfer.types.includes(GROUP_DRAG_TYPE)

  const handleDrop = (e: React.DragEvent) => {
    if (!accepts(e)) return
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const tabId = e.dataTransfer.getData(TAB_DRAG_TYPE)
    const groupId = e.dataTransfer.getData(GROUP_DRAG_TYPE)
    if (tabId) void ctx?.moveTabToGroup(tabId, group.id)
    else if (groupId && groupId !== group.id) void moveGroup(groupId, group.id)
  }

  const header = (
    <div
      draggable={!renaming}
      onDragStart={(e) => {
        e.stopPropagation()
        e.dataTransfer.setData(GROUP_DRAG_TYPE, group.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(e) => {
        if (!accepts(e)) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        if (!dragOver) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !renaming && toggleCollapsed()}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (!collapsedSidebar) {
          setNameDraft(group.name)
          setRenaming(true)
        }
      }}
      className={
        `group/gh flex items-center gap-1.5 h-8 pl-1.5 pr-2 rounded-lg text-[12.5px] font-semibold cursor-pointer select-none transition-colors w-full min-w-0 ${
              dragOver ? 'bg-primary/15 ring-1 ring-primary/50' : 'hover:bg-tab-hover'
            } ${group.collapsed && containsActive ? 'bg-tab-hover/60' : ''}`
      }
    >
      {(
        <>
          <ChevronRight
            className={`w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ${group.collapsed ? '' : 'rotate-90'}`}
          />
          {group.collapsed ? (
            <Folder className="w-3.5 h-3.5 shrink-0" style={{ color }} />
          ) : (
            <FolderOpen className="w-3.5 h-3.5 shrink-0" style={{ color }} />
          )}
          {renaming ? (
            <input
              ref={inputRef}
              value={nameDraft}
              maxLength={80}
              onChange={(e) => setNameDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={commitRename}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setRenaming(false)
              }}
              className="flex-1 min-w-0 bg-background border border-primary/50 rounded-md px-1.5 py-0.5 text-[12.5px] font-semibold text-foreground outline-none"
            />
          ) : (
            <span className="flex-1 min-w-0 truncate text-sidebar-foreground">{group.name}</span>
          )}
          {group.openLinksInGroup && !renaming && (
            <span title="Links open in this group">
              <Link2 className="w-3 h-3 shrink-0 text-muted-foreground" />
            </span>
          )}
          {!renaming && (
            <>
              <span className="text-[10.5px] font-medium text-muted-foreground tabular-nums group-hover/gh:hidden">
                {allTabs.length}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  void newTabInGroup()
                }}
                className="hidden group-hover/gh:flex w-5 h-5 rounded-md items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground"
                title="New tab in this group"
                aria-label="New tab in this group"
              >
                <Plus className="w-3 h-3" />
              </button>
            </>
          )}
        </>
      )}
    </div>
  )

  const menu = (
        <ContextMenuContent className="w-56 bg-popover text-popover-foreground border border-border shadow-2xl rounded-xl p-1 z-50">
          <ContextMenuItem onClick={() => void newTabInGroup()} className="text-xs rounded-lg cursor-pointer">
            <Plus className="w-3.5 h-3.5 mr-2 text-primary" />
            <span>New tab in group</span>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canNest}
            onClick={() => void newNestedGroup()}
            className="text-xs rounded-lg cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5 mr-2" />
            <span>New group inside</span>
            {!canNest && <span className="ml-auto text-[10px] text-muted-foreground">max depth</span>}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              setNameDraft(group.name)
              setRenaming(true)
            }}
            className="text-xs rounded-lg cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5 mr-2" />
            <span>Rename</span>
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger className="text-xs rounded-lg cursor-pointer">
              <Palette className="w-3.5 h-3.5 mr-2" />
              <span>Color</span>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="p-2 bg-popover border border-border rounded-xl shadow-2xl">
              <div className="grid grid-cols-5 gap-1.5">
                {GROUP_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => void updateGroup(group.id, { color: c })}
                    className="w-6 h-6 rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  >
                    {group.color === c && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                ))}
              </div>
              {group.parentId && (
                <button
                  onClick={() => void updateGroup(group.id, { color: null })}
                  className={`mt-2 w-full text-left text-[11px] px-2 py-1 rounded-md hover:bg-accent ${
                    group.color === null ? 'text-primary font-semibold' : 'text-muted-foreground'
                  }`}
                >
                  {group.color === null ? '✓ ' : ''}Same as parent group
                </button>
              )}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator className="my-1 bg-border" />
          <ContextMenuCheckboxItem
            checked={group.openLinksInGroup}
            onCheckedChange={(v) => void updateGroup(group.id, { openLinksInGroup: !!v })}
            className="text-xs rounded-lg cursor-pointer"
          >
            Open links in this group
          </ContextMenuCheckboxItem>
          {group.parentId && (
            <ContextMenuItem onClick={() => void moveGroup(group.id, null)} className="text-xs rounded-lg cursor-pointer">
              <FolderOpen className="w-3.5 h-3.5 mr-2" />
              <span>Move to top level</span>
            </ContextMenuItem>
          )}
          <ContextMenuSeparator className="my-1 bg-border" />
          <ContextMenuItem onClick={() => void removeGroup(group.id, false)} className="text-xs rounded-lg cursor-pointer">
            <Ungroup className="w-3.5 h-3.5 mr-2" />
            <span>Ungroup</span>
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => void removeGroup(group.id, true)}
            className="text-xs rounded-lg cursor-pointer text-destructive hover:bg-destructive/10"
          >
            <X className="w-3.5 h-3.5 mr-2" />
            <span>
              Close group{allTabs.length > 0 ? ` (${allTabs.length} tab${allTabs.length === 1 ? '' : 's'})` : ''}
            </span>
          </ContextMenuItem>
        </ContextMenuContent>
  )

  // --- Collapsed (icon-only) sidebar: folder tiles ---
  if (collapsedSidebar) {
    const renameBox = renaming && (
      <input
        ref={inputRef}
        value={nameDraft}
        maxLength={80}
        onChange={(e) => setNameDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={commitRename}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') commitRename()
          if (e.key === 'Escape') setRenaming(false)
        }}
        className="absolute left-full top-1/2 -translate-y-1/2 ml-2 w-44 z-50 bg-popover border border-primary/50 rounded-lg px-2 py-1 text-xs font-semibold text-foreground outline-none shadow-xl"
      />
    )
    const dropProps = {
      draggable: !renaming,
      onDragStart: (e: React.DragEvent) => {
        e.stopPropagation()
        e.dataTransfer.setData(GROUP_DRAG_TYPE, group.id)
        e.dataTransfer.effectAllowed = 'move' as const
      },
      onDragOver: (e: React.DragEvent) => {
        if (!accepts(e)) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        if (!dragOver) setDragOver(true)
      },
      onDragLeave: () => setDragOver(false),
      onDrop: handleDrop
    }
    const tip = `${group.name} · ${allTabs.length} tab${allTabs.length === 1 ? '' : 's'}`

    // Folder icon in the group's color; when open, a rail in the same color runs down the left
    // edge past the group's last tab, so it's clear which tabs belong to which group
    const showRail = !group.collapsed && (childGroups.length > 0 || directTabs.length > 0)
    return (
      <div className="relative w-full flex flex-col items-center gap-1">
        {showRail && (
          <span
            aria-hidden
            className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full pointer-events-none"
            style={{ backgroundColor: color, opacity: depth > 1 ? 0.55 : 0.9 }}
          />
        )}
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              {...dropProps}
              onClick={() => !renaming && toggleCollapsed()}
              title={tip}
              className={`w-9 h-8 rounded-xl flex items-center justify-center cursor-pointer transition-all hover:brightness-125 ${
                dragOver ? 'ring-2 ring-primary' : ''
              }`}
              style={{ backgroundColor: `${color}${group.collapsed ? '1a' : '26'}` }}
            >
              {group.collapsed ? (
                <Folder className="w-4 h-4" style={{ color }} />
              ) : (
                <FolderOpen className="w-4 h-4" style={{ color }} />
              )}
            </div>
          </ContextMenuTrigger>
          {menu}
        </ContextMenu>
        {renameBox}
        {!group.collapsed && (
          <>
            {childGroups.map((child) => (
              <TabGroupNode
                key={child.id}
                group={child}
                depth={depth + 1}
                tabs={tabs}
                byId={byId}
                activeTabId={activeTabId}
                collapsedSidebar
                renderTab={renderTab}
              />
            ))}
            {directTabs.map((tab) => (
              <React.Fragment key={tab.id}>{renderTab(tab)}</React.Fragment>
            ))}
          </>
        )}
        {/* Keep the active tab visible even when its folder is closed */}
        {group.collapsed &&
          containsActive &&
          allTabs
            .filter((t) => t.id === activeTabId)
            .map((tab) => <React.Fragment key={tab.id}>{renderTab(tab)}</React.Fragment>)}
      </div>
    )
  }

  return (
    <div className="w-full min-w-0">
      <ContextMenu>
        <ContextMenuTrigger asChild>{header}</ContextMenuTrigger>
        {menu}
      </ContextMenu>

      {!group.collapsed && (childGroups.length > 0 || directTabs.length > 0) && (
        <div
          className={
            collapsedSidebar
              ? 'flex flex-col items-center gap-1 mt-0.5'
              : 'ml-[13px] pl-1.5 mt-0.5 space-y-0.5 border-l-2 min-w-0'
          }
          style={collapsedSidebar ? undefined : { borderColor: `${color}55` }}
        >
          {childGroups.map((child) => (
            <TabGroupNode
              key={child.id}
              group={child}
              depth={depth + 1}
              tabs={tabs}
              byId={byId}
              activeTabId={activeTabId}
              collapsedSidebar={collapsedSidebar}
              renderTab={renderTab}
            />
          ))}
          {directTabs.map((tab) => (
            <React.Fragment key={tab.id}>{renderTab(tab)}</React.Fragment>
          ))}
        </div>
      )}

      {/* Collapsed group still shows its active tab, so you never lose track of where you are */}
      {group.collapsed && containsActive && (
        <div className={collapsedSidebar ? 'flex flex-col items-center mt-0.5' : 'ml-[13px] pl-1.5 mt-0.5 border-l-2 min-w-0'} style={collapsedSidebar ? undefined : { borderColor: `${color}55` }}>
          {allTabs.filter((t) => t.id === activeTabId).map((tab) => (
            <React.Fragment key={tab.id}>{renderTab(tab)}</React.Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
