import React, { useEffect, useState } from 'react'
import { TAB_DRAG_TYPE } from './TabGroupContext'
import type { Tab } from '@/types/api'

export type DropPosition = 'before' | 'after'
export type ReorderOrientation = 'vertical' | 'horizontal'

/**
 * Id of the tab being dragged. The drag payload can only be read on drop, so tabs announce the
 * drag with `tct:tab-drag-start` / `tct:tab-drag-end` and we track it here.
 */
export function useDraggingTabId(): string | null {
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    const start = (e: Event) => setId((e as CustomEvent).detail?.tabId ?? null)
    const end = () => setId(null)
    window.addEventListener('tct:tab-drag-start', start)
    window.addEventListener('tct:tab-drag-end', end)
    window.addEventListener('drop', end)
    return () => {
      window.removeEventListener('tct:tab-drag-start', start)
      window.removeEventListener('tct:tab-drag-end', end)
      window.removeEventListener('drop', end)
    }
  }, [])
  return id
}

/**
 * Turn a drag-over highlight off when the drag ends ANYWHERE. A drop handled by a child (e.g.
 * dropping onto another tab to reorder) stops propagation, so the parent's own onDrop /
 * onDragLeave never run and its highlight would otherwise stay on after the drag.
 */
export function useClearOnDragEnd(active: boolean, setActive: (value: boolean) => void): void {
  useEffect(() => {
    if (!active) return
    const clear = () => setActive(false)
    // Capture phase: runs even when a child's handler calls stopPropagation()
    window.addEventListener('dragend', clear, true)
    window.addEventListener('drop', clear, true)
    window.addEventListener('tct:tab-drag-end', clear)
    return () => {
      window.removeEventListener('dragend', clear, true)
      window.removeEventListener('drop', clear, true)
      window.removeEventListener('tct:tab-drag-end', clear)
    }
  }, [active, setActive])
}

/** Props that make an element a draggable tab (same payload as the sidebar: split view, groups…) */
export function tabDragProps(tab: Tab) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(TAB_DRAG_TYPE, tab.id)
      e.dataTransfer.setData('text/uri-list', tab.url)
      e.dataTransfer.effectAllowed = 'move'
      window.dispatchEvent(new CustomEvent('tct:tab-drag-start', { detail: { tabId: tab.id } }))
    },
    onDragEnd: () => window.dispatchEvent(new CustomEvent('tct:tab-drag-end'))
  }
}

interface TabDropOptions {
  tab: Tab
  draggingTab: Tab | null
  onReorder: (dragId: string, targetId: string, position: DropPosition) => void
  orientation?: ReorderOrientation
}

/**
 * Drop target for a tab: dragging another tab over it shows an insertion line before/after it
 * (by pointer position) and dropping moves the dragged tab there. Pinned and unpinned tabs only
 * reorder among themselves.
 */
export function useTabDrop({ tab, draggingTab, onReorder, orientation = 'vertical' }: TabDropOptions) {
  const [position, setPosition] = useState<DropPosition | null>(null)
  const canDrop = !!draggingTab && draggingTab.id !== tab.id && !!draggingTab.isPinned === !!tab.isPinned

  useEffect(() => {
    if (!draggingTab) setPosition(null)
  }, [draggingTab])

  const positionFor = (e: React.DragEvent): DropPosition => {
    const r = e.currentTarget.getBoundingClientRect()
    return orientation === 'horizontal'
      ? e.clientX < r.left + r.width / 2
        ? 'before'
        : 'after'
      : e.clientY < r.top + r.height / 2
      ? 'before'
      : 'after'
  }

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (!canDrop || !e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      const next = positionFor(e)
      if (next !== position) setPosition(next)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setPosition(null)
    },
    onDrop: (e: React.DragEvent) => {
      const dragId = e.dataTransfer.getData(TAB_DRAG_TYPE)
      const pos = position ?? positionFor(e)
      setPosition(null)
      if (!canDrop || !dragId) return
      e.preventDefault()
      e.stopPropagation()
      onReorder(dragId, tab.id, pos)
    }
  }

  const indicator = position ? (
    <span
      className={`pointer-events-none absolute rounded-full bg-primary z-20 ${
        orientation === 'horizontal'
          ? `top-1.5 bottom-1.5 w-0.5 ${position === 'before' ? '-left-px' : '-right-px'}`
          : `left-1 right-1 h-0.5 ${position === 'before' ? '-top-px' : '-bottom-px'}`
      }`}
    />
  ) : null

  return { dropProps, indicator }
}

interface ReorderSlotProps extends TabDropOptions {
  children: React.ReactNode
}

/** Sidebar wrapper around a tab (vertical list) */
export const ReorderSlot: React.FC<ReorderSlotProps> = ({ children, ...options }) => {
  const { dropProps, indicator } = useTabDrop(options)
  return (
    <div className="relative w-full min-w-0 flex justify-center" {...dropProps}>
      {indicator}
      {children}
    </div>
  )
}
