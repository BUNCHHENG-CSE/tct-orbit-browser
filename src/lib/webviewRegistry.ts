/**
 * Live <webview> elements by tab id, so features outside WebViewContainer (split compare,
 * page watcher picker) can reach a tab's page. Filled by WebViewContainer.
 */
const webviews = new Map<string, any>()

export const webviewRegistry = {
  set(tabId: string, el: any) {
    webviews.set(tabId, el)
  },
  delete(tabId: string, el?: any) {
    if (!el || webviews.get(tabId) === el) webviews.delete(tabId)
  },
  get(tabId: string | null | undefined): any | null {
    if (!tabId) return null
    const el = webviews.get(tabId)
    return el && typeof el.executeJavaScript === 'function' ? el : null
  }
}

/** executeJavaScript that never throws (webview not attached yet, page navigating, ...) */
export async function runInTab<T = unknown>(tabId: string | null | undefined, script: string, userGesture = false): Promise<T | null> {
  const el = webviewRegistry.get(tabId)
  if (!el) return null
  try {
    return (await el.executeJavaScript(script, userGesture)) as T
  } catch {
    return null
  }
}
