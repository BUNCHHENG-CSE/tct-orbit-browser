import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, RefreshCw, Send, ShieldCheck, Square, X } from 'lucide-react'
import { api } from '@/lib/ipc'
import { currentLanguage, useT } from '@/lib/i18n'
import { LANGUAGES } from '@/lib/locales'
import { COMPARE_TEXT_SCRIPT } from '@/lib/pageScripts'
import { runInTab } from '@/lib/webviewRegistry'
import { useSettings } from '@/hooks/useSettings'
import { TRANSLATE_LANGUAGES } from '@/lib/translatePage'
import type { AiStatus } from '@/types/essentials'
import { activeTab, openInNewTab } from './EssentialsRuntime'

interface Message {
  role: 'user' | 'assistant'
  content: string
  error?: boolean
}

const newId = () => `ask-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/** Side panel: questions about the current page, answered by a model on this computer (Ollama) */
export const AskPagePanel: React.FC = () => {
  const t = useT()
  const { settings, updateSettings } = useSettings()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const pendingRef = useRef<string | null>(null)
  pendingRef.current = pending
  /** Page the conversation is about: a new page starts a new conversation */
  const pageRef = useRef('')
  const endRef = useRef<HTMLDivElement>(null)

  const check = useCallback(() => {
    setStatus(null)
    api.essentials.ai
      .status()
      .then(setStatus)
      .catch(() => setStatus({ available: false, models: [] }))
  }, [])

  useEffect(() => {
    const toggle = () => setOpen((o) => !o)
    window.addEventListener('tct:ask-page', toggle)
    return () => window.removeEventListener('tct:ask-page', toggle)
  }, [])

  useEffect(() => {
    if (open) check()
  }, [open, check])

  useEffect(() => {
    return api.essentials.ai.onChunk((chunk) => {
      if (chunk.id !== pendingRef.current) return
      setMessages((list) => {
        const last = list[list.length - 1]
        if (!last || last.role !== 'assistant') return list
        const content = chunk.error ? chunk.error : last.content + chunk.text
        return [...list.slice(0, -1), { ...last, content, error: !!chunk.error }]
      })
      if (chunk.done) setPending(null)
    })
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const models = status?.models ?? []
  const model = settings?.aiModel && models.includes(settings.aiModel) ? settings.aiModel : models[0] ?? ''

  const ask = async (question: string) => {
    const tab = activeTab()
    const q = question.trim()
    if (!q || !model || pending || !tab) return
    const page = await runInTab<{ title: string; text: string } | null>(tab.id, COMPARE_TEXT_SCRIPT)
    const text = typeof page?.text === 'string' ? page.text.trim() : ''
    const history = pageRef.current === tab.url ? messages.filter((m) => !m.error && m.content) : []
    pageRef.current = tab.url
    if (!text) {
      setMessages([...history, { role: 'user', content: q }, { role: 'assistant', content: 'This page has no text to read.', error: true }])
      return
    }
    const id = newId()
    setInput('')
    setMessages([...history, { role: 'user', content: q }, { role: 'assistant', content: '' }])
    setPending(id)
    pendingRef.current = id
    const ok = await api.essentials.ai
      .ask({
        id,
        model,
        question: q,
        pageTitle: tab.title.slice(0, 1000),
        pageUrl: tab.url.slice(0, 8192),
        pageText: text.slice(0, 100_000),
        history: history.slice(-8).map(({ role, content }) => ({ role, content: content.slice(0, 20_000) }))
      })
      .catch(() => false)
    if (!ok) {
      setPending(null)
      setMessages((l) => [...l.slice(0, -1), { role: 'assistant', content: 'The question could not be sent.', error: true }])
    }
  }

  const stop = () => {
    if (pending) void api.essentials.ai.cancel(pending)
    setPending(null)
  }

  if (!open) return null

  const langName = (id: string) => TRANSLATE_LANGUAGES.find((l) => l.id === id)?.name ?? LANGUAGES.find((l) => l.id === id)?.name ?? id
  const target = langName(settings?.translateTo || currentLanguage())
  const quick = [
    { label: t('Summarize'), q: `Summarize this page in a short paragraph. Answer in ${langName(currentLanguage())}.` },
    { label: t('Key points'), q: `List the key points of this page. Answer in ${langName(currentLanguage())}.` },
    { label: t('Explain simply'), q: `Explain this page in simple words. Answer in ${langName(currentLanguage())}.` },
    { label: `→ ${target}`, q: `Translate the main text of this page into ${target}.` }
  ]

  return (
    <aside
      aria-label={t('Ask this page')}
      className="absolute top-0 right-0 bottom-0 w-[min(400px,100%)] bg-background/95 backdrop-blur-md border-l border-border shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200 select-text"
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <header className="h-12 px-4 border-b border-border flex items-center gap-2 shrink-0 bg-muted/20 select-none">
        <Bot className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold flex-1">{t('Ask this page')}</span>
        {models.length > 1 && (
          <select
            aria-label="Model"
            value={model}
            onChange={(e) => void updateSettings({ aiModel: e.target.value })}
            className="h-7 max-w-[150px] px-1.5 rounded-lg bg-background border border-border text-[11px]"
          >
            {models.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        )}
        <button aria-label={t('Close')} onClick={() => setOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
          <X className="w-4 h-4" />
        </button>
      </header>

      {status && (!status.available || models.length === 0) ? (
        <div className="p-5 space-y-3 text-xs leading-relaxed">
          <p className="font-semibold">{status.available ? 'No model is installed yet.' : 'Ollama is not running on this computer.'}</p>
          <p className="text-muted-foreground">
            Answers come from a free AI model on your own computer, so the pages you read are never sent to the internet. Install Ollama, then run this once in a terminal:
          </p>
          <code className="block p-2.5 rounded-lg bg-muted font-mono text-[11.5px]">ollama pull llama3.2</code>
          <div className="flex gap-2">
            <button onClick={() => void openInNewTab('https://ollama.com/download', 'Ollama')} className="h-8 px-3 rounded-lg font-semibold bg-primary text-primary-foreground">
              Get Ollama
            </button>
            <button onClick={check} className="h-8 px-3 rounded-lg border border-border hover:bg-muted inline-flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> {t('Retry')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-3" data-lenis-prevent aria-live="polite">
            {messages.length === 0 && (
              <p className="flex items-start gap-2 text-[11.5px] text-muted-foreground">
                <ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-emerald-500 shrink-0" /> Answered on this computer. Small models make mistakes: check important facts on the page.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-xl px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words ${
                  m.role === 'user' ? 'bg-primary/10 ml-8' : m.error ? 'bg-destructive/10 text-destructive' : 'bg-muted/50 mr-4'
                }`}
              >
                {m.content || <span className="text-muted-foreground animate-pulse">…</span>}
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="p-3 border-t border-border space-y-2 shrink-0">
            <div className="flex flex-wrap gap-1.5">
              {quick.map((a) => (
                <button key={a.label} disabled={!!pending || !model} onClick={() => void ask(a.q)} className="h-7 px-2.5 rounded-full text-[11.5px] border border-border hover:bg-muted disabled:opacity-40">
                  {a.label}
                </button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void ask(input)
              }}
            >
              <input
                autoFocus
                value={input}
                maxLength={4000}
                aria-label={t('Ask this page')}
                placeholder={`${t('Ask this page')}…`}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-background border border-border focus:border-primary/60 text-xs outline-none"
              />
              {pending ? (
                <button type="button" aria-label="Stop" onClick={stop} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted">
                  <Square className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button type="submit" aria-label="Send" disabled={!input.trim() || !model} className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40">
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </form>
          </div>
        </>
      )}
    </aside>
  )
}
