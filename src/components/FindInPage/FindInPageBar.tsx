import React, { useState, useEffect, useRef } from 'react'
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react'
import { useBrowserStore } from '@/store/useBrowserStore'

interface FindInPageProps {
  onFind: (text: string, options: { forward?: boolean; findNext?: boolean; matchCase?: boolean }) => void
  onStop: (action: 'clearSelection' | 'keepSelection' | 'activateSelection') => void
  matchesCount?: { activeMatchOrdinal: number; matches: number }
}

export const FindInPageBar: React.FC<FindInPageProps> = ({
  onFind,
  onStop,
  matchesCount
}) => {
  const isOpen = useBrowserStore((s) => s.findBarOpen)
  const setOpen = useBrowserStore((s) => s.setFindBarOpen)

  const [query, setQuery] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.select()
        }
      }, 30)
    } else {
      onStop('clearSelection')
    }
  }, [isOpen, onStop])

  // Ctrl+F while open, F3 / Shift+F3
  const nextRef = useRef<() => void>(() => {})
  const prevRef = useRef<() => void>(() => {})
  useEffect(() => {
    const focus = () => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    const next = () => (useBrowserStore.getState().findBarOpen ? nextRef.current() : useBrowserStore.getState().setFindBarOpen(true))
    const prev = () => (useBrowserStore.getState().findBarOpen ? prevRef.current() : useBrowserStore.getState().setFindBarOpen(true))
    window.addEventListener('tct:focus-find', focus)
    window.addEventListener('tct:find-next', next)
    window.addEventListener('tct:find-prev', prev)
    return () => {
      window.removeEventListener('tct:focus-find', focus)
      window.removeEventListener('tct:find-next', next)
      window.removeEventListener('tct:find-prev', prev)
    }
  }, [])

  // Trigger search when query or matchCase changes
  useEffect(() => {
    if (!isOpen) return

    if (!query) {
      onStop('clearSelection')
      return
    }

    onFind(query, { forward: true, findNext: false, matchCase })
  }, [query, matchCase, isOpen, onFind, onStop])

  // Find next match
  const handleFindNext = () => {
    if (!query) return
    onFind(query, { forward: true, findNext: true, matchCase })
  }

  // Find previous match
  const handleFindPrev = () => {
    if (!query) return
    onFind(query, { forward: false, findNext: false, matchCase })
  }

  nextRef.current = handleFindNext
  prevRef.current = handleFindPrev

  // Close find bar
  const handleClose = () => {
    setOpen(false)
    onStop('clearSelection')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        handleFindPrev()
      } else {
        handleFindNext()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleClose()
    }
  }

  if (!isOpen) return null

  const activeOrdinal = matchesCount?.activeMatchOrdinal || 0
  const totalMatches = matchesCount?.matches || 0

  return (
    <div className="absolute top-3 right-5 z-40 flex items-center gap-1.5 p-1.5 rounded-2xl bg-background/95 border border-border shadow-2xl backdrop-blur-md text-foreground animate-in fade-in slide-in-from-top-2 duration-150">
      {/* Search Icon */}
      <Search className="w-3.5 h-3.5 text-muted-foreground ml-2 shrink-0 pointer-events-none" />

      {/* Input Field */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in page..."
        className="w-40 sm:w-52 h-7 px-2 text-xs bg-transparent outline-none text-foreground placeholder:text-muted-foreground/60 font-medium"
      />

      {/* Match Count Badge */}
      {query && (
        <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground shrink-0 select-none">
          {totalMatches > 0 ? `${activeOrdinal}/${totalMatches}` : '0/0'}
        </span>
      )}

      {/* Case Sensitive Toggle */}
      <button
        onClick={() => setMatchCase(!matchCase)}
        className={`h-7 px-1.5 rounded-lg text-[11px] font-mono font-bold transition-colors cursor-pointer ${
          matchCase
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
        }`}
        title={matchCase ? 'Match Case (Enabled)' : 'Match Case (Disabled)'}
      >
        Aa
      </button>

      {/* Previous Match Button */}
      <button
        onClick={handleFindPrev}
        disabled={!query || totalMatches === 0}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
        title="Previous match (Shift+Enter)"
      >
        <ChevronUp className="w-4 h-4" />
      </button>

      {/* Next Match Button */}
      <button
        onClick={handleFindNext}
        disabled={!query || totalMatches === 0}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
        title="Next match (Enter)"
      >
        <ChevronDown className="w-4 h-4" />
      </button>

      {/* Close Button */}
      <button
        onClick={handleClose}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer ml-0.5"
        title="Close (Esc)"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
