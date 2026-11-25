import React, { useEffect, useRef } from 'react'
import {
  Plus,
  X,
  Globe,
  Volume2,
  VolumeX,
  EyeOff,
  Pin,
  PinOff,
  Copy,
  RotateCw,
  ChevronDown,
  Check,
  PanelLeft,
  Settings,
  UserRound,
  SlidersHorizontal,
  AppWindow
} from 'lucide-react'
import { toast } from 'sonner'
import { useSpaces } from '@/hooks/useSpaces'
import { useTabs } from '@/hooks/useTabs'
import { useSettings } from '@/hooks/useSettings'
import { openNewTab, isStartPageUrl } from '@/lib/startPage'
import { modKey, isMac } from '@/lib/platform'
import { WindowControls } from '@/components/TitleBar/WindowControls'
import { BrandMark } from '@/components/TitleBar/BrandMark'
import { useDraggingTabId, useTabDrop, tabDragProps, droppedOutside, type DropPosition } from '@/components/Sidebar/TabReorder'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useSmartStore } from '@/store/useSmartStore'
import { SnoozeMenu } from '@/components/Smart/SnoozeMenu'
import { api } from '@/lib/ipc'
import { isPrivateWindow } from '@/lib/privateWindow'
import { canMoveToNewWindow, isExtraWindow, isMainWindow } from '@/lib/extraWindow'
import { moveTabToOtherWindow } from '@/lib/tabLifecycle'
import { useT } from '@/lib/i18n'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { Tab } from '@/types/api'

const menuItem = 'text-xs rounded-lg cursor-pointer gap-2'

/** Thin reading-progress line along the bottom of a tab (only while the page is partly read) */
const ReadingProgressLine: React.FC<{ tabId: string; color: string }> = ({ tabId, color }) => {
  const progress = useSmartStore((s) => s.progress[tabId])
  if (progress === undefined || progress <= 0.03 || progress >= 0.97) return null
  return (
    <span className="pointer-events-none absolute left-3 right-3 bottom-[3px] h-[2px] rounded-full bg-muted-foreground/10 overflow-hidden" aria-hidden>
      <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: `${color}b3` }} />
    </span>
  )
}
const emit = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }))

/** Inverted corners at the foot of the active tab, so it flows into the toolbar below */
const footCls = 'pointer-events-none absolute bottom-0 w-2 h-2'
const leftFoot = { background: 'radial-gradient(circle at 0 0, transparent 7.5px, hsl(var(--chrome-bg)) 8px)' }
const rightFoot = { background: 'radial-gradient(circle at 100% 0, transparent 7.5px, hsl(var(--chrome-bg)) 8px)' }

const Favicon: React.FC<{ tab: Tab; className?: string }> = ({ tab, className = 'w-4 h-4' }) => {
  if (tab.isPrivate && isStartPageUrl(tab.url)) return <EyeOff className={`${className} shrink-0 text-violet-500`} />
  return tab.favicon ? (
    <img src={tab.favicon} alt="" className={`${className} shrink-0 rounded-sm object-contain`} draggable={false} />
  ) : (
    <Globe className={`${className} shrink-0 text-muted-foreground`} />
  )
}

/** Per-tab drop zone for drag-to-reorder (render prop so the hook runs once per tab) */
const TabDrop: React.FC<{
  tab: Tab
  draggingTab: Tab | null
  onReorder: (dragId: string, targetId: string, position: DropPosition) => void
  children: (drop: ReturnType<typeof useTabDrop>) => React.ReactElement
}> = ({ tab, draggingTab, onReorder, children }) => children(useTabDrop({ tab, draggingTab, onReorder, orientation: 'horizontal' }))

/**
 * Top-bar tab layout (Settings → Tabs & Spaces → Tab layout: Horizon):
 *   [space ▾] [Space name · pinned icons] [tab | tab | active tab] [+] ···drag··· [– □ ×]
 * This row replaces the window's title bar; the toolbar (address bar) sits below it and the
 * active tab flows into it.
 */
