import React, { useState } from 'react'
import { X, Globe, Pin, PinOff, Copy } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { modKey } from '@/lib/platform'
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
}

export const TabItem: React.FC<TabItemProps> = ({
  tab,
  isActive,
  accentColor = '#6366f1',
  collapsed = false,
  onSelect,
  onClose,
  onTogglePin,
  onDuplicate
}) => {
  const [faviconError, setFaviconError] = useState(false)

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(tab.url)
  }

  // Favicon calculation
  let faviconSrc = tab.favicon
  if (!faviconSrc && tab.url) {
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
        {faviconSrc && !faviconError ? (
          <img
            src={faviconSrc}
            alt=""
            className="w-3.5 h-3.5 object-contain rounded-xs"
            onError={() => setFaviconError(true)}
          />
        ) : (
          <Globe className="w-3.5 h-3.5 opacity-60 text-muted-foreground" />
        )}
      </div>

      {/* Subtle pinned indicator dot */}
      {tab.isPinned && (
        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400/80" />
      )}
    </div>
  ) : (
    <div
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
        {faviconSrc && !faviconError ? (
          <img
            src={faviconSrc}
            alt=""
            className="w-3.5 h-3.5 object-contain rounded-xs"
            onError={() => setFaviconError(true)}
          />
        ) : (
          <Globe className="w-3.5 h-3.5 opacity-60 text-muted-foreground" />
        )}
      </div>

      {/* Tab Title */}
      <span className="flex-1 min-w-0 truncate tracking-tight text-[12px] font-medium leading-none">
        {tab.title || 'New Tab'}
      </span>

      {/* Pin indicator badge */}
      {tab.isPinned && (
        <Pin className="w-3 h-3 text-muted-foreground shrink-0 transform rotate-45" />
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
      <ContextMenuTrigger asChild>
        {collapsed ? (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>{content}</TooltipTrigger>
              <TooltipContent
                side="right"
                className="bg-popover border border-border text-popover-foreground shadow-xl py-2 px-3 max-w-[260px] rounded-xl z-50"
              >
                <div className="space-y-1">
                  <p className="font-semibold text-xs leading-snug line-clamp-2 text-foreground">
                    {tab.title || 'New Tab'}
                  </p>
                  {tabHostname && (
                    <p className="text-[10px] text-muted-foreground truncate font-mono">{tabHostname}</p>
                  )}
                  <div className="flex items-center gap-2 pt-1 text-[9px] text-muted-foreground border-t border-border">
                    <span>Middle-click to close</span>
                    {tab.isPinned && <span className="text-amber-500">• Pinned</span>}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          content
        )}
      </ContextMenuTrigger>

      <ContextMenuContent className="w-44 bg-popover text-popover-foreground border border-border shadow-xl rounded-xl p-1 z-50">
        <ContextMenuItem onClick={onTogglePin} className="text-xs rounded-lg cursor-pointer">
          {tab.isPinned ? (
            <>
              <PinOff className="w-3.5 h-3.5 mr-2" />
              <span>Unpin Tab</span>
            </>
          ) : (
            <>
              <Pin className="w-3.5 h-3.5 mr-2" />
              <span>Pin Tab</span>
            </>
          )}
        </ContextMenuItem>
        <ContextMenuItem onClick={handleCopyUrl} className="text-xs rounded-lg cursor-pointer">
          <Copy className="w-3.5 h-3.5 mr-2" />
          <span>Copy URL</span>
        </ContextMenuItem>
        {onDuplicate && (
          <ContextMenuItem onClick={onDuplicate} className="text-xs rounded-lg cursor-pointer">
            <Copy className="w-3.5 h-3.5 mr-2" />
            <span>Duplicate Tab</span>
          </ContextMenuItem>
        )}
        <ContextMenuSeparator className="my-1 bg-border" />
        <ContextMenuItem onClick={onClose} className="text-xs rounded-lg cursor-pointer text-destructive hover:bg-destructive/10">
          <X className="w-3.5 h-3.5 mr-2" />
          <span>Close Tab</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
