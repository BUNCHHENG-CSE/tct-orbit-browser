import React, { useState, useEffect } from 'react'
import {
  X,
  BookOpen,
  Volume2,
  VolumeX,
  Type,
  Minus,
  Plus,
  Clock,
  Sparkles,
  Printer
} from 'lucide-react'
import { useBrowserStore } from '@/store/useBrowserStore'

export const ReaderModeOverlay: React.FC = () => {
  const readerMode = useBrowserStore((s) => s.readerMode)
  const closeReaderMode = useBrowserStore((s) => s.closeReaderMode)
  const updateReaderSettings = useBrowserStore((s) => s.updateReaderSettings)

  const [isSpeaking, setIsSpeaking] = useState(false)

  // Handle ESC key to exit Reader Mode
  useEffect(() => {
    if (!readerMode.isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [readerMode.isOpen])

  // Stop speaking when closed
  const handleClose = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setIsSpeaking(false)
    closeReaderMode()
  }

  // Text-To-Speech (Read Aloud)
  const toggleSpeech = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

    if (isSpeaking) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
      return
    }

    // Extract text from content
    const div = document.createElement('div')
    div.innerHTML = readerMode.contentHtml
    const plainText = `${readerMode.title}. ${div.innerText}`

    const utterance = new SpeechSynthesisUtterance(plainText)
    utterance.rate = 1.0
    utterance.pitch = 1.0

    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)

    window.speechSynthesis.speak(utterance)
    setIsSpeaking(true)
  }

  if (!readerMode.isOpen) return null

  // Theme styling definitions
  const themeStyles = {
    paper: 'bg-[#faf9f6] text-[#22252a] selection:bg-amber-200/60',
    sepia: 'bg-[#fbf0d9] text-[#5c4b37] selection:bg-amber-300/60',
    dark: 'bg-[#181a1b] text-[#e8e6e3] selection:bg-indigo-900/60',
    black: 'bg-[#000000] text-[#dedede] selection:bg-neutral-800'
  }

  const fontStyles = {
    sans: 'font-sans',
    serif: 'font-serif',
    mono: 'font-mono'
  }

  return (
    <div className={`absolute inset-0 z-50 flex flex-col overflow-hidden transition-colors ${themeStyles[readerMode.colorTheme]}`}>
      {/* Top Floating Reader Toolbar */}
      <div className="reader-toolbar h-12 shrink-0 border-b border-black/10 dark:border-white/10 px-4 flex items-center justify-between backdrop-blur-md bg-inherit/90">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 opacity-70" />
          <span className="text-xs font-semibold uppercase tracking-wider opacity-80">
            Reader Mode
          </span>
          {readerMode.readingTime && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 opacity-75 flex items-center gap-1 font-mono">
              <Clock className="w-3 h-3" />
              {readerMode.readingTime}
            </span>
          )}
        </div>

        {/* Reader Customization Controls */}
        <div className="flex items-center gap-2">
          {/* Read Aloud Button */}
          {'speechSynthesis' in window && (
            <button
              onClick={toggleSpeech}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                isSpeaking
                  ? 'bg-primary text-primary-foreground shadow-xs animate-pulse'
                  : 'bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15'
              }`}
              title={isSpeaking ? 'Stop Reading Aloud' : 'Read Aloud'}
            >
              {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span>{isSpeaking ? 'Stop' : 'Listen'}</span>
            </button>
          )}

          {/* Typography Choice */}
          <div className="flex items-center bg-black/5 dark:bg-white/10 rounded-lg p-0.5">
            <button
              onClick={() => updateReaderSettings({ fontTheme: 'serif' })}
              className={`px-2 py-0.5 rounded-md text-xs font-serif ${
                readerMode.fontTheme === 'serif' ? 'bg-black/15 dark:bg-white/20 font-bold' : 'opacity-70'
              }`}
              title="Serif font"
            >
              Serif
            </button>
            <button
              onClick={() => updateReaderSettings({ fontTheme: 'sans' })}
              className={`px-2 py-0.5 rounded-md text-xs font-sans ${
                readerMode.fontTheme === 'sans' ? 'bg-black/15 dark:bg-white/20 font-bold' : 'opacity-70'
              }`}
              title="Sans-serif font"
            >
              Sans
            </button>
            <button
              onClick={() => updateReaderSettings({ fontTheme: 'mono' })}
              className={`px-2 py-0.5 rounded-md text-xs font-mono ${
                readerMode.fontTheme === 'mono' ? 'bg-black/15 dark:bg-white/20 font-bold' : 'opacity-70'
              }`}
              title="Monospace font"
            >
              Mono
            </button>
          </div>

          {/* Font Size Buttons */}
          <div className="flex items-center bg-black/5 dark:bg-white/10 rounded-lg p-0.5">
            <button
              onClick={() =>
                updateReaderSettings({ fontSize: Math.max(14, readerMode.fontSize - 2) })
              }
              className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/15 text-xs"
              title="Decrease font size"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-[11px] font-mono px-1.5 opacity-80 select-none">
              {readerMode.fontSize}px
            </span>
            <button
              onClick={() =>
                updateReaderSettings({ fontSize: Math.min(28, readerMode.fontSize + 2) })
              }
              className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/15 text-xs"
              title="Increase font size"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Color Palette Switcher */}
          <div className="flex items-center gap-1 pl-1">
            <button
              onClick={() => updateReaderSettings({ colorTheme: 'paper' })}
              className={`w-5 h-5 rounded-full bg-[#faf9f6] border ${
                readerMode.colorTheme === 'paper' ? 'ring-2 ring-primary border-primary' : 'border-neutral-300'
              }`}
              title="Paper White"
            />
            <button
              onClick={() => updateReaderSettings({ colorTheme: 'sepia' })}
              className={`w-5 h-5 rounded-full bg-[#fbf0d9] border ${
                readerMode.colorTheme === 'sepia' ? 'ring-2 ring-primary border-primary' : 'border-neutral-300'
              }`}
              title="Warm Sepia"
            />
            <button
              onClick={() => updateReaderSettings({ colorTheme: 'dark' })}
              className={`w-5 h-5 rounded-full bg-[#181a1b] border ${
                readerMode.colorTheme === 'dark' ? 'ring-2 ring-primary border-primary' : 'border-neutral-600'
              }`}
              title="Slate Dark"
            />
            <button
              onClick={() => updateReaderSettings({ colorTheme: 'black' })}
              className={`w-5 h-5 rounded-full bg-[#000000] border ${
                readerMode.colorTheme === 'black' ? 'ring-2 ring-primary border-primary' : 'border-neutral-700'
              }`}
              title="OLED Black"
            />
          </div>

          {/* Print Clean Article */}
          <button
            onClick={() => window.print()}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/15 transition-colors ml-1"
            title="Print Clean Article (Ctrl+P)"
          >
            <Printer className="w-3.5 h-3.5" />
          </button>

          {/* Close Button */}
          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/15 transition-colors ml-0.5"
            title="Exit Reader Mode (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <style>{`
        @media print {
          .reader-toolbar {
            display: none !important;
          }
          .reader-article-container {
            overflow: visible !important;
            height: auto !important;
            padding: 0 !important;
          }
          body, html {
            background: #ffffff !important;
            color: #000000 !important;
          }
        }
      `}</style>

      {/* Reader Main Content Area */}
      <div className="reader-article-container flex-1 overflow-y-auto px-6 py-10 selection:bg-primary/20">
        <article
          className={`max-w-2xl mx-auto leading-relaxed ${fontStyles[readerMode.fontTheme]}`}
          style={{ fontSize: `${readerMode.fontSize}px` }}
        >
          {/* Article Header */}
          <header className="mb-8 pb-6 border-b border-black/10 dark:border-white/10">
            <h1 className="text-3xl font-extrabold tracking-tight leading-tight mb-3">
              {readerMode.title}
            </h1>
            {readerMode.byline && (
              <div className="text-xs uppercase tracking-wider opacity-70 font-mono">
                {readerMode.byline}
              </div>
            )}
          </header>

          {/* Article Cleaned Body */}
          <div
            className="prose dark:prose-invert max-w-none space-y-5 [&>p]:leading-relaxed [&>h2]:text-xl [&>h2]:font-bold [&>h2]:mt-6 [&>h3]:text-lg [&>h3]:font-bold [&>img]:rounded-xl [&>img]:my-4 [&>blockquote]:border-l-4 [&>blockquote]:border-primary/50 [&>blockquote]:pl-4 [&>blockquote]:italic [&>pre]:bg-black/10 [&>pre]:p-4 [&>pre]:rounded-xl"
            dangerouslySetInnerHTML={{ __html: readerMode.contentHtml }}
          />
        </article>
      </div>
    </div>
  )
}
