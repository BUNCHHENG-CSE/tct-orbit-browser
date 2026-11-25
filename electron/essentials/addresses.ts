import crypto from 'crypto'
import type { WebContents } from 'electron'
import { JsonFile } from './jsonFile'
import { safeStorageVault } from '../security'
import type { AddressInput, AddressProfile } from '../../src/types/essentials'

/**
 * Address autofill. Profiles are encrypted with the OS account (safeStorage). Like passwords, a
 * small picker runs in an isolated world: page scripts can't read it, and data only enters the
 * page after the user clicks a profile. Payment cards are deliberately not stored.
 */

const WORLD_ID = 1102
const MSG_PREFIX = '__tctaddr:'
const MAX_PROFILES = 20
const FIELDS = ['label', 'name', 'organization', 'street', 'street2', 'city', 'state', 'zip', 'country', 'email', 'phone'] as const

interface StoreFile {
  version: 1
  /** Encrypted JSON of AddressProfile[] */
  profiles: string
}

function pageScript(nonce: string, entries: Array<{ id: string; title: string; sub: string }>): string {
  return `(() => {
  const ENTRIES = ${JSON.stringify(entries)};
  if (window.__tctAddr) { window.__tctAddr.set(ENTRIES); return; }
  let entries = ENTRIES;
  const send = (o) => { try { console.debug(${JSON.stringify(MSG_PREFIX)} + ${JSON.stringify(nonce)} + ':' + JSON.stringify(Object.assign({ o: location.origin }, o))); } catch (e) {} };
  const visible = (el) => !!(el && el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';
  const AC = {
    'name': 'name', 'given-name': 'first', 'family-name': 'last', 'organization': 'organization', 'street-address': 'street',
    'address-line1': 'street', 'address-line2': 'street2', 'address-level2': 'city', 'address-level1': 'state',
    'postal-code': 'zip', 'country': 'country', 'country-name': 'country', 'email': 'email', 'tel': 'phone', 'tel-national': 'phone'
  };
  const RX = [
    ['street2', /address.?(line)?.?2|apt|suite|unit.?no/i], ['street', /street|address.?(line)?.?1?$|^addr/i],
    ['zip', /zip|post.?(al)?.?code/i], ['city', /city|town|locality/i], ['state', /state|province|region/i],
    ['country', /country/i], ['first', /first.?name|given.?name|fname/i], ['last', /last.?name|family.?name|surname|lname/i],
    ['organization', /company|organi[sz]ation/i], ['email', /e-?mail/i], ['phone', /phone|mobile|^tel/i], ['name', /full.?name|^name$|your.?name|recipient/i]
  ];
  const kindOf = (el) => {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return null;
    if (el instanceof HTMLInputElement && !/^(text|email|tel|search|)$/i.test(el.type || '')) return null;
    const tokens = (el.autocomplete || '').toLowerCase().split(/\\s+/);
    if (tokens.some((t) => t.startsWith('cc-') || t === 'username' || t === 'one-time-code' || t.includes('password'))) return null;
    for (const t of tokens) if (AC[t]) return AC[t];
    for (const s of [el.name, el.id, el.placeholder, el.getAttribute('aria-label')]) if (s) for (const [k, rx] of RX) if (rx.test(s)) return k;
    return null;
  };
  const fieldsNear = (el) => {
    const root = el.form || document;
    return Array.from(root.querySelectorAll('input, select, textarea')).filter(visible).map((f) => [f, kindOf(f)]).filter((p) => p[1]);
  };
  // Only real address forms: something like a street, city or postcode next to other fields
  const isAddressForm = (fields) => {
    const kinds = new Set(fields.map((p) => p[1]));
    return kinds.size >= 3 && (kinds.has('street') || kinds.has('zip') || kinds.has('city'));
  };
  let host = null, target = null;
  const hide = () => { if (host) { host.remove(); host = null; } };
  const onTop = (btn) => {
    if (!host || !host.isConnected) return false;
    if (btn.checkVisibility && !btn.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    for (let n = host; n; n = n.parentElement) if (Number(getComputedStyle(n).opacity) < 0.9) return false;
    const r = btn.getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === host;
  };
  const show = (field) => {
    hide();
    if (!entries.length) return;
    target = field;
    host = document.createElement('tct-addresses');
    const root = host.attachShadow({ mode: 'closed' });
    const r = field.getBoundingClientRect();
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;left:' + Math.round(r.left) + 'px;top:' + Math.round(r.bottom + 4) + 'px;';
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const style = document.createElement('style');
    style.textContent = '.box{font:13px system-ui,sans-serif;min-width:240px;max-width:360px;border-radius:12px;padding:6px;background:' + (dark ? '#18181b' : '#fff') + ';color:' + (dark ? '#f4f4f5' : '#18181b') +
      ';border:1px solid ' + (dark ? '#3f3f46' : '#e4e4e7') + ';box-shadow:0 12px 32px rgba(0,0,0,.25)}.h{font-size:11px;opacity:.6;padding:4px 8px 6px}' +
      'button{all:unset;display:block;width:100%;box-sizing:border-box;padding:8px;border-radius:8px;cursor:pointer}button:hover{background:' + (dark ? '#27272a' : '#f4f4f5') + '}' +
      '.t,.s{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.s{font-size:11px;opacity:.65}';
    const box = document.createElement('div'); box.className = 'box';
    const h = document.createElement('div'); h.className = 'h'; h.textContent = 'TCT Orbit · saved addresses';
    box.append(h);
    for (const en of entries) {
      const b = document.createElement('button');
      const t = document.createElement('div'); t.className = 't'; t.textContent = en.title;
      const s = document.createElement('div'); s.className = 's'; s.textContent = en.sub;
      b.append(t, s);
      b.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (e.isTrusted && onTop(b)) send({ id: en.id });
        hide();
      });
      box.append(b);
    }
    root.append(style, box);
    document.documentElement.appendChild(host);
  };
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!kindOf(el) || (el.form && el.form.querySelector('input[type="password"]') && !fieldsNear(el).some((p) => p[1] === 'street'))) return hide();
    if (isAddressForm(fieldsNear(el))) show(el); else hide();
  }, true);
  document.addEventListener('mousedown', (e) => { if (host && !e.composedPath().includes(host)) hide(); }, true);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  const setVal = (el, v) => {
    if (el instanceof HTMLSelectElement) {
      const n = v.trim().toLowerCase();
      const o = Array.from(el.options).find((x) => x.value.toLowerCase() === n || x.text.trim().toLowerCase() === n);
      if (!o) return;
      el.value = o.value;
    } else {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  window.__tctAddr = {
    set(a) { entries = a; if (!a.length) hide(); },
    fill(p) {
      if (!target || !target.isConnected) return;
      for (const [f, kind] of fieldsNear(target)) if (p[kind] && (!f.value || f instanceof HTMLSelectElement || f === target)) setVal(f, p[kind]);
      hide();
    }
  };
})();`
}

