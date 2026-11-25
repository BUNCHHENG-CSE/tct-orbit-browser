import { useEffect } from 'react'
import { api } from '@/lib/ipc'

/** Open Radix menus / popovers / selects (tooltips are ignored so hovering doesn't flicker DevTools) */
const OVERLAY_SELECTOR =
  '[data-radix-popper-content-wrapper] [role="menu"], [data-radix-popper-content-wrapper] [role="dialog"], [data-radix-popper-content-wrapper] [role="listbox"]'

/**
 * The docked DevTools is a native view drawn above the app, so menus opened near it (Tools,
 * Extensions, Split View…) get covered. While DevTools is open, report the rectangles of open
 * menus to the main process, which hides DevTools only while one of them overlaps it.
 */
export function useDevtoolsOverlayGuard(devtoolsOpen: boolean): void {
  useEffect(() => {
    const send = api.devtools?.setOverlayRects
    if (!devtoolsOpen || !send) return

    let last = ''
    let frame = 0
    const report = () => {
      frame = 0
      const rects = Array.from(document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR))
        .slice(0, 20)
        .map((el) => {
          const r = el.getBoundingClientRect()
          return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
        })
        .filter((r) => r.width > 0 && r.height > 0)
      const key = JSON.stringify(rects)
      if (key === last) return
      last = key
      void send(rects)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(report)
    }

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state', 'style'] })
    schedule()

    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
      void send([])
    }
  }, [devtoolsOpen])
}
