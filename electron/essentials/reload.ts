import { dialog, type MessageBoxOptions, type WebContents } from 'electron'
import { windowOf } from './windowOf'

const START_MS = 250
const ANSWER_MS = 1500
const busy = new WeakSet<WebContents>()

const after = (ms: number): Promise<false> => new Promise((resolve) => setTimeout(() => resolve(false), ms))

/**
 * Reload that also works on the result of a form (POST). Chromium asks the embedder whether to send
 * the form again before such a reload, and Electron never answers: reload() does nothing at all.
 * So: if a page that still responds did not start reloading, ask here and reload from the page.
 */
export async function reloadPage(contents: WebContents, ignoreCache = false): Promise<void> {
  if (busy.has(contents)) return
  busy.add(contents)
  let settled = false
  const onStart = (details: { isMainFrame: boolean; isSameDocument: boolean }): void => {
    if (details.isMainFrame && !details.isSameDocument) settled = true
  }
  // "Leave site?" was shown: whatever the user chose counts
  const onUnload = (): void => {
    settled = true
  }
  contents.on('did-start-navigation', onStart)
  contents.on('will-prevent-unload', onUnload)
  try {
    if (ignoreCache) contents.reloadIgnoringCache()
    else contents.reload()
    if (contents.isCrashed() || !/^https?:/i.test(contents.getURL())) return
    await after(START_MS)
    if (settled || contents.isDestroyed()) return
    // The page answers only after its beforeunload handlers ran
    const answered = await Promise.race([contents.mainFrame.executeJavaScript('true').catch(() => false), after(ANSWER_MS)])
    if (!answered) return
    await after(START_MS)
    if (settled || contents.isDestroyed() || contents.isLoadingMainFrame()) return

    const win = windowOf(contents)
    const opts: MessageBoxOptions = {
      type: 'question',
      buttons: ['Send again', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      title: 'Send the form again?',
      message: 'Send the form again?',
      detail: 'This page is the result of a form you sent. Reloading sends it again, which can repeat a purchase or a message.'
    }
    const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
    if (response === 0 && !contents.isDestroyed()) await contents.mainFrame.executeJavaScript('location.reload()', true).catch(() => {})
  } finally {
    busy.delete(contents)
    if (!contents.isDestroyed()) {
      contents.off('did-start-navigation', onStart)
      contents.off('will-prevent-unload', onUnload)
    }
  }
}
