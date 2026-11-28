/**
 * Keyboard shortcuts: one table used by the main process (keys pressed while a web page has
 * focus), the UI window, Settings > Shortcuts and the Ctrl+/ cheat sheet.
 *
 * A combo is written "Mod+Shift+T". "Mod" is Ctrl (or Cmd on macOS); modifiers are always in the
 * order Mod, Alt, Shift.
 */

export interface KeyInput {
  key: string
  code: string
  control: boolean
  meta: boolean
  shift: boolean
  alt: boolean
}

export type ShortcutGroupName = 'Tabs & windows' | 'Navigation' | 'Page & media' | 'Browser'

export interface ShortcutAction {
  id: string
  group: ShortcutGroupName
  label: string
  defaults: string[]
}

export type ShortcutOverrides = Record<string, string[]>

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: 'new-tab', group: 'Tabs & windows', label: 'New tab', defaults: ['Mod+T'] },
  { id: 'new-window', group: 'Tabs & windows', label: 'New window', defaults: ['Mod+N'] },
  { id: 'new-private-tab', group: 'Tabs & windows', label: 'New private window', defaults: ['Mod+Shift+N', 'Alt+Shift+N'] },
  { id: 'close-tab', group: 'Tabs & windows', label: 'Close tab', defaults: ['Mod+W', 'Mod+F4'] },
  { id: 'reopen-tab', group: 'Tabs & windows', label: 'Reopen closed tab', defaults: ['Mod+Shift+T'] },
  { id: 'tab-search', group: 'Tabs & windows', label: 'Search all open tabs', defaults: ['Mod+Shift+A'] },
  { id: 'next-tab', group: 'Tabs & windows', label: 'Next tab', defaults: ['Mod+Tab', 'Mod+PageDown'] },
  { id: 'prev-tab', group: 'Tabs & windows', label: 'Previous tab', defaults: ['Mod+Shift+Tab', 'Mod+PageUp'] },
  { id: 'switch-tab-last', group: 'Tabs & windows', label: 'Go to last tab', defaults: ['Mod+9'] },
  { id: 'toggle-split-view', group: 'Tabs & windows', label: 'Toggle split view', defaults: ['Mod+\\'] },

  { id: 'focus-address-bar', group: 'Navigation', label: 'Focus address bar', defaults: ['Mod+L', 'Alt+D', 'F6', 'Mod+E'] },
  { id: 'open-command-bar', group: 'Navigation', label: 'Command bar', defaults: ['Mod+K'] },
  { id: 'reload', group: 'Navigation', label: 'Reload', defaults: ['Mod+R', 'F5'] },
  { id: 'hard-reload', group: 'Navigation', label: 'Hard reload (bypass cache)', defaults: ['Mod+Shift+R', 'Mod+F5'] },
  { id: 'back', group: 'Navigation', label: 'Back', defaults: ['Alt+ArrowLeft', 'Mod+['] },
  { id: 'forward', group: 'Navigation', label: 'Forward', defaults: ['Alt+ArrowRight', 'Mod+]'] },
  { id: 'toggle-find', group: 'Navigation', label: 'Find in page', defaults: ['Mod+F'] },
  { id: 'find-next', group: 'Navigation', label: 'Find next', defaults: ['F3', 'Mod+G'] },
  { id: 'find-prev', group: 'Navigation', label: 'Find previous', defaults: ['Shift+F3', 'Mod+Shift+G'] },

  { id: 'zoom-in', group: 'Page & media', label: 'Zoom in', defaults: ['Mod+=', 'Mod++', 'Mod+Shift+=', 'Mod+Shift++'] },
  { id: 'zoom-out', group: 'Page & media', label: 'Zoom out', defaults: ['Mod+-', 'Mod+Shift+-'] },
  { id: 'zoom-reset', group: 'Page & media', label: 'Reset zoom', defaults: ['Mod+0'] },
  { id: 'toggle-reader-mode', group: 'Page & media', label: 'Reader mode', defaults: ['F9', 'Mod+Alt+R'] },
  { id: 'toggle-pip', group: 'Page & media', label: 'Picture-in-picture video', defaults: ['Mod+Alt+P'] },
  { id: 'print-page', group: 'Page & media', label: 'Print', defaults: ['Mod+P'] },
  { id: 'save-page', group: 'Page & media', label: 'Save page as', defaults: ['Mod+S'] },
  { id: 'take-screenshot', group: 'Page & media', label: 'Web capture', defaults: ['Mod+Shift+S'] },
  { id: 'ask-page', group: 'Page & media', label: 'Ask this page', defaults: ['Mod+Shift+Y'] },
  { id: 'view-source', group: 'Page & media', label: 'View page source', defaults: ['Mod+U'] },
  { id: 'toggle-bookmark', group: 'Page & media', label: 'Bookmark page', defaults: ['Mod+D'] },

  { id: 'toggle-sidebar', group: 'Browser', label: 'Toggle sidebar', defaults: ['Mod+Shift+,'] },
  { id: 'open-favorites', group: 'Browser', label: 'Favorites', defaults: ['Mod+Shift+O'] },
  { id: 'toggle-favorites-bar', group: 'Browser', label: 'Show / hide favorites bar', defaults: ['Mod+Shift+B'] },
  { id: 'toggle-notes', group: 'Browser', label: 'Space notes', defaults: ['Mod+Shift+M'] },
  { id: 'open-history', group: 'Browser', label: 'History', defaults: ['Mod+H'] },
  { id: 'open-downloads', group: 'Browser', label: 'Downloads', defaults: ['Mod+J'] },
  { id: 'toggle-zen-mode', group: 'Browser', label: 'Zen mode', defaults: ['F11', 'Mod+Shift+F'] },
  { id: 'open-task-manager', group: 'Browser', label: 'Task manager', defaults: ['Shift+Escape'] },
  { id: 'clear-data', group: 'Browser', label: 'Clear browsing data', defaults: ['Mod+Shift+Delete'] },
  { id: 'toggle-devtools', group: 'Browser', label: 'Developer tools', defaults: ['F12', 'Mod+Shift+I'] },
  { id: 'open-settings', group: 'Browser', label: 'Settings', defaults: ['Mod+,'] },
  { id: 'shortcut-help', group: 'Browser', label: 'Keyboard shortcuts', defaults: ['Mod+/'] }
]

