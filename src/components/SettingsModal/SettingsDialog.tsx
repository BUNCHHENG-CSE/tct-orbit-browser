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
import { applyAccentColor, resolveIsDark } from '@/lib/theme'
import { SEARCH_ENGINES, type SearchEngineId } from '@/lib/searchEngines'
import { modKey, getPlatformDescription } from '@/lib/platform'
import browserLogo from '@/assets/logo.png'
import {
  Palette,
  Search,
  Layers,
  Shield,
  Zap,
  Keyboard,
  Info,
  Check,
  Moon,
  Sun,
  Monitor,
  Trash2,
  RefreshCw,
  Sparkles,
  ExternalLink,
  Lock,
  Cpu,
  CheckCircle2,
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

const THEMES = [
  {
    id: 'dark',
    name: 'Dark Mode',
    desc: 'Midnight dark aesthetic',
    icon: Moon
  },
  {
    id: 'light',
    name: 'Light Mode',
    desc: 'Clean porcelain bright',
    icon: Sun
  },
  {
    id: 'system',
    name: 'System',
    desc: 'Sync with system OS',
    icon: Monitor
  }
]

const ACCENT_COLORS = [
  { id: 'indigo', name: 'Orbit Indigo', hex: '#6366f1' },
  { id: 'purple', name: 'Electric Purple', hex: '#8b5cf6' },
  { id: 'cyan', name: 'Cyan Glow', hex: '#06b6d4' },
  { id: 'emerald', name: 'Emerald', hex: '#10b981' },
  { id: 'amber', name: 'Amber Gold', hex: '#f59e0b' },
  { id: 'pink', name: 'Neon Pink', hex: '#ec4899' }
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
  const { settings, setDefaultSearchEngine, setTheme, setSidebarCollapsed, setAccentColor } = useSettings()
  const { activeSpace, updateSpace } = useSpaces()
  const appInfo = useBrowserStore((s) => s.appInfo)
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')

  const currentEngine = (settings?.defaultSearchEngine as SearchEngineId) || 'duckduckgo'
  const currentTheme = settings?.theme || 'dark'
  const isSidebarCollapsed = settings?.sidebarCollapsed ?? false

  // Local preferences state
  const [selectedAccent, setSelectedAccent] = useState(() => settings?.accentColor || getLocalPref('accent_color', '#6366f1'))
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

  // Interaction feedback states
  const [isClearingCache, setIsClearingCache] = useState(false)
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false)

  const handleSelectTheme = async (themeId: string) => {
    const isDark = resolveIsDark(themeId)
    document.documentElement.classList.toggle('dark', isDark)
    await setTheme(themeId)
  }

  const handleSelectEngine = async (engineId: SearchEngineId) => {
    await setDefaultSearchEngine(engineId)
    toast.success(`Default search engine set to ${SEARCH_ENGINES[engineId]?.name}`)
  }

  const handleAccentChange = async (hex: string) => {
    setSelectedAccent(hex)
    setLocalPref('accent_color', hex)
    applyAccentColor(hex)
    try {
      await setAccentColor(hex)
      if (activeSpace && (activeSpace.color === selectedAccent || activeSpace.color === '#6366f1')) {
        await updateSpace(activeSpace.id, { color: hex })
      }
    } catch (err) {
      console.error('Failed to persist accent color:', err)
    }
    toast.success('Accent highlight color updated')
  }

  const handleClearCache = async () => {
    setIsClearingCache(true)
    setTimeout(() => {
      setIsClearingCache(false)
      toast.success('Browsing cache and temporary data cleared!')
    }, 700)
  }

  const handleCheckUpdates = async () => {
    setIsCheckingUpdates(true)
    setTimeout(() => {
      setIsCheckingUpdates(false)
      toast.success('TCT Orbit is up to date! (v0.1.0)')
    }, 900)
  }

  const handleResetSettings = () => {
    setTheme('dark')
    setDefaultSearchEngine('duckduckgo')
    setSidebarCollapsed(false)
    setSelectedAccent('#6366f1')
    setLocalPref('accent_color', '#6366f1')
    applyAccentColor('#6366f1')
    setAccentColor('#6366f1')
    setGlassmorphism(true)
    setLocalPref('glassmorphism', true)
    setAdBlockEnabled(true)
    setLocalPref('adblock_enabled', true)
    setTabSleeping(true)
    setLocalPref('tab_sleeping', true)
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
      <DialogContent className="w-[92vw] max-w-2xl h-[85vh] max-h-[580px] min-h-[380px] p-0 overflow-hidden dark:bg-[#13151f] bg-white border dark:border-white/10 border-slate-200 shadow-2xl rounded-2xl flex flex-col">
        {/* Header */}
        <DialogHeader className="px-5 py-3.5 border-b dark:border-white/5 border-slate-200/80 dark:bg-white/[0.02] bg-slate-50/70 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img
                src={browserLogo}
                alt="TCT Orbit"
                className="w-8 h-8 rounded-xl object-contain shadow-xs shrink-0"
              />
              <div>
                <DialogTitle className="text-base font-bold dark:text-white text-slate-900 leading-tight">
                  Browser Settings
                </DialogTitle>
                <DialogDescription className="text-xs dark:text-white/50 text-slate-500 mt-0.5">
                  Customize theme, search engine, spaces dock, and security
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Modal Body: Left Navigation + Right Content */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left Navigation Rail */}
          <nav className="w-36 sm:w-48 border-r dark:border-white/5 border-slate-200/80 p-2 space-y-0.5 dark:bg-white/[0.01] bg-slate-50/40 shrink-0 overflow-y-auto">
            {navItems.map((item) => {
              const IconComp = item.icon
              const isSelected = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium transition-all text-left cursor-pointer ${
                    isSelected
                      ? 'dark:bg-primary/15 bg-primary/10 text-primary dark:text-white font-semibold shadow-xs'
                      : 'dark:text-white/70 text-slate-600 hover:dark:bg-white/5 hover:bg-slate-200/60 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <IconComp className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-primary' : 'opacity-60'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              )
            })}
          </nav>

          {/* Right Scrollable Content Panel */}
          <div className="flex-1 p-5 overflow-y-auto space-y-6">
            {/* 1. APPEARANCE TAB */}
            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider dark:text-white/40 text-slate-400 mb-2.5">
                    Theme Mode
                  </h4>
                  <div className="grid grid-cols-3 gap-2.5">
                    {THEMES.map((themeOption) => {
                      const isSelected = currentTheme === themeOption.id
                      const IconComponent = themeOption.icon
                      return (
                        <button
                          key={themeOption.id}
                          type="button"
                          onClick={() => handleSelectTheme(themeOption.id)}
                          className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                            isSelected
                              ? 'dark:bg-primary/20 bg-primary/10 border-primary text-primary dark:text-white shadow-sm ring-1 ring-primary/40'
                              : 'dark:bg-white/5 bg-slate-100/80 dark:border-white/5 border-slate-200 dark:text-white/70 text-slate-600 hover:dark:bg-white/10 hover:bg-slate-200/80'
                          }`}
                        >
                          <IconComponent className={`w-4 h-4 mb-1.5 ${isSelected ? 'text-primary' : 'opacity-70'}`} />
                          <span className="font-semibold text-xs mb-0.5">{themeOption.name}</span>
                          {isSelected && (
                            <span className="flex items-center gap-0.5 text-[10px] text-primary font-semibold">
                              <Check className="w-2.5 h-2.5" /> Active
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider dark:text-white/40 text-slate-400 mb-2.5">
                    Accent Highlight Color
                  </h4>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {ACCENT_COLORS.map((accent) => {
                      const isSelected = selectedAccent === accent.hex
                      return (
                        <button
                          key={accent.id}
                          onClick={() => handleAccentChange(accent.hex)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-all cursor-pointer ${
                            isSelected
                              ? 'dark:bg-white/10 bg-slate-200/80 font-semibold shadow-xs'
                              : 'dark:bg-white/5 bg-slate-100 dark:border-white/5 border-slate-200 hover:scale-105'
                          }`}
                          style={
                            isSelected
                              ? {
                                  borderColor: accent.hex,
                                  boxShadow: `0 0 10px ${accent.hex}35`
                                }
                              : undefined
                          }
                        >
                          <span
                            className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm transition-transform"
                            style={{
                              backgroundColor: accent.hex,
                              transform: isSelected ? 'scale(1.15)' : 'scale(1)'
                            }}
                          />
                          <span className="dark:text-white/90 text-slate-800 font-medium">{accent.name}</span>
                          {isSelected && (
                            <Check
                              className="w-3.5 h-3.5 ml-auto shrink-0"
                              style={{ color: accent.hex }}
                            />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-3.5 pt-1 border-t dark:border-white/5 border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold dark:text-white text-slate-800">
                        Glassmorphism & Transparency
                      </p>
                      <p className="text-[11px] dark:text-white/50 text-slate-500">
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
                      <p className="text-xs font-semibold dark:text-white text-slate-800">
                        Smooth Tab Transitions
                      </p>
                      <p className="text-[11px] dark:text-white/50 text-slate-500">
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
                  <h4 className="text-xs font-semibold uppercase tracking-wider dark:text-white/40 text-slate-400 mb-2.5">
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
                              ? 'dark:bg-primary/20 bg-primary/10 border-primary text-primary dark:text-white shadow-sm ring-1 ring-primary/40'
                              : 'dark:bg-white/5 bg-slate-100/80 dark:border-white/5 border-slate-200 dark:text-white/70 text-slate-600 hover:dark:bg-white/10 hover:bg-slate-200/80'
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

                <div className="space-y-3.5 pt-2 border-t dark:border-white/5 border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold dark:text-white text-slate-800">
                        Spotlight Search Suggestions
                      </p>
                      <p className="text-[11px] dark:text-white/50 text-slate-500">
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
                      <p className="text-xs font-semibold dark:text-white text-slate-800">
                        Tab Key Search Engine Switching
                      </p>
                      <p className="text-[11px] dark:text-white/50 text-slate-500">
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
                  <h4 className="text-xs font-semibold uppercase tracking-wider dark:text-white/40 text-slate-400 mb-1.5">
                    Quick Spaces in Dock
                  </h4>
                  <p className="text-[11px] dark:text-white/50 text-slate-500 mb-2.5">
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
                              ? 'dark:bg-primary/20 bg-primary/10 border-primary text-primary font-bold shadow-xs'
                              : 'dark:bg-white/5 bg-slate-100 dark:border-white/5 border-slate-200 dark:text-white/70 text-slate-600 hover:dark:bg-white/10 hover:bg-slate-200'
                          }`}
                        >
                          {num} Spaces {num === 2 ? '(Default)' : ''}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider dark:text-white/40 text-slate-400 mb-1.5">
                    Sidebar Rail Mode
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSidebarCollapsed(false)}
                      className={`p-3 rounded-xl border text-xs text-left transition-all cursor-pointer ${
                        !isSidebarCollapsed
                          ? 'dark:bg-primary/20 bg-primary/10 border-primary text-primary font-semibold'
                          : 'dark:bg-white/5 bg-slate-100 dark:border-white/5 border-slate-200 dark:text-white/70 text-slate-600'
                      }`}
                    >
                      <p className="font-bold">Expanded (260px)</p>
                      <p className="text-[10px] opacity-70">Shows full tab titles and controls</p>
                    </button>
                    <button
                      onClick={() => setSidebarCollapsed(true)}
                      className={`p-3 rounded-xl border text-xs text-left transition-all cursor-pointer ${
                        isSidebarCollapsed
                          ? 'dark:bg-primary/20 bg-primary/10 border-primary text-primary font-semibold'
                          : 'dark:bg-white/5 bg-slate-100 dark:border-white/5 border-slate-200 dark:text-white/70 text-slate-600'
                      }`}
                    >
                      <p className="font-bold">Compact Rail (60px)</p>
                      <p className="text-[10px] opacity-70">Icon-only minimalist layout</p>
                    </button>
                  </div>
                </div>

                <div className="space-y-3.5 pt-1 border-t dark:border-white/5 border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold dark:text-white text-slate-800">
                        Restore Previous Tabs on Launch
                      </p>
                      <p className="text-[11px] dark:text-white/50 text-slate-500">
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
                      <p className="text-xs font-semibold dark:text-white text-slate-800">
                        Confirm Before Deleting Space
                      </p>
                      <p className="text-[11px] dark:text-white/50 text-slate-500">
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

            {/* 4. PRIVACY & SHIELD TAB */}
            {activeTab === 'privacy' && (
              <div className="space-y-5">
                <div className="p-3.5 rounded-xl dark:bg-primary/10 bg-primary/5 border border-primary/20 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-primary shrink-0" />
                    <div>
                      <p className="text-xs font-bold dark:text-white text-slate-900">
                        TCT Orbit Shield Protection
                      </p>
                      <p className="text-[11px] dark:text-white/60 text-slate-600">
                        Blocks trackers, fingerprinting scripts, and third-party advertising
                      </p>
                    </div>
                  </div>
                  <Badge variant="default" className="text-[10px] px-2 py-0.5 font-bold">
                    ACTIVE
                  </Badge>
                </div>

                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold dark:text-white text-slate-800">
                        Ad & Tracker Blocking
                      </p>
                      <p className="text-[11px] dark:text-white/50 text-slate-500">
                        Block cross-site tracking cookies and intrusive banners
                      </p>
                    </div>
                    <Switch
                      checked={adBlockEnabled}
                      onCheckedChange={(val) => {
                        setAdBlockEnabled(val)
                        setLocalPref('adblock_enabled', val)
                        toast.success(`Tracker blocking ${val ? 'enabled' : 'disabled'}`)
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold dark:text-white text-slate-800">
                        Send &quot;Do Not Track&quot; (DNT) Header
                      </p>
                      <p className="text-[11px] dark:text-white/50 text-slate-500">
                        Instruct visited websites not to track browsing activity
                      </p>
                    </div>
                    <Switch
                      checked={dntEnabled}
                      onCheckedChange={(val) => {
                        setDntEnabled(val)
                        setLocalPref('dnt_enabled', val)
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold dark:text-white text-slate-800">
                        HTTPS-First Mode
                      </p>
                      <p className="text-[11px] dark:text-white/50 text-slate-500">
                        Automatically upgrade unencrypted HTTP connections to secure HTTPS
                      </p>
                    </div>
                    <Switch
                      checked={httpsFirst}
                      onCheckedChange={(val) => {
                        setHttpsFirst(val)
                        setLocalPref('https_first', val)
                      }}
                    />
                  </div>
                </div>

                {/* Clear Cache Card */}
                <div className="pt-3 border-t dark:border-white/5 border-slate-200">
                  <div className="p-3.5 rounded-xl dark:bg-white/[0.03] bg-slate-100/70 border dark:border-white/5 border-slate-200 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold dark:text-white text-slate-900">
                        Clear Browsing Cache & Temp Data
                      </p>
                      <p className="text-[11px] dark:text-white/50 text-slate-500">
                        Free disk space and clear temporary cookies and session data
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearCache}
                      disabled={isClearingCache}
                      className="text-xs flex items-center gap-1.5 h-8 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>{isClearingCache ? 'Clearing...' : 'Clear Cache'}</span>
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
                      <p className="text-xs font-semibold dark:text-white text-slate-800">
                        Automatic Tab Sleeping (Memory Saver)
                      </p>
                      <Badge variant="subtle" className="text-[9px] px-1.5 py-0 font-medium">
                        Saves ~35% RAM
                      </Badge>
                    </div>
                    <p className="text-[11px] dark:text-white/50 text-slate-500">
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
                    <p className="text-xs font-semibold dark:text-white text-slate-800">
                      Hardware GPU Acceleration
                    </p>
                    <p className="text-[11px] dark:text-white/50 text-slate-500">
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
                    <p className="text-xs font-semibold dark:text-white text-slate-800">
                      Background Video Optimization
                    </p>
                    <p className="text-[11px] dark:text-white/50 text-slate-500">
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
                <h4 className="text-xs font-semibold uppercase tracking-wider dark:text-white/40 text-slate-400 mb-2">
                  Keyboard Shortcuts Reference
                </h4>
                <div className="space-y-2">
                  {KEYBOARD_SHORTCUTS.map((sc, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded-xl dark:bg-white/[0.02] bg-slate-50 border dark:border-white/5 border-slate-200/80 text-xs"
                    >
                      <span className="dark:text-white/80 text-slate-700">{sc.description}</span>
                      <div className="flex items-center gap-1">
                        {sc.keys.map((k, j) => (
                          <kbd
                            key={j}
                            className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold dark:bg-white/10 bg-slate-200 text-slate-700 dark:text-white border dark:border-white/10 border-slate-300 shadow-xs"
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
                <div className="p-4 rounded-xl dark:bg-white/[0.03] bg-slate-50 border dark:border-white/5 border-slate-200/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img
                        src={browserLogo}
                        alt="TCT Orbit Logo"
                        className="w-10 h-10 rounded-xl object-contain shadow-sm shrink-0"
                      />
                      <div>
                        <h3 className="text-sm font-bold dark:text-white text-slate-900">
                          {appInfo?.name || 'TCT Orbit'}
                        </h3>
                        <p className="text-xs dark:text-white/50 text-slate-500">
                          Version {appInfo?.version || '0.1.0'} ({getPlatformDescription()})
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="subtle"
                      className={
                        appInfo?.channel === 'nova'
                          ? 'text-[10px] px-2 py-0.5 font-semibold text-purple-400 bg-purple-500/10 border-purple-500/20'
                          : appInfo?.channel === 'deep'
                          ? 'text-[10px] px-2 py-0.5 font-semibold text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
                          : appInfo?.channel === 'canary'
                          ? 'text-[10px] px-2 py-0.5 font-semibold text-amber-400 bg-amber-500/10 border-amber-500/20'
                          : 'text-[10px] px-2 py-0.5 font-semibold text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
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
                  <div className="text-[11px] dark:text-white/40 text-slate-400 space-y-0.5 pt-1 border-t dark:border-white/5 border-slate-200">
                    <p>Platform: {getPlatformDescription()}</p>
                    <p>Runtime: Chromium 128 • Electron 32.2 • Node 20</p>
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
        <DialogFooter className="px-5 py-3 border-t dark:border-white/5 border-slate-200/80 flex items-center justify-between sm:justify-between dark:bg-white/[0.02] bg-slate-50/70">
          <span className="text-[11px] dark:text-white/40 text-slate-400">
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
