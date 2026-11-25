import { app, session, type BrowserWindow, type WebContents } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { safeStorageVault } from './security'
import { PRIVATE_PARTITION } from './privacy/types'
import type { PasswordEntryInfo, PasswordSaveOffer, PasswordSettings } from '../src/types/api'

/**
 * Built-in password manager.
 *
 * - Passwords are encrypted with the OS (Windows DPAPI / macOS Keychain / libsecret) through
 *   safeStorage and stored in <userData>/passwords.json. Never in the browser state or backups.
 * - A helper script runs in an ISOLATED WORLD of each page (the page's own scripts can't see or
 *   change it). It reports login submits and shows a small account picker on login fields.
 *   Messages to the main process carry a per-page random nonce, so a page can't forge them.
 * - Passwords only enter a page when the user picks an account to fill.
 * - Private tabs can fill saved logins but never offer to save new ones.
 */

const WORLD_ID = 1101
const MSG_PREFIX = '__tctpw:'
const OFFER_TTL_MS = 3 * 60_000

interface StoredLogin {
  id: string
  origin: string
  username: string
  password: string // encrypted (safeStorageVault)
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
}

interface StoreFile {
  version: 1
  offerToSave: boolean
  neverSave: string[]
  logins: StoredLogin[]
}

interface PendingOffer {
  origin: string
  username: string
  password: string
  existingId?: string
  createdAt: number
}

/** "https://www.example.com" and "https://example.com" share logins */
export function loginOrigin(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return `${u.protocol}//${u.hostname.replace(/^www\./, '')}${u.port ? `:${u.port}` : ''}`
  } catch {
    return null
  }
}

