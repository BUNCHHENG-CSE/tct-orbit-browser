import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { resolveChannel, type ChannelMeta } from '../../shared/brand'
import { getBrowserLogoPath } from '../resources'

export { getBrowserLogoPath }

export interface AppPaths {
  channelMeta: ChannelMeta
  userDataDir: string
  userProfileDir: string
  stateFilePath: string
  logsDir: string
}

let cachedPaths: AppPaths | null = null

/** %LOCALAPPDATA% (Electron has no getPath name for it) */
function localAppDataDir(): string {
  return process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local')
}

/**
 * Default data folder, laid out like Chrome / Edge / Vivaldi:
 *   Windows  %LOCALAPPDATA%\TCTOrbit\User Data            (Vivaldi: Vivaldi\User Data)
 *   macOS    ~/Library/Application Support/TCTOrbit      (Vivaldi: Vivaldi)
 *   Linux    ~/.config/tct-orbit                         (Chrome: google-chrome)
 * Windows uses Local, not Roaming: browser data is large and machine-bound, and Roaming is copied
 * to the server at every logon/logoff on managed PCs.
 *
 * Older versions stored data in %APPDATA%\tct-orbit (Roaming), %LOCALAPPDATA%\tct-orbit,
 * %LOCALAPPDATA%\TCT\Orbit\User Data, %LOCALAPPDATA%\TCT Orbit\User Data and the matching macOS
 * folders; the first one found is moved here once.
 */
function resolveDefaultUserDataDir(channel: ChannelMeta): string {
  const folder = channel.dataFolder
  const legacyName = channel.userDataDirName
  const appData = app.getPath('appData')
  // Short-lived earlier layouts: "TCT Orbit Nova" and "TCT/Orbit Nova"
  const spaced = channel.displayName
  const split = ['TCT', spaced.replace(/^TCT\s+/, '')] as const

  let target: string
  let legacy: string[]
  if (process.platform === 'win32') {
    const local = localAppDataDir()
    // Microsoft Store package: own folder and no migration. It sees the normal installer's folder
    // through Windows' redirected AppData, and must never use or move that app's data.
    if (process.windowsStore) return path.join(local, `${folder}Store`, 'User Data')
    target = path.join(local, folder, 'User Data')
    legacy = [
      path.join(local, spaced, 'User Data'),
      path.join(local, ...split, 'User Data'),
      path.join(local, legacyName),
      path.join(appData, legacyName)
    ]
  } else if (process.platform === 'darwin') {
    target = path.join(appData, folder)
    legacy = [path.join(appData, spaced), path.join(appData, ...split), path.join(appData, legacyName)]
  } else {
    return path.join(appData, legacyName)
  }

  if (fs.existsSync(target)) return target
  const from = legacy.find((dir) => fs.existsSync(dir))
  if (!from) return target

  const moved = migrateUserData(from, target)
  if (moved) removeEmptyParents(from, process.platform === 'win32' ? localAppDataDir() : appData)
  // Another instance launched at the same moment may have finished the move first
  if (moved || fs.existsSync(target)) return target
  // The move failed: keep using the old folder this launch (no data loss) and retry next time
  return from
}

/** After a move, drop now-empty parent folders (e.g. TCT\Orbit, TCT) up to `stop` */
function removeEmptyParents(dir: string, stop: string): void {
  let current = path.dirname(dir)
  while (current.startsWith(stop) && current !== stop && path.dirname(current) !== current) {
    try {
      fs.rmdirSync(current) // fails unless empty
    } catch {
      return
    }
    current = path.dirname(current)
  }
}

/**
 * Profile folder = <userData>/Default (Chrome's layout). Older versions used
 * <userData>/User Data/Default; move it up once. If that fails, keep using the old one.
 */
function resolveProfileDir(userDataDir: string): string {
  const profile = path.join(userDataDir, 'Default')
  const legacyParent = path.join(userDataDir, 'User Data')
  const legacy = path.join(legacyParent, 'Default')
  if (fs.existsSync(profile) || !fs.existsSync(legacy)) return profile
  try {
    fs.renameSync(legacy, profile)
    try {
      fs.rmdirSync(legacyParent) // only removes it when empty
    } catch {}
    console.log(`[Paths] Moved profile: "${legacy}" -> "${profile}"`)
    return profile
  } catch (err: any) {
    if (fs.existsSync(profile)) return profile
    console.warn(`[Paths] Could not move profile (${err?.code || err}); using "${legacy}" for now`)
    return legacy
  }
}

/**
 * Move the data folder to its new location. Runs before Electron opens anything in either folder.
 * 1. Same drive: one atomic rename.
 * 2. Different drive (redirected AppData): copy into a temp folder, rename it into place, then
 *    delete the old folder. The target only appears once the copy is complete.
 * Any failure (e.g. files locked by a running old version) leaves the old folder untouched.
 */
