import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { localStorageService } from '../storage/localStorage'
import { privacyEngine } from '../privacy/privacyEngine'
import type { UpdateState } from '../../src/types/essentials'

/**
 * Auto-update from the project's GitHub Releases (see "publish" in electron-builder.yml).
 * Downloads are checked against the SHA-512 in the release's latest.yml before they run.
 * The Microsoft Store updates its own package; dev and portable builds can't update themselves.
 */

const FIRST_CHECK_MS = 30_000
const CHECK_EVERY_MS = 6 * 3600_000

function unsupportedReason(): string | null {
  if (!app.isPackaged) return 'Development build'
  if (process.windowsStore) return 'The Microsoft Store keeps this app up to date'
  if (process.env.PORTABLE_EXECUTABLE_DIR) return 'The portable version does not update itself'
  if (process.platform === 'linux' && !process.env.APPIMAGE) return 'Update through your package manager'
  return null
}

class UpdateService {
  private state: UpdateState = { phase: 'idle' }
  private readonly blocked = unsupportedReason()
  /** Asks about unsaved pages before restarting */
  public confirmQuit: () => Promise<boolean> = async () => true

  public init(): void {
    if (this.blocked) {
      this.state = { phase: 'unsupported', reason: this.blocked }
      return
    }
    autoUpdater.logger = null
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowDowngrade = false
    autoUpdater.on('checking-for-update', () => this.set({ phase: 'checking' }))
    autoUpdater.on('update-not-available', () => this.set({ phase: 'none', checkedAt: Date.now() }))
    autoUpdater.on('update-available', (i) => this.set({ phase: 'available', version: i.version }))
    autoUpdater.on('download-progress', (p) => this.set({ phase: 'downloading', version: this.state.version, percent: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', (i) => this.set({ phase: 'ready', version: i.version }))
    autoUpdater.on('error', (err) => {
      console.warn('[Updater]', err?.message)
      this.set({ phase: 'error', error: this.describe(err), checkedAt: Date.now() })
    })
    setTimeout(() => void this.autoCheck(), FIRST_CHECK_MS)
    setInterval(() => void this.autoCheck(), CHECK_EVERY_MS)
  }

  private describe(err: Error | undefined): string {
    const msg = err?.message || ''
    if (/404|latest.*\.yml/i.test(msg)) return 'No published update information was found.'
    if (/net::|ENOTFOUND|ECONN|ETIMEDOUT/i.test(msg)) return 'Could not reach the update server.'
    if (/code signature|not signed|signed/i.test(msg)) return 'The update is not signed, so it was not installed.'
    return 'The update check failed.'
  }

  private set(next: UpdateState): void {
    this.state = next
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('updates:state', next)
    }
  }

  private async autoCheck(): Promise<void> {
    if (localStorageService.getSettings().autoUpdate === false) return
    await this.check()
  }

  public getState(): UpdateState {
    return this.state
  }

  public async check(): Promise<UpdateState> {
    if (this.blocked || ['checking', 'available', 'downloading', 'ready'].includes(this.state.phase)) return this.state
    try {
      // Updates go through the same proxy as the browser (Tor users must not expose their address)
      await autoUpdater.netSession.setProxy(privacyEngine.getProxyConfig())
      await autoUpdater.checkForUpdates()
    } catch {
      // Reported through the 'error' event
    }
    return this.state
  }

  /** Restart into the downloaded update */
  public async install(): Promise<boolean> {
    if (this.state.phase !== 'ready' || !(await this.confirmQuit())) return false
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
    return true
  }
}

export const updateService = new UpdateService()
