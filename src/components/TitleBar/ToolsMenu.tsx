import React from 'react'
import type { Tab } from '@/types/api'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  MoreHorizontal,
  Timer,
  Activity,
  Columns2,
  BookOpen,
  Tv2,
  FileText,
  Download,
  Star,
  History,
  Sparkles,
  Search,
  ArrowLeftRight,
  X,
  Plus,
  Globe,
  SlidersHorizontal,
  LayoutTemplate,
  ShieldCheck,
  Keyboard,
  AppWindow,
  Video,
  Eye,
  Puzzle,
  HelpCircle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize,
  PanelLeft,
  Code2,
  FolderOpen,
  Info,
  Bug,
  FileText as DocIcon,
  Sparkles as TourIcon,
  KeyRound,
  Wrench,
  EyeOff,
  Settings as SettingsIcon,
  Pin,
  PinOff,
  AlarmClock
} from 'lucide-react'
import { api } from '@/lib/ipc'
import { isPrivateWindow } from '@/lib/privateWindow'
import { useBrowserStore } from '@/store/useBrowserStore'
import { usePomodoroStore } from '@/store/usePomodoroStore'
import { useMeetingStore } from '@/store/useMeetingStore'
import { useSmartStore } from '@/store/useSmartStore'
import { watchActivePage } from '@/lib/watchPage'
import { modKey } from '@/lib/platform'
import { openNewTab } from '@/lib/startPage'
import { useHeaderPins, type HeaderFeatureId } from '@/lib/headerPins'
import { useExtensionsBar } from './ExtensionsPopover'
import { useFavoritesButton } from '@/lib/favorites'

/** ☆≡ icon, same as the toolbar Favorites button */
const FavoritesMenuIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`relative inline-block w-4 h-4 shrink-0 ${className}`}>
    <Star className="absolute left-0 top-0 w-3 h-3" />
    <span className="absolute right-0 bottom-[1px] flex flex-col gap-[2px]">
      <span className="block w-[6px] h-[1.5px] rounded bg-current" />
      <span className="block w-[6px] h-[1.5px] rounded bg-current" />
      <span className="block w-[6px] h-[1.5px] rounded bg-current" />
    </span>
  </span>
)

interface ToolsMenuProps {
  hasActiveDownload?: boolean
}

/** Run an action shared with keyboard shortcuts (handled in App) */
const runAction = (action: string) => window.dispatchEvent(new CustomEvent('tct:shortcut-action', { detail: action }))
const emit = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }))

/** Open a page in a new tab in the current space */
async function openInNewTab(url: string) {
  const store = useBrowserStore.getState()
  const spaceId = store.activeSpaceId || store.spaces[0]?.id
  if (!spaceId) return
  const tab = await api.tabs.create({ spaceId, url, title: 'Loading...' })
  store.insertTabNextTo(spaceId, tab, store.activeTabId, true)
}

const subItemCls = 'flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-xl cursor-pointer hover:bg-accent transition-colors'
const kbdCls = 'text-[10px] font-mono text-muted-foreground bg-accent/60 px-1.5 py-0.5 rounded border border-border/40'
const subContentCls =
  'w-60 bg-popover/95 dark:bg-[#121316]/95 backdrop-blur-2xl border border-border/80 text-foreground shadow-2xl rounded-2xl p-1.5 z-50 text-xs font-medium'
const subTriggerCls = 'flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer hover:bg-accent transition-colors'

const SubItem: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; kbd?: string; onSelect: () => void }> = ({
  icon: Icon,
  label,
  kbd,
  onSelect
}) => (
  <DropdownMenuItem onClick={onSelect} className={subItemCls}>
    <div className="flex items-center gap-2.5">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span>{label}</span>
    </div>
    {kbd && <kbd className={kbdCls}>{kbd}</kbd>}
  </DropdownMenuItem>
)

const rowCls = 'flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-xl cursor-pointer hover:bg-accent transition-colors'

