import type { Session } from 'electron'
import path from 'path'

/** Stops pages from opening the system passkey dialog on their own (see pagePreload.ts) */
export function attachPagePreload(ses: Session): void {
  const id = 'tct-page-preload'
  if (ses.getPreloadScripts().some((s) => s.id === id)) return
  ses.registerPreloadScript({ type: 'frame', id, filePath: path.join(__dirname, '../preload/page.js') })
}
