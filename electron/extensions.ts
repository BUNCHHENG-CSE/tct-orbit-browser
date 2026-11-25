import { app, dialog, session, webContents, BrowserWindow, type Session } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { PRIVATE_PARTITION } from './privacy/types'
import { SHARED_TAB_PARTITION, getProfileSessions, onTabSessionCreated } from './sessions'
import {
  parseStoreInput,
  downloadPackage,
  crxToZip,
  unzipTo,
  readManifestSummary,
  type ExtensionStore
} from './extensionStore'
import type { BrowserExtensionInfo, ExtensionInstallPreview } from '../src/types/api'
import { BUILTIN_EXTENSIONS, builtinSourceDir, readVersion, applyActionShim, hasActionShim, ACTION_PAGE } from './builtinExtensions'

/**
 * Chrome extensions (unpacked). Electron implements a subset of the Chrome extension APIs:
 * content scripts and most background logic work; toolbar popups and many chrome.* APIs don't.
 *
 * Each added extension is copied into <userData>/Extensions/<folder> so it keeps working if the
 * original folder is moved, and loaded into every normal tab session (shared + space profiles).
 * Private tabs only get extensions the user explicitly allowed there.
 */

interface StoredExtension {
  folder: string
  enabled: boolean
  allowInPrivate: boolean
  addedAt: string
  /** Where it was installed from (store installs can be updated by installing again) */
  source?: { store: ExtensionStore; id: string }
  /** Key of the built-in extension this is (ships with the browser) */
  builtin?: string
}

interface StagedInstall {
  dir: string
  folderBase: string
  source?: { store: ExtensionStore; id: string }
  createdAt: number
}

type InstallResult = { ok: boolean; error?: string; extension?: BrowserExtensionInfo; updated?: boolean }

const MAX_EXTENSION_BYTES = 200 * 1024 * 1024
const SAFE_FOLDER = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/

/** File name -> safe folder name (no leading dot: ".staging" is ours and is wiped at startup) */
const folderNameFrom = (name: string): string =>
  name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 60) || 'extension'

class ExtensionManager {
  private stored: StoredExtension[] = []
  private dir = ''
  private file = ''
  /** Built-ins the user removed: never reinstalled until they restore them */
  private removedBuiltins = new Set<string>()
  private get builtinsFile(): string {
    return path.join(this.dir, 'builtins.json')
  }
  /** folder -> loaded extension id per session */
  private loaded = new Map<string, { id: string; name: string; version: string; description: string }>()
  /** Downloaded + unpacked, waiting for the user to confirm */
  private staged = new Map<string, StagedInstall>()

  private get stagingDir(): string {
    return path.join(this.dir, '.staging')
  }

  public async init(): Promise<void> {
    this.dir = path.join(app.getPath('userData'), 'Extensions')
    this.file = path.join(this.dir, 'extensions.json')
    try {
      fs.mkdirSync(this.dir, { recursive: true })
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'))
        // Plain folder names only: entries are joined to this directory and deleted on removal
        if (Array.isArray(raw)) this.stored = raw.filter((e) => e && typeof e.folder === 'string' && SAFE_FOLDER.test(e.folder))
      }
    } catch (err) {
      console.warn('[Extensions] Could not read extension list:', err)
    }

    try {
      const raw = JSON.parse(fs.readFileSync(this.builtinsFile, 'utf8'))
      if (Array.isArray(raw?.removed)) this.removedBuiltins = new Set(raw.removed.filter((k: unknown) => typeof k === 'string'))
    } catch {}
    this.syncBuiltins()

    // Leftovers from installs that were never confirmed
    try {
      fs.rmSync(this.stagingDir, { recursive: true, force: true })
    } catch {}

