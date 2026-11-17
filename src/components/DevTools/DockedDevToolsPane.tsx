import React, { useRef, useEffect, useState, useCallback } from 'react'
import {
  Code2,
  ExternalLink,
  X
} from 'lucide-react'
import { api } from '@/lib/ipc'
import { useBrowserStore } from '@/store/useBrowserStore'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export const DockedDevToolsPane: React.FC = () => {
  const devtoolsOpen = useBrowserStore((s) => s.devtoolsOpen)
  const devtoolsDetached = useBrowserStore((s) => s.devtoolsDetached)
  const devtoolsWidth = useBrowserStore((s) => s.devtoolsWidth)
  const setDevToolsOpen = useBrowserStore((s) => s.setDevToolsOpen)
  const setDevToolsDetached = useBrowserStore((s) => s.setDevToolsDetached)
  const setDevToolsWidth = useBrowserStore((s) => s.setDevToolsWidth)
  const activeTabId = useBrowserStore((s) => s.activeTabId)

  const containerRef = useRef<HTMLDivElement>(null)
  const contentAreaRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(devtoolsWidth)
  const currentWidthRef = useRef(devtoolsWidth)
  const dragRafRef = useRef<number | null>(null)

  // Sync devtools state from Electron IPC
  useEffect(() => {
    if (api.devtools?.onStateChanged) {
      const unsub = api.devtools.onStateChanged((state) => {
        setDevToolsOpen(state.isOpen)
        setDevToolsDetached(state.isDetached)
      })
      return () => {
        if (typeof unsub === 'function') unsub()
      }
    }
  }, [setDevToolsOpen, setDevToolsDetached])

  // Sync docked bounds to Electron WebContentsView via direct measurement
  const syncBounds = useCallback(() => {
    if (!devtoolsOpen || devtoolsDetached || !contentAreaRef.current) return
    const rect = contentAreaRef.current.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0 && api.devtools?.updateBounds) {
      api.devtools.updateBounds({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      })
    }
  }, [devtoolsOpen, devtoolsDetached])

  // High-performance ResizeObserver with requestAnimationFrame throttling for buttery smooth responsiveness
  useEffect(() => {
    if (!devtoolsOpen || devtoolsDetached || !contentAreaRef.current) return

    let rafId: number | null = null
    const ro = new ResizeObserver(() => {
      // If user is currently dragging the splitter, bounds are updated via the direct drag loop
      if (isDraggingRef.current) return
      if (rafId !== null) return

      rafId = requestAnimationFrame(() => {
        rafId = null
        syncBounds()
      })
    })

    ro.observe(contentAreaRef.current)
    syncBounds()

    return () => {
      ro.disconnect()
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [devtoolsOpen, devtoolsDetached, syncBounds, activeTabId])

  // Ultra-smooth 60/120fps Splitter drag handling with zero React re-render overhead during drag
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    setIsDragging(true)
    startXRef.current = e.clientX
    startWidthRef.current = currentWidthRef.current || devtoolsWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return
      const delta = startXRef.current - moveEvent.clientX
      const maxW = Math.round(window.innerWidth * 0.75)
      const minW = 280
      const nextWidth = Math.min(maxW, Math.max(minW, startWidthRef.current + delta))
      currentWidthRef.current = nextWidth

      // 1. Direct DOM manipulation for zero latency (avoids re-rendering entire React tree on mousemove)
      if (containerRef.current) {
        containerRef.current.style.width = `${nextWidth}px`
      }

      // 2. Throttled IPC bounds update to native Electron WebContentsView via RAF
      if (dragRafRef.current === null) {
        dragRafRef.current = requestAnimationFrame(() => {
          dragRafRef.current = null
          if (contentAreaRef.current && api.devtools?.updateBounds) {
            const rect = contentAreaRef.current.getBoundingClientRect()
            api.devtools.updateBounds({
              x: Math.round(rect.left),
              y: Math.round(rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            })
          }
        })
      }
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
      setIsDragging(false)
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current)
        dragRafRef.current = null
      }
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)

      // Commit final width to persistent store once drag finishes
      setDevToolsWidth(currentWidthRef.current)
      syncBounds()
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  const handleClose = async () => {
    setDevToolsOpen(false)
    if (api.devtools?.close) {
      await api.devtools.close()
    }
  }

  const handleDetach = async () => {
    setDevToolsDetached(true)
    if (api.devtools?.detach) {
      await api.devtools.detach()
    }
  }

  if (!devtoolsOpen || devtoolsDetached) return null

  return (
    <TooltipProvider delayDuration={200}>
      {/* Full-screen mouse capture shield active during splitter drag to prevent webview/devtools pointer hijacking */}
      {isDragging && (
        <div className="fixed inset-0 z-[9999] cursor-col-resize select-none pointer-events-auto bg-transparent" />
      )}

      <aside
        ref={containerRef}
        style={{
          width: devtoolsWidth,
          willChange: isDragging ? 'width' : 'auto'
        }}
        className="h-full relative flex flex-col bg-background border-l border-border select-none z-30 shrink-0"
      >
        {/* Draggable Vertical Splitter Handle */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute -left-1.5 top-0 bottom-0 w-3 cursor-col-resize z-40 group flex items-center justify-center hover:bg-transparent"
          title="Drag to resize Developer Tools"
        >
          <div className="w-0.5 h-full group-hover:w-1 group-hover:bg-primary transition-all duration-150" />
        </div>

        {/* DevTools Top Header Bar */}
        <div className="h-9 px-3 flex items-center justify-between border-b border-border bg-muted/40 shrink-0 text-xs text-foreground font-semibold">
          <div className="flex items-center gap-2">
            <Code2 className="w-3.5 h-3.5 text-primary" />
            <span className="font-semibold text-xs tracking-tight">Developer Tools</span>
          </div>

          <div className="flex items-center gap-0.5">
            {/* Detach to Window button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleDetach}
                  className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  aria-label="Detach DevTools to window"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Detach to separate window</p>
              </TooltipContent>
            </Tooltip>

            {/* Close button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleClose}
                  className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive-foreground hover:bg-destructive transition-colors cursor-pointer"
                  aria-label="Close DevTools"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Close Developer Tools</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Content Area placeholder where Electron WebContentsView is docked */}
        <div
          ref={contentAreaRef}
          className="flex-1 w-full h-full relative overflow-hidden bg-background"
        />
      </aside>
    </TooltipProvider>
  )
}
