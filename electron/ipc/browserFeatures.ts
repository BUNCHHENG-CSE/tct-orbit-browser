import { app, shell, type IpcMain, type BrowserWindow } from 'electron'
import { z } from 'zod'
import { secureHandle } from '../security'
import { getDefaultBrowserStatus, setAsDefaultBrowser } from '../defaultBrowser'
import { extensionManager } from '../extensions'
import { takePendingLaunchUrls } from '../launchUrls'
import { fetchSearchSuggestions } from '../searchSuggest'
import { passwordManager } from '../passwords'

const S = {
  extId: z.string().min(1).max(120),
  storeInput: z.string().min(1).max(4096),
  token: z.string().min(1).max(64),
  extClick: z.tuple([z.string().min(1).max(120), z.number().int().nonnegative()]),
  extToggle: z.tuple([z.string().min(1).max(120), z.boolean()]),
  pwId: z.string().min(1).max(64),
  pwRespond: z.tuple([z.string().min(1).max(64), z.enum(['save', 'never', 'dismiss']), z.string().max(300).optional()]),
  pwUpdate: z.tuple([z.string().min(1).max(64), z.object({ username: z.string().max(300).optional(), password: z.string().max(1000).optional() })]),
  bool: z.boolean(),
  origin: z.string().min(1).max(2048),
  suggest: z.tuple([z.string().min(1).max(200), z.enum(['duckduckgo', 'google', 'bing'])])
}

/** Default browser, Chrome extensions, About info, URLs the app was launched with */
export function register(ipcMain: IpcMain, getMainWindow: () => BrowserWindow | null): void {
  secureHandle(ipcMain, 'default-browser:status', null, async () => getDefaultBrowserStatus())
  secureHandle(ipcMain, 'default-browser:set', null, async () => setAsDefaultBrowser())

  secureHandle(ipcMain, 'extensions:list', null, async () => extensionManager.list())
  secureHandle(ipcMain, 'extensions:add-unpacked', null, async () => extensionManager.addUnpacked(getMainWindow()))
  secureHandle(ipcMain, 'extensions:set-enabled', S.extToggle, async (_, id: string, enabled: boolean) =>
    extensionManager.setEnabled(id, enabled)
  )
  secureHandle(ipcMain, 'extensions:set-private', S.extToggle, async (_, id: string, allow: boolean) =>
    extensionManager.setAllowInPrivate(id, allow)
  )
  secureHandle(ipcMain, 'extensions:prepare-store', S.storeInput, async (_, input: string) =>
    extensionManager.prepareFromStore(input)
  )
  secureHandle(ipcMain, 'extensions:prepare-file', null, async () => extensionManager.prepareFromFile(getMainWindow()))
  secureHandle(ipcMain, 'extensions:commit', S.token, async (_, token: string) => extensionManager.commitInstall(token))
  secureHandle(ipcMain, 'extensions:cancel', S.token, async (_, token: string) => extensionManager.cancelInstall(token))
  secureHandle(ipcMain, 'extensions:remove', S.extId, async (_, id: string) => extensionManager.remove(id))
  secureHandle(ipcMain, 'extensions:click', S.extClick, async (_, id: string, wcId: number) => extensionManager.click(id, wcId))
  secureHandle(ipcMain, 'extensions:restore-builtins', null, async () => extensionManager.restoreBuiltins())
  secureHandle(ipcMain, 'extensions:removed-builtins', null, async () => extensionManager.removedBuiltinCount())
  secureHandle(ipcMain, 'extensions:open-folder', null, async () => {
    await shell.openPath(extensionManager.openFolder())
    return true
  })

  secureHandle(ipcMain, 'app:about', null, async () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    platform: `${process.platform} ${process.arch}`
  }))

  secureHandle(ipcMain, 'search:suggest', S.suggest, async (_, query: string, engine: string) =>
    fetchSearchSuggestions(query, engine)
  )

  // Password manager
  secureHandle(ipcMain, 'passwords:list', null, async () => passwordManager.list())
  secureHandle(ipcMain, 'passwords:reveal', S.pwId, async (_, id: string) => passwordManager.reveal(id))
  secureHandle(ipcMain, 'passwords:update', S.pwUpdate, async (_, id: string, data: { username?: string; password?: string }) =>
    passwordManager.update(id, data)
  )
  secureHandle(ipcMain, 'passwords:remove', S.pwId, async (_, id: string) => passwordManager.remove(id))
  secureHandle(ipcMain, 'passwords:respond', S.pwRespond, async (_, token: string, action: 'save' | 'never' | 'dismiss', username?: string) =>
    passwordManager.respond(token, action, username)
  )
  secureHandle(ipcMain, 'passwords:settings', null, async () => passwordManager.getSettings())
  secureHandle(ipcMain, 'passwords:set-offer', S.bool, async (_, enabled: boolean) => passwordManager.setOfferToSave(enabled))
  secureHandle(ipcMain, 'passwords:remove-never', S.origin, async (_, origin: string) => passwordManager.removeNeverSave(origin))

  secureHandle(ipcMain, 'app:take-pending-urls', null, async () => takePendingLaunchUrls())
}
