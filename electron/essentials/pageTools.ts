import crypto from 'crypto'
import { BrowserWindow, session, type WebContents } from 'electron'
import { JsonFile } from './jsonFile'
import { PRIVATE_PARTITION } from '../privacy/types'
import { hostOf, matchesPattern, normalizePattern, pageKey, type SpaceRoute } from '../../shared/siteRules'
import type { Boost, HighlightColor, PageHighlight } from '../../src/types/essentials'

/** Per-site tools kept on this device: link routing to Spaces, boosts (custom CSS) and highlights */

const WORLD_ID = 1103
const MAX_ROUTES = 200
const MAX_BOOSTS = 200
const MAX_HIGHLIGHTS = 5000
const COLORS: Record<HighlightColor, string> = {
  yellow: 'rgba(250, 204, 21, .5)',
  green: 'rgba(74, 222, 128, .45)',
  blue: 'rgba(96, 165, 250, .45)',
  pink: 'rgba(244, 114, 182, .45)'
}
const COLOR_NAMES = Object.keys(COLORS) as HighlightColor[]

const newId = () => crypto.randomBytes(8).toString('hex')
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')
const list = (raw: unknown): Record<string, unknown>[] => (Array.isArray(raw) ? raw.filter((x) => x && typeof x === 'object') : [])

function parseRoutes(raw: unknown): SpaceRoute[] {
  return list(raw).flatMap((r) => {
    const pattern = normalizePattern(str(r.pattern, 300))
    return pattern && r.spaceId ? [{ id: str(r.id, 40) || newId(), pattern, spaceId: str(r.spaceId, 100) }] : []
  })
}

function parseBoosts(raw: unknown): Boost[] {
  return list(raw).flatMap((b) => {
    const host = normalizePattern(str(b.host, 300))
    if (!host) return []
    return [
      {
        id: str(b.id, 40) || newId(),
        host,
        enabled: b.enabled !== false,
        css: str(b.css, 50_000),
        hidden: cleanSelectors(b.hidden),
        updatedAt: typeof b.updatedAt === 'number' ? b.updatedAt : Date.now()
      }
    ]
  })
}

function parseHighlights(raw: unknown): PageHighlight[] {
  return list(raw).flatMap((h) => {
    const url = pageKey(str(h.url, 8192))
    const text = str(h.text, 5000)
    if (!url || !text) return []
    return [
      {
        id: str(h.id, 40) || newId(),
        url,
        title: str(h.title, 500),
        text,
        before: str(h.before, 60),
        after: str(h.after, 60),
        color: COLOR_NAMES.includes(h.color as HighlightColor) ? (h.color as HighlightColor) : 'yellow',
        createdAt: typeof h.createdAt === 'number' ? h.createdAt : Date.now()
      }
    ]
  })
}

/** Each selector becomes its own rule, so braces must not be able to break out of it */
function cleanSelectors(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((s): s is string => typeof s === 'string' && s.trim() !== '' && s.length <= 500 && !/[{};]|\/\*/.test(s)).slice(0, 100)
}

export function boostCss(boost: Pick<Boost, 'css' | 'hidden'>): string {
  const hide = boost.hidden.map((s) => `${s} { display: none !important; }`).join('\n')
  return [boost.css, hide].filter(Boolean).join('\n')
}

/** Runs in the page (isolated world): selected text with some context on both sides */
const SELECTION_SCRIPT = `(() => {
  const s = getSelection();
  if (!s || !s.rangeCount || s.isCollapsed) return null;
  const r = s.getRangeAt(0);
  const flat = (x) => x.replace(/\\s+/g, ' ');
  const text = flat(r.toString()).trim();
  if (text.length < 2) return null;
  const side = (start) => {
    const c = document.createRange();
    c.selectNodeContents(document.body);
    if (start) c.setEnd(r.startContainer, r.startOffset); else c.setStart(r.endContainer, r.endOffset);
    return flat(c.toString());
  };
  return { text: text.slice(0, 5000), before: side(true).slice(-60), after: side(false).slice(0, 60) };
})()`

/**
 * Runs in the page (isolated world). Finds each highlight's words in the page text (whitespace
 * collapsed, best context match wins) and paints it with the CSS Custom Highlight API, which
 * never changes the page's own DOM.
 */