function migrateUserData(from: string, to: string): boolean {
  try {
    fs.mkdirSync(path.dirname(to), { recursive: true })
  } catch {}

  try {
    fs.renameSync(from, to)
    console.log(`[Paths] Moved user data: "${from}" -> "${to}"`)
    return true
  } catch (err: any) {
    if (err?.code !== 'EXDEV') {
      // Locked / in use / no permission: try again next launch
      console.warn(`[Paths] Could not move user data (${err?.code || err}); using "${from}" for now`)
      return false
    }
  }

  const temp = `${to}.migrating-${process.pid}`
  try {
    fs.rmSync(temp, { recursive: true, force: true })
    fs.cpSync(from, temp, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true })
    fs.renameSync(temp, to)
  } catch (err) {
    console.warn('[Paths] Copying user data failed; keeping the old folder:', err)
    try {
      fs.rmSync(temp, { recursive: true, force: true })
    } catch {}
    return false
  }

  try {
    fs.rmSync(from, { recursive: true, force: true })
  } catch (err) {
    // Data is safe in the new folder; a leftover old copy is only wasted space
    console.warn('[Paths] User data copied, but the old folder could not be removed:', err)
  }
  console.log(`[Paths] Copied user data: "${from}" -> "${to}"`)
  return true
}

/**
 * Configure channel-based app name, logs path, and support overriding userData before app.whenReady().
 * Must be called early in main process before app.whenReady().
 */
export function initAppPaths(): AppPaths {
  if (cachedPaths) {
    return cachedPaths
  }

  const activeChannel = process.env.APP_CHANNEL || process.env.VITE_APP_CHANNEL
  const channelMeta = resolveChannel(activeChannel)

  // 1. Set formal display name for OS-level integration (Taskbar, Dock, Window manager, About dialog)
  app.setName(channelMeta.displayName)

  // 2. Explicit userData overrides win
  // Priority: CLI switch --user-data-dir > environment variable TCT_ORBIT_DATA_DIR
  const cliUserDataDir = app.commandLine.getSwitchValue('user-data-dir')
  const envUserDataDir = process.env.TCT_ORBIT_DATA_DIR
  const customUserDataDir = cliUserDataDir || envUserDataDir

  if (customUserDataDir) {
    const resolvedPath = path.resolve(customUserDataDir)
    app.setPath('userData', resolvedPath)
    console.log(`[Paths] Custom userData directory set from override: ${resolvedPath}`)
  } else {
    // 3. Default location per channel (see resolveDefaultUserDataDir)
    app.setPath('userData', resolveDefaultUserDataDir(channelMeta))
  }

  const userDataDir = app.getPath('userData')
  const userProfileDir = resolveProfileDir(userDataDir)
  const stateFilePath = path.join(userProfileDir, 'state.json')
  const logsDir = path.join(userDataDir, 'Logs')

  // 3. Configure Logs directory
  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true })
    }
    app.setAppLogsPath(logsDir)
  } catch (err) {
    console.warn('[Paths] Failed to set app logs path:', err)
  }

  cachedPaths = {
    channelMeta,
    userDataDir,
    userProfileDir,
    stateFilePath,
    logsDir
  }

  return cachedPaths
}

/**
 * Access cached application paths
 */
export function getAppPaths(): AppPaths {
  if (!cachedPaths) {
    return initAppPaths()
  }
  return cachedPaths
}

/**
 * Safe Startup Migration
 * Checks if legacy state file or database exists while 'User Data/Default/state.json' does not.
 * If found, copies safely to User Data/Default without deleting the original backup.
 */
export function runStartupMigration(): void {
  const paths = getAppPaths()
  const { userProfileDir, stateFilePath, userDataDir } = paths

  try {
    // Ensure User Data/Default directory exists
    if (!fs.existsSync(userProfileDir)) {
      fs.mkdirSync(userProfileDir, { recursive: true })
    }

    // 1. State JSON migration
    if (!fs.existsSync(stateFilePath) && !process.windowsStore) {
      let appDataDir = ''
      try {
        appDataDir = app.getPath('appData')
      } catch {
        appDataDir = path.dirname(userDataDir)
      }

      const legacyDir = path.join(appDataDir, 'TCT Orbit Browser')
      const legacyJsonCandidates = [
        path.join(legacyDir, 'tct-orbit-data.json'),
        path.join(userDataDir, 'tct-orbit-data.json'),
        path.join(legacyDir, 'arc-browser-data.json'),
        path.join(userDataDir, 'arc-browser-data.json')
      ]

      for (const legacyPath of legacyJsonCandidates) {
        if (fs.existsSync(legacyPath)) {
          console.log(`[Migration] Migrating legacy data from "${legacyPath}" -> "${stateFilePath}"...`)
          fs.copyFileSync(legacyPath, stateFilePath)
          console.log(`[Migration] State file migration complete. Preserved backup at "${legacyPath}".`)
          break
        }
      }
    }
  } catch (err) {
    console.error('[Migration] Safe startup migration error:', err)
  }
}
