import { app, type Session } from 'electron'
import type { Settings } from '../../src/types/api'

/**
 * Spell checking on web pages. macOS uses the system dictionaries; elsewhere Chromium downloads a
 * dictionary once per language and checks words on this computer (text is never sent anywhere).
 */
export function applySpellcheck(ses: Session, settings: Pick<Settings, 'spellcheck' | 'spellcheckLanguages'>): void {
  try {
    const enabled = settings.spellcheck !== false
    ses.setSpellCheckerEnabled(enabled)
    if (!enabled || process.platform === 'darwin') return
    const available = ses.availableSpellCheckerLanguages
    const languages = pickLanguages(settings.spellcheckLanguages ?? [], app.getPreferredSystemLanguages(), available)
    if (languages.length > 0) ses.setSpellCheckerLanguages(languages)
  } catch (err) {
    console.warn('[Spellcheck] Could not apply settings:', err)
  }
}

/** Chosen dictionaries, else the system languages, else English; only ones that exist */
export function pickLanguages(chosen: string[], system: string[], available: string[]): string[] {
  const match = (tag: string): string | undefined => {
    const t = tag.toLowerCase()
    return (
      available.find((a) => a.toLowerCase() === t) ??
      available.find((a) => a.toLowerCase() === t.split('-')[0]) ??
      available.find((a) => a.toLowerCase().startsWith(`${t.split('-')[0]}-`))
    )
  }
  const pick = (tags: string[]) => [...new Set(tags.map(match).filter((x): x is string => !!x))]
  const fromUser = pick(chosen)
  if (fromUser.length > 0) return fromUser
  const fromSystem = pick(system)
  if (fromSystem.length > 0) return fromSystem.slice(0, 3)
  return pick(['en-US'])
}
