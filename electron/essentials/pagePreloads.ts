import { dialog, ipcMain, type BrowserWindow, type IpcMainEvent, type Session, type WebContents } from 'electron'
import crypto from 'crypto'
import path from 'path'
import { privacyEngine } from '../privacy/privacyEngine'
import { promptWindowFor } from './windowOf'
import type { PagePromptRequest } from '../../src/types/essentials'

/** Script that runs in pages before their own code, and the two questions it may ask (see pagePreload.ts) */

export function attachPagePreload(ses: Session): void {
  const id = 'tct-page-preload'
  if (ses.getPreloadScripts().some((s) => s.id === id)) return
  ses.registerPreloadScript({ type: 'frame', id, filePath: path.join(__dirname, '../preload/page.js') })
}

interface Pending {
  win: BrowserWindow
  contents: WebContents
  done: (value: string | null) => void
}

class PagePrompts {
  private pending = new Map<string, Pending>()
  /** Pages the user told to stop asking (until they navigate) */
  private muted = new WeakSet<WebContents>()
  /** One alert / confirm at a time per tab */
  private dialogOpen = new WeakSet<WebContents>()

  public init(): void {
    // The answer is only yes / no, for the page that asks
    ipcMain.on('page:ad-block', (event) => {
      event.returnValue = isTabMainFrame(event) && privacyEngine.adBlockingOn(event.sender.getURL() || event.senderFrame?.url || '')
    })
    ipcMain.on('page:prompt', (event, message: unknown, value: unknown) => this.ask(event, message, value))
    ipcMain.on('page:dialog', (event, kind: unknown, message: unknown) => void this.showDialog(event, kind, message))
  }

  /** alert() and confirm(), titled with the site that asks. The page waits until it is answered. */
  private async showDialog(event: IpcMainEvent, kind: unknown, message: unknown): Promise<void> {
    const contents = event.sender
    const frame = event.senderFrame
    const win = promptWindowFor(contents)
    if (
      !win ||
      !frame ||
      !/^https?:/i.test(frame.url) ||
      (kind !== 'alert' && kind !== 'confirm') ||
      typeof message !== 'string' ||
      this.muted.has(contents) ||
      this.dialogOpen.has(contents)
    ) {
      event.returnValue = false
      return
    }
    const hostOf = (url: string): string => {
      try {
        return new URL(url).host
      } catch {
        return ''
      }
    }
    const host = hostOf(frame.url)
    const embedded = frame.parent !== null && host !== hostOf(contents.getURL())
    const title = embedded ? `An embedded page at ${host} says` : `${host} says`
    this.dialogOpen.add(contents)
    try {
      const { response, checkboxChecked } = await dialog.showMessageBox(win, {
        type: 'none',
        title,
        message: title,
        detail: message,
        buttons: kind === 'confirm' ? ['OK', 'Cancel'] : ['OK'],
        defaultId: 0,
        cancelId: kind === 'confirm' ? 1 : 0,
        noLink: true,
        checkboxLabel: "Don't allow this page to show more dialogs",
        checkboxChecked: false
      })
      if (checkboxChecked) {
        this.muted.add(contents)
        contents.once('did-navigate', () => this.muted.delete(contents))
      }
      if (!contents.isDestroyed()) event.returnValue = kind === 'confirm' ? response === 0 : true
    } finally {
      this.dialogOpen.delete(contents)
    }
  }

  private ask(event: IpcMainEvent, message: unknown, value: unknown): void {
    const contents = event.sender
    const win = promptWindowFor(contents)
    const busy = [...this.pending.values()].some((p) => p.contents === contents)
    if (!isTabMainFrame(event) || !win || busy || this.muted.has(contents) || typeof message !== 'string' || typeof value !== 'string') {
      event.returnValue = null
      return
    }
    const id = crypto.randomBytes(8).toString('hex')
    const done: Pending['done'] = (answer) => {
      if (!this.pending.delete(id)) return
      contents.off('destroyed', cancel)
      win.off('closed', cancel)
      if (!win.isDestroyed()) win.webContents.send('page-prompt:dismiss', id)
      // The page is frozen until this is set
      if (!contents.isDestroyed()) event.returnValue = answer
    }
    const cancel = () => done(null)
    contents.once('destroyed', cancel)
    win.once('closed', cancel)
    this.pending.set(id, { win, contents, done })
    let host = ''
    try {
      host = new URL(event.senderFrame?.url ?? '').host
    } catch {}
    const req: PagePromptRequest = { id, host, message: message.slice(0, 2000), value: value.slice(0, 2000) }
    win.webContents.send('page-prompt:request', req)
  }

  public respond(sender: BrowserWindow | null, id: string, value: string | null, mute: boolean): boolean {
    const p = this.pending.get(id)
    if (!p || p.win !== sender) return false
    if (mute) {
      this.muted.add(p.contents)
      p.contents.once('did-navigate', () => this.muted.delete(p.contents))
    }
    p.done(value)
    return true
  }
}

/** Web pages in tabs and sign-in popups, top frame only; never the browser's own interface */
function isTabMainFrame(event: IpcMainEvent): boolean {
  return !!event.senderFrame && event.senderFrame.parent === null && /^https?:/i.test(event.senderFrame.url)
}

export const pagePrompts = new PagePrompts()
