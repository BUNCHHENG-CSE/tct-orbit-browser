import { desktopCapturer, webContents, type BrowserWindow, type DesktopCapturerSource, type Session } from 'electron'
import crypto from 'crypto'
import { promptWindowFor } from './windowOf'
import type { ScreenShareRequest } from '../../src/types/essentials'

/**
 * Screen sharing (navigator.mediaDevices.getDisplayMedia). Every request shows Orbit's picker:
 * nothing is captured until the user chooses a screen or window, and the choice is never remembered.
 */

const TIMEOUT_MS = 2 * 60_000

interface Pending {
  sources: DesktopCapturerSource[]
  audioAvailable: boolean
  win: BrowserWindow
  done: (streams: Electron.Streams | null) => void
  timer: NodeJS.Timeout
}

class ScreenShareService {
  private pending = new Map<string, Pending>()

  public attach(ses: Session): void {
    ses.setDisplayMediaRequestHandler((request, callback) => {
      let answered = false
      const done = (streams: Electron.Streams | null) => {
        if (answered) return
        answered = true
        try {
          // An empty answer rejects the page's request; Electron reports that by throwing here
          callback((streams ?? {}) as Electron.Streams)
        } catch {}
      }
      void this.ask(request, done).catch((err) => {
        console.warn('[ScreenShare] Could not list screens:', err)
        done(null)
      })
    })
  }

  private async ask(request: Electron.DisplayMediaRequestHandlerHandlerRequest, done: Pending['done']): Promise<void> {
    const frame = request.frame
    const contents = frame ? webContents.fromFrame(frame) : undefined
    // Only a real click may open the picker, and only pages shown in a browser tab
    if (!request.userGesture || !contents || contents.getType() !== 'webview' || !request.videoRequested) return done(null)
    const win = promptWindowFor(contents)
    if (!win) return done(null)

    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 200 },
      fetchWindowIcons: true
    })
    if (contents.isDestroyed() || win.isDestroyed()) return done(null)

    const id = crypto.randomBytes(8).toString('hex')
    const audioAvailable = request.audioRequested && process.platform === 'win32'
    const finish: Pending['done'] = (streams) => {
      const p = this.pending.get(id)
      if (!p) return
      clearTimeout(p.timer)
      this.pending.delete(id)
      contents.off('destroyed', cancel)
      contents.off('did-navigate', cancel)
      if (!win.isDestroyed()) win.webContents.send('screen-share:dismiss', id)
      done(streams)
    }
    const cancel = () => finish(null)
    contents.once('destroyed', cancel)
    contents.once('did-navigate', cancel)
    this.pending.set(id, { sources, audioAvailable, win, done: finish, timer: setTimeout(cancel, TIMEOUT_MS) })

    const payload: ScreenShareRequest = {
      id,
      origin: request.securityOrigin,
      audioAvailable,
      sources: sources
        .map((s) => ({
          id: s.id,
          name: s.name.slice(0, 200),
          kind: s.id.startsWith('screen:') ? ('screen' as const) : ('window' as const),
          thumbnail: s.thumbnail.isEmpty() ? '' : s.thumbnail.toDataURL(),
          icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : undefined
        }))
        .sort((a, b) => Number(b.kind === 'screen') - Number(a.kind === 'screen'))
    }
    win.webContents.send('screen-share:request', payload)
  }

  public respond(sender: BrowserWindow | null, id: string, sourceId: string | null, audio: boolean): boolean {
    const p = this.pending.get(id)
    if (!p || p.win !== sender) return false
    const source = sourceId ? p.sources.find((s) => s.id === sourceId) : undefined
    p.done(source ? { video: source, ...(audio && p.audioAvailable ? { audio: 'loopback' as const } : {}) } : null)
    return true
  }
}

export const screenShareService = new ScreenShareService()
