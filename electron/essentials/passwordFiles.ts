import { dialog, shell, type BrowserWindow } from 'electron'
import fs from 'fs'
import { formatLoginsCsv, parseLoginsCsv } from '../../shared/csv'
import { passwordManager } from '../passwords'
import type { PasswordExportResult, PasswordImportResult } from '../../src/types/essentials'

const MAX_FILE = 20 * 1024 * 1024
/** Only files the user just imported may be deleted from the UI */
const imported = new Set<string>()

export async function importPasswordsCsv(win: BrowserWindow | null): Promise<PasswordImportResult> {
  const none = { added: 0, updated: 0, skipped: 0 }
  if (!passwordManager.getSettings().encrypted) {
    return { ok: false, ...none, error: 'System encryption is not available, so passwords can not be saved.' }
  }
  const opts: Electron.OpenDialogOptions = {
    title: 'Import passwords',
    filters: [{ name: 'Passwords (CSV)', extensions: ['csv'] }],
    properties: ['openFile']
  }
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  const filePath = res.filePaths[0]
  if (res.canceled || !filePath) return { ok: false, canceled: true, ...none }
  try {
    if ((await fs.promises.stat(filePath)).size > MAX_FILE) return { ok: false, ...none, error: 'The file is too large.' }
    const parsed = parseLoginsCsv(await fs.promises.readFile(filePath, 'utf8'))
    if (parsed.error) return { ok: false, ...none, error: parsed.error }
    const { added, updated } = passwordManager.importLogins(parsed.logins)
    imported.add(filePath)
    return { ok: true, added, updated, skipped: parsed.skipped, filePath }
  } catch (err) {
    return { ok: false, ...none, error: err instanceof Error ? err.message : 'The file could not be read.' }
  }
}

export async function deleteImportedFile(filePath: string): Promise<boolean> {
  if (!imported.delete(filePath)) return false
  try {
    await shell.trashItem(filePath)
    return true
  } catch {
    return false
  }
}

export async function exportPasswordsCsv(win: BrowserWindow | null): Promise<PasswordExportResult> {
  const warning: Electron.MessageBoxOptions = {
    type: 'warning',
    buttons: ['Export', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: 'Export passwords',
    message: 'The file will not be encrypted.',
    detail: 'Anyone who can open it can read all your passwords. Delete it as soon as you are done.'
  }
  const { response } = win ? await dialog.showMessageBox(win, warning) : await dialog.showMessageBox(warning)
  if (response !== 0) return { ok: false, canceled: true, count: 0 }
  const opts: Electron.SaveDialogOptions = { defaultPath: 'TCT Orbit passwords.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] }
  const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (res.canceled || !res.filePath) return { ok: false, canceled: true, count: 0 }
  try {
    const logins = passwordManager.exportLogins()
    await fs.promises.writeFile(res.filePath, formatLoginsCsv(logins), { encoding: 'utf8', mode: 0o600 })
    return { ok: true, count: logins.length }
  } catch (err) {
    return { ok: false, count: 0, error: err instanceof Error ? err.message : 'The file could not be written.' }
  }
}