/**
 * Like Chrome: these always belong to the browser. Every other shortcut goes to the web page first,
 * and the browser only acts when the page did not use the keys itself (Ctrl+K in GitHub or Slack,
 * Ctrl+/ in Google Docs ...).
 */
export const BROWSER_FIRST = new Set([
  'new-tab',
  'new-window',
  'new-private-tab',
  'close-tab',
  'reopen-tab',
  'next-tab',
  'prev-tab',
  'switch-tab-last',
  ...Array.from({ length: 8 }, (_, i) => `switch-tab-${i + 1}`)
])

/** Same text for a key press in the main process and in the page (see electron/pagePreload.ts) */
export function keySignature(code: string, control: boolean, alt: boolean, shift: boolean, meta: boolean): string {
  return `${code}|${+control}${+alt}${+shift}${+meta}`
}

const ACTION_IDS = new Set(SHORTCUT_ACTIONS.map((a) => a.id))

const CODE_KEYS: Record<string, string> = {
  Comma: ',',
  Slash: '/',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Equal: '=',
  Minus: '-',
  Period: '.',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  NumpadAdd: '+',
  NumpadSubtract: '-'
}
const MODIFIER_KEYS = new Set(['control', 'shift', 'alt', 'meta', 'altgraph', 'capslock'])
const NAMED: Record<string, string> = {
  tab: 'Tab',
  escape: 'Escape',
  enter: 'Enter',
  ' ': 'Space',
  backspace: 'Backspace',
  delete: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown'
}

/**
 * Main key of a press. The typed character wins (so shortcuts follow the user's layout); the
 * physical key is the fallback for non-Latin layouts and characters changed by Alt or Shift.
 */
