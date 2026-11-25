import { useCallback } from 'react'
import { useBrowserStore } from '@/store/useBrowserStore'
import { LANGUAGES, TRANSLATIONS, type LanguageId } from '@/lib/locales'

const COLUMN: Partial<Record<LanguageId, 0 | 1 | 2>> = { es: 0, fr: 1, de: 2 }

/** Interface language: English unless chosen ("system" = the OS language if it is available) */
export function resolveLanguage(setting: string | undefined, system = typeof navigator === 'undefined' ? 'en' : navigator.language): LanguageId {
  const wanted = (setting === 'system' ? system : setting || 'en').toLowerCase().split('-')[0]
  return LANGUAGES.find((l) => l.id === wanted)?.id ?? 'en'
}

export function translate(text: string, lang: LanguageId): string {
  const col = COLUMN[lang]
  return col === undefined ? text : TRANSLATIONS[text]?.[col] ?? text
}

export function currentLanguage(): LanguageId {
  return resolveLanguage(useBrowserStore.getState().settings?.language)
}

export const t = (text: string): string => translate(text, currentLanguage())

/** t() for components: re-renders when the language changes */
export function useT(): (text: string) => string {
  const lang = useBrowserStore((s) => resolveLanguage(s.settings?.language))
  return useCallback((text: string) => translate(text, lang), [lang])
}
