import { app, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { getAppIconPath } from '../resources'

/**
 * Optimizes the Windows Taskbar identity, context menu (JumpList), and icon.
 * Ensures the app displays the official branded name (e.g. "TCT Orbit") and custom icon
 * instead of the default generic "Electron" text and blue Electron atom icon
 * when right-clicked on the Windows taskbar in both development and production.
 */
export function setupWindowsTaskbar(releaseAppId: string, releaseName: string): void {
  // A development run has its own identity and shortcut: it must never take over the installed
  // browser's "TCT Orbit" entry in the Start menu
  const appId = app.isPackaged ? releaseAppId : `${releaseAppId}.dev`
  const displayName = app.isPackaged ? releaseName : `${releaseName} (development)`

  // Microsoft Store package: Windows creates the Start menu entry and taskbar identity itself
  if (process.platform !== 'win32' || process.windowsStore) return

  // 1. Explicitly associate the current process with the application's unique AppUserModelID
  app.setAppUserModelId(appId)

  // 2. Ensure Start Menu shortcut exists with matching AppUserModelId and high-res icon.
  // Windows Taskbar Shell resolves the right-click Jumplist application header (name + icon)
  // strictly via registered Start Menu shortcuts associated with the active AppUserModelID.
  try {
    const programsPath = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    if (fs.existsSync(programsPath)) {
      const shortcutPath = path.join(programsPath, `${displayName}.lnk`)
      const iconPath = getAppIconPath()
      const isPackaged = app.isPackaged

      const target = process.execPath
      const args = isPackaged ? '' : `"${process.cwd()}"`
      const cwd = isPackaged ? path.dirname(process.execPath) : process.cwd()

      const exists = fs.existsSync(shortcutPath)
      const op = exists ? 'update' : 'create'

      const written = shell.writeShortcutLink(shortcutPath, op, {
        target,
        args,
        cwd,
        appUserModelId: appId,
        icon: iconPath,
        iconIndex: 0,
        description: displayName
      })

      if (!written && !exists) {
        shell.writeShortcutLink(shortcutPath, 'create', {
          target,
          args,
          cwd,
          appUserModelId: appId,
          icon: iconPath,
          iconIndex: 0,
          description: displayName
        })
      }
    }
  } catch (err) {
    console.warn('[Windows Taskbar] Failed to configure Start Menu shortcut:', err)
  }

  // 3. Populate Windows JumpList tasks for right-click context menu ("New Window", "New Incognito Window")
  try {
    const iconPath = getAppIconPath()
    app.setUserTasks([
      {
        program: process.execPath,
        arguments: app.isPackaged ? '--new-window' : `"${process.cwd()}" --new-window`,
        title: 'New Window',
        description: 'Open a new TCT Orbit window',
        iconPath: iconPath,
        iconIndex: 0
      },
      {
        program: process.execPath,
        arguments: app.isPackaged ? '--incognito' : `"${process.cwd()}" --incognito`,
        title: 'New Incognito Window',
        description: 'Open a new private browsing window',
        iconPath: iconPath,
        iconIndex: 0
      }
    ])
  } catch (err) {
    console.warn('[Windows Taskbar] Failed to configure JumpList tasks:', err)
  }
}
