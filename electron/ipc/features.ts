import { webContents, type IpcMain, type BrowserWindow } from 'electron'
import { z } from 'zod'
import { secureHandle } from '../security'
import { sitePermissions, PROMPTABLE_PERMISSIONS, type PromptablePermission } from '../permissions/sitePermissions'
import { localStorageService } from '../storage/localStorage'
import { privacyEngine } from '../privacy/privacyEngine'
import { syncService, decryptText } from '../storage/syncService'
import { detectSources, runImport, importBookmarksHtmlFile } from '../storage/browserImport'

const S = {
  permissionRespond: z.object({ id: z.string().min(1).max(100), allow: z.boolean(), remember: z.boolean() }),
  sitePermissionSet: z.object({
    origin: z.string().min(1).max(2048),
    permission: z.enum(PROMPTABLE_PERMISSIONS as [PromptablePermission, ...PromptablePermission[]]),
    decision: z.enum(['allow', 'block']).nullable()
  }),
  origin: z.string().min(1).max(2048),
  focusBlock: z.array(z.string().max(253)).max(500).nullable(),
  reportDays: z.number().int().min(1).max(90).optional(),
  syncConfigure: z.object({
    enabled: z.boolean().optional(),
    filePath: z.string().max(4096).optional(),
    passphrase: z.string().max(1024).optional()
  }),
  passphrase: z.string().min(8).max(1024),
  decrypt: z.object({ content: z.string().min(1).max(200 * 1024 * 1024), passphrase: z.string().min(1).max(1024) }),
  webContentsId: z.number().int().positive(),
  importRun: z.object({ sourceId: z.string().min(1).max(4096), bookmarks: z.boolean(), history: z.boolean() })
}

export function register(ipcMain: IpcMain, getMainWindow: () => BrowserWindow | null): void {
  // --- Permission prompts & per-site settings ---
  secureHandle(ipcMain, 'permissions:respond', S.permissionRespond, async (_, data: { id: string; allow: boolean; remember: boolean }) => {
    return sitePermissions.respond(data.id, data.allow, data.remember)
  })

  secureHandle(ipcMain, 'site-settings:list', null, async () => {
    const prefs = privacyEngine.getPrefs()
    return {
      permissions: sitePermissions.listAll(),
      shieldDisabled: prefs.whitelistedOrigins,
      blocked: privacyEngine.getReport(90).topSites
    }
  })

  secureHandle(
    ipcMain,
    'site-settings:set-permission',
    S.sitePermissionSet,
    async (_, data: { origin: string; permission: PromptablePermission; decision: 'allow' | 'block' | null }) => {
      sitePermissions.setDecision(data.origin, data.permission, data.decision)
      return true
    }
  )

  secureHandle(ipcMain, 'site-settings:reset-permissions', S.origin, async (_, origin: string) => {
    sitePermissions.resetOrigin(origin)
    return true
  })

  // --- Session restore ---
  secureHandle(ipcMain, 'session:get-restore-info', null, async () => localStorageService.getSessionRestoreInfo())
  secureHandle(ipcMain, 'session:restore', null, async () => localStorageService.restorePreviousSession())
  secureHandle(ipcMain, 'session:dismiss', null, async () => {
    localStorageService.dismissSessionRestore()
    return true
  })

  // --- Focus Sprint site blocking ---
  secureHandle(ipcMain, 'focus:set-block', S.focusBlock, async (_, domains: string[] | null) => {
    privacyEngine.setFocusBlock(domains)
    return privacyEngine.getFocusBlock()
  })

  // --- Privacy report ---
  secureHandle(ipcMain, 'privacy:get-report', S.reportDays, async (_, days?: number) => privacyEngine.getReport(days || 7))
  secureHandle(ipcMain, 'privacy:reset-report', null, async () => {
    privacyEngine.resetReport()
    return true
  })

  // --- Encrypted sync file ---
  secureHandle(ipcMain, 'sync:get-config', null, async () => syncService.getConfig())
  secureHandle(ipcMain, 'sync:configure', S.syncConfigure, async (_, opts: { enabled?: boolean; filePath?: string; passphrase?: string }) => {
    return syncService.configure(opts)
  })
  secureHandle(ipcMain, 'sync:choose-file', null, async () => syncService.chooseSyncFile(getMainWindow()))
  secureHandle(ipcMain, 'sync:now', null, async () => syncService.syncNow())
  secureHandle(ipcMain, 'sync:read-file', null, async () => syncService.readSyncFile())
  secureHandle(ipcMain, 'sync:export-encrypted', S.passphrase, async (_, passphrase: string) => {
    return syncService.exportEncrypted(passphrase, getMainWindow())
  })
  secureHandle(ipcMain, 'sync:decrypt', S.decrypt, async (_, data: { content: string; passphrase: string }) => {
    try {
      return { success: true, content: decryptText(data.content, data.passphrase) }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Could not decrypt' }
    }
  })

  // --- Tab hover preview thumbnails (small JPEG of a tab's visible page) ---
  secureHandle(ipcMain, 'webview:thumbnail', S.webContentsId, async (_, id: number) => {
    const wc = webContents.fromId(id)
    if (!wc || wc.isDestroyed() || wc.getType() !== 'webview' || wc.isLoading()) return null
    try {
      const image = await wc.capturePage()
      if (image.isEmpty()) return null
      const resized = image.resize({ width: 320, quality: 'good' })
      return `data:image/jpeg;base64,${resized.toJPEG(70).toString('base64')}`
    } catch {
      return null
    }
  })

  // --- Import from other browsers ---
  secureHandle(ipcMain, 'import:detect', null, async () => detectSources())
  secureHandle(ipcMain, 'import:run', S.importRun, async (_, data: { sourceId: string; bookmarks: boolean; history: boolean }) => {
    return runImport(data.sourceId, { bookmarks: data.bookmarks, history: data.history })
  })
  secureHandle(ipcMain, 'import:bookmarks-html', null, async () => importBookmarksHtmlFile(getMainWindow()))
}
