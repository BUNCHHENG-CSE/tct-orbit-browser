/**
 * Guarantees `tct:tab-drag-end` after every tab drag.
 *
 * Drag overlays (sidebar drop zones, "Drop to open in split view" over the page) turn off on
 * `tct:tab-drag-end`, which the dragged tab sends from its own `dragend` event. Chromium skips
 * that event when the dragged element is moved in the DOM during the drag (reordering does
 * exactly that) or when a drop handler stops propagation, so overlays could stay stuck on screen.
 *
 * This watches the window instead and sends the end signal once, whichever comes first:
 * - `dragend` / `drop` anywhere (capture phase, so stopPropagation can't hide them)
 * - the first mouse move with no button pressed (the drag is certainly over by then)
 */
let dragActive = false

function endDrag(): void {
  if (!dragActive) return
  dragActive = false
  window.dispatchEvent(new CustomEvent('tct:tab-drag-end'))
}

export function installTabDragGuard(): void {
  const w = window as Window & { __tctTabDragGuard?: boolean }
  if (w.__tctTabDragGuard) return
  w.__tctTabDragGuard = true

  window.addEventListener('tct:tab-drag-start', () => {
    dragActive = true
  })
  window.addEventListener('tct:tab-drag-end', () => {
    dragActive = false
  })
  window.addEventListener('dragend', endDrag, true)
  // After the drop handlers have run (they read the drag state)
  window.addEventListener('drop', () => setTimeout(endDrag, 0), true)
  // No mousemove fires during an HTML drag, so a buttonless move means the drag is over
  window.addEventListener(
    'mousemove',
    (e) => {
      if (dragActive && e.buttons === 0) endDrag()
    },
    { capture: true, passive: true }
  )
}
