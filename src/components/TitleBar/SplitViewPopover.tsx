import React, { useState } from 'react'
import {
  Columns2,
  X,
  ArrowLeftRight,
  Globe,
  SplitSquareVertical,
  Plus
} from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import { useBrowserStore } from '@/store/useBrowserStore'
import { modKey } from '@/lib/platform'
import { api } from '@/lib/ipc'

export const SplitViewPopover: React.FC = () => {
  const [open, setOpen] = useState(false)
  const activeSpaceId = useBrowserStore((s) => s.activeSpaceId)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const tabsBySpace = useBrowserStore((s) => s.tabsBySpace)
  const splitTabId = useBrowserStore((s) => s.splitTabId)
  const splitRatio = useBrowserStore((s) => s.splitRatio)
  const setSplitTabId = useBrowserStore((s) => s.setSplitTabId)
  const setSplitRatio = useBrowserStore((s) => s.setSplitRatio)
  const closeSplitView = useBrowserStore((s) => s.closeSplitView)
  const setActiveTabId = useBrowserStore((s) => s.setActiveTabId)

  const currentTabs = activeSpaceId ? tabsBySpace[activeSpaceId] || [] : []
  const otherTabs = currentTabs.filter((t) => t.id !== activeTabId)
  const isSplitActive = Boolean(splitTabId && currentTabs.some((t) => t.id === splitTabId))

  const handleSelectTab = (tabId: string) => {
    setSplitTabId(tabId)
    setOpen(false)
  }

  const handleSwap = () => {
    if (!splitTabId) return
    const currentActive = activeTabId
    setActiveTabId(splitTabId)
    setSplitTabId(currentActive)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
            isSplitActive
              ? 'bg-primary/15 text-primary hover:bg-primary/25 shadow-2xs font-semibold'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
          title={`Split View (${modKey}+\\)`}
        >
          <Columns2 className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-72 p-3 rounded-2xl bg-popover text-popover-foreground border border-border shadow-2xl space-y-3 z-50 select-none"
      >
        <div className="flex items-center justify-between border-b border-border pb-2">
          <div className="flex items-center gap-2">
            <Columns2 className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold text-foreground">Split View</span>
          </div>
          {isSplitActive && (
            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-primary/20 text-primary">
              Active
            </span>
          )}
        </div>

        {isSplitActive ? (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Dual-pane browsing is active in this space.
            </p>

            {/* Quick Ratio Presets */}
            <div className="flex items-center justify-between gap-1 pt-1">
              <button
                onClick={() => setSplitRatio(0.5)}
                className={`flex-1 py-1 px-1.5 rounded-lg text-[11px] font-medium border text-center transition-colors ${
                  Math.abs(splitRatio - 0.5) < 0.05
                    ? 'border-primary bg-primary/10 text-primary font-bold'
                    : 'border-border bg-muted/40 hover:bg-muted text-foreground'
                }`}
              >
                50 / 50
              </button>
              <button
                onClick={() => setSplitRatio(0.7)}
                className={`flex-1 py-1 px-1.5 rounded-lg text-[11px] font-medium border text-center transition-colors ${
                  Math.abs(splitRatio - 0.7) < 0.05
                    ? 'border-primary bg-primary/10 text-primary font-bold'
                    : 'border-border bg-muted/40 hover:bg-muted text-foreground'
                }`}
              >
                70 / 30
              </button>
              <button
                onClick={() => setSplitRatio(0.3)}
                className={`flex-1 py-1 px-1.5 rounded-lg text-[11px] font-medium border text-center transition-colors ${
                  Math.abs(splitRatio - 0.3) < 0.05
                    ? 'border-primary bg-primary/10 text-primary font-bold'
                    : 'border-border bg-muted/40 hover:bg-muted text-foreground'
                }`}
              >
                30 / 70
              </button>
            </div>

            {/* Actions: Swap & Close */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleSwap}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-medium border border-border transition-colors cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-primary" />
                <span>Swap Panes</span>
              </button>

              <button
                onClick={() => {
                  closeSplitView()
                  setOpen(false)
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-destructive/15 hover:bg-destructive/25 text-destructive dark:text-red-400 text-xs font-semibold border border-destructive/30 hover:border-destructive/50 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5 text-destructive dark:text-red-400" />
                <span>Close Split</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">
              Select another tab from this space to view side-by-side:
            </p>

            {otherTabs.length === 0 ? (
              <div className="text-center py-4 px-2 rounded-xl bg-muted/30 border border-border">
                <p className="text-xs text-muted-foreground">
                  No other open tabs in this space.
                </p>
                <button
                  onClick={async () => {
                    const space = activeSpaceId || useBrowserStore.getState().spaces[0]?.id
                    if (space && api.tabs?.create) {
                      const newTab = await api.tabs.create({
                        spaceId: space,
                        url: 'https://duckduckgo.com',
                        title: 'New Tab'
                      })
                      useBrowserStore.getState().addTabToStore(space, newTab)
                      setSplitTabId(newTab.id)
                      setOpen(false)
                    }
                  }}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Open New Tab in Split</span>
                </button>
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                {otherTabs.map((tab) => (
                  <div
                    key={tab.id}
                    onClick={() => handleSelectTab(tab.id)}
                    className="flex items-center gap-2 p-2 rounded-xl hover:bg-muted cursor-pointer transition-colors group"
                  >
                    {tab.favicon ? (
                      <img src={tab.favicon} alt="" className="w-3.5 h-3.5 rounded-xs shrink-0" />
                    ) : (
                      <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-xs text-foreground truncate flex-1 group-hover:text-primary font-medium">
                      {tab.title || tab.url || 'Tab'}
                    </span>
                    <SplitSquareVertical className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
