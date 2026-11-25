import { app } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

/** Folder with the built UI. The main bundle is out/main/index.js, the UI is out/renderer. */
const RENDERER_DIR = path.resolve(__dirname, '../renderer')

/** Vite dev server address. Ignored in packaged builds: an env variable must never choose the UI. */
export function devServerUrl(): string | undefined {
  return app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'] || undefined
}

/** True only for the browser's own UI files (local disk, inside the UI folder; never a network share) */
export function isAppUiFile(raw: string): boolean {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'file:' || url.hostname || url.pathname.startsWith('//')) return false
    const rel = path.relative(RENDERER_DIR, fileURLToPath(url))
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
  } catch {
    return false
  }
}

/** True when a URL is the browser's own interface (the only page that may use IPC) */
export function isAppUiUrl(raw: string | null | undefined): boolean {
  if (!raw) return false
  const dev = devServerUrl()
  if (dev) {
    try {
      if (new URL(raw).origin === new URL(dev).origin) return true
    } catch {
      return false
    }
  }
  return isAppUiFile(raw)
}
