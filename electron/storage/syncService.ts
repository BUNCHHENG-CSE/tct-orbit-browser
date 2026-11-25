import { app, dialog, type BrowserWindow } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { safeStorageVault } from '../security'
import { backupService } from './backupService'
import type { BackupCategory } from '../../src/types/api'

/**
 * Encrypted sync file: the whole profile (spaces, tabs, settings, privacy, history) encrypted
 * with a passphrase (scrypt + AES-256-GCM). Put it in a cloud-synced folder (OneDrive, Dropbox,
 * iCloud) and load it on another computer. No server involved.
 */

export const ENCRYPTED_FORMAT = 'tct-orbit-encrypted'
const SYNC_CATEGORIES: BackupCategory[] = ['settings', 'spaces', 'tabs', 'privacy', 'history', 'bookmarks', 'notes']
// scrypt cost (OWASP minimum, 128 MB): the file lives in cloud storage, so it must resist offline
// guessing. The cost is stored in the file; older files (N = 2^15) still open.
const SCRYPT_PARAMS = { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }

interface EncryptedEnvelope {
  format: typeof ENCRYPTED_FORMAT
  version: 1
  kdf: 'scrypt'
  N: number
  r: number
  p: number
  salt: string
  iv: string
  tag: string
  data: string
  createdAt: string
}

export interface SyncConfig {
  enabled: boolean
  filePath: string
  hasPassphrase: boolean
  lastSyncedAt?: string
}

export function encryptText(plaintext: string, passphrase: string): string {
  if (!passphrase || passphrase.length < 8) throw new Error('Passphrase must be at least 8 characters')
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = crypto.scryptSync(passphrase, salt, 32, SCRYPT_PARAMS)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const envelope: EncryptedEnvelope = {
    format: ENCRYPTED_FORMAT,
    version: 1,
    kdf: 'scrypt',
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
    createdAt: new Date().toISOString()
  }
  return JSON.stringify(envelope)
}

export function isEncryptedContent(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw)
    return parsed && parsed.format === ENCRYPTED_FORMAT
  } catch {
    return false
  }
}

