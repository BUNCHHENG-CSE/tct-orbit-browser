import React from 'react'
import { EyeOff } from 'lucide-react'

/** Private window header (replaces the space switcher): what this window is and that nothing is kept */
export const PrivateWindowBadge: React.FC<{ collapsed?: boolean; className?: string }> = ({ collapsed = false, className = '' }) =>
  collapsed ? (
    <div
      className={`w-9 h-9 my-1 rounded-xl flex items-center justify-center bg-violet-500/15 text-violet-400 border border-violet-500/30 ${className}`}
      title="Private window: nothing is saved after you close it"
    >
      <EyeOff className="w-4 h-4" />
    </div>
  ) : (
    <div className={`mx-1.5 my-1 px-3 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/25 ${className}`}>
      <div className="flex items-center gap-2 text-[13px] font-semibold text-violet-300">
        <EyeOff className="w-4 h-4" /> Private browsing
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        History, cookies and site data from this window are deleted when you close it.
      </p>
    </div>
  )

/** Compact "Private" pill for the toolbar (like Edge's InPrivate badge) */
export const PrivatePill: React.FC = () => (
  <span
    className="flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-full bg-violet-500/20 border border-violet-500/40 text-violet-200 text-[11.5px] font-semibold shrink-0"
    title="Private window: nothing is saved after you close it"
  >
    <EyeOff className="w-3.5 h-3.5" /> Private
  </span>
)
