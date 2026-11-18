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

  // 2. Configure userData path to clean channel slug directory (%APPDATA%\[channel], ~/.config/[channel], etc.)
  app.setPath('userData', path.join(app.getPath('appData'), channelMeta.userDataDirName))

  // 3. Check for explicit userData directory overrides
  // Priority: CLI switch --user-data-dir > environment variable TCT_ORBIT_DATA_DIR
  const cliUserDataDir = app.commandLine.getSwitchValue('user-data-dir')
  const envUserDataDir = process.env.TCT_ORBIT_DATA_DIR
  const customUserDataDir = cliUserDataDir || envUserDataDir

  if (customUserDataDir) {
    const resolvedPath = path.resolve(customUserDataDir)
    app.setPath('userData', resolvedPath)
    console.log(`[Paths] Custom userData directory set from override: ${resolvedPath}`)
  }

  const userDataDir = app.getPath('userData')
  const userProfileDir = path.join(userDataDir, 'User Data', 'Default')
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
    if (!fs.existsSync(stateFilePath)) {
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
