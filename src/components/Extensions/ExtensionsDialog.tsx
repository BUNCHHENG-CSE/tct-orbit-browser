import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Puzzle,
  FolderOpen,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  EyeOff,
  Download,
  FileArchive,
  ExternalLink,
  ShieldAlert,
  ArrowLeft
} from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/ipc'
import { useBrowserStore } from '@/store/useBrowserStore'
import { EXTENSION_STORES, STORE_LABEL, describePermission } from '@/lib/extensionStores'
import type { BrowserExtensionInfo, ExtensionInstallPreview } from '@/types/api'

const btn = 'h-8 px-3 rounded-lg text-xs font-medium border border-border hover:bg-muted flex items-center gap-1.5 disabled:opacity-50'
const primaryBtn = 'h-8 px-3 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 disabled:opacity-50'

const ExtIcon: React.FC<{ icon?: string; size?: string }> = ({ icon, size = 'w-8 h-8' }) =>
  icon ? (
    <img src={icon} alt="" className={`${size} rounded-lg object-contain shrink-0`} />
  ) : (
    <div className={`${size} rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0`}>
      <Puzzle className="w-4 h-4" />
    </div>
  )

async function openInNewTab(url: string) {
  const store = useBrowserStore.getState()
  const spaceId = store.activeSpaceId || store.spaces[0]?.id
  if (!spaceId) return
  const tab = await api.tabs.create({ spaceId, url, title: 'Loading...' })
  store.insertTabNextTo(spaceId, tab, store.activeTabId, true)
}

/**
 * Tools > Extensions. Install from the Chrome Web Store, Edge Add-ons, Opera add-ons (link or
 * "Add to TCT Orbit" on a store page), from a .crx/.zip file, or an unpacked folder.
 * Events: `tct:open-extensions`, `tct:install-extension` { url }.
 */
