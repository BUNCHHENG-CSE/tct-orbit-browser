import React, { useState, useRef } from 'react'
import {
  Plus,
  FolderPlus,
  Layers,
  Compass,
  Globe,
  Briefcase,
  BookOpen,
  Music,
  Code,
  Star,
  Sparkles,
  Check,
  Pencil,
  Trash2,
  LayoutGrid,
  Search,
  X,
  Flame,
  Heart,
  Cpu,
  Coffee,
  Bookmark,
  Zap,
  Terminal,
  Folder
} from 'lucide-react'
import { useSpaces } from '@/hooks/useSpaces'
import { useSettings } from '@/hooks/useSettings'
import { useBrowserStore } from '@/store/useBrowserStore'
import { SEARCH_ENGINES, type SearchEngineId } from '@/lib/searchEngines'
import browserLogo from '@/assets/logo.png'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import type { Space } from '@/types/api'

const PRESET_COLORS = [
  '#6366f1', // Indigo
  '#ec4899', // Pink
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#ef4444', // Red
  '#14b8a6', // Teal
  '#f97316'  // Orange
]

const ICONS_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Layers,
  Compass,
  Globe,
  Briefcase,
  BookOpen,
  Music,
  Code,
  Star,
  Sparkles,
  Flame,
  Heart,
  Cpu,
  Coffee,
  Bookmark,
  Zap,
  Terminal,
  Folder
}

interface SpaceSwitcherProps {
  collapsed?: boolean
}

