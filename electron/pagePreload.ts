import { contextBridge, ipcRenderer } from 'electron'

/**
 * Runs in every web page before the page's own scripts (registered per session in
 * essentials/pagePreloads.ts). The functions below are copied into the page, so each must be
 * self-contained. The page gets no API: only window.prompt() leads back to the browser.
 */

/**
 * Sites like Google start a *silent* passkey request on their sign-in page. Chrome offers those
 * passkeys inside autofill; Electron has no such UI and opens the operating system's passkey
 * dialog over the page instead, without the user asking. So silent requests are reported as
 * unsupported. Passkey buttons the user clicks (normal requests) are untouched.
 */
function quietSilentPasskeys(): void {
  const pkc = (window as any).PublicKeyCredential
  const container = (window as any).CredentialsContainer?.prototype
  if (!pkc || !container) return

  const isSilent = (o: any): boolean =>
    !!o && !!o.publicKey && (o.mediation === 'conditional' || o.mediation === 'immediate' || o.uiMode === 'immediate')
  const notAllowed = () => new DOMException('The operation is not allowed at this time.', 'NotAllowedError')
  // A proxy keeps the function's name, length and native toString()
  const wrap = (target: any, name: string, apply: (original: any, self: any, args: any[]) => any): void => {
    const original = target[name]
    if (typeof original !== 'function') return
    target[name] = new Proxy(original, { apply: (fn, self, args) => apply(fn, self, args) })
  }

  wrap(pkc, 'isConditionalMediationAvailable', () => Promise.resolve(false))
  wrap(pkc, 'getClientCapabilities', async (fn, self, args) => ({
    ...(await Reflect.apply(fn, self, args)),
    conditionalGet: false,
    conditionalCreate: false,
    immediateGet: false
  }))
  wrap(container, 'get', (fn, self, args) => {
    const options = args[0]
    if (!isSilent(options)) return Reflect.apply(fn, self, args)
    if (options.mediation !== 'conditional') return Promise.reject(notAllowed())
    // What a browser does when the user never picks a passkey: wait until the page gives up
    return new Promise((_resolve, reject) => {
      const signal = options.signal
      if (!signal) return
      if (signal.aborted) return reject(signal.reason)
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  })
  wrap(container, 'create', (fn, self, args) => (isSilent(args[0]) ? Promise.reject(notAllowed()) : Reflect.apply(fn, self, args)))
}

/** Electron has no window.prompt(): ask in Orbit's own dialog (the page waits, as in any browser) */
function addPrompt(ask: (message: string, value: string) => string | null): void {
  const prompt = function prompt(message?: unknown, value?: unknown): string | null {
    return ask(message === undefined ? '' : String(message), value === undefined ? '' : String(value))
  }
  Object.defineProperty(window, 'prompt', { value: prompt, writable: true, enumerable: true, configurable: true })
}

/**
 * YouTube puts its ads in the same answers as the video, so they can't be blocked by address.
 * Take the ad lists out of the player data before the player reads it.
 */
function removeYouTubeAds(): void {
  const AD_KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams']
  const MARK = /"(?:adPlacements|adSlots|playerAds|adBreakHeartbeatParams)"/

  const strip = (o: any): void => {
    if (!o || typeof o !== 'object') return
    for (const k of AD_KEYS) if (k in o) delete o[k]
  }
  const clean = (data: any): any => {
    try {
      for (const o of Array.isArray(data) ? data.slice(0, 20) : [data]) {
        if (!o || typeof o !== 'object') continue
        strip(o)
        strip(o.playerResponse)
        strip(o.response?.playerResponse)
        // Shorts: whole ad videos in the list
        if (Array.isArray(o.entries)) {
          o.entries = o.entries.filter((e: any) => !e?.command?.reelWatchEndpoint?.adClientParams?.isAd)
        }
      }
    } catch {}
    return data
  }
  const wrap = (target: any, name: string, apply: (original: any, self: any, args: any[]) => any): void => {
    target[name] = new Proxy(target[name], { apply: (fn, self, args) => apply(fn, self, args) })
  }

  wrap(JSON, 'parse', (fn, self, args) => {
    const out = Reflect.apply(fn, self, args)
    return typeof args[0] === 'string' && out && typeof out === 'object' && MARK.test(args[0]) ? clean(out) : out
  })
  wrap(Response.prototype, 'json', (fn, self, args) => (Reflect.apply(fn, self, args) as Promise<any>).then(clean))

  // The first video's data is written into the page itself
  let initial: any
  Object.defineProperty(window, 'ytInitialPlayerResponse', {
    configurable: true,
    enumerable: true,
    get: () => initial,
    set: (v) => {
      initial = clean(v)
    }
  })
}

/**
 * Keyboard shortcuts go to the page first (like Chrome). After the page handled a key press with a
 * modifier, tell the browser whether the page used it (preventDefault), so the browser does not
 * also act on it. The browser ignores this unless it saw the same key press itself.
 */
function reportKeys(): void {
  window.addEventListener(
    'keydown',
    (e) => {
      if (!e.isTrusted || !(e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key) || e.key === 'Escape')) return
      const signature = `${e.code}|${+e.ctrlKey}${+e.altKey}${+e.shiftKey}${+e.metaKey}`
      // Runs after every listener of the page had its turn
      setTimeout(() => ipcRenderer.send('page:key', signature, e.defaultPrevented), 0)
    },
    true
  )
}

/** alert() and confirm() name the site that asks, like Chrome ("example.com says"). Top frame only: page scripts don't run in embedded frames. */
function addDialogs(ask: (kind: string, message: string) => boolean): void {
  const text = (message: unknown): string => (message === undefined ? '' : String(message))
  const alert = function alert(message?: unknown): void {
    ask('alert', text(message))
  }
  const confirm = function confirm(message?: unknown): boolean {
    return ask('confirm', text(message))
  }
  for (const [name, value] of [['alert', alert], ['confirm', confirm]] as const) {
    Object.defineProperty(window, name, { value, writable: true, enumerable: true, configurable: true })
  }
}

try {
  reportKeys()
  if (/^https?:$/.test(location.protocol)) {
    contextBridge.executeInMainWorld({
      func: addDialogs,
      args: [(kind: string, message: string): boolean => ipcRenderer.sendSync('page:dialog', String(kind), String(message).slice(0, 5000)) === true]
    })
    contextBridge.executeInMainWorld({ func: quietSilentPasskeys })
    contextBridge.executeInMainWorld({
      func: addPrompt,
      args: [
        (message: string, value: string): string | null => {
          const answer: unknown = ipcRenderer.sendSync('page:prompt', String(message).slice(0, 2000), String(value).slice(0, 2000))
          return typeof answer === 'string' ? answer : null
        }
      ]
    })
    if (/(^|\.)youtube\.com$/.test(location.hostname) && ipcRenderer.sendSync('page:ad-block') === true) {
      contextBridge.executeInMainWorld({ func: removeYouTubeAds })
    }
  }
} catch {
  // Never break a page over this
}