export const ExtensionsDialog: React.FC = () => {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<BrowserExtensionInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState('')
  const [preview, setPreview] = useState<ExtensionInstallPreview | null>(null)

  const [removedBuiltins, setRemovedBuiltins] = useState(0)
  const refreshRemovedBuiltins = useCallback(() => {
    api.extensions?.removedBuiltinCount?.().then(setRemovedBuiltins).catch(() => setRemovedBuiltins(0))
  }, [])

  const refresh = useCallback(() => {
    api.extensions?.list().then(setList).catch(() => setList([]))
    refreshRemovedBuiltins()
  }, [refreshRemovedBuiltins])

  const prepareStore = useCallback(async (input: string) => {
    if (!input.trim()) return
    setBusy(true)
    try {
      const res = await api.extensions.prepareFromStore(input.trim())
      if (res.ok) setPreview(res.preview)
      else toast.error('Could not get this extension', { description: res.error })
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    const onOpen = () => setOpen(true)
    const onInstall = (e: Event) => {
      const url = (e as CustomEvent).detail?.url
      setOpen(true)
      if (typeof url === 'string') void prepareStore(url)
    }
    window.addEventListener('tct:open-extensions', onOpen)
    window.addEventListener('tct:install-extension', onInstall)
    return () => {
      window.removeEventListener('tct:open-extensions', onOpen)
      window.removeEventListener('tct:install-extension', onInstall)
    }
  }, [prepareStore])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  // Closing the dialog with a pending preview discards the download
  const handleOpenChange = (next: boolean) => {
    if (!next && preview) void api.extensions.cancelInstall(preview.token)
    if (!next) {
      // Let the header's extensions button pick up installs / removals / toggles
      window.dispatchEvent(new CustomEvent('tct:extensions-changed'))
      setPreview(null)
      setLink('')
    }
    setOpen(next)
  }

  const prepareFile = async () => {
    setBusy(true)
    try {
      const res = await api.extensions.prepareFromFile()
      if (res.ok) setPreview(res.preview)
      else if (res.error) toast.error(res.error)
    } finally {
      setBusy(false)
    }
  }

  const confirmInstall = async () => {
    if (!preview) return
    setBusy(true)
    try {
      const res = await api.extensions.commitInstall(preview.token)
      if (res.ok) {
        const name = res.extension?.name || preview.name
        if (res.error) toast.warning(`${name} installed with limits`, { description: res.error })
        else toast.success(res.updated ? `${name} updated` : `${name} added to TCT Orbit`, { description: 'Reload open pages to use it.' })
        setPreview(null)
        setLink('')
        refresh()
      } else {
        toast.error(res.error || 'Install failed')
      }
    } finally {
      setBusy(false)
    }
  }

  const cancelPreview = () => {
    if (preview) void api.extensions.cancelInstall(preview.token)
    setPreview(null)
  }

  const handleAddFolder = async () => {
    setBusy(true)
    try {
      const res = await api.extensions.addUnpacked()
      if (res.ok) {
        if (res.error) toast.warning(res.error)
        else toast.success(`${res.extension?.name || 'Extension'} added`, { description: 'Reload open pages to use it.' })
      } else if (res.error) toast.error(res.error)
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const permissionLines = useMemo(
    () => (preview ? [...new Set(preview.permissions.map(describePermission))] : []),
    [preview]
  )
  const broadAccess = preview?.permissions.some((p) => p === '<all_urls>' || /^(\*|https?):\/\/\*\//.test(p))

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Puzzle className="w-4 h-4 text-primary" />
            {preview ? (preview.isUpdate ? 'Update extension' : 'Add extension') : 'Extensions'}
          </DialogTitle>
        </DialogHeader>

        {preview ? (
          /* --- Confirm install --- */
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <ExtIcon icon={preview.icon} size="w-12 h-12" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">{preview.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  Version {preview.version} · from {STORE_LABEL[preview.store]}
                </div>
                {preview.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{preview.description}</p>}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="text-[11px] font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                <ShieldAlert className={`w-3.5 h-3.5 ${broadAccess ? 'text-amber-500' : 'text-muted-foreground'}`} />
                It can:
              </div>
              {permissionLines.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No special permissions.</p>
              ) : (
                <ul className="space-y-0.5 max-h-36 overflow-y-auto">
                  {permissionLines.map((line) => (
                    <li key={line} className="text-[11px] text-muted-foreground flex gap-1.5">
                      <span className="text-muted-foreground/60">•</span>
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              TCT Orbit runs Chrome-format extensions with some limits: toolbar popups and a few Chrome APIs are not supported.
            </p>

            <div className="flex items-center justify-end gap-2">
              <button onClick={cancelPreview} disabled={busy} className={btn}>
                <ArrowLeft className="w-3.5 h-3.5" /> Cancel
              </button>
              <button onClick={() => void confirmInstall()} disabled={busy} className={primaryBtn}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {preview.isUpdate ? 'Update' : 'Add extension'}
              </button>
            </div>
          </div>
        ) : (
          /* --- Manage --- */
          <div className="space-y-4">
            {/* Install from a store link */}
            <div className="space-y-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void prepareStore(link)
                }}
                className="flex items-center gap-2"
              >
                <input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="Paste a Chrome Web Store, Edge or Opera extension link"
                  className="flex-1 min-w-0 h-8 px-3 rounded-lg bg-background border border-border focus:border-primary/60 text-xs text-foreground outline-none"
                />
                <button type="submit" disabled={busy || !link.trim()} className={primaryBtn}>
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  Install
                </button>
              </form>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground mr-1">Browse:</span>
                {EXTENSION_STORES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      void openInNewTab(s.url)
                      handleOpenChange(false)
                    }}
                    className="h-7 px-2.5 rounded-full text-[11px] font-medium border border-border hover:bg-muted flex items-center gap-1"
                  >
                    {s.name} <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                On an extension's store page, click <span className="font-medium text-foreground">Add to TCT Orbit</span> in the address bar.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => void prepareFile()} disabled={busy} className={btn}>
                <FileArchive className="w-3.5 h-3.5" /> Install .crx / .zip file…
              </button>
              <button onClick={() => void handleAddFolder()} disabled={busy} className={btn}>
                <Plus className="w-3.5 h-3.5" /> Load unpacked folder…
              </button>
              <button onClick={() => void api.extensions.openFolder()} className={btn} title="Open extensions folder">
                <FolderOpen className="w-3.5 h-3.5" />
              </button>
            </div>

            {removedBuiltins > 0 && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-dashed border-border text-[11px] text-muted-foreground">
                <span>
                  {removedBuiltins === 1 ? '1 built-in extension was removed.' : `${removedBuiltins} built-in extensions were removed.`}
                </span>
                <button
                  onClick={() =>
                    void api.extensions.restoreBuiltins().then((next) => {
                      setList(next)
                      setRemovedBuiltins(0)
                      toast.success('Built-in extensions restored')
                    })
                  }
                  className="text-primary font-medium hover:underline"
                >
                  Restore
                </button>
              </div>
            )}

            <div className="max-h-[42vh] overflow-y-auto space-y-2 pr-1">
              {list.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground">No extensions installed yet.</div>
              ) : (
                list.map((ext) => (
                  <div key={ext.id} className="p-3 rounded-xl border border-border bg-muted/30 space-y-2">
                    <div className="flex items-start gap-3">
                      <ExtIcon icon={ext.icon} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground truncate">{ext.name}</span>
                          {ext.version && <span className="text-[10px] text-muted-foreground">{ext.version}</span>}
                          {ext.store && ext.store !== 'file' && (
                            <span
                              className={`text-[9.5px] px-1.5 py-0.5 rounded ${
                                ext.builtin ? 'bg-primary/15 text-primary font-semibold' : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {STORE_LABEL[ext.store]}
                            </span>
                          )}
                        </div>
                        {ext.description && <p className="text-[11px] text-muted-foreground line-clamp-2">{ext.description}</p>}
                        {ext.enabled && !ext.loaded && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Could not be loaded (unsupported features)
                          </p>
                        )}
                      </div>
                      <Switch
                        checked={ext.enabled}
                        onCheckedChange={(v) => void api.extensions.setEnabled(ext.id, v).then(setList)}
                        aria-label={`Enable ${ext.name}`}
                      />
                    </div>
                    <div className="flex items-center justify-between pl-11">
                      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Switch
                          checked={ext.allowInPrivate}
                          onCheckedChange={(v) => void api.extensions.setAllowInPrivate(ext.id, v).then(setList)}
                          className="scale-75"
                        />
                        <EyeOff className="w-3 h-3 text-violet-500" /> Allow in private tabs
                      </label>
                      <button
                        onClick={() => {
                          if (ext.builtin && !window.confirm(`Remove the built-in ${ext.name}? You can restore it later from this window.`)) return
                          void api.extensions.remove(ext.id).then((next) => {
                            setList(next)
                            refreshRemovedBuiltins()
                          })
                        }}
                        className="text-[11px] text-destructive hover:underline flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
