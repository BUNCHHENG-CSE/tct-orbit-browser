/**
 * Private window (Edge "InPrivate" style): a separate window that only has private tabs.
 * Its tabs live in this virtual space id, which the main window never shows, and are never
 * written to disk. The renderer knows it is the private window from `?window=private`.
 */
export const PRIVATE_WINDOW_SPACE_ID = '__private-window__'
export const PRIVATE_WINDOW_QUERY = 'private'
/** Private start page (same as src/lib/startPage PRIVATE_START_URL) */
export const PRIVATE_START = { url: 'orbit://private', title: 'Private Tab' } as const
