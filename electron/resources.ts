import { app, nativeImage, type NativeImage } from 'electron'
import path from 'path'
import fs from 'fs'

/**
 * Resolves the Windows .ico or platform native icon accurately in development (process.cwd())
 * and packaged builds (process.resourcesPath).
 */
export function getAppIconPath(): string {
  const isWin = process.platform === 'win32'
  const isMac = process.platform === 'darwin'

  const candidates: string[] = []

  if (isWin) {
    candidates.push(
      path.join(process.cwd(), 'build', 'icon.ico'),
      path.join(process.cwd(), 'resources', 'icon.ico'),
      path.join(process.resourcesPath, 'icon.ico'),
      path.join(process.resourcesPath, 'resources', 'icon.ico'),
      path.join(process.resourcesPath, 'build', 'icon.ico'),
      path.join(__dirname, '../../build/icon.ico'),
      path.join(__dirname, '../build/icon.ico')
    )
  } else if (isMac) {
    candidates.push(
      path.join(process.cwd(), 'build', 'icon.icns'),
      path.join(process.resourcesPath, 'icon.icns'),
      path.join(process.resourcesPath, 'build', 'icon.icns')
    )
  }

  // Cross-platform fallbacks
  candidates.push(
    path.join(app.isPackaged ? process.resourcesPath : process.cwd(), 'resources', 'browser-logo.png'),
    path.join(process.resourcesPath, 'browser-logo.png'),
    path.join(process.resourcesPath, 'resources', 'browser-logo.png'),
    path.join(process.cwd(), 'resources', 'browser-logo.png'),
    path.join(process.cwd(), 'build', 'icon.png'),
    path.join(process.cwd(), 'resources', 'icon.png'),
    path.join(__dirname, '../../resources/browser-logo.png'),
    path.join(__dirname, '../resources/browser-logo.png')
  )

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return path.join(process.cwd(), 'resources', 'browser-logo.png')
}

/**
 * Loads the application icon as a NativeImage preserving multi-resolution mipmaps (16px to 256px).
 */
export function getAppNativeIcon(): NativeImage {
  const iconPath = getAppIconPath()
  return nativeImage.createFromPath(iconPath)
}

/**
 * Resolves resources/browser-logo.png accurately in development (process.cwd())
 * and packaged builds (process.resourcesPath).
 */
export function getBrowserLogoPath(): string {
  const candidates = [
    path.join(app.isPackaged ? process.resourcesPath : process.cwd(), 'resources', 'browser-logo.png'),
    path.join(process.resourcesPath, 'browser-logo.png'),
    path.join(process.resourcesPath, 'resources', 'browser-logo.png'),
    path.join(process.cwd(), 'resources', 'browser-logo.png'),
    path.join(__dirname, '../../resources/browser-logo.png'),
    path.join(__dirname, '../resources/browser-logo.png'),
    path.join(process.cwd(), 'build', 'icon.png')
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  // Fallback to resources/browser-logo.png
  return path.join(process.cwd(), 'resources', 'browser-logo.png')
}