function paintScript(items: PageHighlight[], scrollTo?: string): string {
  const data = items.map(({ id, text, before, after, color }) => ({ id, text, before, after, color }))
  return `(() => {
  const ITEMS = ${JSON.stringify(data)};
  if (!window.CSS || !CSS.highlights || !document.body) return false;
  const groups = {};
  let hit = false;
  let text = '';
  const map = [];
  if (ITEMS.length) {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/.test(n.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    let space = true;
    for (let n; (n = w.nextNode()) && text.length < 2000000;) {
      const v = n.data;
      for (let i = 0; i < v.length; i++) {
        const ws = /\\s/.test(v[i]);
        if (ws && space) continue;
        map.push([n, i]);
        text += ws ? ' ' : v[i];
        space = ws;
      }
    }
  }
  const same = (a, b, end) => { let k = 0; while (k < a.length && k < b.length && (end ? a[a.length - 1 - k] === b[b.length - 1 - k] : a[k] === b[k])) k++; return k; };
  for (const h of ITEMS) {
    let best = -1, score = -1;
    for (let i = text.indexOf(h.text), c = 0; i >= 0 && c < 500; i = text.indexOf(h.text, i + 1), c++) {
      const s = same(text.slice(Math.max(0, i - 60), i), h.before, true) + same(text.slice(i + h.text.length, i + h.text.length + 60), h.after, false);
      if (s > score) { score = s; best = i; }
    }
    if (best < 0) continue;
    const a = map[best], b = map[best + h.text.length - 1];
    const r = document.createRange();
    try { r.setStart(a[0], a[1]); r.setEnd(b[0], b[1] + 1); } catch (e) { continue; }
    (groups[h.color] = groups[h.color] || []).push(r);
    if (h.id === ${JSON.stringify(scrollTo ?? '')}) {
      const box = r.getBoundingClientRect();
      scrollTo({ top: scrollY + box.top - innerHeight / 3, behavior: 'smooth' });
      hit = true;
    }
  }
  for (const c of ${JSON.stringify(COLOR_NAMES)}) {
    const name = 'tct-hl-' + c;
    if (groups[c]) CSS.highlights.set(name, new Highlight(...groups[c])); else CSS.highlights.delete(name);
  }
  return hit;
})()`
}

const HIGHLIGHT_CSS = COLOR_NAMES.map((c) => `::highlight(tct-hl-${c}) { background-color: ${COLORS[c]}; }`).join('\n')

class PageTools {
  private routesFile = new JsonFile<SpaceRoute[]>('space-routes.json', parseRoutes)
  private boostsFile = new JsonFile<Boost[]>('boosts.json', parseBoosts)
  private highlightsFile = new JsonFile<PageHighlight[]>('highlights.json', parseHighlights)
  private attached = new Set<WebContents>()
  /** Keys of the boost CSS inserted into each tab's current page */
  private boostKeys = new WeakMap<WebContents, string[]>()

  public init(): void {
    this.routesFile.load()
    this.boostsFile.load()
    this.highlightsFile.load()
  }

  public flush(): void {
    this.routesFile.flushPending()
    this.boostsFile.flushPending()
    this.highlightsFile.flushPending()
  }

  public attach(contents: WebContents): void {
    this.attached.add(contents)
    contents.once('destroyed', () => this.attached.delete(contents))
    contents.on('dom-ready', () => {
      this.boostKeys.delete(contents)
      void this.applyBoosts(contents)
      if (this.highlightsFor(contents).length > 0) contents.insertCSS(HIGHLIGHT_CSS).catch(() => {})
    })
    // Text often arrives after load (apps, infinite pages): paint again once it settled
    const paintSoon = () => {
      if (this.highlightsFor(contents).length === 0) return
      for (const ms of [50, 1500, 4000]) setTimeout(() => void this.paint(contents), ms)
    }
    contents.on('did-finish-load', paintSoon)
    contents.on('did-navigate-in-page', (_e, _url, isMainFrame) => {
      if (!isMainFrame) return
      contents.insertCSS(HIGHLIGHT_CSS).catch(() => {})
      // Also clears the previous page's marks in single-page apps
      setTimeout(() => void this.paint(contents), 300)
      paintSoon()
    })
  }

  // --- Routing links to Spaces ---

  public routes(): SpaceRoute[] {
    return [...this.routesFile.data]
  }

  public saveRoute(input: string, spaceId: string): SpaceRoute[] {
    const pattern = normalizePattern(input)
    if (!pattern) throw new Error('Not a web address')
    const rest = this.routesFile.data.filter((r) => r.pattern !== pattern)
    this.setRoutes([...rest, { id: newId(), pattern, spaceId }].slice(-MAX_ROUTES))
    return this.routes()
  }

  public removeRoute(id: string): SpaceRoute[] {
    this.setRoutes(this.routesFile.data.filter((r) => r.id !== id))
    return this.routes()
  }

