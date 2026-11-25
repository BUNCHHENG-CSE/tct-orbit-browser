import React, { useContext, useState } from 'react'
import { X, Globe, Pin, PinOff, Copy, Plus, RotateCw, Code2, Volume2, VolumeX, Moon, ShieldCheck, EyeOff, Columns2, FolderPlus, Folder, FolderMinus, Home, AppWindow, Loader2 } from 'lucide-react'
import { getUnreadCount, stripUnreadPrefix } from '@/lib/liveTabs'
import { isStartPageUrl, isPrivateStartUrl } from '@/lib/startPage'
import { groupById, groupPathLabel, resolveGroupColor } from '@/lib/tabGroups'
import { TabGroupContext, TAB_DRAG_TYPE } from './TabGroupContext'
import { useThumbnailStore } from '@/store/useThumbnailStore'
import { cleanUrl } from '@/lib/urlCleaner'
import { toast } from 'sonner'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { modKey } from '@/lib/platform'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useSmartStore } from '@/store/useSmartStore'
import { SnoozeMenu } from '@/components/Smart/SnoozeMenu'
import { useT } from '@/lib/i18n'
import { isExtraWindow, canMoveToNewWindow } from '@/lib/extraWindow'
import { moveTabToOtherWindow } from '@/lib/tabLifecycle'
import { droppedOutside } from './TabReorder'
import type { Tab } from '@/types/api'

interface TabItemProps {
  tab: Tab
  isActive: boolean
  accentColor?: string
  collapsed?: boolean
  onSelect: () => void
  onClose: () => void
  onTogglePin: () => void
  onDuplicate?: () => void
  onNewTabToRight?: () => void
  onReload?: () => void
  onCloseOthers?: () => void
  onCloseToRight?: () => void
}

