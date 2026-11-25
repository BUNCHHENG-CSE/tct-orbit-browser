import React, { useMemo, useState } from 'react'
import type { DiffOp } from '@/lib/textDiff'

/**
 * Shows a line diff: lines only on the left (rose), only on the right (emerald), and shared
 * lines collapsed into "N matching lines" unless expanded.
 */
export const DiffView: React.FC<{ ops: DiffOp[]; leftLabel: string; rightLabel: string }> = ({ ops, leftLabel, rightLabel }) => {
  const [showSame, setShowSame] = useState(false)

  // Group consecutive shared lines so long identical stretches collapse
  const blocks = useMemo(() => {
    const out: Array<{ type: DiffOp['type']; lines: string[] }> = []
    for (const op of ops) {
      const last = out[out.length - 1]
      if (last && last.type === op.type) last.lines.push(op.text)
      else out.push({ type: op.type, lines: [op.text] })
    }
    return out
  }, [ops])

  const hasDiff = blocks.some((b) => b.type !== 'same')

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center justify-between gap-3 px-1 pb-2 text-[11px] text-muted-foreground shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-sm bg-rose-500/70 shrink-0" />
            <span className="truncate">Only in {leftLabel}</span>
          </span>
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-sm bg-emerald-500/70 shrink-0" />
            <span className="truncate">Only in {rightLabel}</span>
          </span>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
          <input type="checkbox" checked={showSame} onChange={(e) => setShowSame(e.target.checked)} className="accent-primary" />
          Show matching lines
        </label>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2 font-mono text-[11.5px] leading-relaxed select-text">
        {!hasDiff && <p className="p-4 text-center text-muted-foreground font-sans text-xs">No differences found.</p>}
        {blocks.map((b, i) => {
          if (b.type === 'same') {
            if (showSame) {
              return b.lines.map((l, j) => (
                <div key={`${i}-${j}`} className="px-2 text-muted-foreground whitespace-pre-wrap break-words">
                  {l}
                </div>
              ))
            }
            return (
              <div key={i} className="px-2 py-0.5 my-0.5 text-[10.5px] text-muted-foreground/70 font-sans italic">
                {b.lines.length} matching line{b.lines.length === 1 ? '' : 's'}
              </div>
            )
          }
          const cls =
            b.type === 'left'
              ? 'bg-rose-500/10 border-l-2 border-rose-500/60 text-foreground'
              : 'bg-emerald-500/10 border-l-2 border-emerald-500/60 text-foreground'
          return b.lines.map((l, j) => (
            <div key={`${i}-${j}`} className={`px-2 whitespace-pre-wrap break-words ${cls}`}>
              <span className="select-none text-muted-foreground mr-2">{b.type === 'left' ? '−' : '+'}</span>
              {l}
            </div>
          ))
        })}
      </div>
    </div>
  )
}
