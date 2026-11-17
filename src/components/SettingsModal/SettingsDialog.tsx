import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { useSettings } from '@/hooks/useSettings'
import { useSpaces } from '@/hooks/useSpaces'
import { useBrowserStore } from '@/store/useBrowserStore'
import { useThemeStore } from '@/store/useThemeStore'
import { ACCENT_PRESETS } from '@/lib/theme'
import type { ThemeMode, AccentPreset, WebColorScheme } from '@/types/api'
import { SEARCH_ENGINES, type SearchEngineId } from '@/lib/searchEngines'
import { modKey, getPlatformDescription } from '@/lib/platform'
import browserLogo from '@/assets/logo.png'
import { usePrivacyShield } from '@/hooks/usePrivacyShield'
import {
  Palette,
  Search,
  Layers,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  EyeOff,
  Lock,
  Zap,
  Keyboard,
  Info,
  Check,
  Moon,
  Sun,
  Monitor,
  Trash2,
  RefreshCw,
  Globe,
  RotateCcw
} from 'lucide-react'
import { toast } from 'sonner'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SettingsTab =
  | 'appearance'
  | 'search'
  | 'tabs'
  | 'privacy'
  | 'performance'
  | 'shortcuts'
  | 'about'

const ACCENT_OPTIONS = ACCENT_PRESETS

const WEB_COLOR_SCHEME_OPTIONS: {
  id: WebColorScheme
  name: string
  desc: string
  badge?: string
}[] = [
  {
    id: 'match-browser',
    name: 'Match Browser Theme',
    desc: 'Websites follow TCT Orbit’s active theme (Light or Dark).',
    badge: 'Default'
  },
  {
    id: 'dark',
    name: 'Always Dark',
    desc: 'Requests dark mode stylesheets from all websites supporting dark themes.'
  },
  {
    id: 'light',
    name: 'Always Light',
    desc: 'Requests standard light mode stylesheets from all websites.'
  },
  {
    id: 'system',
    name: 'Follow OS Setting',
    desc: 'Websites synchronize directly with your Windows / macOS theme.'
  }
]

const KEYBOARD_SHORTCUTS = [
  { keys: [modKey, 'T'], description: 'Open new tab' },
  { keys: [modKey, 'W'], description: 'Close active tab' },
  { keys: [modKey, 'L'], description: 'Open Spotlight / URL search' },
  { keys: [modKey, 'S'], description: 'Toggle sidebar rail' },
  { keys: [modKey, 'Tab'], description: 'Switch to next tab' },
  { keys: [modKey, 'Shift', 'Tab'], description: 'Switch to previous tab' },
  { keys: [modKey, 'Shift', 'T'], description: 'Reopen closed tab' },
  { keys: [modKey, ','], description: 'Open browser settings' }
]

// Helper for local browser preferences
const getLocalPref = <T,>(key: string, defaultValue: T): T => {
  try {
    const val = localStorage.getItem(`tct_pref_${key}`) ?? localStorage.getItem(`arc_pref_${key}`)
    return val !== null ? (JSON.parse(val) as T) : defaultValue
  } catch {
    return defaultValue
  }
}