const MenuRow: React.FC<{
  icon: React.ComponentType<{ className?: string }>
  iconCls?: string
  label: string
  kbd?: string
  right?: React.ReactNode
  pinId?: HeaderFeatureId
  /** Custom pin state (e.g. a toolbar button that can be shown / hidden) instead of pinId */
  pinned?: boolean
  onTogglePin?: () => void
  onSelect: () => void
}> = ({ icon: Icon, iconCls, label, kbd, right, pinId, pinned, onTogglePin, onSelect }) => {
  const headerPinned = useHeaderPins((s) => (pinId ? s.pinned.includes(pinId) : false))
  const toggleHeaderPin = useHeaderPins((s) => s.toggle)
  const isPinned = onTogglePin ? !!pinned : headerPinned
  const hasPin = !!pinId || !!onTogglePin
  const togglePin = () => (onTogglePin ? onTogglePin() : pinId && toggleHeaderPin(pinId))
  return (
    <DropdownMenuItem onClick={onSelect} className={`group ${rowCls}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className={`w-4 h-4 shrink-0 ${iconCls ?? 'text-foreground'}`} />
        <span className="truncate whitespace-nowrap">{label}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {right}
        {kbd && <kbd className={kbdCls}>{kbd}</kbd>}
        {hasPin && (
          <button
            type="button"
            title={isPinned ? 'Unpin from header' : 'Pin to header'}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              togglePin()
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={`w-5 h-5 flex items-center justify-center rounded-md transition-opacity hover:bg-background/60 cursor-pointer ${
              isPinned ? 'text-primary opacity-100' : 'text-muted-foreground opacity-0 group-hover:opacity-100 group-data-[highlighted]:opacity-100'
            }`}
          >
            {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
          </button>
        )}
      </div>
    </DropdownMenuItem>
  )
}

const Badge: React.FC<{ cls: string; children: React.ReactNode }> = ({ cls, children }) => (
  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${cls}`}>{children}</span>
)

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <DropdownMenuLabel className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider px-2 py-1">
    {children}
  </DropdownMenuLabel>
)

const NO_TABS: Tab[] = []

const Separator = () => <DropdownMenuSeparator className="my-1 bg-border/40" />

/** Row that opens a group submenu on hover (module level: stable across re-renders) */
const GroupTrigger = ({
  icon: Icon,
  iconCls,
  label,
  status
}: {
  icon: React.ComponentType<{ className?: string }>
  iconCls?: string
  label: string
  status?: React.ReactNode
}) => (
  <DropdownMenuSubTrigger className={subTriggerCls}>
    <Icon className={`w-4 h-4 shrink-0 ${iconCls ?? 'text-foreground'}`} />
    <span className="flex-1 truncate">{label}</span>
    {status}
  </DropdownMenuSubTrigger>
)

