import React, { useState } from 'react'
import { CloudRain, Wind, Coffee, Volume2, VolumeX, Minimize2, Sparkles, Sliders } from 'lucide-react'
import { useBrowserStore } from '@/store/useBrowserStore'
import type { SoundscapeType } from '@/lib/soundscapes'

export const ZenControls: React.FC = () => {
  const zenMode = useBrowserStore((s) => s.zenMode)
  const setZenMode = useBrowserStore((s) => s.setZenMode)
  const zenSoundscape = useBrowserStore((s) => s.zenSoundscape)
  const setZenSoundscape = useBrowserStore((s) => s.setZenSoundscape)

  const [expanded, setExpanded] = useState(false)

  if (!zenMode) return null

  const soundscapes: { type: SoundscapeType; label: string; icon: React.ReactNode }[] = [
    { type: 'none', label: 'Mute', icon: <VolumeX className="w-3.5 h-3.5" /> },
    { type: 'rain', label: 'Rain', icon: <CloudRain className="w-3.5 h-3.5 text-blue-400" /> },
    { type: 'white-noise', label: 'White Noise', icon: <Wind className="w-3.5 h-3.5 text-slate-300" /> },
    { type: 'cafe', label: 'Cafe Hum', icon: <Coffee className="w-3.5 h-3.5 text-amber-500" /> }
  ]

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] transition-all duration-300 select-none"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div
        className={`flex items-center gap-2 p-1.5 rounded-full border border-border/80 bg-background/85 backdrop-blur-xl shadow-2xl transition-all duration-300 ${
          expanded ? 'px-3 py-2 scale-100 opacity-100' : 'opacity-40 hover:opacity-100 scale-95'
        }`}
      >
        <button
          onClick={() => setZenMode(false)}
          title="Exit Zen Mode (F11 or Ctrl+Shift+F)"
          className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Minimize2 className="w-3.5 h-3.5" />
          {expanded && <span>Exit Zen</span>}
        </button>

        {expanded && (
          <>
            <div className="w-[1px] h-4 bg-border/60" />
            <div className="flex items-center gap-1">
              {soundscapes.map((sc) => {
                const isActive = zenSoundscape === sc.type
                return (
                  <button
                    key={sc.type}
                    onClick={() => setZenSoundscape(sc.type)}
                    title={`Ambient Soundscape: ${sc.label}`}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/70'
                    }`}
                  >
                    {sc.icon}
                    <span>{sc.label}</span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {!expanded && (
          <div className="flex items-center gap-1.5 px-1.5 py-0.5 text-xs text-muted-foreground">
            {zenSoundscape !== 'none' ? (
              <span className="flex items-center gap-1 text-primary">
                <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                <span className="capitalize text-[11px] font-medium">{zenSoundscape}</span>
              </span>
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
