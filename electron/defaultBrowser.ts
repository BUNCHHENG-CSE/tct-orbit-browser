import { app, shell } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { DefaultBrowserStatus } from '../src/types/api'

const run = promisify(execFile)

/**
 * "Make TCT Orbit my default browser": opt-in only, never prompted automatically.
 *
 * - Windows 10/11: apps cannot set themselves as default. We register Orbit as a browser for the
 *   current user (HKCU, no admin) so it appears in Settings > Default apps, then open that page.
 * - macOS: setAsDefaultProtocolClient('http'/'https') makes macOS ask the user to confirm.
 * - Linux: xdg-settings with the installed .desktop file.
 */

const WIN_CLIENT_KEY = 'TCTOrbit'
const WIN_PROGID = 'TCTOrbitHTML'
/** Microsoft Store package: <package family name>!<application id> (see electron-builder.store.cjs) */
const STORE_AUMID = 'HANGBUNCHHENG.TCTOrbitBrowser_6768pqypwzr7w!TCTOrbit'

function displayName(): string {
  return app.getName() || 'TCT Orbit'
}

async function reg(args: string[]): Promise<string> {
  const { stdout } = await run('reg', args, { windowsHide: true })
  return stdout
}

async function regAdd(key: string, name: string | null, value: string): Promise<void> {
  const args = ['add', key, '/f', '/t', 'REG_SZ', '/d', value]
  if (name === null) args.splice(2, 0, '/ve')
  else args.splice(2, 0, '/v', name)
  await reg(args)
}

/** Register Orbit as a per-user browser so Windows lists it in Default apps */
async function registerWindowsBrowser(): Promise<void> {
  const exe = process.execPath
  const name = displayName()
  const icon = `"${exe}",0`
  // "--": whatever the link contains, it can't become a command-line switch
  const openCmd = `"${exe}" -- "%1"`
  const client = `HKCU\\Software\\Clients\\StartMenuInternet\\${WIN_CLIENT_KEY}`
  const caps = `${client}\\Capabilities`

  await regAdd(`HKCU\\Software\\Classes\\${WIN_PROGID}`, null, `${name} HTML Document`)
  await regAdd(`HKCU\\Software\\Classes\\${WIN_PROGID}`, 'URL Protocol', '')
  await regAdd(`HKCU\\Software\\Classes\\${WIN_PROGID}\\DefaultIcon`, null, icon)
  await regAdd(`HKCU\\Software\\Classes\\${WIN_PROGID}\\shell\\open\\command`, null, openCmd)

  await regAdd(client, null, name)
  await regAdd(`${client}\\DefaultIcon`, null, icon)
  await regAdd(`${client}\\shell\\open\\command`, null, `"${exe}"`)
  await regAdd(caps, 'ApplicationName', name)
  await regAdd(caps, 'ApplicationDescription', `${name} web browser`)
  await regAdd(caps, 'ApplicationIcon', icon)
  for (const scheme of ['http', 'https']) await regAdd(`${caps}\\URLAssociations`, scheme, WIN_PROGID)
  for (const ext of ['.htm', '.html', '.xhtml', '.svg', '.pdf']) await regAdd(`${caps}\\FileAssociations`, ext, WIN_PROGID)
  await regAdd('HKCU\\Software\\RegisteredApplications', name, `Software\\Clients\\StartMenuInternet\\${WIN_CLIENT_KEY}\\Capabilities`)
}

async function windowsIsDefault(): Promise<boolean> {
  try {
    const out = await reg([
      'query',
      'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice',
      '/v',
      'ProgId'
    ])
    if (!process.windowsStore) return out.includes(WIN_PROGID)
    // Store apps get a generated ProgId: look up which package it belongs to
    const progId = /ProgId\s+REG_SZ\s+(AppX[a-z0-9]+)/i.exec(out)?.[1]
    if (!progId) return false
    const owner = await reg(['query', `HKCR\\${progId}\\Application`, '/v', 'AppUserModelID'])
    return owner.toLowerCase().includes(STORE_AUMID.toLowerCase())
  } catch {
    return false
  }
}

const LINUX_DESKTOP = 'tct-orbit.desktop'

export async function getDefaultBrowserStatus(): Promise<DefaultBrowserStatus> {
  // A dev build runs as electron.exe and would register the wrong program
  if (!app.isPackaged) return { isDefault: false, canSet: false, reason: 'Only available in the installed app' }
  try {
    if (process.platform === 'win32') return { isDefault: await windowsIsDefault(), canSet: true }
    if (process.platform === 'darwin') {
      return { isDefault: app.isDefaultProtocolClient('https') && app.isDefaultProtocolClient('http'), canSet: true }
    }
    // An AppImage has no menu entry that other programs could open links with
    if (process.env.APPIMAGE) return { isDefault: false, canSet: false, reason: 'Install the .deb package to make TCT Orbit your default browser' }
    const { stdout } = await run('xdg-settings', ['get', 'default-web-browser'])
    return { isDefault: stdout.trim() === LINUX_DESKTOP, canSet: true }
  } catch {
    return { isDefault: false, canSet: process.platform !== 'linux', reason: process.platform === 'linux' ? 'xdg-settings not found' : undefined }
  }
}

/** Returns what happened so the UI can tell the user the next step */
export async function setAsDefaultBrowser(): Promise<{ ok: boolean; openedSystemSettings: boolean; error?: string }> {
  if (!app.isPackaged) return { ok: false, openedSystemSettings: false, error: 'Only available in the installed app' }
  try {
    if (process.platform === 'win32' && process.windowsStore) {
      // Links are declared in the package manifest; Windows only needs the user's choice
      await shell.openExternal(`ms-settings:defaultapps?registeredAUMID=${encodeURIComponent(STORE_AUMID)}`)
      return { ok: true, openedSystemSettings: true }
    }
    if (process.platform === 'win32') {
      await registerWindowsBrowser()
      // Windows requires the user to pick the default themselves
      await shell.openExternal(`ms-settings:defaultapps?registeredAppUser=${encodeURIComponent(displayName())}`)
      return { ok: true, openedSystemSettings: true }
    }
    if (process.platform === 'darwin') {
      // macOS shows its own confirmation dialog
      const ok = app.setAsDefaultProtocolClient('http') && app.setAsDefaultProtocolClient('https')
      return { ok, openedSystemSettings: false }
    }
    await run('xdg-settings', ['set', 'default-web-browser', LINUX_DESKTOP])
    return { ok: true, openedSystemSettings: false }
  } catch (err: any) {
    return { ok: false, openedSystemSettings: false, error: err?.message || 'Could not set default browser' }
  }
}
