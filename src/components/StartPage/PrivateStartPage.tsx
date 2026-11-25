import React, { useEffect, useRef, useState } from 'react'
import { EyeOff, Search, ArrowRight, Check, Eye, ShieldCheck, X } from 'lucide-react'
import { useBrowserStore } from '@/store/useBrowserStore'
import { SEARCH_ENGINES, type SearchEngineId } from '@/lib/searchEngines'
import { navigateFromStartPage } from '@/lib/startPage'
import { api } from '@/lib/ipc'
import type { Tab } from '@/types/api'

interface PrivateStartPageProps {
  tab: Tab
  isActive: boolean
  paneStyle?: React.CSSProperties
  onFocusPane?: () => void
}

const VIOLET = '#8b5cf6'

const NOT_SAVED = ['Browsing history', 'Cookies and site data', 'Logins and form entries', 'Cache and permissions you grant']
const STILL_VISIBLE = ['The websites you visit', 'Your employer or school network', 'Your internet provider']

/**
 * Start page of private tabs. Deliberately shows nothing from normal browsing (no history,
 * shortcuts, notes or downloads): just search and what private mode does and doesn't do.
 */
export const PrivateStartPage: React.FC<PrivateStartPageProps> = ({ tab, isActive, paneStyle, onFocusPane }) => {
  const settings = useBrowserStore((s) => s.settings)
  const privateCount = useBrowserStore((s) => Object.values(s.tabsBySpace).flat().filter((t) => t.isPrivate).length)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const engine = (settings?.defaultSearchEngine as SearchEngineId) || 'duckduckgo'
  const engineName = SEARCH_ENGINES[engine]?.name || 'the web'

  useEffect(() => {
    if (!isActive) return
    const t = setTimeout(() => inputRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [isActive])

  /** Close every private tab: the private session is wiped when the last one closes */
  const closeAllPrivate = async () => {
    const store = useBrowserStore.getState()
    const privateTabs = Object.values(store.tabsBySpace).flat().filter((t) => t.isPrivate)
    for (const t of privateTabs) {
      store.removeTabFromStore(t.id)
      await api.tabs.remove(t.id).catch(() => {})
    }
  }

  return (
    <div
      className="overflow-y-auto overflow-x-hidden flex flex-col bg-[#0c0a14] text-zinc-100"
      style={{
        display: 'flex',
        visibility: isActive ? 'visible' : 'hidden',
        opacity: isActive ? 1 : 0,
        pointerEvents: isActive ? 'auto' : 'none',
        zIndex: isActive ? 10 : 0,
        position: 'absolute',
        inset: paneStyle ? undefined : 0,
        ...paneStyle
      }}
      onMouseDown={() => {
        onFocusPane?.()
        window.dispatchEvent(new CustomEvent('tct:close-omnibox'))
      }}
      data-lenis-prevent
    >
      {/* Violet ambient glow: private mode always looks different from normal tabs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute -top-48 left-1/2 -translate-x-1/2 w-[900px] h-[560px] rounded-full blur-3xl opacity-30"
          style={{ background: `radial-gradient(closest-side, ${VIOLET}, transparent)` }}
        />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />
      </div>

      <div className="relative w-full max-w-[720px] mx-auto px-6 pt-[11vh] pb-14 select-none">
        <header className="flex flex-col items-center text-center mb-9">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 shadow-lg"
            style={{ background: `linear-gradient(135deg, ${VIOLET}, #6d28d9)`, boxShadow: `0 10px 40px ${VIOLET}55` }}
          >
            <EyeOff className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-semibold tracking-tight">You're browsing privately</h1>
          <p className="mt-3 text-sm text-zinc-400 max-w-md">
            Nothing from this tab is saved. When you close your last private tab, its cookies, site data and cache are erased.
          </p>
        </header>

        {/* Search */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void navigateFromStartPage(tab.id, query)
          }}
          className="relative mb-10"
        >
          <div className="flex items-center h-14 rounded-[21px] bg-white/[0.06] border border-violet-500/30 focus-within:border-violet-400/70 backdrop-blur-xl shadow-lg transition-colors">
            <Search className="ml-5 w-[18px] h-[18px] text-zinc-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search privately with ${engineName} or type a URL`}
              className="flex-1 min-w-0 h-full px-3 bg-transparent text-[15px] text-zinc-100 placeholder:text-zinc-500 outline-none select-text"
            />
            {query && (
              <button
                type="submit"
                className="mr-2 h-10 px-4 rounded-2xl text-xs font-semibold text-white flex items-center gap-1.5"
                style={{ backgroundColor: VIOLET }}
              >
                Go <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </form>

        {/* What private mode does and doesn't do */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <h2 className="text-[11px] uppercase tracking-wider font-semibold text-violet-300 mb-3">Not saved after you close</h2>
            <ul className="space-y-2">
              {NOT_SAVED.map((item) => (
                <li key={item} className="flex items-center gap-2 text-xs text-zinc-300">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <h2 className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400 mb-3">Can still see your activity</h2>
            <ul className="space-y-2">
              {STILL_VISIBLE.map((item) => (
                <li key={item} className="flex items-center gap-2 text-xs text-zinc-300">
                  <Eye className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'privacy' } }))}
              className="mt-3 text-[11px] text-violet-300 hover:text-violet-200 flex items-center gap-1"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Hide your IP with Tor or a proxy
            </button>
          </section>
        </div>

        <div className="mt-8 flex items-center justify-center gap-3 text-xs text-zinc-500">
          <span>
            {privateCount} private tab{privateCount === 1 ? '' : 's'} open
          </span>
          <span>·</span>
          <button onClick={() => void closeAllPrivate()} className="flex items-center gap-1 text-zinc-400 hover:text-rose-300 transition-colors">
            <X className="w-3.5 h-3.5" /> Close all private tabs
          </button>
        </div>
      </div>
    </div>
  )
}