export const SpaceSwitcher: React.FC<SpaceSwitcherProps> = ({ collapsed = false }) => {
  const { spaces, activeSpaceId, setActive, createSpace, updateSpace, removeSpace } = useSpaces()
  const { settings } = useSettings()
  const tabsBySpace = useBrowserStore((s) => s.tabsBySpace)

  const currentEngine = (settings?.defaultSearchEngine as SearchEngineId) || 'duckduckgo'
  const engineMeta = SEARCH_ENGINES[currentEngine] || SEARCH_ENGINES.duckduckgo

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [spacesHubOpen, setSpacesHubOpen] = useState(false)
  const [editingSpace, setEditingSpace] = useState<Space | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Create form state
  const [name, setName] = useState('')
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0])
  const [selectedIcon, setSelectedIcon] = useState('Layers')

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState(PRESET_COLORS[0])
  const [editIcon, setEditIcon] = useState('Layers')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const lastWheelTimeRef = useRef(0)

  // Helper: tab count for a given space
  const getTabCount = (space: Space): number => {
    return tabsBySpace[space.id]?.length ?? space.tabs?.length ?? 0
  }

  // Smooth mouse-wheel cycle across spaces when hovering over the dock
  const handleWheel = (e: React.WheelEvent) => {
    if (spaces.length <= 1) return
    const now = Date.now()
    if (now - lastWheelTimeRef.current < 220) return
    lastWheelTimeRef.current = now

    const currentIdx = spaces.findIndex((s) => s.id === activeSpaceId)
    if (currentIdx === -1) return

    if (e.deltaY > 0) {
      const nextIdx = (currentIdx + 1) % spaces.length
      setActive(spaces[nextIdx].id)
    } else if (e.deltaY < 0) {
      const prevIdx = (currentIdx - 1 + spaces.length) % spaces.length
      setActive(spaces[prevIdx].id)
    }
  }

  // Smart Visible Spaces Calculation:
  // Cap dock at MAX_QUICK items (2) so spaces don't push tabs down.
  // Ensure the active space is ALWAYS in the quick dock.
  const MAX_QUICK = 2

  const isOverLimit = spaces.length > MAX_QUICK
  let visibleSpaces = spaces.slice(0, MAX_QUICK)

  if (isOverLimit && activeSpaceId) {
    const activeIdx = spaces.findIndex((s) => s.id === activeSpaceId)
    if (activeIdx >= MAX_QUICK) {
      // Replace the last dock slot with the currently active space
      visibleSpaces = [...spaces.slice(0, MAX_QUICK - 1), spaces[activeIdx]]
    }
  }
  const overflowCount = Math.max(0, spaces.length - visibleSpaces.length)

  // Filtered spaces for Spaces Hub
  const filteredSpaces = spaces.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  )

  const handleCreateSpace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    try {
      setIsSubmitting(true)
      const newSpace = await createSpace({
        name: name.trim(),
        color: selectedColor,
        icon: selectedIcon,
        initialUrl: engineMeta.homeUrl,
        initialTitle: engineMeta.name
      })
      await setActive(newSpace.id)
      if (newSpace.tabs && newSpace.tabs.length > 0) {
        useBrowserStore.getState().setActiveTabId(newSpace.tabs[0].id)
      }
      setName('')
      setCreateDialogOpen(false)
      toast.success(`Space "${newSpace.name}" created`)
    } catch (err) {
      console.error('Failed to create space:', err)
      toast.error('Failed to create space')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenEdit = (space: Space) => {
    setEditingSpace(space)
    setEditName(space.name)
    setEditColor(space.color)
    setEditIcon(space.icon)
    setEditDialogOpen(true)
  }

  const handleUpdateSpace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSpace || !editName.trim()) return

    try {
      setIsSubmitting(true)
      await updateSpace(editingSpace.id, {
        name: editName.trim(),
        color: editColor,
        icon: editIcon
      })
      toast.success('Space updated')
      setEditDialogOpen(false)
    } catch (err) {
      console.error('Failed to update space:', err)
      toast.error('Failed to update space')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteSpace = async (spaceId: string) => {
    if (spaces.length <= 1) {
      toast.error('Cannot delete the only remaining space.')
      return
    }

    try {
      if (spaceId === activeSpaceId) {
        const remaining = spaces.filter((s) => s.id !== spaceId)
        if (remaining.length > 0) {
          await setActive(remaining[0].id)
        }
      }
      await removeSpace(spaceId)
      toast.success('Space deleted')
      setEditDialogOpen(false)
    } catch (err) {
      console.error('Failed to delete space:', err)
      toast.error('Failed to delete space')
    }
  }

  const renderIcon = (iconName: string, className = 'w-4 h-4') => {
    const IconComponent = ICONS_MAP[iconName] || Layers
    return <IconComponent className={className} />
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div
        onWheel={handleWheel}
        className={
          collapsed
            ? 'flex flex-col items-center gap-1.5 p-1 rounded-2xl bg-muted/60 border border-border shadow-inner'
            : 'flex items-center gap-1.5 p-1.5 rounded-2xl bg-muted/60 border border-border shadow-inner overflow-x-auto scrollbar-none'
        }
      >
        {/* Quick Dock Visible Spaces */}
        {visibleSpaces.map((space) => {
          const isActive = space.id === activeSpaceId
          const tabCount = getTabCount(space)

          return (
            <ContextMenu key={space.id}>
              <ContextMenuTrigger asChild>
                <div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setActive(space.id)}
                        className={`relative flex items-center justify-center transition-all duration-200 shrink-0 cursor-pointer ${
                          collapsed
                            ? `w-9 h-9 rounded-xl ${
                                isActive
                                  ? 'scale-105 shadow-md ring-1.5 ring-foreground/80'
                                  : 'hover:scale-105 opacity-80 hover:opacity-100'
                              }`
                            : `w-8 h-8 rounded-xl ${
                                isActive
                                  ? 'scale-105 shadow-md ring-2 ring-foreground/70 ring-offset-2 ring-offset-background'
                                  : 'opacity-70 hover:opacity-100 hover:scale-105'
                              }`
                        }`}
                        style={
                          collapsed && !isActive
                            ? {
                                backgroundColor: `${space.color}25`,
                                border: '1px solid rgba(120, 120, 140, 0.2)'
                              }
                            : {
                                backgroundColor: space.color,
                                boxShadow: isActive ? `0 0 14px ${space.color}80` : undefined
                              }
                        }
                        aria-label={space.name}
                      >
                        {/* Collapsed active indicator bar */}
                        {collapsed && isActive && (
                          <span className="absolute -left-1 top-2 bottom-2 w-0.5 rounded-r-full bg-foreground shadow-sm" />
                        )}
                        <span style={collapsed && !isActive ? { color: space.color } : { color: '#ffffff' }}>
                          {renderIcon(space.icon, 'w-4 h-4')}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side={collapsed ? 'right' : 'bottom'}>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-xs">{space.name}</span>
                          {isActive && <span className="text-[10px] opacity-70">• Active</span>}
                        </div>
                        <p className="text-[10px] opacity-60">
                          {tabCount} {tabCount === 1 ? 'tab' : 'tabs'} open
                        </p>
                        <p className="text-[9px] opacity-40">Right-click to edit or delete</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </ContextMenuTrigger>

              <ContextMenuContent className="w-44 bg-popover text-popover-foreground border border-border shadow-xl rounded-xl p-1 z-50">
                <ContextMenuItem
                  onClick={() => handleOpenEdit(space)}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-accent text-foreground"
                >
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Edit Space</span>
                </ContextMenuItem>
                <ContextMenuSeparator className="my-1 bg-border" />
                <ContextMenuItem
                  onClick={() => handleDeleteSpace(space.id)}
                  disabled={spaces.length <= 1}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer text-destructive hover:bg-destructive/10 disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Space</span>
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          )
        })}

        {/* Spaces Hub Overflow Button (when spaces > 2) */}
        {isOverLimit && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  setSearchQuery('')
                  setSpacesHubOpen(true)
                }}
                className={
                  collapsed
                    ? 'relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors bg-muted/70 hover:bg-muted border border-border text-foreground hover:scale-105 active:scale-95 cursor-pointer group shrink-0'
                    : 'relative flex items-center gap-1.5 px-2.5 h-8 rounded-xl bg-muted/70 hover:bg-muted text-foreground border border-border text-xs font-semibold transition-colors hover:scale-105 active:scale-95 shrink-0 cursor-pointer group'
                }
                aria-label="Spaces Hub"
              >
                <LayoutGrid className="w-4 h-4 transition-transform group-hover:scale-110" />
                {collapsed ? (
                  <span className="absolute -top-1 -right-1 min-w-[17px] h-4 px-1 rounded-full text-[9px] font-bold bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                    +{overflowCount}
                  </span>
                ) : (
                  <span>+{overflowCount}</span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side={collapsed ? 'right' : 'bottom'}>
              <div className="space-y-0.5">
                <p className="font-semibold text-xs">Spaces Hub</p>
                <p className="text-[10px] opacity-70">
                  {spaces.length} spaces total ({overflowCount} more)
                </p>
                <p className="text-[9px] opacity-40">Click to search, switch, or manage</p>
              </div>
            </TooltipContent>
          </Tooltip>
        )}

        {/* New Space Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setCreateDialogOpen(true)}
              className={
                collapsed
                  ? 'w-9 h-9 rounded-xl border border-dashed border-border hover:border-primary/50 text-muted-foreground hover:text-foreground bg-transparent hover:bg-muted/50 transition-colors flex items-center justify-center shrink-0 cursor-pointer hover:scale-105 active:scale-95'
                  : 'flex items-center justify-center w-8 h-8 rounded-xl bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 border border-border cursor-pointer hover:scale-105 active:scale-95'
              }
              aria-label="New Space"
            >
              {collapsed ? <FolderPlus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side={collapsed ? 'right' : 'bottom'}>
            <p>New Space</p>
          </TooltipContent>
        </Tooltip>

        {/* Spaces Hub Modal (for 100+ Spaces) */}
        <Dialog open={spacesHubOpen} onOpenChange={setSpacesHubOpen}>
          <DialogContent className="w-[92vw] max-w-xl max-h-[85vh] p-0 overflow-hidden bg-card text-card-foreground border border-border shadow-2xl rounded-2xl flex flex-col">
            {/* Header */}
            <div className="p-5 pb-3 border-b border-border bg-muted/30 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <img
                    src={browserLogo}
                    alt="TCT Orbit"
                    className="w-8 h-8 rounded-xl object-contain shadow-xs shrink-0"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <DialogTitle className="text-base font-bold text-foreground">
                        Spaces Hub
                      </DialogTitle>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary border border-primary/20">
                        {spaces.length} {spaces.length === 1 ? 'Space' : 'Spaces'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Search, switch, and manage all your workspace environments
                    </p>
                  </div>
                </div>
              </div>

              {/* Real-time Search Filter */}
              <div className="relative mt-4">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter spaces by name... (e.g. Work, Research, Personal)"
                  className="pl-9 pr-9 h-9 text-xs rounded-xl bg-background border border-border"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Spaces Grid */}
            <div className="p-4 flex-1 overflow-y-auto max-h-[50vh] min-h-0">
              {filteredSpaces.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-xs text-muted-foreground">
                    No spaces found matching &ldquo;{searchQuery}&rdquo;
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 text-xs"
                    onClick={() => {
                      setName(searchQuery)
                      setSpacesHubOpen(false)
                      setCreateDialogOpen(true)
                    }}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Create Space &ldquo;{searchQuery}&rdquo;
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredSpaces.map((space) => {
                    const isActive = space.id === activeSpaceId
                    const tabCount = getTabCount(space)

                    return (
                      <div
                        key={space.id}
                        onClick={() => {
                          setActive(space.id)
                          setSpacesHubOpen(false)
                        }}
                        className={`group relative flex items-center justify-between p-2.5 rounded-xl border transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-primary/15 border-primary/40 shadow-sm ring-1 ring-primary/30'
                            : 'bg-muted/30 hover:bg-muted/60 border-border text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white shadow-sm transition-transform group-hover:scale-105"
                            style={{
                              backgroundColor: space.color,
                              boxShadow: isActive ? `0 0 12px ${space.color}80` : undefined
                            }}
                          >
                            {renderIcon(space.icon, 'w-4 h-4')}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-xs truncate text-foreground">
                                {space.name}
                              </span>
                              {isActive && (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-primary text-primary-foreground shrink-0">
                                  Active
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground block mt-0.5">
                              {tabCount} {tabCount === 1 ? 'tab' : 'tabs'}
                            </span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            type="button"
                            title="Edit Space"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSpacesHubOpen(false)
                              handleOpenEdit(space)
                            }}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Delete Space"
                            disabled={spaces.length <= 1}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteSpace(space.id)
                            }}
                            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <DialogFooter className="px-5 py-3 border-t border-border flex items-center justify-between sm:justify-between w-full bg-muted/30 shrink-0">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>Scroll wheel on dock to cycle spaces</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSpacesHubOpen(false)
                    setCreateDialogOpen(true)
                  }}
                  className="text-xs flex items-center gap-1.5 h-8"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Space</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setSpacesHubOpen(false)}
                  className="text-xs h-8"
                >
                  Done
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Space Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-foreground">Create New Space</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateSpace} className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  Space Name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Work, Research, Personal"
                  autoFocus
                  required
                />
              </div>

              {/* Color Preset Palette */}
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  Theme Color
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setSelectedColor(color)}
                      className="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 cursor-pointer"
                      style={{ backgroundColor: color }}
                    >
                      {selectedColor === color && <Check className="w-4 h-4 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Icon Selector */}
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  Icon
                </label>
                <div className="grid grid-cols-6 gap-2 max-h-36 overflow-y-auto p-1">
                  {Object.keys(ICONS_MAP).map((iconKey) => {
                    const isSelected = selectedIcon === iconKey
                    return (
                      <button
                        key={iconKey}
                        type="button"
                        onClick={() => setSelectedIcon(iconKey)}
                        className={`flex items-center justify-center p-2 rounded-lg border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-primary/10 border-primary text-primary shadow-sm'
                            : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        {renderIcon(iconKey, 'w-4 h-4')}
                      </button>
                    )
                  })}
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!name.trim() || isSubmitting}>
                  Create Space
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Space Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-foreground">Edit Space</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateSpace} className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  Space Name
                </label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Space Name"
                  autoFocus
                  required
                />
              </div>

              {/* Color Preset Palette */}
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  Theme Color
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setEditColor(color)}
                      className="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 cursor-pointer"
                      style={{ backgroundColor: color }}
                    >
                      {editColor === color && <Check className="w-4 h-4 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Icon Selector */}
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">
                  Icon
                </label>
                <div className="grid grid-cols-6 gap-2 max-h-36 overflow-y-auto p-1">
                  {Object.keys(ICONS_MAP).map((iconKey) => {
                    const isSelected = editIcon === iconKey
                    return (
                      <button
                        key={iconKey}
                        type="button"
                        onClick={() => setEditIcon(iconKey)}
                        className={`flex items-center justify-center p-2 rounded-lg border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-primary/10 border-primary text-primary shadow-sm'
                            : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        {renderIcon(iconKey, 'w-4 h-4')}
                      </button>
                    )
                  })}
                </div>
              </div>

              <DialogFooter className="pt-2 flex items-center justify-between sm:justify-between w-full">
                {editingSpace && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={spaces.length <= 1}
                    onClick={() => handleDeleteSpace(editingSpace.id)}
                    className="flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </Button>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setEditDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!editName.trim() || isSubmitting}>
                    Save Changes
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
