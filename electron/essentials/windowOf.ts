import { BrowserWindow, type WebContents } from 'electron'

/** Browser window a tab (or popup) belongs to */
export function windowOf(contents: WebContents | null | undefined): BrowserWindow | null {
  if (!contents || contents.isDestroyed()) return null
  const host = (contents as unknown as { hostWebContents?: WebContents }).hostWebContents
  const win = BrowserWindow.fromWebContents(host && !host.isDestroyed() ? host : contents)
  return win && !win.isDestroyed() ? win : null
}

/** Window that shows prompts for some contents: the tab's window, or a sign-in popup's parent */
export function promptWindowFor(contents: WebContents | null | undefined): BrowserWindow | null {
  const win = windowOf(contents)
  return win?.getParentWindow() ?? win
}

/** Tabs (webviews) living in a window */
export function tabsOf(win: BrowserWindow, all: Iterable<WebContents>): WebContents[] {
  const out: WebContents[] = []
  for (const wc of all) if (!wc.isDestroyed() && windowOf(wc) === win) out.push(wc)
  return out
}
