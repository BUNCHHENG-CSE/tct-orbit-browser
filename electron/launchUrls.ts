/**
 * URLs the OS asked us to open before the UI was ready (cold start as default browser,
 * macOS open-url during launch). The renderer takes them once it has mounted.
 */
const pending: string[] = []

export function isOpenableUrl(arg: unknown): arg is string {
  return typeof arg === 'string' && /^https?:\/\//i.test(arg) && arg.length < 8192
}

export function queueLaunchUrl(url: string): void {
  if (isOpenableUrl(url) && pending.length < 20) pending.push(url)
}

export function takePendingLaunchUrls(): string[] {
  return pending.splice(0, pending.length)
}
