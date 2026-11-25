import React from 'react'
import { AlarmClock, Layers } from 'lucide-react'
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger
} from '@/components/ui/context-menu'
import { snoozeOptions, snoozeTab } from '@/lib/snooze'
import { useSmartStore } from '@/store/useSmartStore'
import type { Tab } from '@/types/api'

/**
 * "Snooze until…" submenu for a tab's context menu: the tab closes now and comes back later
 * (at a time, or the next time its space is opened).
 */
export const SnoozeMenu: React.FC<{ tab: Tab; onClose: () => void | Promise<unknown>; className?: string }> = ({
  tab,
  onClose,
  className = 'text-xs rounded-lg cursor-pointer'
}) => {
  if (tab.isPrivate || !/^https?:/i.test(tab.url)) return null
  // Computed when the menu renders, so "In 1 hour" etc. are always current
  const options = snoozeOptions()
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger className={className}>
        <AlarmClock className="w-3.5 h-3.5 mr-2 text-amber-500" />
        <span>Snooze until…</span>
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-64 bg-popover text-popover-foreground border border-border shadow-2xl rounded-xl p-1">
        {options.map((opt) => (
          <React.Fragment key={opt.id}>
            {opt.id === 'space' && <ContextMenuSeparator className="my-1 bg-border" />}
            <ContextMenuItem onClick={() => void snoozeTab(tab, opt, onClose)} className={`${className} flex items-center justify-between gap-3`}>
              <span className="flex items-center gap-2 min-w-0">
                {opt.id === 'space' && <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                <span className="truncate">{opt.label}</span>
              </span>
              {opt.hint && <span className="text-[11px] text-muted-foreground shrink-0">{opt.hint}</span>}
            </ContextMenuItem>
          </React.Fragment>
        ))}
        <ContextMenuSeparator className="my-1 bg-border" />
        <ContextMenuItem onClick={() => useSmartStore.getState().openSmartTools('snoozed')} className={`${className} text-muted-foreground`}>
          See snoozed tabs
        </ContextMenuItem>
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}
