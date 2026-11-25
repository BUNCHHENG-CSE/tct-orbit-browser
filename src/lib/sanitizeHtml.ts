/**
 * Allowlist sanitizer for HTML that came from a web page (Reader Mode).
 *
 * The browser UI runs with access to window.api, so page HTML must never be able to run code or
 * load local / network-share files here. The input is parsed into an inert document (nothing
 * loads, no handlers fire) and rebuilt from scratch: only known-safe tags and attributes survive.
 */

const TAGS = new Set([
  'a', 'abbr', 'article', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'dd', 'del', 'details', 'dfn', 'div',
  'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li',
  'main', 'mark', 'ol', 'p', 'pre', 'q', 's', 'samp', 'section', 'small', 'span', 'strong', 'sub', 'summary', 'sup',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul', 'var', 'wbr'
])

/** Dropped together with everything inside them (other unknown tags keep their text) */
const DROP = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'webview', 'noscript', 'template',
  'svg', 'math', 'link', 'meta', 'base', 'title', 'head', 'form', 'input', 'button', 'select', 'textarea', 'option',
  'video', 'audio', 'source', 'track', 'canvas', 'dialog', 'portal', 'slot', 'xmp', 'plaintext', 'noembed', 'noframes'
])

const MAX_NODES = 50_000
const MAX_DEPTH = 200

function safeLink(raw: string): string | null {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:' ? u.href : null
  } catch {
    return null
  }
}

/** Image address the UI may load. Never file:, UNC shares, blob: or other local schemes. */
export function safeImageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null
  if (/^data:image\/(png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon|svg\+xml)[;,]/i.test(raw)) return raw
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}

function copyAttributes(from: Element, to: HTMLElement, tag: string): void {
  if (tag === 'a') {
    const href = safeLink(from.getAttribute('href') || '')
    if (href) {
      to.setAttribute('href', href)
      to.setAttribute('rel', 'noopener noreferrer')
    }
  } else if (tag === 'img') {
    const src = safeImageUrl(from.getAttribute('src'))
    if (src) to.setAttribute('src', src)
    to.setAttribute('loading', 'lazy')
    to.setAttribute('referrerpolicy', 'no-referrer')
    to.setAttribute('alt', from.getAttribute('alt') || '')
  } else if (tag === 'td' || tag === 'th') {
    for (const name of ['colspan', 'rowspan']) {
      const n = Number(from.getAttribute(name))
      if (Number.isInteger(n) && n > 1 && n <= 100) to.setAttribute(name, String(n))
    }
  }
}

export function sanitizeHtml(html: unknown): string {
  if (typeof html !== 'string' || !html) return ''
  const source = new DOMParser().parseFromString(html, 'text/html')
  // Build in an inert document too, so images don't start loading before the caller uses the result
  const out = document.implementation.createHTMLDocument('')
  let budget = MAX_NODES

  const walk = (from: Node, to: Node, depth: number): void => {
    if (depth > MAX_DEPTH) return
    for (const child of Array.from(from.childNodes)) {
      if (budget-- <= 0) return
      if (child.nodeType === Node.TEXT_NODE) {
        to.appendChild(out.createTextNode(child.nodeValue || ''))
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const el = child as Element
      const tag = el.localName.toLowerCase()
      // SVG / MathML are parsed in their own namespace: never carried over
      if (DROP.has(tag) || el.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue
      if (!TAGS.has(tag)) {
        walk(el, to, depth + 1)
        continue
      }
      const copy = out.createElement(tag)
      copyAttributes(el, copy, tag)
      if (tag === 'img' && !copy.hasAttribute('src')) continue
      walk(el, copy, depth + 1)
      to.appendChild(copy)
    }
  }

  walk(source.body, out.body, 0)
  return out.body.innerHTML
}

/** Visible text of page HTML, without ever attaching it to the live document */
export function htmlToText(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent || ''
}