function pageScript(nonce: string, accounts: string[]): string {
  return `(() => {
  const ACCOUNTS = ${JSON.stringify(accounts)};
  if (window.__tctPw) { window.__tctPw.setAccounts(ACCOUNTS); return; }
  const NONCE = ${JSON.stringify(nonce)};
  // The page's own origin travels with the message: the tab may have moved on when it is handled
  const send = (o) => { try { console.debug(${JSON.stringify(MSG_PREFIX)} + NONCE + ':' + JSON.stringify(Object.assign({ o: location.origin }, o))); } catch (e) {} };
  let accounts = ACCOUNTS;

  const visible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)) && getComputedStyle(el).visibility !== 'hidden';
  const pwFields = () => Array.from(document.querySelectorAll('input[type="password"]')).filter(visible);
  const TEXTY = /^(text|email|tel|)$/i;
  const USERISH = /user|email|login|account|identifier|phone|mail/i;
  const userField = (pw) => {
    const inputs = Array.from(document.querySelectorAll('input')).filter((i) => visible(i) && TEXTY.test(i.type || ''));
    if (pw) {
      let cand = null;
      for (const i of inputs) if (i.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING) cand = i;
      return cand;
    }
    return inputs.find((i) => USERISH.test((i.name || '') + ' ' + (i.id || '') + ' ' + (i.autocomplete || '') + ' ' + (i.type || ''))) || null;
  };

  let lastSent = '';
  const capture = () => {
    const pws = pwFields();
    const pw = pws.find((p) => p.value);
    // Sign-up / change-password forms have 2+ password fields: use the last (new) one
    const filled = pws.filter((p) => p.value);
    const password = filled.length > 1 ? filled[filled.length - 1].value : pw && pw.value;
    const u = userField(pw || null);
    let msg = null;
    if (password) msg = { t: 'submit', u: (u && u.value) || '', p: password };
    else if (u && u.value && pws.length === 0) msg = { t: 'user', u: u.value };
    if (!msg) return;
    const key = JSON.stringify(msg);
    if (key === lastSent) return;
    lastSent = key;
    setTimeout(() => { if (lastSent === key) lastSent = ''; }, 3000);
    send(msg);
  };
  document.addEventListener('submit', capture, true);
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('button, input[type="submit"], input[type="button"], [role="button"]');
    if (!b) return;
    const label = (b.innerText || b.value || b.getAttribute('aria-label') || '').trim();
    if (b.type === 'submit' || /log ?in|sign ?in|next|continue|submit|verify|connexion|anmelden|iniciar|entrar|accedi/i.test(label)) capture();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') capture();
  }, true);

  // --- Account picker under login fields ---
  let host = null;
  const onTop = (btn) => {
    if (!host || !host.isConnected) return false;
    if (btn.checkVisibility && !btn.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    for (let n = host; n; n = n.parentElement) if (Number(getComputedStyle(n).opacity) < 0.9) return false;
    const r = btn.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === host;
  };
  const hide = () => { if (host) { host.remove(); host = null; } };
  const show = (field) => {
    if (!accounts.length) return;
    hide();
    host = document.createElement('tct-passwords');
    const root = host.attachShadow({ mode: 'closed' });
    const r = field.getBoundingClientRect();
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;left:' + Math.round(r.left) + 'px;top:' + Math.round(r.bottom + 4) + 'px;';
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    root.innerHTML = '<style>' +
      '.box{font:13px system-ui,-apple-system,Segoe UI,sans-serif;min-width:' + Math.max(220, Math.round(r.width)) + 'px;max-width:360px;border-radius:12px;padding:6px;' +
      'background:' + (dark ? '#18181b' : '#fff') + ';color:' + (dark ? '#f4f4f5' : '#18181b') + ';border:1px solid ' + (dark ? '#3f3f46' : '#e4e4e7') + ';box-shadow:0 12px 32px rgba(0,0,0,.25)}' +
      '.h{font-size:11px;opacity:.6;padding:4px 8px 6px}' +
      'button{all:unset;display:flex;gap:8px;align-items:center;width:100%;box-sizing:border-box;padding:8px;border-radius:8px;cursor:pointer}' +
      'button:hover{background:' + (dark ? '#27272a' : '#f4f4f5') + '}' +
      '.k{width:18px;height:18px;border-radius:6px;background:#6366f1;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;flex:none}' +
      '.u{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '</style><div class="box"><div class="h">TCT Orbit · saved passwords</div></div>';
    const box = root.querySelector('.box');
    for (const name of accounts) {
      const btn = document.createElement('button');
      const k = document.createElement('span'); k.className = 'k';
      k.textContent = (name || '?').charAt(0).toUpperCase();
      const u = document.createElement('span'); u.className = 'u'; u.textContent = name || '(no username)';
      btn.append(k, u);
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        // Real clicks only, and only while the picker is really visible (no clickjacking)
        if (e.isTrusted && onTop(btn)) send({ t: 'fill', u: name });
        hide();
      });
      box.appendChild(btn);
    }
    document.documentElement.appendChild(host);
  };
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement)) return;
    const pw = pwFields()[0] || null;
    if (el.type === 'password' || (pw && el === userField(pw)) || (!pw && el === userField(null))) show(el);
    else hide();
  }, true);
  document.addEventListener('mousedown', (e) => { if (host && !e.composedPath().includes(host)) hide(); }, true);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);

  const setVal = (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  window.__tctPw = {
    setAccounts(a) { accounts = a; if (!a.length) hide(); },
    fill(u, p) {
      const pw = pwFields()[0] || null;
      const uf = userField(pw);
      if (uf && u) setVal(uf, u);
      if (pw) setVal(pw, p);
      hide();
    }
  };
})();`
}

class PasswordManager {
  private file = ''
  private data: StoreFile = { version: 1, offerToSave: true, neverSave: [], logins: [] }
  private pending = new Map<string, PendingOffer>()
  /** webContents id -> per-page nonce */
  private nonces = new Map<number, string>()
  /** Multi-step logins (username page, then password page) */
  private lastUsername = new Map<number, { origin: string; username: string; at: number }>()
  private getMainWindow: () => BrowserWindow | null = () => null

