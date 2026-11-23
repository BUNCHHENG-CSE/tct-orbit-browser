import React, { useEffect, useMemo, useState } from 'react'
import { Globe, EyeOff, Moon, Pin, Volume2 } from 'lucide-react'
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command'
import { useBrowserStore } from '@/store/useBrowserStore'
import { api } from '@/lib/ipc'
import type { Tab } from '@/types/api'

/** Ctrl+Shift+A: fuzzy search across open tabs in every space */
export const TabSearchDialog: React.FC = () => {
  const [open, setOpen] = useState(false)
  const spaces = useBrowserStore((s) => s.spaces)
  const tabsBySpace = useBrowserStore((s) => s.tabsBySpace)
  const activeTabId = useBrowserStore((s) => s.activeTabId)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('tct:open-tab-search', onOpen)
    return () => window.removeEventListener('tct:open-tab-search', onOpen)
  }, [])

  const groups = useMemo(
    () =>
      spaces
        .map((space) => ({ space, tabs: tabsBySpace[space.id] || [] }))
        .filter((g) => g.tabs.length > 0),
    [spaces, tabsBySpace]
  )

  const switchTo = async (spaceId: string, tab: Tab) => {
    setOpen(false)
    const store = useBrowserStore.getState()
    if (store.activeSpaceId !== spaceId) {
      store.setActiveSpaceId(spaceId)
      for (const sp of store.spaces) store.updateSpaceInStore(sp.id, { isActive: sp.id === spaceId })
      try {
        await api.spaces.setActive(spaceId)
      } catch {}
    }
    useBrowserStore.getState().setActiveTabId(tab.id)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search open tabs by title or address..." />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>No open tab matches.</CommandEmpty>
        {groups.map(({ space, tabs }) => (
          <CommandGroup key={space.id} heading={`${space.name} · ${tabs.length}`}>
            {tabs.map((tab) => (
              <CommandItem
                key={tab.id}
                // cmdk filters on this value: title + url + space name
                value={`${tab.title} ${tab.url} ${space.name} ${tab.id}`}
                onSelect={() => void switchTo(space.id, tab)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer"
              >
                {tab.favicon ? (
                  <img src={tab.favicon} alt="" className="w-4 h-4 rounded-sm shrink-0" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                ) : (
                  <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-foreground truncate">{tab.title || 'New Tab'}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{tab.url}</p>
                </div>
                {tab.isPrivate && <EyeOff className="w-3.5 h-3.5 text-violet-500 shrink-0" />}
                {tab.isPinned && <Pin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                {tab.isAudible && <Volume2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                {tab.isSleeping && <Moon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                {tab.id === activeTabId && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary shrink-0">Current</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
