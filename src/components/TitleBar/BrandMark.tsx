import React from 'react'
import browserLogo from '@/assets/logo-sm.png'
import { useBrowserStore } from '@/store/useBrowserStore'

const CHANNEL_CLS: Record<string, string> = {
  nova: 'bg-purple-500/15 text-purple-400 border border-purple-500/25',
  deep: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/25',
  canary: 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
}

/** TCT Orbit logo + name (+ channel badge on non-stable builds), used in both tab layouts */
export const BrandMark: React.FC<{ className?: string; nameClassName?: string }> = ({
  className = '',
  nameClassName = 'hidden xl:inline'
}) => {
  const channel = useBrowserStore((s) => s.appInfo?.channel)
  return (
    <div className={`flex items-center gap-1.5 font-semibold text-foreground shrink-0 ${className}`}>
      <img src={browserLogo} alt="TCT Orbit" className="w-4 h-4 rounded-md object-contain shadow-xs" draggable={false} />
      <span className={`tracking-wide text-[13px] font-semibold ${nameClassName}`}>TCT Orbit</span>
      {channel && channel !== 'stable' && (
        <span
          className={`h-3.5 px-1.5 rounded-full text-[8px] font-semibold uppercase tracking-wider inline-flex items-center justify-center leading-none shrink-0 ${
            CHANNEL_CLS[channel] ?? CHANNEL_CLS.canary
          }`}
        >
          {channel}
        </span>
      )}
    </div>
  )
}