  public init(getMainWindow: () => BrowserWindow | null): void {
    this.getMainWindow = getMainWindow
    this.file = path.join(app.getPath('userData'), 'passwords.json')
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'))
        if (raw && Array.isArray(raw.logins)) {
          this.data = {
            version: 1,
            offerToSave: raw.offerToSave !== false,
            neverSave: Array.isArray(raw.neverSave) ? raw.neverSave.filter((x: unknown) => typeof x === 'string') : [],
            logins: raw.logins.filter((l: any) => l && typeof l.origin === 'string' && typeof l.password === 'string')
          }
        }
      }
    } catch (err) {
      console.error('[Passwords] Could not read password store:', err)
    }
  }

  private save(): void {
    const tmp = `${this.file}.tmp`
    try {
      // Readable by this OS user only (the mode has no effect on Windows; the profile folder's ACL applies)
      fs.writeFileSync(tmp, JSON.stringify(this.data), { encoding: 'utf8', mode: 0o600 })
      fs.renameSync(tmp, this.file)
    } catch (err) {
      console.error('[Passwords] Could not save password store:', err)
    }
  }

  private accountsFor(origin: string): string[] {
    return this.data.logins
      .filter((l) => l.origin === origin)
      .sort((a, b) => (b.lastUsedAt || b.updatedAt).localeCompare(a.lastUsedAt || a.updatedAt))
      .map((l) => l.username)
  }

  private inject(contents: WebContents): void {
    if (contents.isDestroyed()) return
    const origin = loginOrigin(contents.getURL())
    if (!origin) return
    let nonce = this.nonces.get(contents.id)
    if (!nonce) {
      nonce = crypto.randomBytes(16).toString('hex')
      this.nonces.set(contents.id, nonce)
    }
    contents
      .executeJavaScriptInIsolatedWorld(WORLD_ID, [{ code: pageScript(nonce, this.accountsFor(origin)) }])
      .catch(() => {})
  }

  /** Watch a tab (webview) or popup window for logins */
  public attach(contents: WebContents): void {
    contents.on('dom-ready', () => this.inject(contents))
    contents.on('console-message', (...args: any[]) => {
      const msg: unknown = typeof args[0]?.message === 'string' ? args[0].message : args[2]
      if (typeof msg !== 'string' || !msg.startsWith(MSG_PREFIX)) return
      const nonce = this.nonces.get(contents.id)
      if (!nonce || !msg.startsWith(`${MSG_PREFIX}${nonce}:`)) return
      try {
        this.handleMessage(contents, JSON.parse(msg.slice(MSG_PREFIX.length + nonce.length + 1)))
      } catch {}
    })
    contents.once('destroyed', () => {
      this.nonces.delete(contents.id)
      this.lastUsername.delete(contents.id)
    })
  }

  private handleMessage(contents: WebContents, m: { t?: string; u?: unknown; p?: unknown; o?: unknown }): void {
    // Origin of the page that sent it (trusted: isolated world + nonce), not wherever the tab is now
    const pageOrigin = typeof m.o === 'string' ? m.o : ''
    const origin = loginOrigin(pageOrigin)
    if (!origin) return
    const username = typeof m.u === 'string' ? m.u.slice(0, 300) : ''

    if (m.t === 'user') {
      if (username) this.lastUsername.set(contents.id, { origin, username, at: Date.now() })
      return
    }

    if (m.t === 'fill') {
      const login = this.data.logins.find((l) => l.origin === origin && l.username === username)
      if (!login) return
      const password = safeStorageVault.decryptString(login.password)
      if (!password) return
      login.lastUsedAt = new Date().toISOString()
      this.save()
      // Checked again inside the page: it may have navigated to another site since the click
      contents
        .executeJavaScriptInIsolatedWorld(WORLD_ID, [
          {
            code: `if (location.origin === ${JSON.stringify(pageOrigin)} && window.__tctPw) window.__tctPw.fill(${JSON.stringify(login.username)}, ${JSON.stringify(password)})`
          }
        ])
        .catch(() => {})
      return
    }

    if (m.t === 'submit' && typeof m.p === 'string' && m.p.length > 0 && m.p.length <= 1000) {
      const isPrivate = contents.session === session.fromPartition(PRIVATE_PARTITION)
      if (isPrivate || !this.data.offerToSave || this.data.neverSave.includes(origin)) return
      // No OS encryption (e.g. Linux without a keyring): never write passwords in readable form
      if (!safeStorageVault.isAvailable()) return

      let user = username
      const prev = this.lastUsername.get(contents.id)
      if (!user && prev && prev.origin === origin && Date.now() - prev.at < 10 * 60_000) user = prev.username

      const sameUser = this.data.logins.find((l) => l.origin === origin && l.username === user)
      if (sameUser) {
        if (safeStorageVault.decryptString(sameUser.password) === m.p) {
          sameUser.lastUsedAt = new Date().toISOString()
          this.save()
          return
        }
      }
      this.offer(origin, user, m.p, sameUser?.id)
    }
  }

  private offer(origin: string, username: string, password: string, existingId?: string): void {
    const now = Date.now()
    for (const [token, p] of this.pending) if (now - p.createdAt > OFFER_TTL_MS) this.pending.delete(token)
    const token = crypto.randomBytes(12).toString('hex')
    this.pending.set(token, { origin, username, password, existingId, createdAt: now })
    const offer: PasswordSaveOffer = { token, origin, username, isUpdate: !!existingId }
    const win = this.getMainWindow()
    if (win && !win.isDestroyed()) win.webContents.send('passwords:offer', offer)
  }

  public respond(token: string, action: 'save' | 'never' | 'dismiss', username?: string): boolean {
    const p = this.pending.get(token)
    if (!p) return false
    this.pending.delete(token)
    if (action === 'never') {
      if (!this.data.neverSave.includes(p.origin)) this.data.neverSave.push(p.origin)
      this.save()
      return true
    }
    if (action !== 'save') return true
    if (!safeStorageVault.isAvailable()) return false
    const user = typeof username === 'string' ? username.trim().slice(0, 300) : p.username
    const now = new Date().toISOString()
    const existing =
      (p.existingId && this.data.logins.find((l) => l.id === p.existingId)) ||
      this.data.logins.find((l) => l.origin === p.origin && l.username === user)
    if (existing) {
      existing.username = user
      existing.password = safeStorageVault.encryptString(p.password)
      existing.updatedAt = now
    } else {
      this.data.logins.push({
        id: crypto.randomBytes(8).toString('hex'),
        origin: p.origin,
        username: user,
        password: safeStorageVault.encryptString(p.password),
        createdAt: now,
        updatedAt: now
      })
    }
    this.save()
    return true
  }

  public list(): PasswordEntryInfo[] {
    return this.data.logins
      .map((l) => ({ id: l.id, origin: l.origin, username: l.username, createdAt: l.createdAt, updatedAt: l.updatedAt, lastUsedAt: l.lastUsedAt }))
      .sort((a, b) => a.origin.localeCompare(b.origin) || a.username.localeCompare(b.username))
  }

  public reveal(id: string): string | null {
    const login = this.data.logins.find((l) => l.id === id)
    return login ? safeStorageVault.decryptString(login.password) : null
  }

  public update(id: string, data: { username?: string; password?: string }): boolean {
    const login = this.data.logins.find((l) => l.id === id)
    if (!login) return false
    if (data.password && !safeStorageVault.isAvailable()) return false
    if (typeof data.username === 'string') login.username = data.username.trim().slice(0, 300)
    if (typeof data.password === 'string' && data.password) login.password = safeStorageVault.encryptString(data.password)
    login.updatedAt = new Date().toISOString()
    this.save()
    return true
  }

  public remove(id: string): boolean {
    const before = this.data.logins.length
    this.data.logins = this.data.logins.filter((l) => l.id !== id)
    this.save()
    return this.data.logins.length !== before
  }

  public getSettings(): PasswordSettings {
    return { offerToSave: this.data.offerToSave, neverSave: [...this.data.neverSave], encrypted: safeStorageVault.isAvailable() }
  }

  public setOfferToSave(enabled: boolean): PasswordSettings {
    this.data.offerToSave = enabled
    this.save()
    return this.getSettings()
  }

  public removeNeverSave(origin: string): PasswordSettings {
    this.data.neverSave = this.data.neverSave.filter((o) => o !== origin)
    this.save()
    return this.getSettings()
  }
}

export const passwordManager = new PasswordManager()