export const TabStrip: React.FC = () => {
  const { spaces, activeSpace, activeSpaceId, setActive } = useSpaces()
  const { tabs, activeTabId, setActiveTab, removeTab, updateTab, createTab, closeOtherTabs, closeTabsToRight } =
    useTabs(activeSpaceId)
  const splitTabId = useBrowserStore((s) => s.splitTabId)
  const { updateSettings } = useSettings()
  const scrollRef = useRef<HTMLDivElement>(null)

  const pinned = tabs.filter((t) => t.isPinned)
  const normal = tabs.filter((t) => !t.isPinned)

  // Drag a tab left/right onto another tab to move it (pinned and normal tabs stay separate)
  const draggingId = useDraggingTabId()
  const draggingTab = draggingId ? tabs.find((t) => t.id === draggingId) ?? null : null
  const reorderTab = (dragId: string, targetId: string, position: DropPosition) => {
    if (!activeSpaceId) return
    const store = useBrowserStore.getState()
    const all = store.tabsBySpace[activeSpaceId] || []
    const dragged = all.find((t) => t.id === dragId)
    if (!dragged || dragId === targetId) return
    const rest = all.filter((t) => t.id !== dragId)
    const at = rest.findIndex((t) => t.id === targetId) + (position === 'after' ? 1 : 0)
    if (at < 0) return
    const next = [...rest.slice(0, at), dragged, ...rest.slice(at)].map((t, order) => ({ ...t, order }))
    store.setTabsForSpace(activeSpaceId, next)
    api.tabs.reorder(activeSpaceId, next.map((t) => t.id)).catch((err) => console.error('[TabStrip] Reorder failed:', err))
  }
  const accent = activeSpace?.color || '#6366f1'
  const t = useT()
  const movable = (tab: Tab) => canMoveToNewWindow(tab, !!activeSpace?.isolated)
  const tearOff = (tab: Tab) => (e: React.DragEvent) => {
    if (movable(tab) && !isExtraWindow && droppedOutside(e)) void moveTabToOtherWindow(tab.id)
  }

  // Keep the active tab in view
  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-tab-id="${activeTabId}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTabId])

  // Vertical mouse wheel scrolls the tabs sideways
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!scrollRef.current || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
    scrollRef.current.scrollLeft += e.deltaY
  }

  const togglePin = async (tab: Tab) => {
    if (tab.isPrivate) {
      toast('Private tabs cannot be pinned', { description: 'Pinned tabs are restored after restart.' })
      return
    }
    await updateTab(tab.id, { isPinned: !tab.isPinned })
  }

  const tabMenu = (tab: Tab, active: boolean) => (
    <ContextMenuContent className="w-52 rounded-xl p-1">
      <ContextMenuItem onClick={() => void togglePin(tab)} className={menuItem}>
        {tab.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
        {tab.isPinned ? 'Unpin tab' : 'Pin tab'}
      </ContextMenuItem>
      <ContextMenuItem onClick={() => void createTab({ url: tab.url, title: tab.title, favicon: tab.favicon })} className={menuItem}>
        <Copy className="w-3.5 h-3.5" /> Duplicate
      </ContextMenuItem>
      {active && (
        <ContextMenuItem onClick={() => emit('tct:webview-reload')} className={menuItem}>
          <RotateCw className="w-3.5 h-3.5" /> Reload
        </ContextMenuItem>
      )}
      {movable(tab) && (
        <ContextMenuItem onClick={() => void moveTabToOtherWindow(tab.id)} className={menuItem}>
          <AppWindow className="w-3.5 h-3.5" /> {t(isExtraWindow ? 'Move to main window' : 'Move to new window')}
        </ContextMenuItem>
      )}
      {!isExtraWindow && <SnoozeMenu tab={tab} onClose={() => removeTab(tab.id)} className={menuItem} />}
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => void removeTab(tab.id)} className={menuItem}>
        <X className="w-3.5 h-3.5" /> Close tab
      </ContextMenuItem>
      <ContextMenuItem onClick={() => void closeOtherTabs(tab.id)} className={menuItem}>
        Close other tabs
      </ContextMenuItem>
      <ContextMenuItem onClick={() => void closeTabsToRight(tab.id)} className={menuItem}>
        Close tabs to the right
      </ContextMenuItem>
    </ContextMenuContent>
  )

  /** Pinned tab: icon inside the space chip */
  const renderPinned = (tab: Tab) => {
    const active = tab.id === activeTabId || tab.id === splitTabId
    return (
      <TabDrop key={tab.id} tab={tab} draggingTab={draggingTab} onReorder={reorderTab}>
        {({ dropProps, indicator }) => (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            data-tab-id={tab.id}
            role="tab"
            aria-selected={active}
            title={tab.title || tab.url}
            onClick={() => setActiveTab(tab.id)}
            {...tabDragProps(tab, tearOff(tab))}
            {...dropProps}
            className={`relative w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
              active ? 'bg-chrome shadow-sm' : 'hover:bg-background/40'
            } ${draggingId === tab.id ? 'opacity-40' : ''}`}
          >
            {indicator}
            <Favicon tab={tab} />
            {active && <span className="absolute left-1.5 right-1.5 bottom-0.5 h-0.5 rounded-full" style={{ backgroundColor: accent }} />}
          </button>
        </ContextMenuTrigger>
        {tabMenu(tab, active)}
      </ContextMenu>
        )}
      </TabDrop>
    )
  }

  const renderTab = (tab: Tab, index: number) => {
    // Both tabs of a visible split look selected, so they read as one unit
    const isShown = (id?: string) => !!id && (id === activeTabId || id === splitTabId)
    const active = isShown(tab.id)
    const nextActive = isShown(normal[index + 1]?.id)
    // Thin divider on the right, hidden next to the active tab (like Chrome)
    const showDivider = !active && !nextActive && index < normal.length - 1
    return (
      <TabDrop key={tab.id} tab={tab} draggingTab={draggingTab} onReorder={reorderTab}>
        {({ dropProps, indicator }) => (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            data-tab-id={tab.id}
            role="tab"
            tabIndex={0}
            aria-selected={active}
            title={tab.title || tab.url}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setActiveTab(tab.id)
              } else if (e.key === 'Delete') void removeTab(tab.id)
              else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                const all = Array.from(scrollRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])
                all[all.indexOf(e.currentTarget) + (e.key === 'ArrowRight' ? 1 : -1)]?.focus()
              }
            }}
            {...tabDragProps(tab, tearOff(tab))}
            {...dropProps}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                void removeTab(tab.id)
              }
            }}
            className={`group relative flex items-center gap-2 self-end h-[34px] min-w-[56px] max-w-[240px] flex-1 basis-[240px] pl-3 pr-1.5 cursor-default select-none transition-colors ${
              active
                ? 'bg-chrome text-foreground rounded-t-lg z-10'
                : `text-muted-foreground hover:text-foreground ${tab.isSleeping ? 'opacity-60' : ''}`
            } ${draggingId === tab.id ? 'opacity-40' : ''}`}
          >
            {indicator}
            {active && (
              <>
                <span className={`${footCls} -left-2`} style={leftFoot} />
                <span className={`${footCls} -right-2`} style={rightFoot} />
                {/* Accent line on top of the active tab (space colour) */}
                <span
                  className="pointer-events-none absolute top-0 left-2.5 right-2.5 h-[2px] rounded-b-full"
                  style={{ backgroundColor: accent, boxShadow: `0 1px 6px ${accent}66` }}
                />
              </>
            )}
            {/* Hover highlight for background tabs */}
            {!active && <span className="absolute inset-x-1 top-1 bottom-1 rounded-lg bg-muted/0 group-hover:bg-muted/60 transition-colors -z-0" />}

            <span className="relative flex items-center gap-2 flex-1 min-w-0">
              <Favicon tab={tab} />
              <span className={`flex-1 min-w-0 truncate text-[12.5px] ${active ? 'font-semibold' : ''}`}>{tab.title || 'New Tab'}</span>
              {tab.isPrivate && <EyeOff className="w-3 h-3 shrink-0 text-violet-500" />}
              {(tab.isAudible || tab.isMuted) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    emit('tct:toggle-mute-tab', { tabId: tab.id })
                  }}
                  className="w-5 h-5 shrink-0 flex items-center justify-center rounded-full hover:bg-muted"
                  title={tab.isMuted ? 'Unmute tab' : 'Mute tab'}
                >
                  {tab.isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  void removeTab(tab.id)
                }}
                className={`w-5 h-5 shrink-0 flex items-center justify-center rounded-full hover:bg-muted-foreground/20 ${
                  active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                title={`Close tab (${modKey}+W)`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>

            <ReadingProgressLine tabId={tab.id} color={accent} />
            {showDivider && <span className="absolute right-0 top-2.5 bottom-2.5 w-px bg-border" />}
          </div>
        </ContextMenuTrigger>
        {tabMenu(tab, active)}
      </ContextMenu>
        )}
      </TabDrop>
    )
  }

  return (
    // app-drag: empty areas move the window; Windows/macOS maximize on double-click natively
    <div className="flex items-stretch h-10 w-full bg-sidebar select-none app-drag animate-in fade-in slide-in-from-top-1 duration-200">
      {/* macOS traffic lights */}
      {isMac && <div className="w-[74px] shrink-0" />}

      <div className="flex items-center gap-1 pl-2 pr-1 shrink-0 app-no-drag">
        <BrandMark className="px-1.5" nameClassName="hidden lg:inline" />

        <div className="w-px h-4 bg-border mx-1 shrink-0" />

        {isPrivateWindow && (
          <span className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-300 text-[12.5px] font-semibold shrink-0">
            <EyeOff className="w-3.5 h-3.5" /> Private
          </span>
        )}
        {/* Space chip: opens the space menu; pinned tabs sit inside it */}
        {isExtraWindow && pinned.map(renderPinned)}
        {isMainWindow && (
        <div className="flex items-center gap-0.5 h-8 pl-1 pr-1 rounded-lg bg-muted/60">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1.5 h-7 pl-1.5 pr-1 rounded-md text-foreground hover:bg-background/50 transition-colors"
                title="Switch space"
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accent }} />
                <span className="text-[12.5px] font-semibold truncate max-w-[120px]">{activeSpace?.name || 'Space'}</span>
                {activeSpace?.isolated && <UserRound className="w-3 h-3 text-primary shrink-0" />}
                <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={6} className="w-56 rounded-xl p-1">
              {spaces.map((space) => (
                <DropdownMenuItem key={space.id} onClick={() => void setActive(space.id)} className={menuItem}>
                  <span className="w-4 flex justify-center">
                    {space.id === activeSpaceId ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: space.color }} />
                    )}
                  </span>
                  <span className="flex-1 truncate">{space.name}</span>
                  {space.isolated && <UserRound className="w-3 h-3 text-primary" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => emit('tct:new-space')} className={menuItem}>
                <span className="w-4 flex justify-center">
                  <Plus className="w-3.5 h-3.5" />
                </span>
                New space…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => emit('open-settings', { tab: 'tabs' })} className={menuItem}>
                <span className="w-4 flex justify-center">
                  <Settings className="w-3.5 h-3.5" />
                </span>
                Space settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => emit('open-settings')} className={menuItem}>
                <span className="w-4 flex justify-center">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </span>
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void updateSettings({ tabLayout: 'sidebar' })} className={menuItem}>
                <span className="w-4 flex justify-center">
                  <PanelLeft className="w-3.5 h-3.5" />
                </span>
                Switch to Rail (side tabs)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {pinned.length > 0 && <span className="w-px h-4 bg-border mx-0.5" />}
          {pinned.map(renderPinned)}
        </div>
        )}
      </div>

      {/* Tabs */}
      <div
        ref={scrollRef}
        onWheel={onWheel}
        className="flex items-stretch min-w-0 overflow-x-auto overflow-y-hidden px-2 app-no-drag [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
      >
        {normal.map(renderTab)}
      </div>

      <div className="flex items-center shrink-0 pl-1 app-no-drag">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              onClick={() => void openNewTab()}
              className="w-8 h-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={`New Tab (${modKey}+T) · right-click for a private tab`}
            >
              <Plus className="w-4 h-4" />
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-52 rounded-xl p-1">
            <ContextMenuItem onClick={() => void openNewTab()} className={menuItem}>
              <Plus className="w-3.5 h-3.5" /> New tab
              <span className="ml-auto text-[10px] text-muted-foreground">{modKey}+T</span>
            </ContextMenuItem>
            <ContextMenuItem onClick={() => emit('tct:new-private-tab')} className={menuItem}>
              <EyeOff className="w-3.5 h-3.5 text-violet-500" /> {isPrivateWindow ? 'New tab' : 'New private window'}
              <span className="ml-auto text-[10px] text-muted-foreground">Alt+Shift+N</span>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>

      {/* Empty space drags the window */}
      <div className="flex-1 min-w-[40px]" />

      <WindowControls />
    </div>
  )
}