    for (const ext of this.stored) if (ext.enabled) await this.loadEverywhere(ext)
    // Space profiles created later get the enabled extensions too
    onTabSessionCreated((ses) => {
      for (const ext of this.stored) if (ext.enabled) void this.loadInto(ses, ext)
    })
  }

  /** Install missing built-ins and update ones whose bundled version changed */
  private syncBuiltins(): StoredExtension[] {
    const added: StoredExtension[] = []
    for (const b of BUILTIN_EXTENSIONS) {
      if (this.removedBuiltins.has(b.key)) continue
      const src = builtinSourceDir(b)
      if (!src) {
        console.warn(`[Extensions] Built-in "${b.key}" is missing from the app resources`)
        continue
      }
      const existing = this.stored.find((e) => e.builtin === b.key)
      const folder = existing?.folder ?? `builtin-${b.key}`
      const target = path.join(this.dir, folder)
      const needsCopy = !existing || !fs.existsSync(target) || readVersion(target) !== readVersion(src) || !hasActionShim(target)
      if (needsCopy) {
        try {
          fs.rmSync(target, { recursive: true, force: true })
          fs.cpSync(src, target, { recursive: true, dereference: true })
          applyActionShim(target)
        } catch (err) {
          console.warn(`[Extensions] Could not install built-in "${b.key}":`, err)
          continue
        }
      }
      if (!existing) {
        const ext: StoredExtension = { folder, enabled: true, allowInPrivate: false, addedAt: new Date().toISOString(), builtin: b.key }
        this.stored.unshift(ext)
        added.push(ext)
      }
    }
    if (added.length) this.save()
    return added
  }

  private saveBuiltins(): void {
    try {
      fs.writeFileSync(this.builtinsFile, JSON.stringify({ removed: [...this.removedBuiltins] }, null, 2), 'utf8')
    } catch (err) {
      console.error('[Extensions] Could not save built-in state:', err)
    }
  }

  /** Reinstall built-in extensions the user removed */
  public async restoreBuiltins(): Promise<BrowserExtensionInfo[]> {
    this.removedBuiltins.clear()
    this.saveBuiltins()
    for (const ext of this.syncBuiltins()) {
      await this.loadEverywhere(ext)
      for (const ses of this.profileSessions()) await this.loadInto(ses, ext)
    }
    return this.list()
  }

  /** Built-ins that were removed and can be restored */
  public removedBuiltinCount(): number {
    return BUILTIN_EXTENSIONS.filter((b) => this.removedBuiltins.has(b.key) && builtinSourceDir(b)).length
  }

  /**
   * Toolbar click for an extension without a popup: open its helper page in the tab's session,
   * which tells the service-worker shim to fire chrome.action.onClicked for that tab.
   */
  public async click(id: string, tabWebContentsId: number): Promise<{ ok: boolean; error?: string }> {
    const ext = this.stored.find((e) => e.folder === id)
    const live = this.loaded.get(id)
    if (!ext || !ext.enabled || !live) return { ok: false, error: 'Extension is not running' }
    if (!hasActionShim(path.join(this.dir, ext.folder))) return { ok: false, error: 'unsupported' }
    const wc = webContents.fromId(tabWebContentsId)
    if (!wc || wc.isDestroyed()) return { ok: false, error: 'No active tab' }
    const ses = wc.session
    if (!ses.extensions.getExtension(live.id)) return { ok: false, error: 'Extension is not available in this tab' }

    const tab = { id: wc.id, url: wc.getURL(), title: wc.getTitle(), windowId: -1, active: true }
    const helper = new BrowserWindow({
      show: false,
      width: 1,
      height: 1,
      webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    const kill = setTimeout(() => {
      if (!helper.isDestroyed()) helper.destroy()
    }, 8000)
    helper.on('closed', () => clearTimeout(kill))
    try {
      await helper.loadURL(`chrome-extension://${live.id}/${ACTION_PAGE}#${encodeURIComponent(JSON.stringify(tab))}`)
      return { ok: true }
    } catch (err: any) {
      if (!helper.isDestroyed()) helper.destroy()
      return { ok: false, error: err?.message || 'Could not open the extension' }
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.stored, null, 2), 'utf8')
    } catch (err) {
      console.error('[Extensions] Could not save extension list:', err)
    }
  }

  private sessionsFor(ext: StoredExtension): Session[] {
    const list = [session.fromPartition(SHARED_TAB_PARTITION)]
    if (ext.allowInPrivate) list.push(session.fromPartition(PRIVATE_PARTITION))
    return list
  }

  private async loadInto(ses: Session, ext: StoredExtension): Promise<void> {
    try {
      const loaded = await ses.extensions.loadExtension(path.join(this.dir, ext.folder), { allowFileAccess: false })
      this.loaded.set(ext.folder, {
        id: loaded.id,
        name: loaded.name,
        version: loaded.version,
        description: (loaded.manifest?.description as string) || ''
      })
    } catch (err) {
      console.warn(`[Extensions] Failed to load ${ext.folder}:`, err)
    }
  }

  private async loadEverywhere(ext: StoredExtension): Promise<void> {
    for (const ses of this.sessionsFor(ext)) await this.loadInto(ses, ext)
  }

  private unloadEverywhere(folder: string): void {
    const info = this.loaded.get(folder)
    if (!info) return
    const all = [session.fromPartition(SHARED_TAB_PARTITION), session.fromPartition(PRIVATE_PARTITION), ...getProfileSessions()]
    for (const ses of all) {
      try {
        if (ses.extensions.getExtension(info.id)) ses.extensions.removeExtension(info.id)
      } catch {}
    }
  }

  private readManifest(dir: string) {
    return readManifestSummary(dir)
  }

  public list(): BrowserExtensionInfo[] {
    return this.stored.map((ext) => {
      const live = this.loaded.get(ext.folder)
      const manifest = this.readManifest(path.join(this.dir, ext.folder))
      return {
        id: ext.folder,
        name: live?.name || manifest?.name || ext.folder,
        version: live?.version || manifest?.version || '',
        description: live?.description || manifest?.description || '',
        enabled: ext.enabled,
        allowInPrivate: ext.allowInPrivate,
        loaded: ext.enabled && !!live,
        icon: manifest?.icon,
        store: ext.builtin ? 'builtin' : ext.source?.store,
        builtin: !!ext.builtin,
        hasAction: !!manifest?.hasAction && (!!manifest?.popup || hasActionShim(path.join(this.dir, ext.folder))),
        popupUrl: live && manifest?.popup ? `chrome-extension://${live.id}/${manifest.popup}` : undefined,
        optionsUrl: live && manifest?.options ? `chrome-extension://${live.id}/${manifest.options}` : undefined
      }
    })
  }

  private dirSize(dir: string): number {
    let total = 0
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) continue
      total += entry.isDirectory() ? this.dirSize(p) : fs.statSync(p).size
      if (total > MAX_EXTENSION_BYTES) return total
    }
    return total
  }

  /** Pick an unpacked extension folder (with manifest.json), copy it in and load it */
  public async addUnpacked(win: BrowserWindow | null): Promise<{ ok: boolean; error?: string; extension?: BrowserExtensionInfo }> {
    const res = await dialog.showOpenDialog(win || (undefined as any), {
      title: 'Select an unpacked extension folder (contains manifest.json)',
      properties: ['openDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return { ok: false }
    const source = res.filePaths[0]
    const manifest = this.readManifest(source)
    if (!manifest) return { ok: false, error: 'That folder has no valid manifest.json' }
    if (this.dirSize(source) > MAX_EXTENSION_BYTES) return { ok: false, error: 'Extension folder is too large' }

    const base = folderNameFrom(path.basename(source))
    let folder = base
    for (let i = 2; fs.existsSync(path.join(this.dir, folder)); i++) folder = `${base}-${i}`
    try {
      fs.cpSync(source, path.join(this.dir, folder), { recursive: true, dereference: false, verbatimSymlinks: true })
    } catch (err: any) {
      return { ok: false, error: `Could not copy extension: ${err?.message || err}` }
    }

    const ext: StoredExtension = { folder, enabled: true, allowInPrivate: false, addedAt: new Date().toISOString() }
    this.stored.push(ext)
    this.save()
    await this.loadEverywhere(ext)
    for (const ses of this.profileSessions()) await this.loadInto(ses, ext)
    if (!this.loaded.has(folder)) {
      return { ok: true, error: 'Added, but this extension uses features TCT Orbit does not support yet', extension: this.list().find((e) => e.id === folder) }
    }
    return { ok: true, extension: this.list().find((e) => e.id === folder) }
  }

  // --- Store / package installs: prepare (download + unpack) -> user confirms -> commit ---

  private async stageFromZip(zip: Buffer, folderBase: string, source?: StagedInstall['source']): Promise<ExtensionInstallPreview> {
    const token = crypto.randomBytes(16).toString('hex')
    const dir = path.join(this.stagingDir, token)
    try {
      unzipTo(zip, dir)
      const summary = readManifestSummary(dir)
      if (!summary) throw new Error('The package has no valid manifest.json')
      this.staged.set(token, { dir, folderBase, source, createdAt: Date.now() })
      const existing = source && this.stored.find((e) => e.source?.store === source.store && e.source.id === source.id)
      return {
        token,
        name: summary.name,
        version: summary.version,
        description: summary.description,
        permissions: summary.permissions,
        icon: summary.icon,
        store: source?.store ?? 'file',
        manifestVersion: summary.manifestVersion,
        isUpdate: !!existing
      }
    } catch (err) {
      fs.rmSync(dir, { recursive: true, force: true })
      throw err
    }
  }

  /** Download from the Chrome Web Store / Edge Add-ons / Opera add-ons and unpack for review */
  public async prepareFromStore(input: string): Promise<{ ok: true; preview: ExtensionInstallPreview } | { ok: false; error: string }> {
    const target = parseStoreInput(input)
    if ('error' in target) return { ok: false, error: target.error }
    try {
      const pkg = await downloadPackage(target.downloadUrl)
      // Chrome / Edge packages must carry the signature of the extension that was asked for
      const signedId = target.store === 'chrome' || target.store === 'edge' ? target.id : undefined
      const preview = await this.stageFromZip(crxToZip(pkg, signedId), `${target.store}-${target.id}`.slice(0, 60), {
        store: target.store,
        id: target.id
      })
      return { ok: true, preview }
    } catch (err: any) {
      console.warn('[Extensions] Store download failed:', err)
      return { ok: false, error: err?.message || 'Download failed' }
    }
  }

  /** Pick a .crx or .zip file and unpack it for review */
  public async prepareFromFile(win: BrowserWindow | null): Promise<{ ok: true; preview: ExtensionInstallPreview } | { ok: false; error?: string }> {
    const res = await dialog.showOpenDialog(win || (undefined as any), {
      title: 'Choose an extension package',
      filters: [{ name: 'Extension package (*.crx, *.zip)', extensions: ['crx', 'zip'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths[0]) return { ok: false }
    try {
      const file = res.filePaths[0]
      if (fs.statSync(file).size > MAX_EXTENSION_BYTES) return { ok: false, error: 'File is too large' }
      const base = folderNameFrom(path.basename(file, path.extname(file)))
      const preview = await this.stageFromZip(crxToZip(fs.readFileSync(file)), base)
      return { ok: true, preview }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Could not read the package' }
    }
  }

  public cancelInstall(token: string): boolean {
    const staged = this.staged.get(token)
    if (!staged) return false
    this.staged.delete(token)
    fs.rmSync(staged.dir, { recursive: true, force: true })
    return true
  }

  /** User confirmed: move the unpacked extension in place and load it (replacing an older version) */
  public async commitInstall(token: string): Promise<InstallResult> {
    const staged = this.staged.get(token)
    if (!staged) return { ok: false, error: 'This install expired. Try again.' }
    this.staged.delete(token)

    // Installing the same store extension again = update it
    const previous = staged.source && this.stored.find((e) => e.source?.store === staged.source!.store && e.source.id === staged.source!.id)
    if (previous) this.remove(previous.folder)

    const base = folderNameFrom(staged.folderBase)
    let folder = base
    for (let i = 2; fs.existsSync(path.join(this.dir, folder)); i++) folder = `${base}-${i}`
    try {
      fs.renameSync(staged.dir, path.join(this.dir, folder))
    } catch (err: any) {
      fs.rmSync(staged.dir, { recursive: true, force: true })
      return { ok: false, error: `Could not install: ${err?.message || err}` }
    }

    const ext: StoredExtension = {
      folder,
      enabled: true,
      allowInPrivate: previous?.allowInPrivate ?? false,
      addedAt: new Date().toISOString(),
      source: staged.source
    }
    this.stored.push(ext)
    this.save()
    await this.loadEverywhere(ext)
    for (const ses of this.profileSessions()) await this.loadInto(ses, ext)
    const extension = this.list().find((e) => e.id === folder)
    if (!this.loaded.has(folder)) {
      return { ok: true, updated: !!previous, extension, error: 'Installed, but it uses features TCT Orbit does not support yet' }
    }
    return { ok: true, updated: !!previous, extension }
  }

  private profileSessions(): Session[] {
    return getProfileSessions()
  }

  public async setEnabled(id: string, enabled: boolean): Promise<BrowserExtensionInfo[]> {
    const ext = this.stored.find((e) => e.folder === id)
    if (!ext) return this.list()
    ext.enabled = enabled
    this.save()
    if (enabled) {
      await this.loadEverywhere(ext)
      for (const ses of this.profileSessions()) await this.loadInto(ses, ext)
    } else {
      this.unloadEverywhere(id)
      this.loaded.delete(id)
    }
    return this.list()
  }

  public async setAllowInPrivate(id: string, allow: boolean): Promise<BrowserExtensionInfo[]> {
    const ext = this.stored.find((e) => e.folder === id)
    if (!ext) return this.list()
    ext.allowInPrivate = allow
    this.save()
    const info = this.loaded.get(id)
    const priv = session.fromPartition(PRIVATE_PARTITION)
    if (allow && ext.enabled) await this.loadInto(priv, ext)
    if (!allow && info) {
      try {
        if (priv.extensions.getExtension(info.id)) priv.extensions.removeExtension(info.id)
      } catch {}
    }
    return this.list()
  }

  public remove(id: string): BrowserExtensionInfo[] {
    const ext = this.stored.find((e) => e.folder === id)
    if (!ext) return this.list()
    this.unloadEverywhere(id)
    this.loaded.delete(id)
    this.stored = this.stored.filter((e) => e.folder !== id)
    this.save()
    if (ext.builtin) {
      this.removedBuiltins.add(ext.builtin)
      this.saveBuiltins()
    }
    try {
      fs.rmSync(path.join(this.dir, id), { recursive: true, force: true })
    } catch {}
    return this.list()
  }

  public openFolder(): string {
    return this.dir
  }
}

export const extensionManager = new ExtensionManager()
