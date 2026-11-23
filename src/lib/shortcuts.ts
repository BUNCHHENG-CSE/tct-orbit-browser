import { modKey } from './platform'

export interface ShortcutEntry {
  keys: string[]
  description: string
}

export interface ShortcutGroup {
  title: string
  items: ShortcutEntry[]
}

/** Single source of truth for the Settings reference and the Ctrl+/ cheat sheet */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Tabs',
    items: [
      { keys: [modKey, 'T'], description: 'New tab' },
      { keys: ['Alt', 'Shift', 'N'], description: 'New private tab' },
      { keys: [modKey, 'W'], description: 'Close tab' },
      { keys: [modKey, 'Shift', 'T'], description: 'Reopen closed tab' },
      { keys: [modKey, 'Shift', 'A'], description: 'Search all open tabs' },
      { keys: [modKey, 'Tab'], description: 'Next tab' },
      { keys: [modKey, 'Shift', 'Tab'], description: 'Previous tab' },
      { keys: [modKey, '1-8'], description: 'Go to tab 1–8' },
      { keys: [modKey, '9'], description: 'Go to last tab' },
      { keys: [modKey, '\\'], description: 'Toggle split view' }
    ]
  },
  {
    title: 'Navigation',
    items: [
      { keys: [modKey, 'L'], description: 'Focus address bar' },
      { keys: [modKey, 'K'], description: 'Command bar' },
      { keys: [modKey, 'R'], description: 'Reload' },
      { keys: [modKey, 'Shift', 'R'], description: 'Hard reload (bypass cache)' },
      { keys: ['Alt', '←'], description: 'Back' },
      { keys: ['Alt', '→'], description: 'Forward' },
      { keys: [modKey, 'F'], description: 'Find in page' }
    ]
  },
  {
    title: 'Page & media',
    items: [
      { keys: [modKey, '+'], description: 'Zoom in' },
      { keys: [modKey, '-'], description: 'Zoom out' },
      { keys: [modKey, '0'], description: 'Reset zoom' },
      { keys: ['F9'], description: 'Reader mode' },
      { keys: [modKey, 'Shift', 'P'], description: 'Picture-in-picture video' },
      { keys: [modKey, 'P'], description: 'Print' },
      { keys: [modKey, 'Shift', 'S'], description: 'Screenshot of tab' },
      { keys: [modKey, 'D'], description: 'Bookmark page' }
    ]
  },
  {
    title: 'Browser',
    items: [
      { keys: [modKey, 'S'], description: 'Toggle sidebar' },
      { keys: [modKey, 'Shift', 'N'], description: 'Space notes' },
      { keys: [modKey, 'H'], description: 'History' },
      { keys: [modKey, 'J'], description: 'Downloads' },
      { keys: ['F11'], description: 'Zen mode' },
      { keys: ['Shift', 'Esc'], description: 'Task manager' },
      { keys: ['F12'], description: 'Developer tools' },
      { keys: [modKey, ','], description: 'Settings' },
      { keys: [modKey, '/'], description: 'This shortcut list' }
    ]
  }
]

export const ALL_SHORTCUTS: ShortcutEntry[] = SHORTCUT_GROUPS.flatMap((g) => g.items)