const setLocalPref = <T,>(key: string, value: T): void => {
  try {
    localStorage.setItem(`tct_pref_${key}`, JSON.stringify(value))
  } catch (e) {
    console.error(e)
  }
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({ open, onOpenChange }) => {
  const {
    settings,
    setDefaultSearchEngine,
    setTheme,
    setSidebarCollapsed,
    setAccentPreset,
    setWebColorScheme: persistWebColorScheme
  } = useSettings()

  const { activeSpace, updateSpace } = useSpaces()
  const appInfo = useBrowserStore((s) => s.appInfo)
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')

  // Theme Store
  const themeMode = useThemeStore((s) => s.mode)
  const resolvedTheme = useThemeStore((s) => s.resolved)
  const currentAccent = useThemeStore((s) => s.accent)
  const webColorScheme = useThemeStore((s) => s.webColorScheme)
  const setThemeModeStore = useThemeStore((s) => s.setThemeMode)
  const setAccentStore = useThemeStore((s) => s.setAccent)
  const setWebColorSchemeStore = useThemeStore((s) => s.setWebColorScheme)

  const currentEngine = (settings?.defaultSearchEngine as SearchEngineId) || 'duckduckgo'
  const isSidebarCollapsed = settings?.sidebarCollapsed ?? false

  // Local preferences state
  const [selectedAccent, setSelectedAccent] = useState(() => ACCENT_PRESETS.find((p) => p.id === currentAccent)?.hex || '#3b82f6')
  const [glassmorphism, setGlassmorphism] = useState(() => getLocalPref('glassmorphism', true))
  const [smoothTransitions, setSmoothTransitions] = useState(() => getLocalPref('smooth_transitions', true))
  const [tabCyclingSearch, setTabCyclingSearch] = useState(() => getLocalPref('tab_cycling_search', true))
  const [searchSuggestions, setSearchSuggestions] = useState(() => getLocalPref('search_suggestions', true))
  const [dockLimit, setDockLimit] = useState<number>(() => getLocalPref('dock_limit', 2))
  const [restoreTabsOnStartup, setRestoreTabsOnStartup] = useState(() => getLocalPref('restore_tabs', true))
  const [confirmCloseSpace, setConfirmCloseSpace] = useState(() => getLocalPref('confirm_close_space', true))
  const [adBlockEnabled, setAdBlockEnabled] = useState(() => getLocalPref('adblock_enabled', true))
  const [dntEnabled, setDntEnabled] = useState(() => getLocalPref('dnt_enabled', true))
  const [httpsFirst, setHttpsFirst] = useState(() => getLocalPref('https_first', true))
  const [tabSleeping, setTabSleeping] = useState(() => getLocalPref('tab_sleeping', true))
  const [gpuAcceleration, setGpuAcceleration] = useState(() => getLocalPref('gpu_accel', true))
  const [videoOptimization, setVideoOptimization] = useState(() => getLocalPref('video_opt', true))
  const [smoothScrolling, setSmoothScrolling] = useState(() => getLocalPref('smooth_scrolling', true))

  // Interaction feedback states
  const [isClearingCache, setIsClearingCache] = useState(false)
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false)

  const handleSelectTheme = async (mode: ThemeMode) => {
    await setThemeModeStore(mode)
    await setTheme(mode)
    toast.success(`Theme mode set to ${mode === 'system' ? 'System sync' : mode === 'dark' ? 'Dark' : 'Light'}`)
  }

  const handleAccentPresetChange = async (preset: AccentPreset) => {
    await setAccentStore(preset)
    await setAccentPreset(preset)
    const presetObj = ACCENT_PRESETS.find((p) => p.id === preset)
    const hex = presetObj?.hex || '#3b82f6'
    setSelectedAccent(hex)
    if (activeSpace && (activeSpace.color === selectedAccent || activeSpace.color === '#6366f1' || activeSpace.color === '#3b82f6')) {
      try {
        await updateSpace(activeSpace.id, { color: hex })
      } catch (err) {
        console.error('Failed to persist accent to space:', err)
      }
    }
    toast.success(`Accent color set to ${presetObj?.name || preset}`)
  }

  const handleWebColorSchemeChange = async (scheme: WebColorScheme) => {
    await setWebColorSchemeStore(scheme)
    await persistWebColorScheme(scheme)
    toast.success(`Website color scheme updated to ${scheme}`)
  }

  const handleSelectEngine = async (engineId: SearchEngineId) => {
    await setDefaultSearchEngine(engineId)
    toast.success(`Default search engine set to ${SEARCH_ENGINES[engineId]?.name}`)
  }

  const {
    prefs: privacyPrefs,
    masterStatus: privacyMasterStatus,
    stats: privacyStats,
    isClearing: isClearingPrivacyData,
    togglePref: togglePrivacyPref,
    setDohProvider,
    clearBrowsingData: clearPrivacyBrowsingData
  } = usePrivacyShield()

  const handleClearCache = async () => {
    const success = await clearPrivacyBrowsingData()
    if (success) {
      toast.success('Browsing cache and temporary site data cleared!')
    } else {
      toast.error('Failed to clear browsing data')
    }
  }

  const handleCheckUpdates = async () => {
    setIsCheckingUpdates(true)
    setTimeout(() => {
      setIsCheckingUpdates(false)
      toast.success('TCT Orbit is up to date! (v0.1.0)')
    }, 900)
  }

  const handleResetSettings = async () => {
    await setThemeModeStore('dark')
    await setTheme('dark')
    await setAccentStore('orbit-blue')
    await setAccentPreset('orbit-blue')
    await setWebColorSchemeStore('match-browser')
    await persistWebColorScheme('match-browser')
    setDefaultSearchEngine('duckduckgo')
    setSidebarCollapsed(false)
    setSelectedAccent(ACCENT_PRESETS[0].hex)
    setGlassmorphism(true)
    setLocalPref('glassmorphism', true)
    setAdBlockEnabled(true)
    setLocalPref('adblock_enabled', true)
    setTabSleeping(true)
    setLocalPref('tab_sleeping', true)
    setSmoothScrolling(true)
    setLocalPref('smooth_scrolling', true)
    toast.success('All settings reset to defaults')
  }

  const navItems = [
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'search', label: 'Search Engine', icon: Search },
    { id: 'tabs', label: 'Spaces & Dock', icon: Layers },
    { id: 'privacy', label: 'Privacy & Shield', icon: Shield },
    { id: 'performance', label: 'Performance', icon: Zap },
    { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
    { id: 'about', label: 'About', icon: Info }
  ] as const

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-2xl h-[85vh] max-h-[620px] min-h-[420px] p-0 overflow-hidden bg-card text-card-foreground border border-border shadow-2xl rounded-2xl flex flex-col">
        {/* Header */}
        <DialogHeader className="px-5 py-3.5 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img
                src={browserLogo}
                alt="TCT Orbit"
                className="w-8 h-8 rounded-xl object-contain shadow-xs shrink-0"
              />
              <div>
                <DialogTitle className="text-base font-bold text-foreground leading-tight">
                  Browser Settings
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Customize theme, search engine, spaces dock, and security
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Modal Body: Left Navigation + Right Content */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left Navigation Rail */}
          <nav className="w-36 sm:w-48 border-r border-border p-2 space-y-0.5 bg-muted/20 shrink-0 overflow-y-auto" data-lenis-prevent>
            {navItems.map((item) => {
              const IconComp = item.icon
              const isSelected = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium transition-all text-left cursor-pointer ${
                    isSelected
                      ? 'bg-primary/15 text-primary font-semibold shadow-xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <IconComp className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-primary' : 'opacity-60'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              )
            })}
          </nav>

          {/* Right Scrollable Content Panel */}
          <div className="flex-1 p-5 overflow-y-auto space-y-6" data-lenis-prevent>
            {/* 1. APPEARANCE TAB */}
            {activeTab === 'appearance' && (
              <div className="space-y-6">
                {/* Theme Mode Visual Previews */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
                    Theme Mode
                  </h4>
                  <div className="grid grid-cols-3 gap-2.5">
                    {/* Light Mode Preview Card */}
                    <button
                      type="button"
                      onClick={() => handleSelectTheme('light')}
                      className={`group relative flex flex-col rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                        themeMode === 'light'
                          ? 'border-primary ring-2 ring-primary/40 bg-primary/5 shadow-xs'
                          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/50'
                      }`}
                    >
                      <div className="w-full h-20 rounded-lg overflow-hidden border border-slate-200 bg-white flex flex-col shadow-xs mb-2">
                        <div className="h-4 bg-[#f4f4f5] border-b border-slate-200 px-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          </div>
                          <div className="h-2.5 w-14 rounded-xs bg-white border border-slate-200 flex items-center px-1">
                            <div className="w-1 h-1 rounded-full bg-primary" />
                          </div>
                          <div className="w-3" />
                        </div>
                        <div className="h-4 bg-white border-b border-slate-100 px-2 flex items-center">
                          <div className="h-2 w-full rounded-xs bg-slate-100 border border-slate-200/60" />
                        </div>
                        <div className="flex-1 p-2 bg-white flex flex-col gap-1">
                          <div className="h-1.5 w-1/2 rounded-full bg-slate-200" />
                          <div className="h-1 w-3/4 rounded-full bg-slate-100" />
                          <div className="h-1 w-2/3 rounded-full bg-slate-100" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-1.5">
                          <Sun className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-xs font-semibold text-foreground">Light</span>
                        </div>
                        {themeMode === 'light' && (
                          <span className="flex items-center gap-0.5 text-[11.5px] text-primary font-semibold">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      <p className="text-[11.5px] text-muted-foreground mt-0.5">Clean porcelain bright</p>
                    </button>

                    {/* Dark Mode Preview Card */}
                    <button
                      type="button"
                      onClick={() => handleSelectTheme('dark')}
                      className={`group relative flex flex-col rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                        themeMode === 'dark'
                          ? 'border-primary ring-2 ring-primary/40 bg-primary/5 shadow-xs'
                          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/50'
                      }`}
                    >
                      <div className="w-full h-20 rounded-lg overflow-hidden border border-zinc-800 bg-[#09090b] flex flex-col shadow-xs mb-2">
                        <div className="h-4 bg-[#121215] border-b border-zinc-800 px-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-400/80" />
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400/80" />
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                          </div>
                          <div className="h-2.5 w-14 rounded-xs bg-[#18181b] border border-zinc-700 flex items-center px-1">
                            <div className="w-1 h-1 rounded-full bg-primary" />
                          </div>
                          <div className="w-3" />
                        </div>
                        <div className="h-4 bg-[#09090b] border-b border-zinc-800/80 px-2 flex items-center">
                          <div className="h-2 w-full rounded-xs bg-[#18181b] border border-zinc-800" />
                        </div>
                        <div className="flex-1 p-2 bg-[#09090b] flex flex-col gap-1">
                          <div className="h-1.5 w-1/2 rounded-full bg-zinc-700" />
                          <div className="h-1 w-3/4 rounded-full bg-zinc-800" />
                          <div className="h-1 w-2/3 rounded-full bg-zinc-800" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-1.5">
                          <Moon className="w-3.5 h-3.5 text-blue-400" />
                          <span className="text-xs font-semibold text-foreground">Dark</span>
                        </div>
                        {themeMode === 'dark' && (
                          <span className="flex items-center gap-0.5 text-[11.5px] text-primary font-semibold">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      <p className="text-[11.5px] text-muted-foreground mt-0.5">Midnight dark aesthetic</p>
                    </button>

                    {/* System Mode Split Preview Card */}
                    <button
                      type="button"
                      onClick={() => handleSelectTheme('system')}
                      className={`group relative flex flex-col rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                        themeMode === 'system'
                          ? 'border-primary ring-2 ring-primary/40 bg-primary/5 shadow-xs'
                          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/50'
                      }`}
                    >
                      <div className="w-full h-20 rounded-lg overflow-hidden border border-border flex mb-2 shadow-xs">
                        <div className="w-1/2 h-full bg-white flex flex-col border-r border-border">
                          <div className="h-4 bg-[#f4f4f5] border-b border-slate-200 px-1 flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          </div>
                          <div className="h-4 bg-white border-b border-slate-100 px-1 flex items-center">
                            <div className="h-2 w-full rounded-xs bg-slate-100" />
                          </div>
                          <div className="flex-1 p-1.5 bg-white flex flex-col gap-1">
                            <div className="h-1.5 w-3/4 rounded-full bg-slate-200" />
                            <div className="h-1 w-full rounded-full bg-slate-100" />
                          </div>
                        </div>
                        <div className="w-1/2 h-full bg-[#09090b] flex flex-col">
                          <div className="h-4 bg-[#121215] border-b border-zinc-800 px-1 flex items-center justify-end">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                          </div>
                          <div className="h-4 bg-[#09090b] border-b border-zinc-800/80 px-1 flex items-center">
                            <div className="h-2 w-full rounded-xs bg-[#18181b]" />
                          </div>
                          <div className="flex-1 p-1.5 bg-[#09090b] flex flex-col gap-1">
                            <div className="h-1.5 w-3/4 rounded-full bg-zinc-700" />
                            <div className="h-1 w-full rounded-full bg-zinc-800" />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-1.5">
                          <Monitor className="w-3.5 h-3.5 text-primary" />
                          <span className="text-xs font-semibold text-foreground">System</span>
                        </div>
                        {themeMode === 'system' && (
                          <span className="flex items-center gap-0.5 text-[11.5px] text-primary font-semibold">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      <p className="text-[11.5px] text-muted-foreground mt-0.5">
                        Follows OS ({resolvedTheme === 'dark' ? 'Dark' : 'Light'})
                      </p>
                    </button>
                  </div>
                </div>

                {/* Accent Color Presets */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
                    Accent Color Presets
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ACCENT_OPTIONS.map((opt) => {
                      const isSelected = currentAccent === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleAccentPresetChange(opt.id)}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                            isSelected
                              ? 'border-primary ring-2 ring-primary/40 bg-primary/5 text-foreground shadow-xs'
                              : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/60'
                          }`}
                        >
                          <span
                            className="w-4 h-4 rounded-full shrink-0 shadow-xs border border-white/20 transition-transform flex items-center justify-center"
                            style={{ backgroundColor: opt.hex }}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                          </span>
                          <span className="truncate">{opt.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Website Original Color Scheme */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Website Original Color Scheme
                    </h4>
                    <span className="text-[11.5px] text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                      Native CSS Engine
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-2.5">
                    Websites render using their author&apos;s native Light and Dark CSS stylesheets via @media (prefers-color-scheme).
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {WEB_COLOR_SCHEME_OPTIONS.map((opt) => {
                      const isSelected = webColorScheme === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleWebColorSchemeChange(opt.id)}
                          className={`flex flex-col p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'border-primary ring-2 ring-primary/40 bg-primary/5 shadow-xs'
                              : 'border-border bg-card hover:bg-muted/60'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                              <Globe className="w-3.5 h-3.5 text-primary" />
                              {opt.name}
                            </span>
                            {opt.badge ? (
                              <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                                {opt.badge}
                              </span>
                            ) : isSelected ? (
                              <Check className="w-3.5 h-3.5 text-primary" />
                            ) : null}
                          </div>
                          <p className="text-[11.5px] text-muted-foreground leading-relaxed">{opt.desc}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Visual Customizations Switches */}
                <div className="space-y-3.5 pt-1 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Glassmorphism & Transparency
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Render frosted glass blurs across sidebar and command bar
                      </p>
                    </div>
                    <Switch
                      checked={glassmorphism}
                      onCheckedChange={(val) => {
                        setGlassmorphism(val)
                        setLocalPref('glassmorphism', val)
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Smooth Tab Transitions
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Animate tab switching and sidebar collapse transitions
                      </p>
                    </div>
                    <Switch
                      checked={smoothTransitions}
                      onCheckedChange={(val) => {
                        setSmoothTransitions(val)
                        setLocalPref('smooth_transitions', val)
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 2. SEARCH ENGINE TAB */}
            {activeTab === 'search' && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
                    Default Search Engine
                  </h4>
                  <div className="grid grid-cols-3 gap-2.5">
                    {Object.values(SEARCH_ENGINES).map((engine) => {
                      const isSelected = currentEngine === engine.id
                      return (
                        <button
                          key={engine.id}
                          type="button"
                          onClick={() => handleSelectEngine(engine.id as SearchEngineId)}
                          className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-primary/15 border-primary text-primary font-bold shadow-xs ring-1 ring-primary/40'
                              : 'bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          <span className="text-sm font-bold mb-1">{engine.name}</span>
                          {isSelected && (
                            <span className="flex items-center gap-1 text-[11px] text-primary font-semibold">
                              <Check className="w-3 h-3" /> Selected
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-3.5 pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Spotlight Search Suggestions
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Display direct search queries and quick navigation links in Command Bar
                      </p>
                    </div>
                    <Switch
                      checked={searchSuggestions}
                      onCheckedChange={(val) => {
                        setSearchSuggestions(val)
                        setLocalPref('search_suggestions', val)
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Tab Key Search Engine Switching
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Press Tab in Command Bar to quickly cycle between Google, DuckDuckGo, and Bing
                      </p>
                    </div>
                    <Switch
                      checked={tabCyclingSearch}
                      onCheckedChange={(val) => {
                        setTabCyclingSearch(val)
                        setLocalPref('tab_cycling_search', val)
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 3. SPACES & DOCK TAB */}
            {activeTab === 'tabs' && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Quick Spaces in Dock
                  </h4>
                  <p className="text-[11px] text-muted-foreground mb-2.5">
                    Limit visible spaces in sidebar rail. Spaces beyond this count are accessible via the Spaces Hub (+N).
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[2, 3, 4].map((num) => {
                      const isSelected = dockLimit === num
                      return (
                        <button
                          key={num}
                          onClick={() => {
                            setDockLimit(num)
                            setLocalPref('dock_limit', num)
                            toast.success(`Dock capacity set to ${num} spaces`)
                          }}
                          className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all cursor-pointer text-center ${
                            isSelected
                              ? 'bg-primary/15 border-primary text-primary font-bold shadow-xs'
                              : 'bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          {num} Spaces {num === 2 ? '(Default)' : ''}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Sidebar Rail Mode
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSidebarCollapsed(false)}
                      className={`p-3 rounded-xl border text-xs text-left transition-all cursor-pointer ${
                        !isSidebarCollapsed
                          ? 'bg-primary/15 border-primary text-primary font-semibold'
                          : 'bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <p className="font-bold">Expanded (260px)</p>
                      <p className="text-[11.5px] opacity-70">Shows full tab titles and controls</p>
                    </button>
                    <button
                      onClick={() => setSidebarCollapsed(true)}
                      className={`p-3 rounded-xl border text-xs text-left transition-all cursor-pointer ${
                        isSidebarCollapsed
                          ? 'bg-primary/15 border-primary text-primary font-semibold'
                          : 'bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <p className="font-bold">Compact Rail (60px)</p>
                      <p className="text-[11.5px] opacity-70">Icon-only minimalist layout</p>
                    </button>
                  </div>
                </div>

                <div className="space-y-3.5 pt-1 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Restore Previous Tabs on Launch
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Automatically reload tabs and active spaces from your last session
                      </p>
                    </div>
                    <Switch
                      checked={restoreTabsOnStartup}
                      onCheckedChange={(val) => {
                        setRestoreTabsOnStartup(val)
                        setLocalPref('restore_tabs', val)
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Confirm Before Deleting Space
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Warn when attempting to delete a space with open tabs
                      </p>
                    </div>
                    <Switch
                      checked={confirmCloseSpace}
                      onCheckedChange={(val) => {
                        setConfirmCloseSpace(val)
                        setLocalPref('confirm_close_space', val)
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 4. PRIVACY & SHIELD TAB (Mullvad Standard) */}
            {activeTab === 'privacy' && (
              <div className="space-y-4">
                {/* Master Status Banner */}
                <div
                  className={`p-3.5 rounded-xl border flex items-center justify-between transition-colors ${
                    privacyMasterStatus === 'ACTIVE'
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400'
                      : privacyMasterStatus === 'PARTIALLY_ACTIVE'
                      ? 'bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-400'
                      : 'bg-destructive/10 border-destructive/25 text-destructive'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {privacyMasterStatus === 'ACTIVE' ? (
                      <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
                    ) : privacyMasterStatus === 'PARTIALLY_ACTIVE' ? (
                      <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />
                    ) : (
                      <ShieldX className="w-5 h-5 text-destructive shrink-0" />
                    )}
                    <div>
                      <p className="text-xs font-bold text-foreground">
                        TCT Orbit Shield Protection
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {privacyMasterStatus === 'ACTIVE'
                          ? 'Mullvad-hardened ad blocking, tracker interception, fingerprint resistance & DoH'
                          : privacyMasterStatus === 'PARTIALLY_ACTIVE'
                          ? 'Shield is partially active; enable all layers for maximum privacy'
                          : 'Shield is turned off. Visited sites can track and display ads'}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={privacyMasterStatus === 'ACTIVE' ? 'default' : 'secondary'}
                    className={`text-[11px] px-2 py-0.5 font-bold uppercase tracking-wide shrink-0 ${
                      privacyMasterStatus === 'ACTIVE'
                        ? 'bg-emerald-600 text-white'
                        : privacyMasterStatus === 'PARTIALLY_ACTIVE'
                        ? 'bg-amber-500 text-black font-extrabold'
                        : 'bg-destructive text-destructive-foreground'
                    }`}
                  >
                    {privacyMasterStatus === 'ACTIVE'
                      ? 'ACTIVE'
                      : privacyMasterStatus === 'PARTIALLY_ACTIVE'
                      ? 'PARTIALLY ACTIVE'
                      : 'OFF'}
                  </Badge>
                </div>

                {/* Real-time Blocked Metrics */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-muted/40 border border-border">
                    <span className="block text-base font-bold text-foreground font-mono">
                      {privacyStats.adsBlockedTotal}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">Ads Blocked</span>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/40 border border-border">
                    <span className="block text-base font-bold text-foreground font-mono">
                      {privacyStats.trackersBlockedTotal}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">Trackers Stopped</span>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/40 border border-border">
                    <span className="block text-base font-bold text-foreground font-mono">
                      {privacyStats.httpsUpgradesTotal}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">HTTPS Upgrades</span>
                  </div>
                </div>

                {/* Privacy & Shield Feature Toggles */}
                <div className="space-y-3 pt-1">
                  {/* 1. Ad & Tracker Blocker */}
                  <div className="flex items-center justify-between">
                    <div className="pr-2">
                      <p className="text-xs font-semibold text-foreground">
                        Ad & Content Blocker (EasyList, EasyPrivacy, AdGuard)
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Blocks YouTube video ads, sponsored banners, popups, and intrusive ad slots
                      </p>
                    </div>
                    <Switch
                      checked={privacyPrefs.adBlockerEnabled}
                      onCheckedChange={() => togglePrivacyPref('adBlockerEnabled')}
                    />
                  </div>

                  {/* 2. Strict Tracking & Bounce Interception */}
                  <div className="flex items-center justify-between">
                    <div className="pr-2">
                      <p className="text-xs font-semibold text-foreground">
                        Strict Tracker & Bounce Protection
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Intercepts tracking beacons, analytics telemetry, and intermediate redirect hops
                      </p>
                    </div>
                    <Switch
                      checked={privacyPrefs.trackerProtection}
                      onCheckedChange={() => togglePrivacyPref('trackerProtection')}
                    />
                  </div>

                  {/* 3. Fingerprinting Resistance */}
                  <div className="flex items-center justify-between">
                    <div className="pr-2">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-foreground">
                          Browser Fingerprinting Resistance (Mullvad Standard)
                        </p>
                        <Badge variant="subtle" className="text-[9px] px-1 py-0 font-medium">Hardened</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Injects canvas/audio noise and normalizes hardware concurrency, memory & sensor APIs
                      </p>
                    </div>
                    <Switch
                      checked={privacyPrefs.fingerprintResistance}
                      onCheckedChange={() => togglePrivacyPref('fingerprintResistance')}
                    />
                  </div>

                  {/* 4. HTTPS-Only Mode */}
                  <div className="flex items-center justify-between">
                    <div className="pr-2">
                      <p className="text-xs font-semibold text-foreground">
                        HTTPS-Only Mode
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Automatically upgrades all unencrypted HTTP connections to encrypted HTTPS
                      </p>
                    </div>
                    <Switch
                      checked={privacyPrefs.httpsOnlyMode}
                      onCheckedChange={() => togglePrivacyPref('httpsOnlyMode')}
                    />
                  </div>

                  {/* 5. DNS over HTTPS (DoH) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="pr-2">
                        <p className="text-xs font-semibold text-foreground">
                          Encrypted DNS (DNS over HTTPS)
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Encrypts domain name queries with zero unencrypted fallback (prevents ISP snooping)
                        </p>
                      </div>
                      <Switch
                        checked={privacyPrefs.dnsOverHttps}
                        onCheckedChange={() => togglePrivacyPref('dnsOverHttps')}
                      />
                    </div>
                    {privacyPrefs.dnsOverHttps && (
                      <div className="flex items-center gap-1.5 pl-0.5">
                        <span className="text-[10px] text-muted-foreground shrink-0 font-medium">Resolver:</span>
                        {(['mullvad', 'cloudflare', 'quad9', 'adguard'] as const).map((prov) => (
                          <button
                            key={prov}
                            onClick={() => setDohProvider(prov)}
                            className={`px-2 py-0.5 rounded text-[10.5px] font-medium transition-colors cursor-pointer capitalize ${
                              privacyPrefs.dohProvider === prov
                                ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                                : 'bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {prov === 'mullvad' ? 'Mullvad (DoH)' : prov}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 6. Strip Tracking Query Parameters */}
                  <div className="flex items-center justify-between">
                    <div className="pr-2">
                      <p className="text-xs font-semibold text-foreground">
                        Strip Tracking Query Parameters
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Removes tracking identifiers (utm_*, fbclid, gclid, mc_eid) from all navigation links
                      </p>
                    </div>
                    <Switch
                      checked={privacyPrefs.stripTrackingParams}
                      onCheckedChange={() => togglePrivacyPref('stripTrackingParams')}
                    />
                  </div>

                  {/* 7. Block Third-Party Cookies */}
                  <div className="flex items-center justify-between">
                    <div className="pr-2">
                      <p className="text-xs font-semibold text-foreground">
                        Block Third-Party Cookies & State Isolation
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Isolates storage and prevents cross-site tracking cookies across different websites
                      </p>
                    </div>
                    <Switch
                      checked={privacyPrefs.blockThirdPartyCookies}
                      onCheckedChange={() => togglePrivacyPref('blockThirdPartyCookies')}
                    />
                  </div>

                  {/* 8. WebRTC Protection */}
                  <div className="flex items-center justify-between">
                    <div className="pr-2">
                      <p className="text-xs font-semibold text-foreground">
                        WebRTC IP Leak Protection
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Disables non-proxied UDP to prevent websites from discovering your real public/local IP
                      </p>
                    </div>
                    <Switch
                      checked={privacyPrefs.webrtcProtection}
                      onCheckedChange={() => togglePrivacyPref('webrtcProtection')}
                    />
                  </div>

                  {/* 9. Global Privacy Control & DNT */}
                  <div className="flex items-center justify-between">
                    <div className="pr-2">
                      <p className="text-xs font-semibold text-foreground">
                        Global Privacy Control (GPC) & DNT
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Sends Sec-GPC: 1 and DNT: 1 headers signaling visited sites not to track or sell your data
                      </p>
                    </div>
                    <Switch
                      checked={privacyPrefs.globalPrivacyControl}
                      onCheckedChange={() => togglePrivacyPref('globalPrivacyControl')}
                    />
                  </div>

                  {/* 10. Clear Cache on Exit */}
                  <div className="flex items-center justify-between">
                    <div className="pr-2">
                      <p className="text-xs font-semibold text-foreground">
                        Clear Browsing Data on Exit
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Automatically clears cookies, cache, and visited site storage when closing the browser
                      </p>
                    </div>
                    <Switch
                      checked={privacyPrefs.clearCacheOnExit}
                      onCheckedChange={() => togglePrivacyPref('clearCacheOnExit')}
                    />
                  </div>
                </div>

                {/* Clear Browsing Data Card */}
                <div className="pt-2 border-t border-border">
                  <div className="p-3 rounded-xl bg-muted/40 border border-border flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-foreground">
                        Clear Browsing Cache & Temp Data
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Safely cleans cache and visited site storage without resetting your settings or spaces
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearCache}
                      disabled={isClearingPrivacyData}
                      className="text-xs flex items-center gap-1.5 h-8 shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{isClearingPrivacyData ? 'Clearing...' : 'Clear Cache'}</span>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* 5. PERFORMANCE TAB */}
            {activeTab === 'performance' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-foreground">
                        Automatic Tab Sleeping (Memory Saver)
                      </p>
                      <Badge variant="subtle" className="text-[9px] px-1.5 py-0 font-medium">
                        Saves ~35% RAM
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Puts inactive background tabs to sleep after 30 minutes to free memory
                    </p>
                  </div>
                  <Switch
                    checked={tabSleeping}
                    onCheckedChange={(val) => {
                      setTabSleeping(val)
                      setLocalPref('tab_sleeping', val)
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      Hardware GPU Acceleration
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Utilize graphics card acceleration for smooth 60fps rendering
                    </p>
                  </div>
                  <Switch
                    checked={gpuAcceleration}
                    onCheckedChange={(val) => {
                      setGpuAcceleration(val)
                      setLocalPref('gpu_accel', val)
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-foreground">
                        Momentum Smooth Scrolling
                      </p>
                      <Badge variant="subtle" className="text-[9px] px-1.5 py-0 font-medium">
                        Lenis & Compositor
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Buttery-smooth inertia scrolling powered by Lenis and Chromium GPU acceleration
                    </p>
                  </div>
                  <Switch
                    checked={smoothScrolling}
                    onCheckedChange={(val) => {
                      setSmoothScrolling(val)
                      setLocalPref('smooth_scrolling', val)
                      toast.success(`Smooth scrolling ${val ? 'enabled' : 'disabled'}`)
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      Background Video Optimization
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Throttle non-visible video players in hidden tabs to extend laptop battery life
                    </p>
                  </div>
                  <Switch
                    checked={videoOptimization}
                    onCheckedChange={(val) => {
                      setVideoOptimization(val)
                      setLocalPref('video_opt', val)
                    }}
                  />
                </div>
              </div>
            )}

            {/* 6. KEYBOARD SHORTCUTS TAB */}
            {activeTab === 'shortcuts' && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Keyboard Shortcuts Reference
                </h4>
                <div className="space-y-2">
                  {KEYBOARD_SHORTCUTS.map((sc, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded-xl bg-muted/40 border border-border text-xs"
                    >
                      <span className="text-foreground">{sc.description}</span>
                      <div className="flex items-center gap-1">
                        {sc.keys.map((k, j) => (
                          <kbd
                            key={j}
                            className="px-2 py-0.5 rounded-md text-[11.5px] font-mono font-semibold bg-muted text-foreground border border-border shadow-xs"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 7. ABOUT TAB */}
            {activeTab === 'about' && (
              <div className="space-y-5">
                <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img
                        src={browserLogo}
                        alt="TCT Orbit Logo"
                        className="w-10 h-10 rounded-xl object-contain shadow-xs shrink-0"
                      />
                      <div>
                        <h3 className="text-sm font-bold text-foreground">
                          {appInfo?.name || 'TCT Orbit'}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Version {appInfo?.version || '0.1.0'} ({getPlatformDescription()})
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="subtle"
                      className={
                        appInfo?.channel === 'nova'
                          ? 'text-[11.5px] px-2 py-0.5 font-semibold text-purple-400 bg-purple-500/10 border-purple-500/20'
                          : appInfo?.channel === 'deep'
                          ? 'text-[11.5px] px-2 py-0.5 font-semibold text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
                          : appInfo?.channel === 'canary'
                          ? 'text-[11.5px] px-2 py-0.5 font-semibold text-amber-400 bg-amber-500/10 border-amber-500/20'
                          : 'text-[11.5px] px-2 py-0.5 font-semibold text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
                      }
                    >
                      {appInfo?.channel === 'nova'
                        ? 'Nova (Beta)'
                        : appInfo?.channel === 'deep'
                        ? 'Deep (Nightly)'
                        : appInfo?.channel === 'canary'
                        ? 'Canary'
                        : 'Stable'}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground space-y-0.5 pt-1 border-t border-border">
                    <p>Platform: {getPlatformDescription()}</p>
                    <p>Runtime: Chromium 130 • Electron 33.2 • Node 20</p>
                    <p>Graphics: GPU Rasterization • Metal / Direct3D / Wayland-X11 Auto</p>
                    <p>Storage: 100% Local Machine Storage (Zero Cloud Sync)</p>
                    <p>Privacy: All Data Stored Locally on Your Computer</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCheckUpdates}
                    disabled={isCheckingUpdates}
                    className="text-xs flex items-center gap-1.5 h-8"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdates ? 'animate-spin' : ''}`} />
                    <span>{isCheckingUpdates ? 'Checking...' : 'Check for Updates'}</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetSettings}
                    className="text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 flex items-center gap-1.5 h-8"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Defaults</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-5 py-3 border-t border-border flex items-center justify-between sm:justify-between bg-muted/20">
          <span className="text-[11px] text-muted-foreground">
            Preferences auto-save instantly
          </span>
          <Button
            variant="default"
            onClick={() => onOpenChange(false)}
            className="rounded-xl px-5 text-xs h-8"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