export const TabItem: React.FC<TabItemProps> = React.memo(({
  tab,
  isActive,
  accentColor = '#6366f1',
  collapsed = false,
  onSelect,
  onClose,
  onTogglePin,
  onDuplicate,
  onNewTabToRight,
  onReload,
  onCloseOthers,
  onCloseToRight
}) => {
  const [faviconError, setFaviconError] = useState(false)
  const t = useT()
  const isolated = useBrowserStore((s) => !!s.spaces.find((sp) => sp.id === tab.spaceId)?.isolated)
  const movable = canMoveToNewWindow(tab, isolated)
  const loading = useBrowserStore((s) => !!s.loadingTabs[tab.id])
  const thumbnail = useThumbnailStore((s) => s.thumbs[tab.id]?.dataUrl)
  // Reading progress of the page (thin bar under the title); only while partly read
  const progress = useSmartStore((s) => s.progress[tab.id])
  const showProgress = progress !== undefined && progress > 0.03 && progress < 0.97
  const groupCtx = useContext(TabGroupContext)
  const isStart = isStartPageUrl(tab.url)
  // Live Work badge: unread count from titles like "(3) Slack" or "Inbox (12)"
  const unread = getUnreadCount(tab.title)
  const displayTitle = unread ? stripUnreadPrefix(tab.title) : tab.title

  const addToNewGroup = async () => {
    if (!groupCtx) return
    const created = await groupCtx.createGroup({ name: 'New Group', tabIds: [tab.id], parentId: tab.groupId ?? null })
    if (created) groupCtx.setEditingGroupId(created.id)
  }

  // Drag onto the page area to open in split view (see WebViewContainer drop zone)
  const dragProps = {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(TAB_DRAG_TYPE, tab.id)
      e.dataTransfer.setData('text/uri-list', tab.url)
      e.dataTransfer.effectAllowed = 'move'
      window.dispatchEvent(new CustomEvent('tct:tab-drag-start', { detail: { tabId: tab.id } }))
    },
    onDragEnd: (e: React.DragEvent) => {
      window.dispatchEvent(new CustomEvent('tct:tab-drag-end'))
      if (movable && !isExtraWindow && droppedOutside(e)) void moveTabToOtherWindow(tab.id)
    }
  }

  /** Tabs are reachable and usable with the keyboard */
  const a11yProps = {
    role: 'tab' as const,
    tabIndex: 0,
    'aria-selected': isActive,
    'aria-label': displayTitle || 'New Tab',
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onSelect()
      } else if (e.key === 'Delete') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const all = Array.from(document.querySelectorAll<HTMLElement>('[data-orbit-tab]'))
        const next = all[all.indexOf(e.currentTarget as HTMLElement) + (e.key === 'ArrowDown' ? 1 : -1)]
        if (next) {
          e.preventDefault()
          next.focus()
        }
      }
    },
    'data-orbit-tab': true,
    'data-tab-id': tab.id
  }

  const openInSplit = () => {
    const store = useBrowserStore.getState()
    if (tab.id === store.activeTabId) {
      toast.info('This tab is already showing. Pick another tab for split view.')
      return
    }
    store.setSplitTabId(tab.id)
    store.setSplitActivePane('secondary')
  }

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(tab.url)
  }

  // Favicon calculation
  let faviconSrc = tab.favicon
  if (!faviconSrc && tab.url && !isStart) {
    try {
      const urlObj = new URL(tab.url)
      faviconSrc = `${urlObj.origin}/favicon.ico`
    } catch {
      faviconSrc = null
    }
  }

  const handleAuxClick = (e: React.MouseEvent) => {
    // Middle mouse button click closes tab
    if (e.button === 1) {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  const content = collapsed ? (
    <div
      {...dragProps}
      {...a11yProps}
      onClick={onSelect}
      onAuxClick={handleAuxClick}
      className={`group relative w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors duration-150 select-none ${
        isActive
          ? 'bg-tab-active text-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-tab-hover hover:text-foreground border border-transparent hover:border-border/50'
      }`}
      style={
        isActive
          ? {
              border: `1px solid ${accentColor}50`,
              boxShadow: `0 0 10px ${accentColor}25`
            }
          : undefined
      }
    >
      {/* Active Accent Indicator bar */}
      {isActive && (
        <span
          className="absolute -left-1 top-2 bottom-2 w-0.5 rounded-r-full shadow-sm"
          style={{ backgroundColor: accentColor }}
        />
      )}

      {/* Favicon with Dark Mode Contrast Protection */}
      <div className="w-5 h-5 shrink-0 flex items-center justify-center rounded-md p-0.5 dark:bg-white/[0.08] bg-transparent transition-colors">
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" aria-label="Loading" />
        ) : faviconSrc && !faviconError ? (
          <img
            src={faviconSrc}
            alt=""
            className="w-3.5 h-3.5 object-contain rounded-xs"
            onError={() => setFaviconError(true)}
          />
        ) : isStart ? (
          isPrivateStartUrl(tab.url) ? <EyeOff className="w-3.5 h-3.5 text-violet-500" /> : <Home className="w-3.5 h-3.5 text-primary" />
        ) : (
          <Globe className="w-3.5 h-3.5 opacity-60 text-muted-foreground" />
        )}
      </div>

      {/* Live Work unread badge, else subtle pinned indicator dot */}
      {unread ? (
        <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-[3px] rounded-full bg-rose-500 text-white text-[9px] font-bold leading-[15px] text-center shadow-sm">
          {unread}
        </span>
      ) : tab.isPinned ? (
        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400/80" />
      ) : null}
    </div>
  ) : (
    <div
      {...dragProps}
      {...a11yProps}
      onClick={onSelect}
      onAuxClick={handleAuxClick}
      className={`group relative flex items-center gap-2 pl-3.5 pr-2 py-1.5 h-9 rounded-xl text-xs font-medium cursor-pointer transition-colors duration-150 select-none w-full max-w-full min-w-0 ${
        isActive
          ? 'bg-tab-active text-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-tab-hover hover:text-foreground border border-transparent'
      }`}
      style={
        isActive
          ? {
              border: `1px solid ${accentColor}40`,
              boxShadow: `0 1px 3px rgba(0, 0, 0, 0.06), 0 0 10px ${accentColor}18`
            }
          : undefined
      }
    >
      {/* Active Accent Indicator bar on the left edge */}
      {isActive && (
        <span
          className="absolute left-1.5 top-2.5 bottom-2.5 w-1 rounded-full shadow-xs"
          style={{ backgroundColor: accentColor }}
        />
      )}

      {/* Favicon with Dark Mode Contrast Protection */}
      <div className="w-5 h-5 shrink-0 flex items-center justify-center rounded-md p-0.5 dark:bg-white/[0.08] bg-transparent transition-colors">
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" aria-label="Loading" />
        ) : faviconSrc && !faviconError ? (
          <img
            src={faviconSrc}
            alt=""
            className="w-3.5 h-3.5 object-contain rounded-xs"
            onError={() => setFaviconError(true)}
          />
        ) : isStart ? (
          isPrivateStartUrl(tab.url) ? <EyeOff className="w-3.5 h-3.5 text-violet-500" /> : <Home className="w-3.5 h-3.5 text-primary" />
        ) : (
          <Globe className="w-3.5 h-3.5 opacity-60 text-muted-foreground" />
        )}
      </div>

      {/* Tab Title */}
      <span className={`flex-1 min-w-0 truncate tracking-tight text-[13.5px] font-medium leading-none ${
        tab.isSleeping && !isActive ? 'opacity-60 italic' : ''
      }`}>
        {displayTitle || 'New Tab'}
      </span>

      {/* Live Work unread badge */}
      {unread && (
        <span
          className="shrink-0 min-w-[18px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-[16px] text-center tabular-nums"
          title={`${unread} unread`}
        >
          {unread}
        </span>
      )}

      {/* Private tab indicator */}
      {tab.isPrivate && (
        <span title="Private tab: nothing is saved after closing" className="shrink-0 flex items-center">
          <EyeOff className="w-3.5 h-3.5 text-violet-500" />
        </span>
      )}

      {/* Sleeping indicator */}
      {tab.isSleeping && !isActive && (
        <span
          className="text-[9.5px] font-mono px-1 py-0.2 rounded bg-muted/80 text-muted-foreground border border-border/50 shrink-0 select-none flex items-center gap-0.5"
          title="Tab is sleeping to save memory. Click to wake up."
        >
          <Moon className="w-2.5 h-2.5 text-indigo-400" />
          <span>zzz</span>
        </span>
      )}

      {/* Audio Indicator / 1-Click Mute Button */}
      {(tab.isAudible || tab.isMuted) && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            window.dispatchEvent(new CustomEvent('tct:toggle-mute-tab', { detail: { tabId: tab.id } }))
          }}
          className={`w-5 h-5 rounded-md flex items-center justify-center transition-all shrink-0 cursor-pointer ${
            tab.isMuted
              ? 'text-destructive hover:bg-destructive/15'
              : 'text-primary hover:bg-primary/15 animate-pulse'
          }`}
          title={tab.isMuted ? 'Unmute Tab' : 'Mute Tab'}
        >
          {tab.isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
      )}


      {showProgress && (
        <span className="pointer-events-none absolute left-3.5 right-3 bottom-[3px] h-[2px] rounded-full bg-muted-foreground/10 overflow-hidden" aria-hidden>
          <span
            className="block h-full rounded-full transition-[width] duration-300"
            style={{ width: `${Math.round(progress! * 100)}%`, backgroundColor: `${accentColor}b3` }}
          />
        </span>
      )}

      {/* Close button (visible on hover) */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-md flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
        aria-label="Close tab"
        title={`Close Tab (${modKey}+W)`}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )

  let tabHostname = ''
  if (tab.url) {
    try {
      tabHostname = new URL(tab.url).hostname
    } catch {
      tabHostname = tab.url
    }
  }

  return (
    <ContextMenu>
      {collapsed ? (
        <Tooltip delayDuration={150}>
          <ContextMenuTrigger asChild>
            <TooltipTrigger asChild>{content}</TooltipTrigger>
          </ContextMenuTrigger>
          <TooltipContent
            side="right"
            sideOffset={10}
            className="bg-popover border border-border text-popover-foreground shadow-2xl py-2 px-3 max-w-[260px] rounded-xl z-[100] pointer-events-none"
          >
            <div className="space-y-1">
              {thumbnail && !isActive && (
                <img src={thumbnail} alt="" className="w-[236px] aspect-[16/10] object-cover object-top rounded-lg border border-border mb-1" />
              )}
              <p className="font-semibold text-xs leading-snug line-clamp-2 text-foreground">
                {tab.title || 'New Tab'}
              </p>
              {tabHostname && (
                <p className="text-[11.5px] text-muted-foreground truncate font-mono">{tabHostname}</p>
              )}
              <div className="flex items-center gap-2 pt-1 text-[10.5px] text-muted-foreground border-t border-border">
                <span>Middle-click to close</span>
                {tab.isPinned && <span className="text-amber-500">• Pinned</span>}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip delayDuration={650}>
          <ContextMenuTrigger asChild>
            <TooltipTrigger asChild>{content}</TooltipTrigger>
          </ContextMenuTrigger>
          <TooltipContent
            side="right"
            sideOffset={12}
            className="bg-popover border border-border text-popover-foreground shadow-2xl p-2 w-[256px] rounded-xl z-[100] pointer-events-none"
          >
            {thumbnail && !isActive ? (
              <img src={thumbnail} alt="" className="w-full aspect-[16/10] object-cover object-top rounded-lg border border-border" />
            ) : null}
            <p className={`font-semibold text-xs leading-snug line-clamp-2 text-foreground ${thumbnail && !isActive ? 'mt-1.5' : ''}`}>
              {tab.title || 'New Tab'}
            </p>
            {tabHostname && <p className="text-[11px] text-muted-foreground truncate font-mono mt-0.5">{tabHostname}</p>}
            {tab.isSleeping && !isActive && <p className="text-[10.5px] text-indigo-400 mt-1">Sleeping to save memory</p>}
          </TooltipContent>
        </Tooltip>
      )}

      <ContextMenuContent className="w-48 bg-popover text-popover-foreground border border-border shadow-2xl rounded-xl p-1 z-50">
        {onNewTabToRight && (
          <ContextMenuItem onClick={onNewTabToRight} className="text-xs rounded-lg cursor-pointer">
            <Plus className="w-3.5 h-3.5 mr-2 text-primary" />
            <span>{t('New tab to right')}</span>
          </ContextMenuItem>
        )}
        {onReload && (
          <ContextMenuItem onClick={onReload} className="text-xs rounded-lg cursor-pointer">
            <RotateCw className="w-3.5 h-3.5 mr-2" />
            <span>{t('Reload')}</span>
          </ContextMenuItem>
        )}
        {!isActive && (
          <ContextMenuItem onClick={openInSplit} className="text-xs rounded-lg cursor-pointer">
            <Columns2 className="w-3.5 h-3.5 mr-2 text-primary" />
            <span>{t('Open in Split View')}</span>
          </ContextMenuItem>
        )}
        {groupCtx && (
          <ContextMenuSub>
            <ContextMenuSubTrigger className="text-xs rounded-lg cursor-pointer">
              <FolderPlus className="w-3.5 h-3.5 mr-2" />
              <span>{t('Add to group')}</span>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56 max-h-80 overflow-y-auto bg-popover text-popover-foreground border border-border shadow-2xl rounded-xl p-1">
              <ContextMenuItem onClick={() => void addToNewGroup()} className="text-xs rounded-lg cursor-pointer">
                <FolderPlus className="w-3.5 h-3.5 mr-2 text-primary" />
                <span>{t('New group')}</span>
              </ContextMenuItem>
              {groupCtx.groups.length > 0 && <ContextMenuSeparator className="my-1 bg-border" />}
              {(() => {
                const byId = groupById(groupCtx.groups)
                return groupCtx.groups
                  .map((g) => ({ g, label: groupPathLabel(g, byId) }))
                  .sort((a, b) => a.label.localeCompare(b.label))
                  .map(({ g, label }) => (
                    <ContextMenuItem
                      key={g.id}
                      disabled={g.id === tab.groupId}
                      onClick={() => void groupCtx.moveTabToGroup(tab.id, g.id)}
                      className="text-xs rounded-lg cursor-pointer"
                    >
                      <Folder className="w-3.5 h-3.5 mr-2 shrink-0" style={{ color: resolveGroupColor(g, byId) }} />
                      <span className="truncate">{label}</span>
                    </ContextMenuItem>
                  ))
              })()}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        {groupCtx && tab.groupId && (
          <ContextMenuItem
            onClick={() => void groupCtx.moveTabToGroup(tab.id, null)}
            className="text-xs rounded-lg cursor-pointer"
          >
            <FolderMinus className="w-3.5 h-3.5 mr-2" />
            <span>{t('Remove from group')}</span>
          </ContextMenuItem>
        )}
        {onDuplicate && (
          <ContextMenuItem onClick={onDuplicate} className="text-xs rounded-lg cursor-pointer">
            <Copy className="w-3.5 h-3.5 mr-2" />
            <span>{t('Duplicate Tab')}</span>
          </ContextMenuItem>
        )}
        <ContextMenuItem
          onClick={() => {
            window.dispatchEvent(new CustomEvent('tct:toggle-mute-tab', { detail: { tabId: tab.id } }))
          }}
          className="text-xs rounded-lg cursor-pointer"
        >
          {tab.isMuted ? (
            <>
              <Volume2 className="w-3.5 h-3.5 mr-2 text-primary" />
              <span>{t('Unmute Tab')}</span>
            </>
          ) : (
            <>
              <VolumeX className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
              <span>{t('Mute Tab')}</span>
            </>
          )}
        </ContextMenuItem>
        {!isActive && !tab.isPinned && !tab.isSleeping && (
          <ContextMenuItem
            onClick={() => {
              useBrowserStore.getState().setTabSleeping(tab.id, true)
            }}
            className="text-xs rounded-lg cursor-pointer"
          >
            <Moon className="w-3.5 h-3.5 mr-2 text-indigo-400" />
            <span>{t('Sleep Tab (Save RAM)')}</span>
          </ContextMenuItem>
        )}
        {movable && (
          <ContextMenuItem onClick={() => void moveTabToOtherWindow(tab.id)} className="text-xs rounded-lg cursor-pointer">
            <AppWindow className="w-3.5 h-3.5 mr-2" />
            <span>{t(isExtraWindow ? 'Move to main window' : 'Move to new window')}</span>
          </ContextMenuItem>
        )}
        {!isExtraWindow && <SnoozeMenu tab={tab} onClose={onClose} />}
        <ContextMenuItem onClick={onTogglePin} className="text-xs rounded-lg cursor-pointer">
          {tab.isPinned ? (
            <>
              <PinOff className="w-3.5 h-3.5 mr-2" />
              <span>{t('Unpin Tab')}</span>
            </>
          ) : (
            <>
              <Pin className="w-3.5 h-3.5 mr-2" />
              <span>{t('Pin Tab')}</span>
            </>
          )}
        </ContextMenuItem>
        <ContextMenuItem onClick={handleCopyUrl} className="text-xs rounded-lg cursor-pointer">
          <Copy className="w-3.5 h-3.5 mr-2" />
          <span>{t('Copy URL')}</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={(e) => {
            e.stopPropagation()
            if (tab.url) {
              const sanitized = cleanUrl(tab.url)
              navigator.clipboard.writeText(sanitized)
              toast.success('Clean URL copied (trackers stripped)')
            }
          }}
          className="text-xs rounded-lg cursor-pointer"
        >
          <ShieldCheck className="w-3.5 h-3.5 mr-2 text-emerald-500" />
          <span>{t('Copy Clean Link')}</span>
        </ContextMenuItem>
        <ContextMenuSeparator className="my-1 bg-border" />
        <ContextMenuItem onClick={onClose} className="text-xs rounded-lg cursor-pointer text-destructive hover:bg-destructive/10">
          <X className="w-3.5 h-3.5 mr-2" />
          <span>{t('Close Tab')}</span>
        </ContextMenuItem>
        {onCloseOthers && (
          <ContextMenuItem onClick={onCloseOthers} className="text-xs rounded-lg cursor-pointer">
            <span>{t('Close Other Tabs')}</span>
          </ContextMenuItem>
        )}
        {onCloseToRight && (
          <ContextMenuItem onClick={onCloseToRight} className="text-xs rounded-lg cursor-pointer">
            <span>{t('Close Tabs to Right')}</span>
          </ContextMenuItem>
        )}
        {import.meta.env.DEV && (
          <>
            <ContextMenuSeparator className="my-1 bg-border" />
            <ContextMenuItem
              onClick={() => useBrowserStore.getState().setDevToolsOpen(true)}
              className="text-xs rounded-lg cursor-pointer text-muted-foreground"
            >
              <Code2 className="w-3.5 h-3.5 mr-2" />
              <span>Inspect UI Element</span>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}, tabItemPropsEqual)

/**
 * Parents pass fresh inline callbacks (() => onSelectTab(tab.id)) on every render, which made
 * React.memo useless: every row (with its tooltip and context menu) re-rendered whenever ANY tab
 * changed. The callbacks only close over the tab id / tab object and stable handlers, so a row
 * only needs to re-render when its data changes or a callback appears / disappears.
 */
function tabItemPropsEqual(prev: TabItemProps, next: TabItemProps): boolean {
  if (prev.tab !== next.tab || prev.isActive !== next.isActive || prev.accentColor !== next.accentColor || prev.collapsed !== next.collapsed) {
    return false
  }
  const optional: Array<keyof TabItemProps> = ['onDuplicate', 'onNewTabToRight', 'onReload', 'onCloseOthers', 'onCloseToRight']
  return optional.every((k) => !!prev[k] === !!next[k])
}
