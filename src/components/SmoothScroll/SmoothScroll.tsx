import React, { createContext, useContext, useEffect, useRef, useMemo } from 'react'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { useBrowserStore } from '@/store/useBrowserStore'

export interface SmoothScrollContextValue {
  lenis: Lenis | null
  scrollTo: (target: number | string | HTMLElement, options?: any) => void
  resize: () => void
}

const SmoothScrollContext = createContext<SmoothScrollContextValue>({
  lenis: null,
  scrollTo: () => {},
  resize: () => {}
})

export const useSmoothScroll = () => useContext(SmoothScrollContext)

export interface SmoothScrollProps {
  children: React.ReactNode
  enabled?: boolean
  lerp?: number
  wheelMultiplier?: number
  touchMultiplier?: number
  routeKey?: unknown
  wrapperRef?: React.RefObject<HTMLElement>
  contentRef?: React.RefObject<HTMLElement>
}

/**
 * High-performance smooth scrolling provider powered by Lenis.
 * Adapted for TCT Orbit (Electron + React 18 + Vite).
 * Automatically pauses on reduced-motion preference and prevents
 * interference with form controls and webview browse panes.
 */
export const SmoothScroll: React.FC<SmoothScrollProps> = ({
  children,
  enabled = true,
  lerp = 0.1,
  wheelMultiplier = 1,
  touchMultiplier = 1.5,
  routeKey,
  wrapperRef,
  contentRef
}) => {
  const lenisRef = useRef<Lenis | null>(null)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const activeSpaceId = useBrowserStore((s) => s.activeSpaceId)

  // Key tracking to recalculate scroll bounds when switching tabs/spaces
  const currentKey = routeKey ?? `${activeSpaceId}_${activeTabId}`

  useEffect(() => {
    // The main Electron browser window is a fixed desktop shell and must never scroll.
    // Only attach Lenis if an explicit wrapper element is provided.
    if (!wrapperRef?.current) {
      if (lenisRef.current) {
        lenisRef.current.destroy()
        lenisRef.current = null
      }
      return
    }

    // Check user preference for reduced motion
    if (!enabled || (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      if (lenisRef.current) {
        lenisRef.current.destroy()
        lenisRef.current = null
      }
      return
    }

    const wrapper = wrapperRef.current
    const content = contentRef?.current ?? undefined

    const lenis = new Lenis({
      wrapper,
      content,
      lerp,
      smoothWheel: true,
      wheelMultiplier,
      touchMultiplier,
      autoResize: true,
      prevent: (node) => {
        // Prevent Lenis from stealing scroll events from text inputs, selects, webviews or explicit prevent zones
        const tag = node.tagName?.toUpperCase()
        if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'INPUT' || tag === 'WEBVIEW') {
          return true
        }
        if (Boolean(node.closest?.('[data-lenis-prevent]')) || Boolean(node.closest?.('webview'))) {
          return true
        }
        return false
      }
    })

    lenisRef.current = lenis

    let frameId: number

    function raf(time: number) {
      lenis.raf(time)
      frameId = requestAnimationFrame(raf)
    }

    frameId = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(frameId)
      lenis.destroy()
      lenisRef.current = null
    }
  }, [enabled, lerp, wheelMultiplier, touchMultiplier, wrapperRef, contentRef])

  // Recalculate scroll dimensions after view/tab transitions and layout changes
  useEffect(() => {
    const lenis = lenisRef.current
    if (!lenis) return

    const timer = window.setTimeout(() => {
      lenis.resize()
    }, 50)

    return () => window.clearTimeout(timer)
  }, [currentKey])

  const contextValue = useMemo<SmoothScrollContextValue>(
    () => ({
      lenis: lenisRef.current,
      scrollTo: (target, options) => lenisRef.current?.scrollTo(target, options),
      resize: () => lenisRef.current?.resize()
    }),
    []
  )

  return (
    <SmoothScrollContext.Provider value={contextValue}>
      {children}
    </SmoothScrollContext.Provider>
  )
}

export default SmoothScroll
