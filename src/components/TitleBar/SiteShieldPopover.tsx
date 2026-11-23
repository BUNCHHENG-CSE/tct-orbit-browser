import React, { useState, useEffect, useRef } from 'react'
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  Lock,
  ExternalLink,
  Settings,
  Check,
  AlertTriangle,
  RotateCcw
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { usePrivacyShield } from '@/hooks/usePrivacyShield'
import type { SiteShieldStatus } from '@/types/api'

interface SiteShieldPopoverProps {
  url?: string
}

export const SiteShieldPopover: React.FC<SiteShieldPopoverProps> = ({ url }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [siteStatus, setSiteStatus] = useState<SiteShieldStatus | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const {
    prefs,
    masterStatus,
    getSiteStatus,
    toggleSiteShield
  } = usePrivacyShield()

  const isWebUrl = url && (url.startsWith('http://') || url.startsWith('https://'))

  let origin = ''
  let hostname = ''
  try {
    if (url) {
      const u = new URL(url)
      origin = u.origin
      hostname = u.hostname
    }
  } catch {}

  // Fetch live site status whenever URL or popover opens
  useEffect(() => {
    if (!url || !isWebUrl) return
    let mounted = true

    getSiteStatus(url).then((status) => {
      if (mounted && status) {
        setSiteStatus(status)
      }
    })

    return () => {
      mounted = false
    }
  }, [url, isWebUrl, isOpen, getSiteStatus])

  // Click outside listener to dismiss popover
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!isWebUrl || !origin) return null

  const isWhitelisted = prefs.whitelistedOrigins.includes(origin)
  const isShieldActive = !isWhitelisted && prefs.adBlockerEnabled
  const isHttps = url.startsWith('https://')

  const handleToggle = async () => {
    await toggleSiteShield(origin)
    const updated = await getSiteStatus(url)
    if (updated) setSiteStatus(updated)
  }

  const handleOpenSettings = () => {
    setIsOpen(false)
    window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'privacy' } }))
  }

  return (
    <div className="relative inline-flex items-center">
      {/* Omnibox Shield Trigger Icon */}
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        className={`p-1 rounded-full transition-all flex items-center justify-center cursor-pointer ${
          isShieldActive
            ? 'text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
        }`}
        title={
          isShieldActive
            ? `TCT Orbit Shield: Active for ${hostname}`
            : `TCT Orbit Shield: Disabled for ${hostname}`
        }
      >
        {isShieldActive ? (
          <ShieldCheck className="w-3.5 h-3.5" />
        ) : (
          <ShieldOff className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>

      {/* Floating Popover Panel */}
      {isOpen && (
        <div
          ref={popoverRef}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-border bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-xl p-3.5 z-50 animate-in fade-in-50 zoom-in-95 duration-100 select-none text-xs"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-border">
            <div className="flex items-center gap-2 min-w-0 pr-1">
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                  isShieldActive ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted text-muted-foreground'
                }`}
              >
                {isShieldActive ? (
                  <ShieldCheck className="w-4 h-4" />
                ) : (
                  <ShieldOff className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-foreground truncate">{hostname}</p>
                <div className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                  {isHttps ? (
                    <>
                      <Lock className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">Secure HTTPS</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                      <span className="text-amber-500 font-medium">Not Secure (HTTP)</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <span
              className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-full shrink-0 uppercase tracking-wider ${
                isShieldActive
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {isShieldActive ? 'Protected' : 'Paused'}
            </span>
          </div>

          {/* Toggle Switch */}
          <div className="py-2.5 flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">Shield on this site</p>
              <p className="text-[10.5px] text-muted-foreground">
                {isShieldActive ? 'Ads & trackers are blocked' : 'Protections temporarily paused'}
              </p>
            </div>
            <Switch checked={isShieldActive} onCheckedChange={handleToggle} />
          </div>

          {/* Blocked Stats on Current Page */}
          {isShieldActive && (
            <div className="grid grid-cols-2 gap-2 my-1 py-2 px-2.5 rounded-xl bg-muted/40 border border-border text-center">
              <div>
                <span className="block text-sm font-bold text-foreground font-mono">
                  {siteStatus?.adsBlocked ?? 0}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase font-medium">Ads Blocked</span>
              </div>
              <div>
                <span className="block text-sm font-bold text-foreground font-mono">
                  {siteStatus?.trackersBlocked ?? 0}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase font-medium">Trackers Stopped</span>
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="pt-2 mt-1 border-t border-border flex items-center justify-between text-[11px]">
            <button
              onClick={() => {
                setIsOpen(false)
                window.dispatchEvent(new CustomEvent('tct:open-privacy-report'))
              }}
              className="text-muted-foreground hover:text-foreground font-medium cursor-pointer"
            >
              Privacy report
            </button>
            <button
              onClick={handleOpenSettings}
              className="flex items-center gap-1 text-primary hover:text-primary/80 font-medium cursor-pointer"
            >
              <Settings className="w-3 h-3" />
              <span>Shield Settings</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
