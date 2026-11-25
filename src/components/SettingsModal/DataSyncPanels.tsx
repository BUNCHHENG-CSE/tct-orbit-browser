import React, { useCallback, useEffect, useState } from 'react'
import { Download, FileCode2, Loader2, Lock, RefreshCw, FolderSync, KeyRound, Upload, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/ipc'
import { useBrowserStore } from '@/store/useBrowserStore'
import type { ArcImportInfo, ImportSource, SyncConfig } from '@/types/api'

const inputCls =
  'h-8 px-3 rounded-lg bg-background border border-border text-xs outline-none focus:border-primary placeholder:text-muted-foreground'
const btnCls =
  'h-8 px-3 rounded-lg text-xs font-medium border border-border hover:bg-muted flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none'
const primaryBtnCls =
  'h-8 px-3 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none'

/** Import bookmarks & history from other browsers installed on this computer */
export const BrowserImportPanel: React.FC = () => {
  const [sources, setSources] = useState<ImportSource[] | null>(null)
  const [selected, setSelected] = useState('')
  const [withBookmarks, setWithBookmarks] = useState(true)
  const [withHistory, setWithHistory] = useState(true)
  const [busy, setBusy] = useState(false)
  const [arc, setArc] = useState<ArcImportInfo | null>(null)

  useEffect(() => {
    api.browserImport
      ?.arcDetect?.()
      .then(setArc)
      .catch(() => setArc(null))
    api.browserImport
      ?.detect()
      .then((list) => {
        setSources(list)
        if (list.length > 0) setSelected(list[0].id)
      })
      .catch(() => setSources([]))
  }, [])

  const source = sources?.find((s) => s.id === selected)

  const handleImport = async () => {
    if (!source) return
    setBusy(true)
    try {
      const res = await api.browserImport.run(source.id, withBookmarks && source.hasBookmarks, withHistory && source.hasHistory)
      if (res.success) {
        toast.success(`Imported from ${source.browser}`, {
          description: `${res.bookmarks} bookmark${res.bookmarks === 1 ? '' : 's'} and ${res.history} history entr${res.history === 1 ? 'y' : 'ies'}${
            res.error ? ` (some items failed: ${res.error})` : ''
          }`
        })
      } else {
        toast.error('Import failed', { description: res.error })
      }
    } catch (err: any) {
      toast.error('Import failed', { description: err?.message })
    } finally {
      setBusy(false)
    }
  }

  // Arc: spaces, folders (as nested groups), pinned and unpinned tabs
  const handleArcImport = async () => {
    setBusy(true)
    try {
      const res = await api.browserImport.arcImport()
      if (res.success) {
        useBrowserStore.getState().setSpaces(await api.spaces.list())
        toast.success('Imported from Arc', {
          description: `${res.spaces} space${res.spaces === 1 ? '' : 's'}, ${res.tabs} tab${res.tabs === 1 ? '' : 's'} and ${res.groups} folder${
            res.groups === 1 ? '' : 's'
          }. Imported tabs load when you open them.`
        })
      } else {
        toast.error('Arc import failed', { description: res.error })
      }
    } catch (err: any) {
      toast.error('Arc import failed', { description: err?.message })
    } finally {
      setBusy(false)
    }
  }

  const handleHtml = async () => {
    setBusy(true)
    try {
      const res = await api.browserImport.bookmarksHtml()
      if (!res) return
      if (res.success) toast.success(`Imported ${res.bookmarks} bookmark${res.bookmarks === 1 ? '' : 's'}`)
      else toast.error('Import failed', { description: res.error })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-3">
      <div>
        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Download className="w-3.5 h-3.5 text-primary" /> Import from another browser
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Copies bookmarks and up to 5,000 recent history entries. Your other browser is not changed and can stay open.
        </p>
      </div>

      {sources === null ? (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> Looking for installed browsers…
        </p>
      ) : sources.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No Arc, Chrome, Edge, Brave, Vivaldi, Opera or Firefox profile found.</p>
      ) : (
        <>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className={`${inputCls} w-full cursor-pointer`}>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.browser} · {s.profileName}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-2 text-foreground">
              <Switch checked={withBookmarks} onCheckedChange={setWithBookmarks} disabled={!source?.hasBookmarks} /> Bookmarks
            </label>
            <label className="flex items-center gap-2 text-foreground">
              <Switch checked={withHistory} onCheckedChange={setWithHistory} disabled={!source?.hasHistory} /> History
            </label>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={handleImport} disabled={busy || !source || (!withBookmarks && !withHistory)} className={primaryBtnCls}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Import
        </button>
        <button onClick={handleHtml} disabled={busy} className={btnCls} title="Every browser can export bookmarks as an HTML file">
          <FileCode2 className="w-3.5 h-3.5" /> Import bookmarks HTML file…
        </button>
      </div>

      {arc?.found && (
        <div className="pt-3 border-t border-border space-y-2">
          <p className="text-xs font-semibold text-foreground">Arc spaces & tabs</p>
          <p className="text-[11px] text-muted-foreground">
            {arc.spaces > 0
              ? `Found ${arc.spaces} space${arc.spaces === 1 ? '' : 's'} with ${arc.tabs} tab${arc.tabs === 1 ? '' : 's'}. Each Arc space becomes a new space; folders become tab groups; Favorites, pinned and unpinned tabs are all included.`
              : 'Arc is installed, but no spaces with tabs were found.'}
          </p>
          <button onClick={handleArcImport} disabled={busy || arc.spaces === 0} className={primaryBtnCls}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Import Arc spaces
          </button>
        </div>
      )}
    </div>
  )
}

/** Passphrase-encrypted sync file in a cloud folder (OneDrive, Dropbox, iCloud …) */
export const EncryptedSyncPanel: React.FC = () => {
  const [config, setConfig] = useState<SyncConfig | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  // Loading an encrypted file on this computer
  const [pendingEncrypted, setPendingEncrypted] = useState<string | null>(null)
  const [unlockPass, setUnlockPass] = useState('')

  const refresh = useCallback(() => {
    api.sync?.getConfig().then(setConfig).catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    // BackupSettings hands encrypted files over here for the passphrase
    const onEncrypted = (e: Event) => {
      const content = (e as CustomEvent).detail?.content
      if (typeof content === 'string') {
        setPendingEncrypted(content)
        setUnlockPass('')
      }
    }
    window.addEventListener('tct:encrypted-backup-selected', onEncrypted)
    return () => window.removeEventListener('tct:encrypted-backup-selected', onEncrypted)
  }, [refresh])

  const passValid = passphrase.length >= 8 && passphrase === confirm

  const handleChooseFile = async () => {
    const filePath = await api.sync.chooseFile()
    if (!filePath) return
    setConfig(await api.sync.configure({ filePath }))
  }

  const handleSaveSetup = async () => {
    if (!passValid) return
    setBusy(true)
    try {
      setConfig(await api.sync.configure({ passphrase, enabled: true }))
      setPassphrase('')
      setConfirm('')
      const res = await api.sync.syncNow()
      if (res.success) toast.success('Encrypted sync is on', { description: `Saved to ${res.filePath}. Updated each time you quit.` })
      else toast.error('Sync failed', { description: res.error })
      refresh()
    } catch (err: any) {
      toast.error('Could not set up sync', { description: err?.message })
    } finally {
      setBusy(false)
    }
  }

  const handleSyncNow = async () => {
    setBusy(true)
    const res = await api.sync.syncNow()
    setBusy(false)
    if (res.success) toast.success('Sync file updated')
    else toast.error('Sync failed', { description: res.error })
    refresh()
  }

  const handleExportOnce = async () => {
    if (!passValid) {
      toast.error('Enter the same passphrase twice (8+ characters)')
      return
    }
    setBusy(true)
    const res = await api.sync.exportEncrypted(passphrase)
    setBusy(false)
    if (res.success) toast.success('Encrypted backup saved', { description: res.filePath })
    else if (!res.canceled) toast.error('Export failed', { description: res.error })
  }

  const handleLoadSyncFile = async () => {
    const content = await api.sync.readFile()
    if (!content) {
      toast.error('Sync file not found', { description: config?.filePath })
      return
    }
    setPendingEncrypted(content)
    setUnlockPass('')
  }

  const handleUnlockAndImport = async () => {
    if (!pendingEncrypted) return
    setBusy(true)
    try {
      const dec = await api.sync.decrypt(pendingEncrypted, unlockPass)
      if (!dec.success || !dec.content) {
        toast.error(dec.error || 'Wrong passphrase')
        return
      }
      const inspection = await api.backup.inspectJsonString(dec.content)
      if (!inspection.valid) {
        toast.error('The decrypted file is not a valid backup', { description: inspection.error })
        return
      }
      const res = await api.backup.importData({ rawContent: dec.content, mode: 'merge' })
      if (res.success) {
        const list = await api.spaces.list()
        useBrowserStore.getState().setSpaces(list)
        toast.success('Synced data loaded', {
          description: `Merged ${res.importedCounts.spaces} space(s) and ${res.importedCounts.tabs} tab(s).`
        })
        setPendingEncrypted(null)
        setUnlockPass('')
      } else {
        toast.error('Import failed', { description: res.error })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-3">
      <div>
        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <FolderSync className="w-3.5 h-3.5 text-primary" /> Encrypted sync file
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Keeps an encrypted copy of your spaces, tabs, settings and history in a folder you choose. Put it in OneDrive,
          Dropbox or iCloud Drive to use it on another computer. No account or server; without the passphrase the file
          can't be read (AES-256).
        </p>
      </div>

      {pendingEncrypted !== null && (
        <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-2">
          <p className="text-[11.5px] font-semibold text-foreground flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-primary" /> Enter the passphrase to load this encrypted file
          </p>
          <div className="flex items-center gap-2">
            <input
              type="password"
              autoFocus
              value={unlockPass}
              onChange={(e) => setUnlockPass(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && unlockPass && handleUnlockAndImport()}
              placeholder="Passphrase"
              className={`${inputCls} flex-1`}
            />
            <button onClick={handleUnlockAndImport} disabled={busy || !unlockPass} className={primaryBtnCls}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Decrypt & merge
            </button>
            <button onClick={() => setPendingEncrypted(null)} className={btnCls}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 h-8 px-3 rounded-lg bg-background border border-border text-[11px] font-mono text-muted-foreground flex items-center truncate">
          {config?.filePath || 'No sync file chosen'}
        </div>
        <button onClick={handleChooseFile} className={btnCls}>
          Choose…
        </button>
      </div>

      {config?.hasPassphrase && config.filePath ? (
        <div className="space-y-2">
          <label className="flex items-center justify-between text-xs text-foreground">
            <span>Update the sync file automatically when TCT Orbit quits</span>
            <Switch
              checked={config.enabled}
              onCheckedChange={async (v) => setConfig(await api.sync.configure({ enabled: v }))}
            />
          </label>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            {config.lastSyncedAt ? `Last synced ${new Date(config.lastSyncedAt).toLocaleString()}` : 'Not synced yet'}
            <span className="opacity-70">· passphrase stored with your OS keychain</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleSyncNow} disabled={busy} className={primaryBtnCls}>
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> Sync now
            </button>
            <button onClick={handleLoadSyncFile} disabled={busy} className={btnCls}>
              <Upload className="w-3.5 h-3.5" /> Load from sync file
            </button>
            <button
              onClick={async () => setConfig(await api.sync.configure({ passphrase: '', enabled: false }))}
              className={btnCls}
            >
              Change passphrase
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Passphrase (8+ characters)"
              className={inputCls}
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat passphrase"
              className={inputCls}
            />
          </div>
          {passphrase && confirm && passphrase !== confirm && <p className="text-[11px] text-destructive">Passphrases don't match.</p>}
          <div className="flex flex-wrap gap-2">
            <button onClick={handleSaveSetup} disabled={busy || !passValid || !config?.filePath} className={primaryBtnCls}>
              <Lock className="w-3.5 h-3.5" /> Turn on sync
            </button>
            <button onClick={handleExportOnce} disabled={busy || !passValid} className={btnCls}>
              <Download className="w-3.5 h-3.5" /> Export encrypted copy once…
            </button>
            {config?.filePath && (
              <button onClick={handleLoadSyncFile} disabled={busy} className={btnCls}>
                <Upload className="w-3.5 h-3.5" /> Load existing sync file
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">If you forget the passphrase, the file can't be recovered.</p>
        </div>
      )}
    </div>
  )
}
