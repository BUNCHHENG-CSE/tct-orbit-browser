import { contextBridge } from 'electron'

/**
 * Runs in every web page before the page's own scripts (registered per session in
 * essentials/silentPasskeys.ts). It exposes nothing to the page.
 *
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

try {
  if (/^https?:$/.test(location.protocol)) contextBridge.executeInMainWorld({ func: quietSilentPasskeys })
} catch {
  // Never break a page over this
}
