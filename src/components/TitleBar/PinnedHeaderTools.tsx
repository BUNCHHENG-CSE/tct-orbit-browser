import React from 'react'
import { HEADER_FEATURES, useHeaderPins } from '@/lib/headerPins'

/** Tools-menu features the user pinned to the title bar */
export const PinnedHeaderTools: React.FC = () => {
  const pinned = useHeaderPins((s) => s.pinned)
  const toggle = useHeaderPins((s) => s.toggle)
  if (pinned.length === 0) return null
  return (
    <>
      {pinned.map((id) => {
        const f = HEADER_FEATURES[id]
        const Icon = f.icon
        return (
          <button
            key={id}
            onClick={f.run}
            onContextMenu={(e) => {
              e.preventDefault()
              toggle(id)
            }}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            title={`${f.label} (right-click to unpin)`}
          >
            <Icon className={`w-3.5 h-3.5 ${'iconCls' in f ? f.iconCls : ''}`} />
          </button>
        )
      })}
    </>
  )
}
