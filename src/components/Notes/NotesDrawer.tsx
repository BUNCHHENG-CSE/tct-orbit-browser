import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  FileText,
  X,
  Link,
  Bold,
  Italic,
  List,
  CheckSquare,
  Code,
  Heading2,
  Check,
  Layers,
  Copy,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/ipc'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useSpaces } from '@/hooks/useSpaces'
import { modKey } from '@/lib/platform'

export const NotesDrawer: React.FC = () => {
  const isOpen = useBrowserStore((s) => s.notesDrawerOpen)
  const setIsOpen = useBrowserStore((s) => s.setNotesDrawerOpen)
  const activeSpaceId = useBrowserStore((s) => s.activeSpaceId)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const tabsBySpace = useBrowserStore((s) => s.tabsBySpace)

  const { activeSpace } = useSpaces()
  const [content, setContent] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const currentSpaceRef = useRef(activeSpaceId)

  // Load notes when opened or when space changes
  useEffect(() => {
    currentSpaceRef.current = activeSpaceId
    if (!activeSpaceId || !api.notes?.get) return

    api.notes.get(activeSpaceId).then((loaded) => {
      if (currentSpaceRef.current === activeSpaceId) {
        setContent(loaded || '')
        setSaveStatus('idle')
      }
    }).catch(() => {})
  }, [activeSpaceId, isOpen])

  // "Send to Space Notes" from the page context menu: append a quote + source link and save now.
  // Done here (not via IPC directly) so a pending debounced save can't overwrite the clip.
  const contentRef = useRef(content)
  contentRef.current = content
  useEffect(() => {
    const onClip = async (e: Event) => {
      const { text, url, title } = (e as CustomEvent).detail || {}
      const spaceId = currentSpaceRef.current
      if (!text || !spaceId || !api.notes?.save) return
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
      const quote = String(text).trim().split(/\r?\n/).map((l: string) => `> ${l}`).join('\n')
      const source = url ? `\n— [${String(title || url).replace(/[[\]]/g, '')}](${url})` : ''
      const prev = contentRef.current
      const sep = !prev ? '' : prev.endsWith('\n\n') ? '' : prev.endsWith('\n') ? '\n' : '\n\n'
      const next = `${prev}${sep}${quote}${source}\n`
      setContent(next)
      try {
        await api.notes.save(spaceId, next)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 1500)
      } catch {
        setSaveStatus('idle')
        toast.error('Could not save to notes')
      }
    }
    window.addEventListener('tct:clip-to-notes', onClip)
    return () => window.removeEventListener('tct:clip-to-notes', onClip)
  }, [])

  // Save content debounced
  const handleContentChange = (newVal: string) => {
    setContent(newVal)
    setSaveStatus('saving')

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (!activeSpaceId || !api.notes?.save) return
      try {
        await api.notes.save(activeSpaceId, newVal)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 1500)
      } catch (err) {
        console.error('[Notes] Save failed:', err)
      }
    }, 400)
  }

  // Insert markdown helpers
  const insertFormatting = (prefix: string, suffix = '') => {
    const el = textareaRef.current
    if (!el) return

    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = content.slice(start, end)
    const replacement = `${prefix}${selected || 'text'}${suffix}`

    const nextContent = content.slice(0, start) + replacement + content.slice(end)
    handleContentChange(nextContent)

    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + prefix.length, start + replacement.length - suffix.length)
    }, 10)
  }

  // Insert current active tab URL and title
  const handleInsertTabLink = () => {
    if (!activeSpaceId || !activeTabId) {
      toast.info('No active tab to insert link from')
      return
    }

    const currentTabs = tabsBySpace[activeSpaceId] || []
    const activeTab = currentTabs.find((t) => t.id === activeTabId)
    if (!activeTab || !activeTab.url || activeTab.url === 'about:blank') {
      toast.info('No valid tab URL to insert')
      return
    }

    const linkMarkdown = `\n- [${activeTab.title || 'Page'}](${activeTab.url})\n`
    const el = textareaRef.current
    if (el) {
      const start = el.selectionStart
      const nextContent = content.slice(0, start) + linkMarkdown + content.slice(start)
      handleContentChange(nextContent)
    } else {
      handleContentChange(content + linkMarkdown)
    }

    toast.success('Inserted tab link into notes')
  }

  // Copy full notes
  const handleCopyNotes = () => {
    if (!content) return
    navigator.clipboard.writeText(content)
    toast.success('Notes copied to clipboard')
  }

  // Clear notes for space
  const handleClearNotes = () => {
    if (!content) return
    if (window.confirm(`Clear notes for ${activeSpace?.name || 'this space'}?`)) {
      handleContentChange('')
      toast.info('Notes cleared')
    }
  }

  // Keyboard shortcut listener for Ctrl+Shift+N
  useEffect(() => {
    const handleToggle = () => {
      setIsOpen(!useBrowserStore.getState().notesDrawerOpen)
    }
    window.addEventListener('tct:toggle-notes', handleToggle)
    return () => window.removeEventListener('tct:toggle-notes', handleToggle)
  }, [setIsOpen])

  if (!isOpen) return null

  // Word and character count
  const charCount = content.length
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0

  return (
    <aside
      className="absolute top-0 right-0 bottom-0 w-84 sm:w-96 bg-background/95 backdrop-blur-md border-l border-border shadow-2xl z-40 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 select-text"
      aria-label="Orbit Notes"
    >
      {/* Drawer Header */}
      <div className="h-12 px-4 border-b border-border flex items-center justify-between shrink-0 select-none bg-muted/20">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-2xs text-white"
            style={{ backgroundColor: activeSpace?.color || '#6366f1' }}
          >
            <FileText className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-foreground truncate">
                {activeSpace?.name || 'Space'} Notes
              </span>
              {saveStatus === 'saving' && (
                <span className="text-[10px] text-muted-foreground animate-pulse font-mono">
                  saving...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-[10px] text-emerald-500 flex items-center gap-0.5 font-mono">
                  <Check className="w-2.5 h-2.5" /> saved
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleCopyNotes}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Copy notes"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleClearNotes}
            className="p-1.5 rounded-lg hover:bg-destructive/15 hover:text-destructive text-muted-foreground transition-colors cursor-pointer"
            title="Clear notes"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer ml-1"
            title="Close notes (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Formatting Toolbar */}
      <div className="px-3 py-1.5 border-b border-border bg-muted/10 flex items-center justify-between shrink-0 select-none gap-1">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => insertFormatting('**', '**')}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs font-bold"
            title="Bold (**text**)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => insertFormatting('*', '*')}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs italic"
            title="Italic (*text*)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => insertFormatting('## ')}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs font-bold"
            title="Heading (## Title)"
          >
            <Heading2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => insertFormatting('- ')}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Bullet List (- item)"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => insertFormatting('- [ ] ')}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Task Checkbox (- [ ] task)"
          >
            <CheckSquare className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => insertFormatting('`', '`')}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors font-mono"
            title="Code (`code`)"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Insert Current Tab Link */}
        <button
          onClick={handleInsertTabLink}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground text-[11px] font-medium transition-colors cursor-pointer"
          title="Insert link from active tab"
        >
          <Link className="w-3 h-3 text-primary" />
          <span>Insert Tab</span>
        </button>
      </div>

      {/* Textarea Content */}
      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder={`Jot down ideas, to-do items, code snippets, or links for ${activeSpace?.name || 'this space'}...\n\n- [ ] Task 1\n- [ ] Task 2`}
          spellCheck={false}
          className="w-full h-full flex-1 bg-transparent border-none outline-none resize-none text-foreground text-xs leading-relaxed font-sans placeholder:text-muted-foreground/60 select-text p-1"
        />
      </div>

      {/* Footer Metrics */}
      <div className="h-8 px-4 border-t border-border bg-muted/20 flex items-center justify-between text-[10.5px] text-muted-foreground shrink-0 select-none font-mono">
        <div className="flex items-center gap-2">
          <span>{wordCount} words</span>
          <span>•</span>
          <span>{charCount} chars</span>
        </div>
        <div>
          <span>{modKey}+Shift+N</span>
        </div>
      </div>
    </aside>
  )
}
