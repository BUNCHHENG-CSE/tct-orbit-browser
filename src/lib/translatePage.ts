import { currentLanguage } from '@/lib/i18n'
import { useBrowserStore } from '@/store/useBrowserStore'

export const TRANSLATE_LANGUAGES: Array<{ id: string; name: string }> = [
  { id: 'ar', name: 'العربية' },
  { id: 'bn', name: 'বাংলা' },
  { id: 'zh-CN', name: '中文 (简体)' },
  { id: 'zh-TW', name: '中文 (繁體)' },
  { id: 'nl', name: 'Nederlands' },
  { id: 'en', name: 'English' },
  { id: 'fr', name: 'Français' },
  { id: 'de', name: 'Deutsch' },
  { id: 'hi', name: 'हिन्दी' },
  { id: 'id', name: 'Bahasa Indonesia' },
  { id: 'it', name: 'Italiano' },
  { id: 'ja', name: '日本語' },
  { id: 'km', name: 'ខ្មែរ' },
  { id: 'ko', name: '한국어' },
  { id: 'lo', name: 'ລາວ' },
  { id: 'ms', name: 'Bahasa Melayu' },
  { id: 'pl', name: 'Polski' },
  { id: 'pt', name: 'Português' },
  { id: 'ru', name: 'Русский' },
  { id: 'es', name: 'Español' },
  { id: 'th', name: 'ไทย' },
  { id: 'tr', name: 'Türkçe' },
  { id: 'uk', name: 'Українська' },
  { id: 'vi', name: 'Tiếng Việt' }
]

function target(): string {
  return useBrowserStore.getState().settings?.translateTo || currentLanguage()
}

/** Google Translate page for a web page. Null when the page can't be translated (local, internal). */
export function translatePageUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (/^(localhost|127\.|10\.|192\.168\.|\[)/.test(u.hostname) || !u.hostname.includes('.') || u.hostname.endsWith('.translate.goog')) return null
    return `https://translate.google.com/translate?sl=auto&tl=${encodeURIComponent(target())}&u=${encodeURIComponent(url)}`
  } catch {
    return null
  }
}

export function translateTextUrl(text: string): string {
  return `https://translate.google.com/?sl=auto&tl=${encodeURIComponent(target())}&op=translate&text=${encodeURIComponent(text.slice(0, 4000))}`
}
