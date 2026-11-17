/**
 * Platform detection and OS-specific formatting utilities
 * Fully optimized for Windows (x64, arm64), macOS (Apple Silicon M-Series, Intel x64),
 * and Linux (all major distributions: Ubuntu/Debian, Fedora, Arch, openSUSE, AppImage).
 */

export const isMac =
  typeof navigator !== 'undefined' &&
  (/Macintosh|Mac OS X|MacIntel|MacPPC/i.test(navigator.userAgent) ||
    (navigator as any).userAgentData?.platform === 'macOS')

export const isWindows =
  typeof navigator !== 'undefined' &&
  (/Win32|Win64|Windows/i.test(navigator.userAgent) ||
    (navigator as any).userAgentData?.platform === 'Windows')

export const isLinux =
  typeof navigator !== 'undefined' &&
  (/Linux/i.test(navigator.userAgent) ||
    (navigator as any).userAgentData?.platform === 'Linux')

/**
 * Symbol for main modifier key:
 * '⌘' on macOS, 'Ctrl' on Windows & Linux
 */
export const modKey = isMac ? '⌘' : 'Ctrl'

/**
 * Word for main modifier key:
 * 'Cmd' on macOS, 'Ctrl' on Windows & Linux
 */
export const modName = isMac ? 'Cmd' : 'Ctrl'

/**
 * Symbol for Alt/Option key:
 * '⌥' on macOS, 'Alt' on Windows & Linux
 */
export const altKey = isMac ? '⌥' : 'Alt'

/**
 * Symbol for Shift key:
 * '⇧' on macOS, 'Shift' on Windows & Linux
 */
export const shiftKey = isMac ? '⇧' : 'Shift'

/**
 * Human-readable OS name
 */
export function getOsName(): string {
  if (isMac) return 'macOS'
  if (isWindows) return 'Windows'
  if (isLinux) return 'Linux'
  return 'Desktop'
}

/**
 * Human-readable platform and architecture description
 */
export function getPlatformDescription(): string {
  if (isMac) {
    return 'macOS (Universal • Apple Silicon & Intel)'
  }
  if (isWindows) {
    return 'Windows 11 / 10 (x64 & ARM64)'
  }
  if (isLinux) {
    return 'Linux (AppImage • DEB • RPM • Arch • Tarball)'
  }
  return 'Cross-Platform Desktop'
}

/**
 * Format shortcut keys cleanly for the current OS:
 * ['Ctrl', 'T'] -> on Mac: '⌘T', on Windows/Linux: 'Ctrl+T'
 */
export function formatShortcut(keys: string[]): string {
  if (isMac) {
    return keys
      .map((k) => {
        const lower = k.toLowerCase()
        if (lower === 'ctrl' || lower === 'cmd' || lower === 'mod') return '⌘'
        if (lower === 'shift') return '⇧'
        if (lower === 'alt' || lower === 'opt') return '⌥'
        return k.toUpperCase()
      })
      .join('')
  }
  return keys
    .map((k) => {
      const lower = k.toLowerCase()
      if (lower === 'cmd' || lower === 'mod') return 'Ctrl'
      return k
    })
    .join('+')
}
