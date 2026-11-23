import React, { useEffect, useState } from 'react'
import { LayoutTemplate, Plus, Play, Trash2, Rocket } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { useBrowserStore } from '@/store/useBrowserStore'
import { loadTemplates, saveTemplates, templateFromTabs, openTemplateAsSpace, type SpaceTemplate } from '@/lib/spaceTemplates'

export const SpaceTemplatesDialog: React.FC = () => {
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<SpaceTemplate[]>([])
  const [name, setName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const spaces = useBrowserStore((s) => s.spaces)
  const activeSpaceId = useBrowserStore((s) => s.activeSpaceId)
  const tabsBySpace = useBrowserStore((s) => s.tabsBySpace)
  const activeSpace = spaces.find((s) => s.id === activeSpaceId)
  const savableCount = (activeSpaceId ? tabsBySpace[activeSpaceId] || [] : []).filter(
    (t) => !t.isPrivate && /^https?:\/\//i.test(t.url)
  ).length

  useEffect(() => {
    const onOpen = () => {
      setTemplates(loadTemplates())
      setOpen(true)
    }
    const onChanged = () => setTemplates(loadTemplates())
    window.addEventListener('tct:open-space-templates', onOpen)
    window.addEventListener('tct:space-templates-changed', onChanged)
    return () => {
      window.removeEventListener('tct:open-space-templates', onOpen)
      window.removeEventListener('tct:space-templates-changed', onChanged)
    }
  }, [])

  useEffect(() => {
    if (open) setName(activeSpace?.name || '')
  }, [open, activeSpace?.name])

  const update = (list: SpaceTemplate[]) => {
    setTemplates(list)
    saveTemplates(list)
  }

  const handleSave = () => {
    if (!activeSpaceId || savableCount === 0) {
      toast.error('This space has no web pages to save')
      return
    }
    const tpl = templateFromTabs(name || activeSpace?.name || 'Template', activeSpace?.color || '#6366f1', tabsBySpace[activeSpaceId] || [])
    const existing = templates.findIndex((t) => t.name.toLowerCase() === tpl.name.toLowerCase())
    if (existing !== -1) {
      const next = [...templates]
      next[existing] = { ...tpl, id: templates[existing].id, openOnStartup: templates[existing].openOnStartup }
      update(next)
      toast.success(`Template "${tpl.name}" updated (${tpl.tabs.length} tabs)`)
    } else {
      update([tpl, ...templates])
      toast.success(`Saved "${tpl.name}" with ${tpl.tabs.length} tabs`)
    }
  }

  const handleOpen = async (tpl: SpaceTemplate) => {
    setBusyId(tpl.id)
    try {
      await openTemplateAsSpace(tpl)
      setOpen(false)
      toast.success(`Opened "${tpl.name}"`, { description: `${tpl.tabs.length} tabs in a new space` })
    } catch (err) {
      console.error('[SpaceTemplates] Open failed:', err)
      toast.error('Could not open template')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[92vw] max-w-lg max-h-[80vh] p-0 overflow-hidden flex flex-col bg-card border border-border rounded-2xl">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <LayoutTemplate className="w-4 h-4 text-primary" /> Space templates
          </DialogTitle>
          <DialogDescription className="text-xs">Save a set of tabs once, reopen it as a new space any time.</DialogDescription>
        </DialogHeader>

        <div className="p-5 space-y-4 overflow-y-auto" data-lenis-prevent>
          <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-2">
            <p className="text-xs font-semibold text-foreground">
              Save current space <span className="font-normal text-muted-foreground">({savableCount} tabs)</span>
            </p>
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder="Template name, e.g. Work"
                maxLength={80}
                className="flex-1 h-8 px-3 rounded-lg bg-background border border-border text-xs outline-none focus:border-primary"
              />
              <button
                onClick={handleSave}
                disabled={savableCount === 0}
                className="h-8 px-3 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Save
              </button>
            </div>
          </div>

          {templates.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No templates yet.</p>
          ) : (
            <ul className="space-y-2">
              {templates.map((tpl) => (
                <li key={tpl.id} className="p-3 rounded-xl border border-border bg-background/50">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: tpl.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-foreground truncate">{tpl.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {tpl.tabs.length} tabs · {tpl.tabs.slice(0, 3).map((t) => t.title).join(', ')}
                      </p>
                    </div>
                    <button
                      onClick={() => void handleOpen(tpl)}
                      disabled={busyId !== null}
                      className="h-7 px-2.5 rounded-lg text-[11px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1 disabled:opacity-50"
                    >
                      <Play className="w-3 h-3" /> Open
                    </button>
                    <button
                      onClick={() => update(templates.filter((t) => t.id !== tpl.id))}
                      className="w-7 h-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center"
                      title="Delete template"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <label className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Rocket className="w-3 h-3" /> Open automatically when TCT Orbit starts
                    </span>
                    <Switch
                      checked={tpl.openOnStartup}
                      onCheckedChange={(v) => update(templates.map((t) => (t.id === tpl.id ? { ...t, openOnStartup: v } : t)))}
                    />
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
