import React, { useEffect, useState } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Puzzle, Pin, PinOff, MoreHorizontal, Settings2, Power, Trash2, ExternalLink, Store } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { api } from '@/lib/ipc'
import { useBrowserStore } from '@/store/useBrowserStore'
import type { BrowserExtensionInfo } from '@/types/api'

/* ---------- state ---------- */

interface ExtensionsState {
  list: BrowserExtensionInfo[]
  pinned: string[]
  /** Show the puzzle (Extensions) button in the header */
  showButton: boolean
  setShowButton: (show: boolean) => void
  refresh: () => Promise<void>
  setList: (list: BrowserExtensionInfo[]) => void
  togglePin: (id: string) => void
}

export const useExtensionsBar = create<ExtensionsState>()(
  persist(
    (set) => ({
      list: [],
      pinned: [],
      showButton: true,
      setShowButton: (showButton) => set({ showButton }),
      refresh: async () => {
        try {
          set({ list: (await api.extensions?.list()) ?? [] })
        } catch {
          set({ list: [] })
        }
      },
      setList: (list) => set({ list }),
      togglePin: (id) => set((s) => ({ pinned: s.pinned.includes(id) ? s.pinned.filter((p) => p !== id) : [...s.pinned, id] }))
    }),
    { name: 'tct-extension-pins', partialize: (s) => ({ pinned: s.pinned, showButton: s.showButton }) }
  )
)

/* ---------- helpers ---------- */

async function openUrlInNewTab(url: string) {
  const store = useBrowserStore.getState()
  const spaceId = store.activeSpaceId || store.spaces[0]?.id
  if (!spaceId) return
  const tab = await api.tabs.create({ spaceId, url, title: 'Extension' })
  store.insertTabNextTo(spaceId, tab, store.activeTabId, true)
}

/** Toolbar click: open the extension's popup page, else its options, else the manager */
function activate(ext: BrowserExtensionInfo) {
  if (!ext.enabled) {
    toast('Extension is turned off', { description: `Turn on ${ext.name} in Manage extensions.` })
    return
  }
  if (ext.popupUrl) {
    void openUrlInNewTab(ext.popupUrl)
    return
  }
  // Toolbar button without a popup (e.g. built-ins): forward the click to the active tab
  if (ext.hasAction) {
    window.dispatchEvent(new CustomEvent('tct:extension-action', { detail: { id: ext.id, name: ext.name } }))
    return
  }
  if (ext.optionsUrl) void openUrlInNewTab(ext.optionsUrl)
  else toast(ext.name, { description: 'This extension runs automatically on pages and has no popup.' })
}

const ExtIcon: React.FC<{ ext: BrowserExtensionInfo; size?: string }> = ({ ext, size = 'w-4 h-4' }) =>
  ext.icon ? (
    <img src={ext.icon} alt="" className={`${size} object-contain shrink-0 ${ext.enabled ? '' : 'grayscale opacity-50'}`} />
  ) : (
    <Puzzle className={`${size} shrink-0 text-muted-foreground`} />
  )

const iconBtn = 'w-7 h-7 flex items-center justify-center rounded-lg transition-colors cursor-pointer'

/** Keeps the extension list fresh for the header */
function useExtensionsSync() {
  const refresh = useExtensionsBar((s) => s.refresh)
  useEffect(() => {
    void refresh()
    const onChange = () => void refresh()
    window.addEventListener('tct:extensions-changed', onChange)
    return () => window.removeEventListener('tct:extensions-changed', onChange)
  }, [refresh])
}

/* ---------- pinned icons in the header ---------- */

export const PinnedExtensions: React.FC = () => {
  useExtensionsSync()
  const list = useExtensionsBar((s) => s.list)
  const pinned = useExtensionsBar((s) => s.pinned)
  const togglePin = useExtensionsBar((s) => s.togglePin)
  const shown = pinned.map((id) => list.find((e) => e.id === id)).filter((e): e is BrowserExtensionInfo => !!e)
  if (shown.length === 0) return null
  return (
    <>
      {shown.map((ext) => (
        <button
          key={ext.id}
          onClick={() => activate(ext)}
          onContextMenu={(e) => {
            e.preventDefault()
            togglePin(ext.id)
          }}
          className={`${iconBtn} hover:bg-muted`}
          title={`${ext.name} (right-click to unpin)`}
        >
          <ExtIcon ext={ext} />
        </button>
      ))}
    </>
  )
}

/* ---------- the Extensions popover ---------- */

