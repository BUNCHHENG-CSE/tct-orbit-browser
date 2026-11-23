import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Trash2, ShieldOff, ZoomIn, RotateCcw, Globe } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/ipc'
import { PERMISSION_META } from '@/components/Permissions/PermissionPrompt'
import type { SitePermission, SiteSettingsList } from '@/types/api'

const ZOOM_KEY = 'tct_orbit_domain_zoom'
const PERMS: SitePermission[] = ['camera', 'microphone', 'geolocation', 'notifications', 'clipboard-read', 'midi']
const SHORT_LABEL: Record<SitePermission, string> = {
  camera: 'Camera',
  microphone: 'Microphone',
  geolocation: 'Location',
  notifications: 'Notifications',
  'clipboard-read': 'Clipboard',
  midi: 'MIDI'
}

function readZoomMap(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(ZOOM_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).hostname
  } catch {
    return origin
  }
}

interface SiteRow {
  origin: string
  host: string
  permissions: Partial<Record<SitePermission, 'allow' | 'block'>>
  shieldOff: boolean
  zoom?: number
  blocked?: number
}

/** Settings → Site Settings: everything the browser remembers per site, in one place */
export const SiteSettingsPanel: React.FC = () => {
  const [data, setData] = useState<SiteSettingsList | null>(null)
  const [zoomMap, setZoomMap] = useState<Record<string, number>>({})
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    try {
      setData(await api.siteSettings.list())
    } catch {
      setData({ permissions: {}, shieldDisabled: [], blocked: [] })
    }
    setZoomMap(readZoomMap())
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const rows = useMemo<SiteRow[]>(() => {
    if (!data) return []
    const byOrigin = new Map<string, SiteRow>()
    const get = (origin: string): SiteRow => {
      let r = byOrigin.get(origin)
      if (!r) {
        r = { origin, host: hostOf(origin), permissions: {}, shieldOff: false }
        byOrigin.set(origin, r)
      }
      return r
    }
    for (const [origin, perms] of Object.entries(data.permissions)) get(origin).permissions = perms
    for (const origin of data.shieldDisabled) get(origin).shieldOff = true
    // Zoom is stored per hostname; attach it to an https origin for display
    for (const [host, zoom] of Object.entries(zoomMap)) {
      const existing = Array.from(byOrigin.values()).find((r) => r.host === host)
      ;(existing || get(`https://${host}`)).zoom = zoom
    }
    for (const b of data.blocked) {
      const existing = byOrigin.get(b.origin)
      if (existing) existing.blocked = b.total
    }
    const q = query.trim().toLowerCase()
    return Array.from(byOrigin.values())
      .filter((r) => !q || r.host.toLowerCase().includes(q))
      .sort((a, b) => a.host.localeCompare(b.host))
  }, [data, zoomMap, query])

  const setPermission = async (origin: string, perm: SitePermission, decision: 'allow' | 'block' | null) => {
    await api.siteSettings.setPermission(origin, perm, decision)
    void load()
  }

  const resetSite = async (row: SiteRow) => {
    await api.siteSettings.resetPermissions(row.origin)
    if (row.shieldOff) await api.privacy.toggleSiteShield(row.origin)
    if (row.zoom !== undefined) {
      const map = readZoomMap()
      delete map[row.host]
      try {
        localStorage.setItem(ZOOM_KEY, JSON.stringify(map))
      } catch {}
    }
    toast.success(`Reset settings for ${row.host}`)
    void load()
  }

  const clearData = async (row: SiteRow) => {
    try {
      await api.site.clearData(row.origin)
      toast.success(`Cookies and site data cleared for ${row.host}`)
    } catch {
      toast.error('Could not clear site data')
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-foreground">Site settings</h4>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Permissions, shield exceptions and zoom you've set for individual sites. New permission requests show a prompt
          under the address bar.
        </p>
      </div>

      <div className="flex items-center gap-2 px-3 h-8 rounded-lg bg-muted border border-border">
        <Search className="w-3.5 h-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sites..."
          className="flex-1 bg-transparent outline-none text-xs text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {rows.length === 0 ? (
        <div className="py-10 text-center">
          <Globe className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-xs text-muted-foreground">
            {query ? `No site matches "${query}".` : 'No site-specific settings yet.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const permEntries = PERMS.filter((p) => row.permissions[p])
            return (
              <li key={row.origin} className="p-3 rounded-xl border border-border bg-muted/20">
                <div className="flex items-center gap-2">
                  <img
                    src={`${row.origin}/favicon.ico`}
                    alt=""
                    className="w-4 h-4 rounded-sm"
                    onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')}
                  />
                  <p className="flex-1 min-w-0 text-[13px] font-semibold text-foreground truncate">{row.host}</p>
                  <button
                    onClick={() => void clearData(row)}
                    className="h-7 px-2 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1"
                    title="Delete this site's cookies and storage"
                  >
                    <Trash2 className="w-3 h-3" /> Clear data
                  </button>
                  <button
                    onClick={() => void resetSite(row)}
                    className="h-7 px-2 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1"
                    title="Forget all settings for this site"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {row.shieldOff && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[11px]">
                      <ShieldOff className="w-3 h-3" /> Shield off
                    </span>
                  )}
                  {row.zoom !== undefined && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted border border-border text-[11px] text-foreground">
                      <ZoomIn className="w-3 h-3" /> {row.zoom}%
                    </span>
                  )}
                  {row.blocked !== undefined && row.blocked > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-muted border border-border text-[11px] text-muted-foreground">
                      {row.blocked.toLocaleString()} blocked
                    </span>
                  )}
                </div>

                {permEntries.length > 0 && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {permEntries.map((p) => {
                      const Icon = PERMISSION_META[p].icon
                      const value = row.permissions[p] || 'ask'
                      return (
                        <label key={p} className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-background border border-border text-[11.5px]">
                          <span className="flex items-center gap-1.5 text-foreground">
                            <Icon className="w-3.5 h-3.5 text-muted-foreground" /> {SHORT_LABEL[p]}
                          </span>
                          <select
                            value={value}
                            onChange={(e) => {
                              const v = e.target.value
                              void setPermission(row.origin, p, v === 'ask' ? null : (v as 'allow' | 'block'))
                            }}
                            className={`bg-transparent text-[11px] font-medium outline-none cursor-pointer ${
                              value === 'allow' ? 'text-emerald-600 dark:text-emerald-400' : value === 'block' ? 'text-destructive' : 'text-muted-foreground'
                            }`}
                          >
                            <option value="allow">Allow</option>
                            <option value="block">Block</option>
                            <option value="ask">Ask</option>
                          </select>
                        </label>
                      )
                    })}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