  public forgetSpace(spaceId: string): void {
    if (this.routesFile.data.some((r) => r.spaceId === spaceId)) {
      this.setRoutes(this.routesFile.data.filter((r) => r.spaceId !== spaceId))
    }
  }

  private setRoutes(next: SpaceRoute[]): void {
    this.routesFile.data = next
    this.routesFile.save()
    for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('routes:changed', next)
  }

  // --- Boosts ---

  public boosts(): Boost[] {
    return this.boostsFile.data.map((b) => ({ ...b, hidden: [...b.hidden] }))
  }

  public saveBoost(data: { host: string; css: string; hidden: string[]; enabled: boolean }): Boost[] {
    const host = normalizePattern(data.host)
    if (!host) throw new Error('Not a web address')
    const existing = this.boostsFile.data.find((b) => b.host === host)
    const next: Boost = {
      id: existing?.id ?? newId(),
      host,
      enabled: data.enabled,
      css: data.css.slice(0, 50_000),
      hidden: cleanSelectors(data.hidden),
      updatedAt: Date.now()
    }
    const rest = this.boostsFile.data.filter((b) => b.host !== host)
    this.setBoosts(next.css.trim() || next.hidden.length > 0 ? [next, ...rest].slice(0, MAX_BOOSTS) : rest)
    return this.boosts()
  }

  public removeBoost(id: string): Boost[] {
    this.setBoosts(this.boostsFile.data.filter((b) => b.id !== id))
    return this.boosts()
  }

  private setBoosts(next: Boost[]): void {
    this.boostsFile.data = next
    this.boostsFile.save()
    for (const wc of this.attached) void this.applyBoosts(wc)
  }

  private async applyBoosts(contents: WebContents): Promise<void> {
    if (contents.isDestroyed()) return
    const old = this.boostKeys.get(contents) ?? []
    this.boostKeys.set(contents, [])
    const url = contents.getURL()
    for (const b of this.boostsFile.data) {
      if (!b.enabled || !matchesPattern(url, b.host)) continue
      try {
        const key = await contents.insertCSS(boostCss(b))
        this.boostKeys.get(contents)?.push(key)
      } catch {}
    }
    for (const key of old) contents.removeInsertedCSS(key).catch(() => {})
  }

  // --- Highlights ---

  public highlights(url?: string): PageHighlight[] {
    if (!url) return [...this.highlightsFile.data]
    const key = pageKey(url)
    return key ? this.highlightsFile.data.filter((h) => h.url === key) : []
  }

  private highlightsFor(contents: WebContents): PageHighlight[] {
    return contents.isDestroyed() ? [] : this.highlights(contents.getURL() || 'about:blank')
  }

  private async paint(contents: WebContents, scrollTo?: string): Promise<boolean> {
    if (contents.isDestroyed()) return false
    try {
      const items = this.highlightsFor(contents)
      return !!(await contents.executeJavaScriptInIsolatedWorld(WORLD_ID, [{ code: paintScript(items, scrollTo) }]))
    } catch {
      return false
    }
  }

  public async addHighlight(contents: WebContents, color: HighlightColor): Promise<PageHighlight | null> {
    // Private tabs never leave anything behind
    if (contents.session === session.fromPartition(PRIVATE_PARTITION)) return null
    const url = pageKey(contents.getURL())
    if (!url || !hostOf(url)) return null
    const sel = await contents.executeJavaScriptInIsolatedWorld(WORLD_ID, [{ code: SELECTION_SCRIPT }]).catch(() => null)
    const [item] = parseHighlights([
      { id: newId(), url, title: contents.getTitle(), text: sel?.text, before: sel?.before, after: sel?.after, color, createdAt: Date.now() }
    ])
    if (!item) return null
    this.highlightsFile.data = [item, ...this.highlightsFile.data].slice(0, MAX_HIGHLIGHTS)
    this.highlightsFile.save()
    await contents.insertCSS(HIGHLIGHT_CSS).catch(() => '')
    await this.paint(contents)
    return item
  }

  public removeHighlight(id: string): boolean {
    const item = this.highlightsFile.data.find((h) => h.id === id)
    if (!item) return false
    this.highlightsFile.data = this.highlightsFile.data.filter((h) => h.id !== id)
    this.highlightsFile.save()
    for (const wc of this.attached) if (pageKey(wc.isDestroyed() ? '' : wc.getURL()) === item.url) void this.paint(wc)
    return true
  }

  public scrollToHighlight(contents: WebContents, id: string): Promise<boolean> {
    return this.paint(contents, id)
  }
}

export const pageTools = new PageTools()