export const ExtensionsPopover: React.FC = () => {
  const [open, setOpen] = useState(false)
  const list = useExtensionsBar((s) => s.list)
  const pinned = useExtensionsBar((s) => s.pinned)
  const togglePin = useExtensionsBar((s) => s.togglePin)
  const refresh = useExtensionsBar((s) => s.refresh)
  const setList = useExtensionsBar((s) => s.setList)
  const showButton = useExtensionsBar((s) => s.showButton)
  const setShowButton = useExtensionsBar((s) => s.setShowButton)

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  const openManager = () => {
    setOpen(false)
    window.dispatchEvent(new CustomEvent('tct:open-extensions'))
  }

  const hideButton = () => {
    setOpen(false)
    setShowButton(false)
    toast('Extensions button unpinned', {
      description: 'Pin it again from ⋯ → Extensions.',
      action: { label: 'Undo', onClick: () => setShowButton(true) }
    })
  }

  if (!showButton) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ContextMenu>
        <PopoverTrigger asChild>
          <ContextMenuTrigger asChild>
            <button
              className={`${iconBtn} ${open ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
              title="Extensions (right-click to unpin)"
            >
              <Puzzle className="w-3.5 h-3.5" />
            </button>
          </ContextMenuTrigger>
        </PopoverTrigger>
        <ContextMenuContent className="w-52 rounded-xl p-1 text-xs">
          <ContextMenuItem onClick={hideButton} className="rounded-lg cursor-pointer gap-2 text-xs">
            <PinOff className="w-3.5 h-3.5" />
            Unpin from toolbar
          </ContextMenuItem>
          <ContextMenuItem onClick={openManager} className="rounded-lg cursor-pointer gap-2 text-xs">
            <Settings2 className="w-3.5 h-3.5" />
            Manage extensions
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <PopoverContent
        align="end"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-80 p-1.5 rounded-2xl bg-popover/95 dark:bg-[#121316]/95 backdrop-blur-2xl border border-border/80 shadow-2xl z-50 text-xs font-medium select-none"
      >
        <div className="flex items-center justify-between pl-2.5 pr-1 pt-1 pb-1.5">
          <span className="text-sm font-semibold text-foreground">
            Extensions
            {list.length > 0 && <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">{list.length}</span>}
          </span>
          <button
            onClick={openManager}
            className={`${iconBtn} text-muted-foreground hover:text-foreground hover:bg-accent`}
            title="Manage extensions"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {list.length === 0 ? (
          <div className="px-2.5 py-5 flex flex-col items-center gap-1.5 text-center text-muted-foreground">
            <Puzzle className="w-5 h-5 opacity-60" />
            <span>No extensions installed yet</span>
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto space-y-0.5">
            {list.map((ext) => {
              const isPinned = pinned.includes(ext.id)
              return (
                <div
                  key={ext.id}
                  className="group flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-xl hover:bg-accent focus-within:bg-accent transition-colors"
                >
                  <button
                    onClick={() => {
                      setOpen(false)
                      activate(ext)
                    }}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer py-1.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    title={ext.description || ext.name}
                  >
                    <ExtIcon ext={ext} />
                    <span className={`truncate ${ext.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>{ext.name}</span>
                    {ext.builtin && (
                      <span className="shrink-0 text-[9px] px-1 py-px rounded bg-primary/15 text-primary font-semibold">Built-in</span>
                    )}
                  </button>

                  <button
                    onClick={() => togglePin(ext.id)}
                    className={`${iconBtn} shrink-0 outline-none hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      isPinned ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title={isPinned ? 'Unpin from toolbar' : 'Pin to toolbar'}
                  >
                    {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                  </button>

                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={`${iconBtn} shrink-0 outline-none text-muted-foreground hover:text-foreground hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-primary/40 data-[state=open]:bg-background/60`}
                        title="More actions"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-52 bg-popover/95 dark:bg-[#121316]/95 backdrop-blur-2xl border border-border/80 shadow-2xl rounded-xl p-1 z-[60] text-xs"
                    >
                      <DropdownMenuItem onClick={() => togglePin(ext.id)} className="rounded-lg cursor-pointer gap-2">
                        {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                        {isPinned ? 'Unpin from toolbar' : 'Pin to toolbar'}
                      </DropdownMenuItem>
                      {ext.optionsUrl && (
                        <DropdownMenuItem
                          onClick={() => {
                            setOpen(false)
                            void openUrlInNewTab(ext.optionsUrl!)
                          }}
                          className="rounded-lg cursor-pointer gap-2"
                        >
                          <Settings2 className="w-3.5 h-3.5" />
                          Extension options
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => void api.extensions.setEnabled(ext.id, !ext.enabled).then(setList)}
                        className="rounded-lg cursor-pointer gap-2"
                      >
                        <Power className="w-3.5 h-3.5" />
                        {ext.enabled ? 'Turn off' : 'Turn on'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="my-1 bg-border/40" />
                      <DropdownMenuItem
                        onClick={() => {
                          const msg = ext.builtin
                            ? `Remove the built-in ${ext.name}? You can restore it later in Manage extensions.`
                            : `Remove ${ext.name}?`
                          if (!window.confirm(msg)) return
                          void api.extensions.remove(ext.id).then((next) => {
                            setList(next)
                            if (isPinned) togglePin(ext.id)
                            toast.success(`${ext.name} removed`)
                          })
                        }}
                        className="rounded-lg cursor-pointer gap-2 text-destructive focus:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-1.5 pt-1.5 border-t border-border/40 space-y-0.5">
          <button
            onClick={openManager}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-accent transition-colors cursor-pointer text-foreground"
          >
            <Puzzle className="w-4 h-4 text-muted-foreground" />
            Manage extensions
          </button>
          <button
            onClick={hideButton}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-accent transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <PinOff className="w-4 h-4" />
            Hide Extensions button
          </button>
          <button
            onClick={() => {
              setOpen(false)
              void openUrlInNewTab('https://chromewebstore.google.com/category/extensions')
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-accent transition-colors cursor-pointer text-foreground"
          >
            <Store className="w-4 h-4 text-muted-foreground" />
            <span className="flex-1 text-left">Get extensions</span>
            <ExternalLink className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
