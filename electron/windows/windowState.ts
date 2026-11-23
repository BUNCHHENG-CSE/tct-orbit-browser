import { app, screen, type BrowserWindow, type Rectangle } from 'electron'
import fs from 'fs'
import path from 'path'

/**
 * Remembers the main window's size, position and maximized/fullscreen state between launches.
 * First launch (no saved state) opens maximized.
 */
interface SavedWindowState {
  bounds: Rectangle
  isMaximized: boolean
  isFullScreen: boolean
}

const DEFAULT_WIDTH = 1280
const DEFAULT_HEIGHT = 850
const MIN_VISIBLE_PX = 100

function getStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function readState(): SavedWindowState | null {
  try {
    const raw = JSON.parse(fs.readFileSync(getStatePath(), 'utf8'))
    const b = raw?.bounds
    if (!b || ![b.x, b.y, b.width, b.height].every(isNumber)) return null
    return {
      bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
      isMaximized: !!raw.isMaximized,
      isFullScreen: !!raw.isFullScreen
    }
  } catch {
    return null
  }
}

/** True when a reasonable part of the window lies on a currently connected display */
function isVisibleOnSomeDisplay(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea: wa }) => {
    const overlapW = Math.min(bounds.x + bounds.width, wa.x + wa.width) - Math.max(bounds.x, wa.x)
    const overlapH = Math.min(bounds.y + bounds.height, wa.y + wa.height) - Math.max(bounds.y, wa.y)
    return overlapW >= MIN_VISIBLE_PX && overlapH >= MIN_VISIBLE_PX
  })
}

export interface InitialWindowState {
  /** Bounds for the BrowserWindow constructor (x/y omitted when the OS should center it) */
  bounds: Partial<Rectangle> & { width: number; height: number }
  maximize: boolean
  fullScreen: boolean
}

export function getInitialWindowState(): InitialWindowState {
  const saved = readState()

  if (!saved) {
    // First launch: open maximized; these bounds are what "restore down" goes back to
    return { bounds: { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }, maximize: true, fullScreen: false }
  }

  const workArea = screen.getPrimaryDisplay().workAreaSize
  const width = Math.min(Math.max(saved.bounds.width, 480), Math.max(workArea.width, 480))
  const height = Math.min(Math.max(saved.bounds.height, 400), Math.max(workArea.height, 400))
  const bounds = { ...saved.bounds, width, height }

  // Monitor unplugged / resolution changed: drop the position and let the OS center the window
  if (!isVisibleOnSomeDisplay(bounds)) {
    return { bounds: { width, height }, maximize: saved.isMaximized, fullScreen: saved.isFullScreen }
  }

  return { bounds, maximize: saved.isMaximized, fullScreen: saved.isFullScreen }
}

/** Persist window state on resize/move (debounced) and on close */
export function trackWindowState(win: BrowserWindow): void {
  // Last "normal" (non-maximized) bounds, so un-maximizing next session restores the user's size
  let normalBounds = win.isMaximized() || win.isFullScreen() ? null : win.getBounds()
  let timer: NodeJS.Timeout | null = null

  const save = () => {
    if (win.isDestroyed()) return
    const isMaximized = win.isMaximized()
    const isFullScreen = win.isFullScreen()
    if (!isMaximized && !isFullScreen && !win.isMinimized()) {
      normalBounds = win.getBounds()
    }
    const state: SavedWindowState = {
      bounds: normalBounds || win.getNormalBounds(),
      isMaximized,
      isFullScreen
    }
    try {
      fs.writeFileSync(getStatePath(), JSON.stringify(state), 'utf8')
    } catch (err) {
      console.warn('[WindowState] Could not save window state:', err)
    }
  }

  const scheduleSave = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, 500)
  }

  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)
  win.on('maximize', scheduleSave)
  win.on('unmaximize', scheduleSave)
  win.on('enter-full-screen', scheduleSave)
  win.on('leave-full-screen', scheduleSave)
  win.on('close', () => {
    if (timer) clearTimeout(timer)
    save()
  })
}
