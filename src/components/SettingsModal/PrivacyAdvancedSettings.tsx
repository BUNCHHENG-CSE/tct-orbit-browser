import React, { useEffect, useState } from 'react'
import { Globe2, Loader2, ShieldAlert, ShieldCheck, Sparkles, EyeOff } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import type { PrivacyShieldPrefs, ProxyMode, ProxyTestResult } from '@/types/api'

const PROXY_URL_RE = /^(socks5|socks4|http|https):\/\/[a-z0-9.\-_[\]:]+:\d{1,5}$/i

interface Props {
  prefs: PrivacyShieldPrefs
  togglePref: (key: keyof PrivacyShieldPrefs) => void
  setProxy: (mode: ProxyMode, url?: string) => void
  applyMaxPrivacy: () => void
  testProxy: () => Promise<ProxyTestResult>
}

const PROXY_OPTIONS: Array<{ mode: ProxyMode; label: string }> = [
  { mode: 'off', label: 'Off' },
  { mode: 'system', label: 'System' },
  { mode: 'tor', label: 'Tor' },
  { mode: 'custom', label: 'Custom' }
]

const ToggleRow: React.FC<{
  title: string
  description: string
  checked: boolean
  onChange: () => void
  badge?: string
}> = ({ title, description, checked, onChange, badge }) => (
  <div className="flex items-center justify-between">
    <div className="pr-2">
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        {badge && (
          <Badge variant="subtle" className="text-[9px] px-1 py-0 font-medium">
            {badge}
          </Badge>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{description}</p>
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
)

export const PrivacyAdvancedSettings: React.FC<Props> = ({ prefs, togglePref, setProxy, applyMaxPrivacy, testProxy }) => {
  const [customUrl, setCustomUrl] = useState(prefs.proxyUrl)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ProxyTestResult | null>(null)

  useEffect(() => {
    setCustomUrl(prefs.proxyUrl)
  }, [prefs.proxyUrl])

  useEffect(() => {
    setTestResult(null)
  }, [prefs.proxyMode, prefs.proxyUrl])

  const customValid = PROXY_URL_RE.test(customUrl.trim())

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await testProxy())
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      {/* One-click preset */}
      <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" /> Maximum Privacy
          </p>
          <p className="text-[11px] text-muted-foreground">
            Turns on every protection below, including clear-on-exit. Some sites may need the per-site shield toggle.
          </p>
        </div>
        <Button size="sm" onClick={applyMaxPrivacy} className="text-xs h-8 shrink-0 cursor-pointer">
          Apply
        </Button>
      </div>

      {/* Proxy / Tor */}
      <div className="space-y-2">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold text-foreground">Anonymous Routing (Proxy / Tor)</p>
            <Badge variant="subtle" className="text-[9px] px-1 py-0 font-medium">Hides your IP</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Sends all tab traffic through a proxy. "Tor" needs the Tor service running on 127.0.0.1:9050
            (Tor Browser uses port 9150; pick Custom). WebRTC is locked to the proxy automatically.
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {PROXY_OPTIONS.map((opt) => (
            <button
              key={opt.mode}
              onClick={() => setProxy(opt.mode)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                prefs.proxyMode === opt.mode
                  ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {prefs.proxyMode === 'custom' && (
          <div className="flex items-center gap-1.5">
            <Input
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="socks5://127.0.0.1:9150"
              spellCheck={false}
              className={`h-8 text-xs font-mono ${customUrl && !customValid ? 'border-destructive' : ''}`}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!customValid || customUrl.trim() === prefs.proxyUrl}
              onClick={() => setProxy('custom', customUrl.trim())}
              className="text-xs h-8 shrink-0 cursor-pointer"
            >
              Save
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={runTest}
            disabled={testing}
            className="text-xs h-7 cursor-pointer flex items-center gap-1.5"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe2 className="w-3.5 h-3.5" />}
            Check my IP
          </Button>
          {testResult && (
            <span className="text-[11px] flex items-center gap-1">
              {testResult.ok ? (
                testResult.isTor ? (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-500 font-medium">Connected through Tor</span>
                    <span className="text-muted-foreground font-mono">({testResult.ip})</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-muted-foreground">
                      Visible IP: <span className="font-mono">{testResult.ip}</span> (not Tor)
                    </span>
                  </>
                )
              ) : (
                <>
                  <ShieldAlert className="w-3.5 h-3.5 text-destructive" />
                  <span className="text-destructive">{testResult.error}</span>
                </>
              )}
            </span>
          )}
        </div>
      </div>

      <ToggleRow
        title="Block Cookie Banners & Annoyances"
        description="Adds EasyList Cookie and annoyance lists: hides consent pop-ups, newsletter and app-install nags"
        checked={prefs.blockCookieBanners}
        onChange={() => togglePref('blockCookieBanners')}
      />
      <ToggleRow
        title="Block Tracking Pings & Beacons"
        description='Cancels <a ping> hyperlink auditing and navigator.sendBeacon() analytics requests'
        checked={prefs.blockPings}
        onChange={() => togglePref('blockPings')}
      />
      <ToggleRow
        title="Strict Referrer Policy"
        description="Sends no Referer header at all to other websites (some payment / login flows may need it)"
        checked={prefs.strictReferrer}
        onChange={() => togglePref('strictReferrer')}
      />
      <ToggleRow
        title="Generic Language (en-US)"
        description="Reports a common English locale in headers and navigator.languages so your language list can't fingerprint you"
        checked={prefs.spoofLanguage}
        onChange={() => togglePref('spoofLanguage')}
        badge="Anti-fingerprint"
      />

      <div className="p-2.5 rounded-lg bg-violet-500/5 border border-violet-500/20 flex items-start gap-2">
        <EyeOff className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">Private tabs</span> (Alt+Shift+N, or right-click a link) use a
          separate in-memory session: no history, no saved cookies, and everything is wiped when the last private tab
          closes.
        </p>
      </div>
    </div>
  )
}
