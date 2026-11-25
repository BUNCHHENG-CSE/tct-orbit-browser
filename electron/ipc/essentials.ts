import { BrowserWindow, webContents, type IpcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { secureHandle } from '../security'
import { updateService } from '../essentials/updater'
import { screenShareService } from '../essentials/screenShare'
import { httpAuthService } from '../essentials/httpAuth'
import { confirmCloseTab } from '../essentials/unload'
import { safeBrowsing } from '../essentials/safeBrowsing'
import { addressService } from '../essentials/addresses'
import { pageTools } from '../essentials/pageTools'
import { captureFullPage, captureVisible, copyImage, saveImage } from '../essentials/capture'
import { aiStatus, askPage, cancelAsk } from '../essentials/localAi'
import { deleteImportedFile, exportPasswordsCsv, importPasswordsCsv } from '../essentials/passwordFiles'
import type { AddressInput, AiAskData, HighlightColor } from '../../src/types/essentials'

const id = z.string().min(1).max(100)
const wcId = z.number().int().positive()
const field = z.string().max(200)
const color = z.enum(['yellow', 'green', 'blue', 'pink'])

const S = {
  id,
  wcId,
  path: z.string().min(1).max(4096),
  host: z.string().min(1).max(300),
  optionalUrl: z.string().max(8192).optional(),
  screenRespond: z.tuple([id, z.string().max(200).nullable(), z.boolean()]),
  authRespond: z.tuple([id, z.string().max(300).nullable(), z.string().max(1000)]),
  address: z.object({
    id: id.optional(),
    label: field,
    name: field,
    organization: field,
    street: field,
    street2: field,
    city: field,
    state: field,
    zip: field,
    country: field,
    email: field,
    phone: field
  }),
  route: z.tuple([z.string().min(1).max(300), id]),
  boost: z.object({
    host: z.string().min(1).max(300),
    css: z.string().max(50_000),
    hidden: z.array(z.string().max(500)).max(100),
    enabled: z.boolean()
  }),
  highlight: z.tuple([wcId, color]),
  scroll: z.tuple([wcId, id]),
  image: z.string().startsWith('data:image/png;base64,'),
  saveImage: z.tuple([z.string().startsWith('data:image/png;base64,'), z.string().max(300)]),
  ask: z.object({
    id,
    model: z.string().min(1).max(200),
    question: z.string().min(1).max(4000),
    pageTitle: z.string().max(1000),
    pageUrl: z.string().max(8192),
    pageText: z.string().max(200_000),
    history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(20_000) })).max(40)
  })
}

export function register(ipcMain: IpcMain): void {
  const winOf = (e: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender)
  /** A web page tab (never the UI, an extension page or a helper window) */
  const tab = (contentsId: number) => {
    const wc = webContents.fromId(contentsId)
    return wc && !wc.isDestroyed() && wc.getType() === 'webview' ? wc : null
  }

  secureHandle(ipcMain, 'updates:state', null, () => updateService.getState())
  secureHandle(ipcMain, 'updates:check', null, () => updateService.check())
  secureHandle(ipcMain, 'updates:install', null, () => updateService.install())

  secureHandle(ipcMain, 'pages:confirm-close', S.wcId, async (_, contentsId: number) => {
    const wc = tab(contentsId)
    return wc ? confirmCloseTab(wc) : true
  })

  secureHandle(ipcMain, 'screen-share:respond', S.screenRespond, (e, reqId: string, source: string | null, audio: boolean) =>
    screenShareService.respond(winOf(e), reqId, source, audio)
  )
  secureHandle(ipcMain, 'auth:respond', S.authRespond, (e, reqId: string, user: string | null, pass: string) =>
    httpAuthService.respond(winOf(e), reqId, user, pass)
  )

  secureHandle(ipcMain, 'safe-browsing:status', null, () => safeBrowsing.status())
  secureHandle(ipcMain, 'safe-browsing:refresh', null, async () => {
    await safeBrowsing.refresh()
    return safeBrowsing.status()
  })
  secureHandle(ipcMain, 'safe-browsing:allow', S.host, (_, host: string) => {
    safeBrowsing.allow(host)
    return true
  })

  secureHandle(ipcMain, 'addresses:list', null, () => addressService.list())
  secureHandle(ipcMain, 'addresses:encrypted', null, () => addressService.encrypted)
  secureHandle(ipcMain, 'addresses:save', S.address, (_, data: AddressInput) => addressService.saveProfile(data))
  secureHandle(ipcMain, 'addresses:remove', S.id, (_, profileId: string) => addressService.remove(profileId))

  secureHandle(ipcMain, 'passwords:import-csv', null, (e) => importPasswordsCsv(winOf(e)))
  secureHandle(ipcMain, 'passwords:export-csv', null, (e) => exportPasswordsCsv(winOf(e)))
  secureHandle(ipcMain, 'passwords:delete-imported', S.path, (_, file: string) => deleteImportedFile(file))

  secureHandle(ipcMain, 'routes:list', null, () => pageTools.routes())
  secureHandle(ipcMain, 'routes:save', S.route, (_, pattern: string, spaceId: string) => pageTools.saveRoute(pattern, spaceId))
  secureHandle(ipcMain, 'routes:remove', S.id, (_, routeId: string) => pageTools.removeRoute(routeId))

  secureHandle(ipcMain, 'boosts:list', null, () => pageTools.boosts())
  secureHandle(ipcMain, 'boosts:save', S.boost, (_, data) => pageTools.saveBoost(data))
  secureHandle(ipcMain, 'boosts:remove', S.id, (_, boostId: string) => pageTools.removeBoost(boostId))

  secureHandle(ipcMain, 'highlights:list', S.optionalUrl, (_, url?: string) => pageTools.highlights(url))
  secureHandle(ipcMain, 'highlights:add', S.highlight, (_, contentsId: number, c: HighlightColor) => {
    const wc = tab(contentsId)
    return wc ? pageTools.addHighlight(wc, c) : null
  })
  secureHandle(ipcMain, 'highlights:remove', S.id, (_, hid: string) => pageTools.removeHighlight(hid))
  secureHandle(ipcMain, 'highlights:scroll', S.scroll, (_, contentsId: number, hid: string) => {
    const wc = tab(contentsId)
    return wc ? pageTools.scrollToHighlight(wc, hid) : false
  })

  secureHandle(ipcMain, 'capture:full-page', S.wcId, (_, contentsId: number) => {
    const wc = tab(contentsId)
    return wc ? captureFullPage(wc) : { ok: false, error: 'Open a web page first.' }
  })
  secureHandle(ipcMain, 'capture:visible', S.wcId, (_, contentsId: number) => {
    const wc = tab(contentsId)
    return wc ? captureVisible(wc) : { ok: false, error: 'Open a web page first.' }
  })
  secureHandle(ipcMain, 'capture:copy', S.image, (_, dataUrl: string) => copyImage(dataUrl))
  secureHandle(ipcMain, 'capture:save', S.saveImage, (e, dataUrl: string, name: string) => saveImage(winOf(e), dataUrl, name))

  secureHandle(ipcMain, 'ai:status', null, () => aiStatus())
  secureHandle(ipcMain, 'ai:ask', S.ask, (e, data: AiAskData) => {
    void askPage(e.sender, data)
    return true
  })
  secureHandle(ipcMain, 'ai:cancel', S.id, (_, askId: string) => cancelAsk(askId))
}