export const ToolsMenu: React.FC<ToolsMenuProps> = ({ hasActiveDownload = false }) => {
  const setTaskManagerOpen = useBrowserStore((s) => s.setTaskManagerOpen)
  const showExtButton = useExtensionsBar((s) => s.showButton)
  const showFavButton = useFavoritesButton((s) => s.show)
  const setShowFavButton = useFavoritesButton((s) => s.setShow)
  const setShowExtButton = useExtensionsBar((s) => s.setShowButton)
  const setHistoryDialogOpen = useBrowserStore((s) => s.setHistoryDialogOpen)
  const setBookmarksDialogOpen = useBrowserStore((s) => s.setBookmarksDialogOpen)
  const setZenMode = useBrowserStore((s) => s.setZenMode)
  const zenMode = useBrowserStore((s) => s.zenMode)

  // Split View state from store
  const activeSpaceId = useBrowserStore((s) => s.activeSpaceId)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const currentTabs = useBrowserStore((s) => (s.activeSpaceId ? s.tabsBySpace[s.activeSpaceId] : undefined)) ?? NO_TABS
  const splitTabId = useBrowserStore((s) => s.splitTabId)
  const splitRatio = useBrowserStore((s) => s.splitRatio)
  const setSplitTabId = useBrowserStore((s) => s.setSplitTabId)
  const setSplitRatio = useBrowserStore((s) => s.setSplitRatio)
  const closeSplitView = useBrowserStore((s) => s.closeSplitView)
  const setActiveTabId = useBrowserStore((s) => s.setActiveTabId)

  // Pomodoro state
  const isPomodoroRunning = usePomodoroStore((s) => s.isRunning)
  const pomodoroTimeLeft = usePomodoroStore((s) => s.timeLeft)
  const pomodoroMode = usePomodoroStore((s) => s.mode)
  const setPomodoroOpen = usePomodoroStore((s) => s.setIsOpen)
  const setMeetingOpen = useMeetingStore((s) => s.setDialogOpen)
  const meetingActive = useMeetingStore((s) => !!s.active)
  const focusMeeting = useMeetingStore((s) => s.focus)

  const otherTabs = currentTabs.filter((t) => t.id !== activeTabId)
  const isSplitActive = Boolean(splitTabId && currentTabs.some((t) => t.id === splitTabId))

  const pomodoroMinutes = Math.floor(pomodoroTimeLeft / 60)
  const pomodoroSeconds = pomodoroTimeLeft % 60
  const pomodoroFormatted = `${pomodoroMinutes.toString().padStart(2, '0')}:${pomodoroSeconds.toString().padStart(2, '0')}`

  const handleSwapSplit = () => {
    if (!splitTabId) return
    useBrowserStore.getState().swapSplit()
  }

  // Submenus open on hover and never grow past the screen (they scroll instead)
  const groupContentCls = `${subContentCls} w-64 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto`
  const dot = (cls: string) => <span className={`w-1.5 h-1.5 rounded-full ${cls}`} />

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          title="Tools & Features"
        >
          <MoreHorizontal className="w-4 h-4" />

          {/* Indicator badges */}
          {hasActiveDownload && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary ring-2 ring-background animate-pulse" />
          )}
          {isPomodoroRunning && !hasActiveDownload && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-background animate-pulse" />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        collisionPadding={8}
        className="w-64 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto bg-popover/95 dark:bg-[#121316]/95 backdrop-blur-2xl border border-border/80 text-foreground shadow-2xl rounded-2xl p-1.5 z-50 text-xs font-medium select-none"
      >
        {/* Everyday actions stay at the top level */}
        <MenuRow icon={Plus} iconCls="text-primary" label="New tab" kbd={`${modKey}+T`} onSelect={() => void openNewTab()} />
        {!isPrivateWindow && (
          <MenuRow icon={EyeOff} iconCls="text-violet-500" label="New private window" kbd="Alt+Shift+N" onSelect={() => emit('tct:new-private-tab')} />
        )}
        <Separator />
        <MenuRow
          icon={FavoritesMenuIcon}
          iconCls="text-foreground"
          label="Favorites"
          kbd={`${modKey}+Shift+O`}
          pinned={showFavButton}
          onTogglePin={() => setShowFavButton(!showFavButton)}
          onSelect={() => {
            // Open the toolbar panel if its button is shown, otherwise the full manager
            if (showFavButton) setTimeout(() => emit('tct:open-favorites'), 60)
            else setBookmarksDialogOpen(true)
          }}
        />
        <MenuRow icon={Star} iconCls="text-amber-500" pinId="bookmarks" label="Bookmarks" kbd={`${modKey}+D`} onSelect={() => setBookmarksDialogOpen(true)} />
        <MenuRow icon={History} pinId="history" label="History" kbd={`${modKey}+H`} onSelect={() => setHistoryDialogOpen(true)} />
        <MenuRow
          icon={Download}
          pinId="downloads"
          label="Downloads"
          kbd={`${modKey}+J`}
          onSelect={() => emit('open-downloads')}
          right={hasActiveDownload ? dot('bg-primary animate-pulse') : undefined}
        />
        <Separator />

        {/* Productivity & Focus */}
        <DropdownMenuSub>
          <GroupTrigger
            icon={Timer}
            iconCls="text-primary"
            label="Productivity & Focus"
            status={
              isPomodoroRunning ? (
                <span className="text-[10.5px] font-mono font-bold text-primary">{pomodoroFormatted}</span>
              ) : meetingActive ? (
                dot('bg-rose-500')
              ) : undefined
            }
          />
          <DropdownMenuSubContent className={groupContentCls} collisionPadding={8}>
            <MenuRow
              icon={Timer}
              iconCls={isPomodoroRunning ? 'text-primary animate-pulse' : 'text-primary'}
              pinId="focus-timer"
              label="Focus Timer"
              onSelect={() => setPomodoroOpen(true)}
              right={
                <span className="text-[11px] font-mono font-semibold text-muted-foreground">
                  {isPomodoroRunning ? <span className="text-primary font-bold">{pomodoroFormatted}</span> : '25m'}
                </span>
              }
            />
            <MenuRow
              icon={Video}
              iconCls="text-rose-500"
              pinId="meeting"
              label={meetingActive ? 'Go to Meeting' : 'Meeting Mode'}
              onSelect={() => (meetingActive ? focusMeeting() : setMeetingOpen(true))}
              right={meetingActive ? <Badge cls="bg-rose-500/15 text-rose-500">Active</Badge> : undefined}
            />
            <MenuRow icon={Activity} iconCls="text-emerald-500" pinId="task-manager" label="Task Manager" kbd="Shift+Esc" onSelect={() => setTaskManagerOpen(true)} />
            <MenuRow icon={Sparkles} iconCls="text-purple-400" pinId="zen" label="Zen Mode" kbd="F11" onSelect={() => setZenMode(!zenMode)} />
            <MenuRow icon={FileText} pinId="notes" label="Space Notes" kbd={`${modKey}+Shift+N`} onSelect={() => emit('tct:toggle-notes')} />
            {!isPrivateWindow && (
              <>
                <Separator />
                <MenuRow icon={Eye} iconCls="text-sky-500" label="Watch this page for changes" onSelect={() => setTimeout(() => void watchActivePage(), 80)} />
                <MenuRow icon={AlarmClock} iconCls="text-amber-500" label="Snoozed tabs" onSelect={() => useSmartStore.getState().openSmartTools('snoozed')} />
                <MenuRow icon={Wrench} iconCls="text-primary" label="Smart Tools" onSelect={() => useSmartStore.getState().openSmartTools()} />
              </>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* View & Panes (also holds what the old View submenu had) */}
        <DropdownMenuSub>
          <GroupTrigger
            icon={Columns2}
            iconCls={isSplitActive ? 'text-primary' : undefined}
            label="View & Panes"
            status={isSplitActive ? <Badge cls="bg-primary/20 text-primary">Split</Badge> : undefined}
          />
          <DropdownMenuSubContent className={groupContentCls} collisionPadding={8}>
            <MenuRow
              icon={Columns2}
              iconCls={isSplitActive ? 'text-primary' : undefined}
              pinId="split"
              label="Split View"
              onSelect={() => emit('tct:toggle-split-view')}
              right={isSplitActive ? <Badge cls="bg-primary/20 text-primary">Active</Badge> : undefined}
              kbd={isSplitActive ? undefined : `${modKey}+\\`}
            />
            {isSplitActive && (
              <div className="px-2.5 py-1.5 mx-1 my-1 space-y-1.5 rounded-xl bg-muted/40 border border-border/50 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Panes & Ratio</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSwapSplit()
                    }}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <ArrowLeftRight className="w-3 h-3" />
                    <span>Swap</span>
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      [0.5, '50/50'],
                      [0.7, '70/30'],
                      [0.3, '30/70']
                    ] as const
                  ).map(([ratio, text]) => (
                    <button
                      key={text}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSplitRatio(ratio)
                      }}
                      className={`py-1 rounded-lg text-xs font-medium border text-center transition-colors cursor-pointer ${
                        Math.abs(splitRatio - ratio) < 0.05
                          ? 'border-primary bg-primary/15 text-primary font-bold'
                          : 'border-border/60 hover:bg-accent text-foreground'
                      }`}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!isSplitActive && otherTabs.length > 1 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className={`${subTriggerCls} text-muted-foreground`}>
                  <Columns2 className="w-3.5 h-3.5" />
                  <span>Split with tab…</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className={groupContentCls} collisionPadding={8}>
                  {otherTabs.map((tab) => (
                    <DropdownMenuItem
                      key={tab.id}
                      onClick={() => setSplitTabId(tab.id)}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl cursor-pointer hover:bg-accent"
                    >
                      <Globe className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="truncate">{tab.title || 'Untitled Tab'}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <MenuRow icon={BookOpen} pinId="reader" label="Reader Mode" kbd="F9" onSelect={() => emit('tct:toggle-reader-mode')} />
            <MenuRow icon={Tv2} pinId="pip" label="Picture-in-Picture" kbd={`${modKey}+Shift+P`} onSelect={() => emit('tct:toggle-pip')} />
            <Separator />
            <SubItem icon={ZoomIn} label="Zoom in" kbd={`${modKey}+=`} onSelect={() => runAction('zoom-in')} />
            <SubItem icon={ZoomOut} label="Zoom out" kbd={`${modKey}+-`} onSelect={() => runAction('zoom-out')} />
            <SubItem icon={RotateCcw} label="Actual size" kbd={`${modKey}+0`} onSelect={() => runAction('zoom-reset')} />
            <Separator />
            <SubItem icon={Maximize} label="Full screen" onSelect={() => void api.window.toggleFullScreen?.()} />
            <SubItem icon={PanelLeft} label="Show / hide sidebar" kbd={`${modKey}+B`} onSelect={() => runAction('toggle-sidebar')} />
            <SubItem icon={Code2} label="Developer tools" kbd="F12" onSelect={() => runAction('toggle-devtools')} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* More tools */}
        <DropdownMenuSub>
          <GroupTrigger icon={Wrench} label="More tools" />
          <DropdownMenuSubContent className={groupContentCls} collisionPadding={8}>
            <MenuRow icon={KeyRound} iconCls="text-primary" pinId="passwords" label="Passwords" onSelect={() => emit('tct:open-passwords')} />
            <MenuRow icon={Search} pinId="find" label="Find in Page" kbd={`${modKey}+F`} onSelect={() => emit('tct:toggle-find')} />
            <MenuRow
              icon={AppWindow}
              iconCls="text-primary"
              pinId="tab-search"
              label="Search Tabs"
              kbd={`${modKey}+Shift+A`}
              onSelect={() => emit('tct:open-tab-search')}
            />
            <MenuRow icon={LayoutTemplate} pinId="templates" label="Space Templates" onSelect={() => emit('tct:open-space-templates')} />
            <MenuRow icon={ShieldCheck} iconCls="text-emerald-500" pinId="privacy" label="Privacy Report" onSelect={() => emit('tct:open-privacy-report')} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Extensions */}
        <DropdownMenuSub>
          <GroupTrigger icon={Puzzle} label="Extensions" />
          <DropdownMenuSubContent className={groupContentCls} collisionPadding={8}>
            <SubItem
              icon={showExtButton ? PinOff : Pin}
              label={showExtButton ? 'Unpin Extensions button' : 'Pin Extensions button'}
              onSelect={() => setShowExtButton(!showExtButton)}
            />
            <SubItem icon={Puzzle} label="Manage extensions" onSelect={() => emit('tct:open-extensions')} />
            <SubItem icon={FolderOpen} label="Open extensions folder" onSelect={() => void api.extensions?.openFolder()} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Help */}
        <DropdownMenuSub>
          <GroupTrigger icon={HelpCircle} label="Help" />
          <DropdownMenuSubContent className={groupContentCls} collisionPadding={8}>
            <SubItem icon={Keyboard} label="Keyboard shortcuts" kbd={`${modKey}+/`} onSelect={() => emit('tct:open-shortcut-help')} />
            <SubItem icon={TourIcon} label="Welcome tour" onSelect={() => emit('tct:open-onboarding')} />
            <SubItem icon={Bug} label="Report a problem" onSelect={() => void openInNewTab('https://github.com/tctorbit/tct-orbit/issues')} />
            <DropdownMenuSeparator className="my-1 bg-border/40" />
            <SubItem icon={DocIcon} label="Privacy policy" onSelect={() => emit('tct:open-legal', { doc: 'privacy' })} />
            <SubItem icon={DocIcon} label="Terms of use" onSelect={() => emit('tct:open-legal', { doc: 'terms' })} />
            <SubItem icon={Info} label="About TCT Orbit" onSelect={() => emit('tct:open-about')} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <Separator />
        <MenuRow icon={SettingsIcon} label="Settings" kbd={`${modKey}+,`} onSelect={() => emit('open-settings')} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
