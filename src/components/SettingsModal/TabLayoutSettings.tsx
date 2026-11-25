import React from 'react'
import { ArrowUp, Star, Download } from 'lucide-react'
import { BrowserImportPanel } from './DataSyncPanels'
import { Switch } from '@/components/ui/switch'
import { useSettings } from '@/hooks/useSettings'
import type { TabLayout, FavoritesBarMode } from '@/types/api'

const LAYOUTS: { id: TabLayout; label: string }[] = [
  { id: 'topbar', label: 'Horizon' },
  { id: 'sidebar', label: 'Rail' }
]

/** Mini window preview: tabs as a bar across the top, or as a column on the left */
const Preview: React.FC<{ layout: TabLayout; selected: boolean }> = ({ layout, selected }) => (
  <div
    className={`relative w-[88px] h-[58px] rounded-lg border-2 bg-background/60 transition-colors ${
      selected ? 'border-primary' : 'border-border group-hover:border-muted-foreground/60'
    }`}
  >
    {layout === 'topbar' ? (
      <div className={`absolute top-2 left-2 right-2 h-2 rounded-sm ${selected ? 'bg-primary/70' : 'bg-muted-foreground/40'}`} />
    ) : (
      <div className={`absolute top-2 bottom-2 left-2 w-4 rounded-sm ${selected ? 'bg-primary/70' : 'bg-muted-foreground/40'}`} />
    )}
  </div>
)

/** Settings → Tabs & Spaces: where tabs are shown and where new tabs go */
export const TabLayoutSettings: React.FC = () => {
  const { settings, updateSettings } = useSettings()
  const layout: TabLayout = settings?.tabLayout ?? 'sidebar'
  const onTop = !!settings?.newTabsOnTop

  return (
    <div className="space-y-2.5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">General</h4>
      <div className="rounded-2xl border border-border bg-muted/20 divide-y divide-border">
        <div className="flex items-center justify-between gap-4 p-4">
          <div>
            <div className="text-xs font-medium text-foreground">Tab layout</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Horizon lines tabs up across the top. Rail stacks them down the side.</div>
          </div>
          <div className="flex items-start gap-3" role="radiogroup" aria-label="Tab layout">
            {LAYOUTS.map((opt) => {
              const selected = layout === opt.id
              return (
                <button
                  key={opt.id}
                  role="radio"
                  aria-checked={selected}
                  onClick={() => void updateSettings({ tabLayout: opt.id })}
                  className="group flex flex-col items-center gap-2 cursor-pointer outline-none rounded-xl p-1 focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <span className={`text-[11px] font-medium ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>{opt.label}</span>
                  <Preview layout={opt.id} selected={selected} />
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      selected ? 'border-primary' : 'border-muted-foreground/60'
                    }`}
                  >
                    {selected && <span className="w-2 h-2 rounded-full bg-primary" />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <label className="flex items-center justify-between gap-4 p-4 cursor-pointer">
          <div className="flex items-center gap-3">
            <ArrowUp className="w-4 h-4 text-muted-foreground shrink-0" />
            <div>
              <div className="text-xs font-medium text-foreground">
                Add new tabs to the {layout === 'topbar' ? 'start' : 'top'}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                New tabs open first (after pinned tabs) instead of next to the current tab. Links from a page still open next to it.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-muted-foreground w-6 text-right">{onTop ? 'On' : 'Off'}</span>
            <Switch checked={onTop} onCheckedChange={(v) => void updateSettings({ newTabsOnTop: v })} aria-label="Add new tabs to the top" />
          </div>
        </label>

        <div className="flex items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <Star className="w-4 h-4 text-muted-foreground shrink-0" />
            <div>
              <div className="text-xs font-medium text-foreground">Show favorites bar</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Your favorites under the address bar. Toggle with Ctrl+Shift+B.</div>
            </div>
          </div>
          <select
            value={settings?.favoritesBar ?? 'always'}
            onChange={(e) => void updateSettings({ favoritesBar: e.target.value as FavoritesBarMode })}
            className="h-8 px-2 rounded-lg bg-background border border-border text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer shrink-0"
          >
            <option value="always">Always</option>
            <option value="never">Never</option>
            <option value="new-tab">Only on new tabs</option>
          </select>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Download className="w-4 h-4 text-muted-foreground shrink-0" />
            <div>
              <div className="text-xs font-medium text-foreground">Import favorites</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Bring favorites from Chrome, Edge, Brave, Firefox and others. Their bookmarks bar fills your favorites bar.
              </div>
            </div>
          </div>
          <BrowserImportPanel />
        </div>
      </div>
    </div>
  )
}
