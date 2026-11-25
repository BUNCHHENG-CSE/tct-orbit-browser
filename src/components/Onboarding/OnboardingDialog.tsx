import React, { useEffect, useState } from 'react'
import { Layers, EyeOff, Shield, Command, Download, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { modKey } from '@/lib/platform'
import browserLogo from '@/assets/logo.png'
import { openLegal } from '@/components/Legal/LegalDialog'

const STORAGE_KEY = 'tct_onboarding_done_v1'

interface Step {
  icon: React.ElementType
  title: string
  body: React.ReactNode
}

const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="px-1.5 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-muted text-foreground border border-border">{children}</kbd>
)

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: 'Welcome to TCT Orbit',
    body: 'A fast, private browser built around Spaces. This short tour shows the essentials. It takes about 30 seconds.'
  },
  {
    icon: Layers,
    title: 'Spaces keep work and life apart',
    body: (
      <>
        Each Space has its own tabs, notes and color. Switch with the icons at the top of the sidebar, and save a
        Space's tabs as a <b>template</b> from the Tools menu to reopen the same set later.
      </>
    )
  },
  {
    icon: Command,
    title: 'Everything is a shortcut away',
    body: (
      <>
        <Key>{modKey}</Key> <Key>K</Key> opens the command bar, <Key>{modKey}</Key> <Key>Shift</Key> <Key>A</Key> searches every
        open tab, and <Key>{modKey}</Key> <Key>/</Key> shows all shortcuts.
      </>
    )
  },
  {
    icon: EyeOff,
    title: 'Private tabs',
    body: (
      <>
        <Key>Alt</Key> <Key>Shift</Key> <Key>N</Key> opens a private tab: no history, separate cookies, and everything is wiped when
        the last private tab closes.
      </>
    )
  },
  {
    icon: Shield,
    title: 'Protection is on by default',
    body: 'Ads and trackers are blocked, connections are upgraded to HTTPS, and sites must ask before using your camera, microphone or location. The shield icon in the address bar controls each site.'
  },
  {
    icon: Download,
    title: 'Bring your bookmarks',
    body: 'Import bookmarks and history from Chrome, Edge, Brave, Firefox and more in Settings → Data & Backup.'
  }
]

export const OnboardingDialog: React.FC = () => {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    let done = false
    try {
      done = localStorage.getItem(STORAGE_KEY) === '1'
    } catch {}
    if (!done) {
      // Let the window paint first
      const t = setTimeout(() => setOpen(true), 800)
      return () => clearTimeout(t)
    }
    return undefined
  }, [])

  useEffect(() => {
    const reopen = () => {
      setStep(0)
      setOpen(true)
    }
    window.addEventListener('tct:open-onboarding', reopen)
    return () => window.removeEventListener('tct:open-onboarding', reopen)
  }, [])

  const finish = (openImport = false) => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {}
    setOpen(false)
    if (openImport) {
      window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'backup' } }))
    }
  }

  const s = STEPS[step]
  const Icon = s.icon
  const isLast = step === STEPS.length - 1

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : finish())}>
      <DialogContent
        className="w-[92vw] max-w-md p-0 overflow-hidden bg-card border border-border rounded-2xl"
        onKeyDown={(e) => {
          // Nothing is focused yet: Enter and the arrow keys go through the tour
          if (e.target !== e.currentTarget) return
          if (e.key === 'ArrowLeft' && step > 0) setStep(step - 1)
          else if (e.key === 'Enter' || e.key === 'ArrowRight') {
            if (!isLast) setStep(step + 1)
            else if (e.key === 'Enter') finish()
          }
        }}
      >
        <div className="px-6 pt-7 pb-5 text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            {step === 0 ? <img src={browserLogo} alt="" className="w-10 h-10 object-contain" /> : <Icon className="w-7 h-7" />}
          </div>
          <DialogTitle className="text-lg font-bold text-foreground">{s.title}</DialogTitle>
          <DialogDescription asChild>
            <div className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{s.body}</div>
          </DialogDescription>
        </div>
        {step === 0 && (
          <p className="px-6 -mt-1 pb-3 text-center text-[11px] text-muted-foreground">
            By using TCT Orbit you agree to the{' '}
            <button onClick={() => openLegal('terms')} className="underline underline-offset-2 hover:text-foreground">
              Terms of Use
            </button>{' '}
            and{' '}
            <button onClick={() => openLegal('privacy')} className="underline underline-offset-2 hover:text-foreground">
              Privacy Policy
            </button>
            .
          </p>
        )}
        <div className="flex items-center justify-center gap-1.5 pb-4">
          {STEPS.map((_, i) => (
            <button
              key={i}
              aria-label={`Step ${i + 1}`}
              onClick={() => setStep(i)}
              className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/30'}`}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <button onClick={() => finish()} className="text-xs text-muted-foreground hover:text-foreground">
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="h-8 px-3 rounded-lg text-xs border border-border hover:bg-muted flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </button>
            )}
            {isLast ? (
              <>
                <button onClick={() => finish(true)} className="h-8 px-3 rounded-lg text-xs border border-border hover:bg-muted">
                  Import now
                </button>
                <button
                  onClick={() => finish()}
                  className="h-8 px-4 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Start browsing
                </button>
              </>
            ) : (
              <button
                onClick={() => setStep(step + 1)}
                className="h-8 px-4 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