export function decryptText(raw: string, passphrase: string): string {
  let env: EncryptedEnvelope
  try {
    env = JSON.parse(raw)
  } catch {
    throw new Error('Not an encrypted TCT Orbit file')
  }
  if (env?.format !== ENCRYPTED_FORMAT || env.kdf !== 'scrypt') throw new Error('Not an encrypted TCT Orbit file')
  // Refuse absurd KDF parameters from a tampered file (memory exhaustion)
  if (!(env.N >= 1024 && env.N <= 1 << 20 && env.r >= 1 && env.r <= 16 && env.p >= 1 && env.p <= 4)) {
    throw new Error('Unsupported encryption parameters')
  }
  try {
    const key = crypto.scryptSync(passphrase, Buffer.from(env.salt, 'base64'), 32, {
      N: env.N,
      r: env.r,
      p: env.p,
      maxmem: 256 * 1024 * 1024
    })
    const tag = Buffer.from(env.tag, 'base64')
    // Full-length tag only: GCM accepts shortened tags, which are far easier to forge
    if (tag.length !== 16) throw new Error('Bad tag')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'), { authTagLength: 16 })
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(Buffer.from(env.data, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    // GCM auth failure: wrong passphrase or modified file
    throw new Error('Wrong passphrase, or the file was modified')
  }
}

class SyncService {
  private configPath = ''
  private chosenPath: string | null = null
  private config: { enabled: boolean; filePath: string; passphrase: string; lastSyncedAt?: string } = {
    enabled: false,
    filePath: '',
    passphrase: ''
  }

  public init(): void {
    this.configPath = path.join(app.getPath('userData'), 'sync-config.json')
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = JSON.parse(fs.readFileSync(this.configPath, 'utf8'))
        this.config = {
          enabled: !!raw.enabled,
          filePath: typeof raw.filePath === 'string' ? raw.filePath : '',
          passphrase: typeof raw.passphrase === 'string' ? raw.passphrase : '',
          lastSyncedAt: typeof raw.lastSyncedAt === 'string' ? raw.lastSyncedAt : undefined
        }
      }
    } catch (err) {
      console.warn('[Sync] Could not load sync config:', err)
    }
  }

  private persist(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config), 'utf8')
    } catch (err) {
      console.warn('[Sync] Could not save sync config:', err)
    }
  }

  public getConfig(): SyncConfig {
    return {
      enabled: this.config.enabled,
      filePath: this.config.filePath,
      hasPassphrase: !!this.config.passphrase,
      lastSyncedAt: this.config.lastSyncedAt
    }
  }

  /** Configure auto-sync. Passphrase is stored encrypted with the OS keychain (safeStorage). */
  public configure(opts: { enabled?: boolean; filePath?: string; passphrase?: string }): SyncConfig {
    // Only a location picked in the system dialog: this file is overwritten on every quit
    if (opts.filePath !== undefined && (opts.filePath === '' || opts.filePath === this.chosenPath)) this.config.filePath = opts.filePath
    if (opts.passphrase !== undefined) {
      if (opts.passphrase && opts.passphrase.length < 8) throw new Error('Passphrase must be at least 8 characters')
      if (opts.passphrase && !safeStorageVault.isAvailable()) {
        throw new Error('This system has no secure storage (keyring), so the passphrase cannot be remembered safely')
      }
      this.config.passphrase = opts.passphrase ? safeStorageVault.encryptString(opts.passphrase) : ''
    }
    if (opts.enabled !== undefined) this.config.enabled = opts.enabled
    if (this.config.enabled && (!this.config.filePath || !this.config.passphrase)) {
      this.config.enabled = false
    }
    this.persist()
    return this.getConfig()
  }

  public async chooseSyncFile(win?: BrowserWindow | null): Promise<string | null> {
    const res = await dialog.showSaveDialog(win || (undefined as any), {
      title: 'Choose where to keep your encrypted sync file',
      defaultPath: this.config.filePath || path.join(app.getPath('documents'), 'tct-orbit.orbitsync'),
      filters: [{ name: 'TCT Orbit encrypted sync (*.orbitsync)', extensions: ['orbitsync'] }]
    })
    if (res.canceled || !res.filePath) return null
    this.chosenPath = res.filePath
    return res.filePath
  }

  private buildEncrypted(passphrase: string): string {
    const { backupFile } = backupService.buildBackupFile({ categories: SYNC_CATEGORIES })
    return encryptText(JSON.stringify(backupFile), passphrase)
  }

  /** Write the configured sync file now */
  public syncNow(): { success: boolean; error?: string; filePath?: string } {
    if (!this.config.filePath || !this.config.passphrase) return { success: false, error: 'Sync is not set up' }
    try {
      const passphrase = safeStorageVault.decryptString(this.config.passphrase)
      const content = this.buildEncrypted(passphrase)
      const dir = path.dirname(this.config.filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const tmp = `${this.config.filePath}.tmp`
      fs.writeFileSync(tmp, content, 'utf8')
      fs.renameSync(tmp, this.config.filePath)
      this.config.lastSyncedAt = new Date().toISOString()
      this.persist()
      return { success: true, filePath: this.config.filePath }
    } catch (err: any) {
      console.error('[Sync] Sync failed:', err)
      return { success: false, error: err?.message || 'Sync failed' }
    }
  }

  /** One-off encrypted export to a file the user picks */
  public async exportEncrypted(passphrase: string, win?: BrowserWindow | null): Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }> {
    try {
      const content = this.buildEncrypted(passphrase)
      const res = await dialog.showSaveDialog(win || (undefined as any), {
        title: 'Export encrypted TCT Orbit backup',
        defaultPath: path.join(app.getPath('downloads'), `tct-orbit-${new Date().toISOString().slice(0, 10)}.orbitsync`),
        filters: [{ name: 'TCT Orbit encrypted backup (*.orbitsync)', extensions: ['orbitsync'] }]
      })
      if (res.canceled || !res.filePath) return { success: false, canceled: true }
      fs.writeFileSync(res.filePath, content, 'utf8')
      return { success: true, filePath: res.filePath }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Export failed' }
    }
  }

  /** Read the configured sync file (encrypted) for import on this computer */
  public readSyncFile(): string | null {
    if (!this.config.filePath || !fs.existsSync(this.config.filePath)) return null
    return fs.readFileSync(this.config.filePath, 'utf8')
  }

  /** Called on quit: keep the sync file current */
  public syncOnExit(): void {
    if (!this.config.enabled) return
    const res = this.syncNow()
    if (res.success) console.log('[Sync] Encrypted sync file updated on exit')
  }
}

export const syncService = new SyncService()