class AddressService {
  private store = new JsonFile<StoreFile>('addresses.json', (raw) => {
    const r = raw as Partial<StoreFile> | undefined
    return { version: 1, profiles: typeof r?.profiles === 'string' ? r.profiles : '' }
  })
  private profiles: AddressProfile[] = []
  private nonces = new Map<number, string>()
  private attached = new Set<WebContents>()

  public init(): void {
    this.store.load()
    if (!this.store.data.profiles) return
    try {
      const raw = JSON.parse(safeStorageVault.decryptString(this.store.data.profiles) || '[]')
      if (Array.isArray(raw)) this.profiles = raw.filter((p) => p && typeof p.id === 'string').map((p) => this.clean(p, p.id))
    } catch (err) {
      console.error('[Addresses] Could not read saved addresses:', err)
    }
  }

  private clean(data: Partial<AddressInput>, id: string): AddressProfile {
    const out = { id } as AddressProfile
    for (const f of FIELDS) out[f] = String(data[f] ?? '').trim().slice(0, 200)
    return out
  }

  private persist(): void {
    this.store.data.profiles = safeStorageVault.encryptString(JSON.stringify(this.profiles))
    this.store.flush()
    for (const wc of this.attached) this.inject(wc)
  }

  public get encrypted(): boolean {
    return safeStorageVault.isAvailable()
  }

  public list(): AddressProfile[] {
    return this.profiles.map((p) => ({ ...p }))
  }

  public saveProfile(data: AddressInput): AddressProfile[] {
    // Without OS encryption nothing is written (same rule as passwords)
    if (!this.encrypted) throw new Error('System encryption is not available')
    const at = data.id ? this.profiles.findIndex((p) => p.id === data.id) : -1
    if (at >= 0) this.profiles[at] = this.clean(data, this.profiles[at].id)
    else if (this.profiles.length < MAX_PROFILES) this.profiles.push(this.clean(data, crypto.randomBytes(8).toString('hex')))
    this.persist()
    return this.list()
  }

  public remove(id: string): AddressProfile[] {
    this.profiles = this.profiles.filter((p) => p.id !== id)
    this.persist()
    return this.list()
  }

  private inject(contents: WebContents): void {
    if (contents.isDestroyed() || !/^https?:/i.test(contents.getURL())) return
    // Nothing saved and nothing injected yet: leave the page alone
    if (this.profiles.length === 0 && !this.nonces.has(contents.id)) return
    let nonce = this.nonces.get(contents.id)
    if (!nonce) {
      nonce = crypto.randomBytes(16).toString('hex')
      this.nonces.set(contents.id, nonce)
    }
    const entries = this.profiles.map((p) => ({
      id: p.id,
      title: p.label || p.name || p.street || 'Address',
      sub: [p.street, p.city, p.zip].filter(Boolean).join(', ')
    }))
    contents.executeJavaScriptInIsolatedWorld(WORLD_ID, [{ code: pageScript(nonce, entries) }]).catch(() => {})
  }

  public attach(contents: WebContents): void {
    this.attached.add(contents)
    const id = contents.id
    contents.on('dom-ready', () => this.inject(contents))
    contents.on('console-message', (...args: any[]) => {
      const msg: unknown = typeof args[0]?.message === 'string' ? args[0].message : args[2]
      const nonce = this.nonces.get(id)
      if (typeof msg !== 'string' || !nonce || !msg.startsWith(`${MSG_PREFIX}${nonce}:`)) return
      try {
        this.fill(contents, JSON.parse(msg.slice(MSG_PREFIX.length + nonce.length + 1)))
      } catch {}
    })
    contents.once('destroyed', () => {
      this.attached.delete(contents)
      this.nonces.delete(id)
    })
  }

  private fill(contents: WebContents, m: { id?: unknown; o?: unknown }): void {
    const p = this.profiles.find((x) => x.id === m.id)
    if (!p || typeof m.o !== 'string') return
    const words = p.name.split(/\s+/).filter(Boolean)
    const values = { ...p, first: words.slice(0, -1).join(' ') || words[0] || '', last: words.length > 1 ? words[words.length - 1] : '' }
    const code = `if (location.origin === ${JSON.stringify(m.o)} && window.__tctAddr) window.__tctAddr.fill(${JSON.stringify(values)})`
    contents.executeJavaScriptInIsolatedWorld(WORLD_ID, [{ code }]).catch(() => {})
  }
}

export const addressService = new AddressService()
