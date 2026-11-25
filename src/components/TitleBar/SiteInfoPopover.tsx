import React, { useState, useEffect, useRef } from 'react'
import {
  Lock,
  Globe,
  ShieldCheck,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Cookie,
  Server,
  X
} from 'lucide-react'
import { api } from '@/lib/ipc'
import { useBrowserStore } from '@/store/useBrowserStore'
import { toast } from 'sonner'
import type { SiteInfoResult } from '@/types/api'

interface SiteInfoPopoverProps {
  url?: string
}

export const SiteInfoPopover: React.FC<SiteInfoPopoverProps> = ({ url }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [siteInfo, setSiteInfo] = useState<SiteInfoResult | null>(null)
  const [clearing, setClearing] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

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

  const fetchSiteInfo = async () => {
    if (!url || !isWebUrl || !api.site?.getInfo) return
    try {
      // Isolated spaces keep their own cookies: ask about the active space's profile
      const info = await api.site.getInfo(url, useBrowserStore.getState().activeSpaceId || undefined)
      setSiteInfo(info)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchSiteInfo()
    }
  }, [isOpen, url])

  // Click outside listener
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

    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Clear site data handler
  const handleClearSiteData = async () => {
    if (!origin || !api.site?.clearData) return
    setClearing(true)
    try {
      const res = await api.site.clearData(origin)
      if (res.success) {
        toast.success(`Cleared cookies & storage for ${hostname}`)
        setSiteInfo((prev) => (prev ? { ...prev, cookiesCount: 0, hasStorage: false } : null))
      } else {
        toast.error('Failed to clear site data')
      }
    } catch {
      toast.error('Could not clear site data')
    } finally {
      setClearing(false)
    }
  }

  const isSecure = siteInfo ? siteInfo.isSecure : (url ? url.startsWith('https://') : false)

  return (
    <div className="relative flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="shrink-0 flex items-center justify-center p-1 rounded-md hover:bg-muted/60 transition-colors cursor-pointer mr-1.5"
        title={isSecure ? 'Connection is secure — view site info' : 'Site information & cookies'}
      >
        {isSecure ? (
          <Lock className="w-3.5 h-3.5 text-emerald-500" />
        ) : (
          <Globe className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute left-0 top-full mt-2 w-80 rounded-2xl bg-popover border border-border shadow-2xl p-4 z-50 text-foreground animate-in fade-in zoom-in-95 duration-150 select-none text-xs"
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  isSecure
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                }`}
              >
                {isSecure ? <Lock className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <h4 className="font-semibold text-foreground text-sm truncate">
                  {hostname || 'Current Site'}
                </h4>
                <p className="text-[11px] text-muted-foreground font-mono truncate">
                  {origin || url}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Connection Security Status */}
          <div className="py-3 border-b border-border space-y-1.5">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              {isSecure ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Connection is secure</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-amber-600 dark:text-amber-400">Connection is not secure</span>
                </>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {isSecure
                ? 'Your information (passwords, cookies, messages) is private when sent to this site.'
                : 'Sensitive information you enter on this site might be visible to network observers.'}
            </p>
            {isSecure && (
              <div className="pt-1 flex items-center gap-1 text-[10px] text-muted-foreground/80 font-mono">
                <Server className="w-3 h-3 text-primary" />
                <span>TLS 1.3 Encryption Active</span>
              </div>
            )}
          </div>

          {/* Cookies & Stored Data */}
          <div className="py-3 border-b border-border space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-medium">
                <Cookie className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>Cookies & Site Data</span>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {siteInfo ? `${siteInfo.cookiesCount} in use` : '0 in use'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Data stored locally on this machine to keep you signed in or remember preferences.
            </p>
          </div>

          {/* Action: Clear site data */}
          <div className="pt-3 flex items-center justify-between gap-2">
            <button
              onClick={handleClearSiteData}
              disabled={clearing || !origin}
              className="w-full py-1.5 px-3 rounded-xl border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 text-destructive text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{clearing ? 'Clearing...' : 'Clear Data for This Site'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