function mainKey(input: KeyInput): string | null {
  const key = input.key || ''
  const lower = key.toLowerCase()
  const code = input.code || ''
  if (MODIFIER_KEYS.has(lower)) return null
  if (NAMED[lower]) return NAMED[lower]
  if (/^f([1-9]|1\d|2[0-4])$/.test(lower)) return lower.toUpperCase()
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(code)
  if (digit) return digit[1]
  if (/^[a-z]$/.test(lower) && !input.alt) return lower.toUpperCase()
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1]
  if (key === '+') return '+'
  if (key.length === 1 && !input.shift && !input.alt && key > ' ' && key.charCodeAt(0) < 127) return key
  return CODE_KEYS[code] ?? null
}

/** "Mod+Shift+T" for a key press, or null for a modifier pressed alone */
export function comboFromInput(input: KeyInput): string | null {
  const main = mainKey(input)
  if (!main) return null
  const parts: string[] = []
  if (input.control || input.meta) parts.push('Mod')
  if (input.alt) parts.push('Alt')
  if (input.shift) parts.push('Shift')
  parts.push(main)
  return parts.join('+')
}

/** Splits a combo into its parts ("Mod++" is Mod and the + key) */
export function splitCombo(combo: string): string[] {
  if (combo === '+') return ['+']
  if (combo.endsWith('++')) return [...combo.slice(0, -2).split('+').filter(Boolean), '+']
  return combo.split('+').filter(Boolean)
}

/** Combos a user may assign: something with Mod/Alt, or a function key (plain letters must stay typable) */
export function isAssignableCombo(combo: string): boolean {
  if (combo.length > 40) return false
  const parts = splitCombo(combo)
  const main = parts[parts.length - 1]
  if (!main || main === 'Mod' || main === 'Alt' || main === 'Shift') return false
  if (/^F([1-9]|1\d|2[0-4])$/.test(main)) return true
  return parts.includes('Mod') || parts.includes('Alt')
}

/** Text editing and window keys that pages and the OS need: never taken over */
export const RESERVED_COMBOS = new Set([
  'Mod+C',
  'Mod+V',
  'Mod+X',
  'Mod+Z',
  'Mod+Y',
  'Mod+A',
  'Mod+Shift+V',
  'Mod+Shift+Z',
  'Alt+F4'
])

export function sanitizeOverrides(raw: unknown): ShortcutOverrides {
  const out: ShortcutOverrides = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [id, combos] of Object.entries(raw as Record<string, unknown>)) {
    if (!ACTION_IDS.has(id) || !Array.isArray(combos)) continue
    out[id] = combos
      .filter((c): c is string => typeof c === 'string' && (isAssignableCombo(c) || c === 'Shift+Escape') && !RESERVED_COMBOS.has(c))
      .slice(0, 6)
  }
  return out
}

export function combosFor(id: string, overrides?: ShortcutOverrides | null): string[] {
  const custom = overrides?.[id]
  if (Array.isArray(custom)) return custom
  return SHORTCUT_ACTIONS.find((a) => a.id === id)?.defaults ?? []
}

/** combo -> action. A combo the user assigned wins over another action's default. */
export function buildKeymap(overrides?: ShortcutOverrides | null): Map<string, string> {
  const map = new Map<string, string>()
  for (let n = 1; n <= 8; n++) map.set(`Mod+${n}`, `switch-tab-${n}`)
  for (const a of SHORTCUT_ACTIONS) if (!overrides?.[a.id]) for (const c of a.defaults) map.set(c, a.id)
  for (const a of SHORTCUT_ACTIONS) for (const c of overrides?.[a.id] ?? []) map.set(c, a.id)
  return map
}

export function matchShortcut(input: KeyInput, keymap: Map<string, string>): string | null {
  const combo = comboFromInput(input)
  return combo ? keymap.get(combo) ?? null : null
}

const DISPLAY: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc' }

/** Parts to show in <kbd> elements */
export function displayCombo(combo: string, modLabel: string): string[] {
  return splitCombo(combo).map((p) => (p === 'Mod' ? modLabel : DISPLAY[p] ?? p))
}
