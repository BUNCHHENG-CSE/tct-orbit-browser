import React, { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import { api } from '@/lib/ipc'
import { isMac } from '@/lib/platform'

const btn = 'w-11 h-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors'

/** Minimize / maximize / close for frameless windows (macOS uses its own traffic lights) */
export const WindowControls: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    let mounted = true
    const check = () => {
      api.window
        .isMaximized()
        .then((max) => mounted && setIsMaximized(max))
        .catch(() => {})
    }
    check()
    window.addEventListener('resize', check)
    return () => {
      mounted = false
      window.removeEventListener('resize', check)
    }
  }, [])

  if (isMac) return null

  return (
    <div className="flex items-stretch h-full shrink-0 app-no-drag">
      <button onClick={() => api.window.minimize()} className={`${btn} hover:bg-muted`} title="Minimize">
        <Minus className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={async () => {
          await api.window.maximize()
          setIsMaximized(await api.window.isMaximized())
        }}
        className={`${btn} hover:bg-muted`}
        title={isMaximized ? 'Restore' : 'Maximize'}
      >
        {isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
      </button>
      <button onClick={() => api.window.close()} className={`${btn} hover:bg-destructive hover:text-destructive-foreground`} title="Close">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
