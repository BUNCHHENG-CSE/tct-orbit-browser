/**
 * Extra browser windows (Ctrl+N, "Move tab to new window"). Like the private window, each one has
 * a single virtual space that the main window never shows, but its tabs use the normal session.
 * The renderer knows which one it is from `?window=extra&space=<id>`.
 */
export const EXTRA_WINDOW_QUERY = 'extra'
const RE = /^__window-[a-z0-9]{4,32}__$/

export function isExtraSpaceId(id: unknown): id is string {
  return typeof id === 'string' && RE.test(id)
}

export function newExtraSpaceId(): string {
  return `__window-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}__`
}
