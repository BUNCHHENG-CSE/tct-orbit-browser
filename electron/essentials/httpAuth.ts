import { app, type BrowserWindow } from 'electron'
import crypto from 'crypto'
import { promptWindowFor } from './windowOf'
import type { AuthRequest } from '../../src/types/essentials'

/** Sign-in box for HTTP (Basic / Digest / NTLM) and proxy authentication */

interface Pending {
  win: BrowserWindow
  done: (username?: string, password?: string) => void
}

class HttpAuthService {
  private pending = new Map<string, Pending>()

  public init(): void {
    app.on('login', (event, contents, details, authInfo, callback) => {
      // Only web pages in tabs and sign-in popups. Background requests keep failing silently.
      if (!contents || contents.isDestroyed()) return
      const type = contents.getType()
      const win = promptWindowFor(contents)
      if (!win || (type !== 'webview' && win.webContents === contents)) return
      event.preventDefault()

      const id = crypto.randomBytes(8).toString('hex')
      const finish: Pending['done'] = (username, password) => {
        if (!this.pending.delete(id)) return
        contents.off('destroyed', cancel)
        contents.off('did-start-navigation', onNavigate)
        if (!win.isDestroyed()) win.webContents.send('auth:dismiss', id)
        try {
          if (username === undefined) callback()
          else callback(username, password ?? '')
        } catch {}
      }
      const cancel = () => finish()
      // The page went elsewhere: the answer would go nowhere (and must not go to another site)
      const onNavigate = (e: Electron.Event & { isMainFrame?: boolean; isSameDocument?: boolean; url?: string }) => {
        if (e.isMainFrame && !e.isSameDocument && e.url !== details.url) finish()
      }
      contents.once('destroyed', cancel)
      contents.on('did-start-navigation', onNavigate)
      this.pending.set(id, { win, done: finish })

      const req: AuthRequest = {
        id,
        host: authInfo.port && ![80, 443].includes(authInfo.port) ? `${authInfo.host}:${authInfo.port}` : authInfo.host,
        realm: String(authInfo.realm || '').slice(0, 200),
        isProxy: authInfo.isProxy,
        insecure: !authInfo.isProxy && authInfo.scheme === 'basic' && details.url.startsWith('http:')
      }
      win.webContents.send('auth:request', req)
    })
  }

  public respond(sender: BrowserWindow | null, id: string, username: string | null, password: string): boolean {
    const p = this.pending.get(id)
    if (!p || p.win !== sender) return false
    if (username === null) p.done()
    else p.done(username, password)
    return true
  }
}

export const httpAuthService = new HttpAuthService()
