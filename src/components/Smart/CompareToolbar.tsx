import React, { useEffect, useRef, useState } from 'react'
import { ArrowDownUp, GitCompare, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { runInTab } from '@/lib/webviewRegistry'
import { COMPARE_TEXT_SCRIPT } from '@/lib/pageScripts'
import { diffLines, diffStats, toLines, type DiffOp } from '@/lib/textDiff'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useSmartStore } from '@/store/useSmartStore'
import { DiffView } from './DiffView'

interface CompareResult {
  ops: DiffOp[]
  leftTitle: string
  rightTitle: string
  stats: ReturnType<typeof diffStats>
}

/** Shown this long when the split opens; afterwards only while the pointer is at the bottom */
const INTRO_MS = 30_000
const LEAVE_MS = 1_200

/**
 * Floating toolbar on the split divider: keep both panes scrolled together, and compare the
 * text of the two pages (two product pages, two versions of a doc, terms before/after…).
 */
export const CompareToolbar: React.FC<{ hidden?: boolean }> = ({ hidden = false }) => {
  const syncScroll = useSmartStore((s) => s.syncScroll)
  const setSyncScroll = useSmartStore((s) => s.setSyncScroll)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CompareResult | null>(null)
  const [visible, setVisible] = useState(true)
  const timer = useRef<number | undefined>(undefined)
  const hideIn = (ms: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setVisible(false), ms)
  }
  const show = () => {
    window.clearTimeout(timer.current)
    setVisible(true)
  }
  useEffect(() => {
    hideIn(INTRO_MS)
    return () => window.clearTimeout(timer.current)
  }, [])
  const shown = visible || busy

  const compare = async () => {
    const { activeTabId, splitTabId } = useBrowserStore.getState()
    if (!activeTabId || !splitTabId) return
    setBusy(true)
    try {
      type PageText = { title: string; text: string } | null
      const [left, right] = await Promise.all([
        runInTab<PageText>(activeTabId, COMPARE_TEXT_SCRIPT),
        runInTab<PageText>(splitTabId, COMPARE_TEXT_SCRIPT)
      ])
      if (!left || !right) {
        toast.error('Could not read one of the pages', { description: 'Both sides need to be web pages that have finished loading.' })
        return
      }
      // Let the spinner paint before the (synchronous) diff runs
      await new Promise((r) => setTimeout(r, 16))
      const ops = diffLines(toLines(left.text), toLines(right.text))
      setResult({
        ops,
        leftTitle: left.title || 'Left page',
        rightTitle: right.title || 'Right page',
        stats: diffStats(ops)
      })
    } finally {
      setBusy(false)
    }
  }

  const btn =
    'h-7 px-2.5 rounded-full flex items-center gap-1.5 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap'

  return (
    <>
      {/* Hidden: a slim strip with a handle, so the pages underneath stay clickable */}
      <div
        className={`absolute bottom-0 z-30 -translate-x-1/2 flex flex-col items-center justify-end select-none ${hidden ? 'invisible' : ''} ${shown ? 'pb-4 pt-2 px-3' : 'w-80 h-3'}`}
        style={{ left: 'calc(var(--split-ratio, 0.5) * 100%)' }}
        onMouseEnter={show}
        onMouseLeave={() => hideIn(LEAVE_MS)}
        onFocus={show}
        onBlur={() => hideIn(LEAVE_MS)}
      >
        {!shown && (
          <button
            onClick={show}
            aria-label="Show split view tools"
            className={`w-12 h-1.5 mb-0.5 rounded-full shadow ${syncScroll ? 'bg-primary' : 'bg-muted-foreground/60'}`}
          />
        )}
        {shown && (
      <div className="flex items-center gap-0.5 p-0.5 rounded-full bg-popover/95 backdrop-blur border border-border shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
        <button
          onClick={() => {
            setSyncScroll(!syncScroll)
            toast(syncScroll ? 'Scroll sync off' : 'Scroll sync on', {
              description: syncScroll ? undefined : 'Scrolling one side now scrolls the other to the same spot.'
            })
          }}
          className={`${btn} ${syncScroll ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
          title="Scroll both panes together"
          aria-pressed={syncScroll}
        >
          <ArrowDownUp className="w-3.5 h-3.5" />
          Sync scroll
        </button>
        <button
          onClick={() => void compare()}
          disabled={busy}
          className={`${btn} text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-60`}
          title="Show what is different between the two pages"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitCompare className="w-3.5 h-3.5" />}
          Compare text
        </button>
      </div>
        )}
      </div>

      <Dialog open={!!result} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col rounded-2xl">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-primary" /> Compare pages
            </DialogTitle>
            {result && (
              <DialogDescription className="text-xs">
                {Math.round(result.stats.similarity * 100)}% the same · {result.stats.left} line{result.stats.left === 1 ? '' : 's'} only on the left ·{' '}
                {result.stats.right} only on the right
              </DialogDescription>
            )}
          </DialogHeader>
          {result && <DiffView ops={result.ops} leftLabel={`left: ${result.leftTitle}`} rightLabel={`right: ${result.rightTitle}`} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
