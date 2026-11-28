import { useMemo } from 'react'
import { SHORTCUT_ACTIONS, buildKeymap, combosFor, displayCombo, type ShortcutOverrides } from '@shared/shortcuts'
import { modKey } from './platform'
import { useBrowserStore } from '@/store/useBrowserStore'

export interface ShortcutEntry {
  keys: string[]
  description: string
}

export interface ShortcutGroup {
  title: string
  items: ShortcutEntry[]
}

/** Groups for the Ctrl+/ cheat sheet, with the user's own combinations */
export function shortcutGroups(overrides?: ShortcutOverrides | null): ShortcutGroup[] {
  const titles = [...new Set(SHORTCUT_ACTIONS.map((a) => a.group))]
  return titles.map((title) => ({
    title,
    items: SHORTCUT_ACTIONS.filter((a) => a.group === title).flatMap((a) => {
      const combo = combosFor(a.id, overrides)[0]
      const entry = combo ? [{ keys: displayCombo(combo, modKey), description: a.label }] : []
      return a.id === 'switch-tab-last' ? [{ keys: [modKey, '1-8'], description: 'Go to tab 1–8' }, ...entry] : entry
    })
  }))
}

export function useShortcutGroups(): ShortcutGroup[] {
  const overrides = useBrowserStore((s) => s.settings?.shortcuts)
  return useMemo(() => shortcutGroups(overrides), [overrides])
}

let source: unknown
let keymap = buildKeymap()
/** Keymap for keys pressed in the browser UI */
export function currentKeymap(): Map<string, string> {
  const overrides = useBrowserStore.getState().settings?.shortcuts
  if (overrides !== source) {
    source = overrides
    keymap = buildKeymap(overrides)
  }
  return keymap
}

/** The current first combination of an action, e.g. "Ctrl+Shift+N" (for menus and tooltips) */
export function shortcutLabel(id: string): string {
  const combo = combosFor(id, useBrowserStore.getState().settings?.shortcuts)[0]
  return combo ? displayCombo(combo, modKey).join('+') : ''
}

/** Settings is recording a new combination: keys must not trigger actions */
export const shortcutRecording = { active: false }
