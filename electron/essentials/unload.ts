import { dialog, type BrowserWindow, type MessageBoxSyncOptions, type WebContents } from 'electron'
import { windowOf } from './windowOf'

/**
 * "Leave site? Changes you made may not be saved."
 *
 * Navigations fire will-prevent-unload. Closing a <webview> does not run beforeunload at all, so
 * before closing, the page's beforeunload handlers are asked through a synthetic event.
 */

/** Same rules as Chromium: only pages the user interacted with may keep them */
const PROBE = `(() => {
  try {
    if (!navigator.userActivation || !navigator.userActivation.hasBeenActive) return false;
    const e = document.createEvent('BeforeUnloadEvent');
    e.initEvent('beforeunload', false, true);
    return !window.dispatchEvent(e) || !!e.returnValue;
  } catch (err) { return false; }
})()`

function leaveOptions(host: string, closing: boolean): MessageBoxSyncOptions {
  return {
    type: 'question',
    buttons: [closing ? 'Close anyway' : 'Leave', 'Stay'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: closing ? 'Close tab?' : 'Leave site?',
    message: closing ? `Close ${host}?` : `Leave ${host}?`,
    detail: 'Changes you made may not be saved.'
  }
}

function hostOfContents(contents: WebContents): string {
  try {
    return new URL(contents.getURL()).host || 'this page'
  } catch {
    return 'this page'
  }
}

/** Reload, links, back / forward on a page with unsaved changes */
export function attachLeaveWarning(contents: WebContents): void {
  contents.on('will-prevent-unload', (event) => {
    const win = windowOf(contents)
    const opts = leaveOptions(hostOfContents(contents), false)
    const choice = win ? dialog.showMessageBoxSync(win, opts) : dialog.showMessageBoxSync(opts)
    if (choice === 0) event.preventDefault()
  })
}

async function hasUnsavedChanges(contents: WebContents): Promise<boolean> {
  if (contents.isDestroyed() || contents.isCrashed() || !/^https?:/i.test(contents.getURL())) return false
  // A frozen page must never block closing it
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 600))
  return Promise.race([contents.executeJavaScript(PROBE).then(Boolean, () => false), timeout])
}

/** True when the tab may be closed */
export async function confirmCloseTab(contents: WebContents): Promise<boolean> {
  if (!(await hasUnsavedChanges(contents)) || contents.isDestroyed()) return true
  const win = windowOf(contents)
  const opts = leaveOptions(hostOfContents(contents), true)
  const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
  return response === 0
}

/** Ask once for a whole window */
export async function confirmCloseWindow(win: BrowserWindow, tabs: WebContents[]): Promise<boolean> {
  const unsaved: string[] = []
  await Promise.all(
    tabs.map(async (wc) => {
      if (await hasUnsavedChanges(wc)) unsaved.push(hostOfContents(wc))
    })
  )
  if (unsaved.length === 0 || win.isDestroyed()) return true
  const sites = [...new Set(unsaved)]
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Close anyway', 'Stay'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: 'Close window?',
    message: 'Changes you made may not be saved.',
    detail: sites.slice(0, 6).join('\n') + (sites.length > 6 ? `\n+${sites.length - 6} more` : '')
  })
  return response === 0
}
