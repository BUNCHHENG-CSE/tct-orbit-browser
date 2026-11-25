import { useEffect } from 'react'

const OPEN_POPPER =
  '[data-radix-popper-content-wrapper] [role="menu"], [data-radix-popper-content-wrapper] [role="dialog"], [data-radix-popper-content-wrapper] [role="listbox"]'

/** A modal dialog (not inside a popper) — leave everything alone while one is open */
const hasModalDialog = () =>
  Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).some(
    (el) => !el.closest('[data-radix-popper-content-wrapper]')
  )

/**
 * Clicks inside a web page land in a <webview> (or the native DevTools view), so Radix never sees
 * an "outside click" and popovers / dropdown menus stay open. The app document loses focus in
 * that case, so on window blur we send Radix an outside pointerdown, which closes every open
 * popover, dropdown and context menu — the same as clicking elsewhere in the app.
 */
export function useDismissOverlaysOnBlur(): void {
  useEffect(() => {
    const onBlur = () => {
      if (!document.querySelector(OPEN_POPPER) || hasModalDialog()) return
      const target = document.body
      const init = { bubbles: true, cancelable: true, composed: true, button: 0, pointerType: 'mouse' } as PointerEventInit
      // Full click sequence: newer Radix versions wait for the click before dismissing
      target.dispatchEvent(new PointerEvent('pointerdown', init))
      target.dispatchEvent(new MouseEvent('mousedown', init))
      target.dispatchEvent(new PointerEvent('pointerup', init))
      target.dispatchEvent(new MouseEvent('mouseup', init))
      target.dispatchEvent(new MouseEvent('click', init))
    }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [])
}
