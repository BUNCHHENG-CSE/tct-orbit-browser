import { clipboard, ClipboardItem, dialog, nativeImage, type BrowserWindow, type WebContents } from 'electron'
import fs from 'fs'
import { rememberExportedFile } from '../ipc/downloads'

/** Web capture: what is on screen, or the whole page from top to bottom */

/** Chromium can't draw images taller than this */
const MAX_SIDE = 16_000
const MAX_DATA_URL = 200 * 1024 * 1024

export async function captureVisible(contents: WebContents): Promise<{ ok: boolean; dataUrl?: string; error?: string }> {
  try {
    const img = await contents.capturePage()
    if (img.isEmpty()) return { ok: false, error: 'The page could not be captured.' }
    return { ok: true, dataUrl: img.toDataURL() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Capture failed' }
  }
}

export async function captureFullPage(contents: WebContents): Promise<{ ok: boolean; dataUrl?: string; truncated?: boolean; error?: string }> {
  const dbg = contents.debugger
  const alreadyAttached = dbg.isAttached()
  try {
    if (!alreadyAttached) dbg.attach('1.3')
  } catch {
    return { ok: false, error: 'Close Developer Tools for this tab and try again.' }
  }
  try {
    const m = await dbg.sendCommand('Page.getLayoutMetrics')
    const size = m.cssContentSize ?? m.contentSize
    const width = Math.min(MAX_SIDE, Math.ceil(size.width))
    const height = Math.min(MAX_SIDE, Math.ceil(size.height))
    const shot = dbg.sendCommand('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 }
    })
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('The page took too long to capture.')), 30_000))
    const { data } = await Promise.race([shot, timeout])
    return { ok: true, dataUrl: `data:image/png;base64,${data}`, truncated: size.height > MAX_SIDE }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Capture failed' }
  } finally {
    if (!alreadyAttached) {
      try {
        dbg.detach()
      } catch {}
    }
  }
}

function decode(dataUrl: string): Buffer | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.length <= MAX_DATA_URL ? dataUrl : '')
  return m ? Buffer.from(m[1], 'base64') : null
}

export async function copyPng(png: Buffer): Promise<boolean> {
  if (nativeImage.createFromBuffer(png).isEmpty()) return false
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })])
  return true
}

export async function copyImage(dataUrl: string): Promise<boolean> {
  const png = decode(dataUrl)
  return png ? copyPng(png) : false
}

export async function saveImage(
  win: BrowserWindow | null,
  dataUrl: string,
  name: string
): Promise<{ ok: boolean; filePath?: string; canceled?: boolean; error?: string }> {
  const png = decode(dataUrl)
  if (!png) return { ok: false, error: 'Nothing to save' }
  const safe = name.replace(/[/\\?%*:|"<>\u0000-\u001f]/g, '_').slice(0, 120) || 'capture'
  const opts = { defaultPath: `${safe}.png`, filters: [{ name: 'PNG image', extensions: ['png'] }] }
  const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (res.canceled || !res.filePath) return { ok: false, canceled: true }
  try {
    await fs.promises.writeFile(res.filePath, png)
    rememberExportedFile(res.filePath)
    return { ok: true, filePath: res.filePath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save the file' }
  }
}
