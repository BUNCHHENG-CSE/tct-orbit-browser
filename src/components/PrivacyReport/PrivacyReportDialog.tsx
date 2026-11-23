import React, { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, RotateCcw } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { api } from '@/lib/ipc'
import type { PrivacyReport } from '@/types/api'

const RANGES = [7, 30] as const

function fmt(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : n.toLocaleString()
}

function dayLabel(date: string, short: boolean): string {
  const d = new Date(`${date}T12:00:00`)
  return short ? d.toLocaleDateString(undefined, { weekday: 'short' }) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

/** Trackers and ads blocked over time, from the shield's persistent counters */
export const PrivacyReportDialog: React.FC = () => {
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState<(typeof RANGES)[number]>(7)
  const [report, setReport] = useState<PrivacyReport | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  const load = useCallback(async (d: number) => {
    try {
      setReport(await api.privacy.getReport(d))
    } catch {
      setReport(null)
    }
  }, [])

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('tct:open-privacy-report', onOpen)
    return () => window.removeEventListener('tct:open-privacy-report', onOpen)
  }, [])

  useEffect(() => {
    if (open) void load(days)
  }, [open, days, load])

  const series = report?.days || []
  const max = Math.max(1, ...series.map((d) => d.ads + d.trackers))
  const total = (report?.totals.ads || 0) + (report?.totals.trackers || 0)
  const hovered = hover !== null ? series[hover] : null

  const handleReset = async () => {
    await api.privacy.resetReport()
    void load(days)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[92vw] max-w-xl max-h-[85vh] p-0 overflow-hidden flex flex-col bg-card border border-border rounded-2xl">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-4 h-4 text-primary" /> Privacy report
          </DialogTitle>
          <DialogDescription className="text-xs">
            What TCT Orbit blocked for you. Counted on this device only, never sent anywhere.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5" data-lenis-prevent>
          {/* Range filter */}
          <div className="flex items-center gap-1.5">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setDays(r)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  days === r ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                Last {r} days
              </button>
            ))}
          </div>

          {/* Headline numbers */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Trackers blocked', value: report?.totals.trackers || 0 },
              { label: 'Ads blocked', value: report?.totals.ads || 0 },
              { label: 'Upgraded to HTTPS', value: report?.totals.https || 0 }
            ].map((t) => (
              <div key={t.label} className="p-3 rounded-xl bg-muted/40 border border-border">
                <p className="text-[22px] font-bold text-foreground leading-tight tabular-nums">{fmt(t.value)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{t.label}</p>
              </div>
            ))}
          </div>

          {/* Blocked per day (ads + trackers): single series, so no legend */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-xs font-semibold text-foreground">Blocked per day</p>
              <p className="text-[11px] text-muted-foreground tabular-nums h-4">
                {hovered
                  ? `${dayLabel(hovered.date, false)}: ${fmt(hovered.ads + hovered.trackers)} blocked (${fmt(hovered.trackers)} trackers, ${fmt(hovered.ads)} ads)`
                  : `${fmt(total)} total`}
              </p>
            </div>
            <div
              className="relative h-36 flex items-end gap-[2px] border-b border-border"
              role="img"
              aria-label={`Bar chart of items blocked per day over the last ${days} days`}
              onMouseLeave={() => setHover(null)}
            >
              {series.map((d, i) => {
                const v = d.ads + d.trackers
                const h = v === 0 ? 0 : Math.max(3, Math.round((v / max) * 100))
                return (
                  // Hit target is the full column, larger than the bar itself
                  <div
                    key={d.date}
                    className="flex-1 h-full flex items-end cursor-default"
                    onMouseEnter={() => setHover(i)}
                    title={`${dayLabel(d.date, false)}: ${v} blocked`}
                  >
                    <div
                      className={`w-full rounded-t-[4px] transition-opacity ${hover === null || hover === i ? 'opacity-100' : 'opacity-40'}`}
                      style={{ height: `${h}%`, background: 'hsl(var(--primary))' }}
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex gap-[2px] mt-1">
              {series.map((d, i) => (
                <span key={d.date} className="flex-1 text-center text-[10px] text-muted-foreground truncate">
                  {days === 7 ? dayLabel(d.date, true) : i % 5 === 0 ? dayLabel(d.date, false) : ''}
                </span>
              ))}
            </div>
          </div>

          {/* Top sites table */}
          <div>
            <p className="text-xs font-semibold text-foreground mb-2">Sites with the most blocked items</p>
            {report && report.topSites.length > 0 ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[11px] text-muted-foreground border-b border-border">
                    <th className="text-left font-medium py-1.5">Site</th>
                    <th className="text-right font-medium py-1.5">Trackers</th>
                    <th className="text-right font-medium py-1.5">Ads</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topSites.map((s) => (
                    <tr key={s.origin} className="border-b border-border/50">
                      <td className="py-1.5 text-foreground truncate max-w-[260px]">{hostOf(s.origin)}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{fmt(s.trackers)}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{fmt(s.ads)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[11px] text-muted-foreground">Nothing blocked yet. Browse a few sites and check back.</p>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] text-muted-foreground">
              Counting since {report ? new Date(report.since).toLocaleDateString() : '…'}
            </p>
            <button onClick={handleReset} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> Reset report
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
