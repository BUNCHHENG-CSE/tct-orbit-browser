import { app } from 'electron'
import path from 'path'
import fs from 'fs'

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
