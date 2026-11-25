import { app } from 'electron'
import fs from 'fs'
import path from 'path'

/**
 * Extensions that ship with TCT Orbit (resources/builtin-extensions/<dir>).
 *
 * On startup each one is copied into the user's Extensions folder unless the user removed it.
 * Users can turn them off or remove them like any other extension, and restore removed ones
 * from the Extensions manager. To add another built-in: unpack it into
 * resources/builtin-extensions/<dir> and add an entry here.
 */
export interface BuiltinExtension {
  /** Stable key, never change it (removals are remembered by key) */
  key: string
  /** Folder name under resources/builtin-extensions */
  dir: string
}

export const BUILTIN_EXTENSIONS: BuiltinExtension[] = [{ key: 'tct-responsive', dir: 'tct-responsive' }]

export function builtinSourceDir(ext: BuiltinExtension): string | null {
  const candidates = [
    path.join(process.resourcesPath || '', 'builtin-extensions', ext.dir),
    path.join(app.getAppPath(), 'resources', 'builtin-extensions', ext.dir),
    // Development only: an installed app must never load extensions from the current folder
    ...(app.isPackaged ? [] : [path.join(process.cwd(), 'resources', 'builtin-extensions', ext.dir)])
  ]
  return candidates.find((p) => fs.existsSync(path.join(p, 'manifest.json'))) ?? null
}

export function readVersion(dir: string): string {
  try {
    return String(JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8').replace(/^﻿/, '')).version || '')
  } catch {
    return ''
  }
}

/* ---------------------------------------------------------------------------------------------
 * Toolbar-click support.
 *
 * Electron doesn't implement chrome.action, so an extension whose toolbar button has no popup
 * (it listens to chrome.action.onClicked instead) can't be opened. For built-ins we add a small
 * shim to the service worker that provides chrome.action (+ chrome.storage.session) and fires
 * onClicked when our helper page (__orbit_action.html) asks it to.
 * ------------------------------------------------------------------------------------------- */

export const ACTION_PAGE = '__orbit_action.html'

const SHIM = `/* TCT Orbit: chrome.action / storage.session shim (Electron lacks them) */
(() => {
  const c = globalThis.chrome
  if (!c || !c.runtime) return
  const clicked = new Set()
  const event = (set) => ({
    addListener: (f) => void set.add(f),
    removeListener: (f) => void set.delete(f),
    hasListener: (f) => set.has(f),
    hasListeners: () => set.size > 0
  })
  const noop = () => Promise.resolve()
  try {
    const action = c.action || {}
    action.onClicked = event(clicked)
    for (const k of ['setBadgeText', 'setBadgeBackgroundColor', 'setBadgeTextColor', 'setTitle', 'setIcon', 'setPopup', 'enable', 'disable']) {
      if (typeof action[k] !== 'function') action[k] = noop
    }
    if (typeof action.getBadgeText !== 'function') action.getBadgeText = () => Promise.resolve('')
    c.action = action
  } catch {}

  if (c.storage && !c.storage.session) {
    const mem = new Map()
    const pick = (keys) => {
      if (keys == null) return Object.fromEntries(mem)
      if (typeof keys === 'string') keys = [keys]
      if (Array.isArray(keys)) return Object.fromEntries(keys.filter((k) => mem.has(k)).map((k) => [k, mem.get(k)]))
      return Object.fromEntries(Object.entries(keys).map(([k, d]) => [k, mem.has(k) ? mem.get(k) : d]))
    }
    const done = (cb, v) => (typeof cb === 'function' ? (cb(v), undefined) : Promise.resolve(v))
    c.storage.session = {
      get: (keys, cb) => done(typeof keys === 'function' ? keys : cb, pick(typeof keys === 'function' ? null : keys)),
      set: (items, cb) => { for (const [k, v] of Object.entries(items || {})) mem.set(k, v); return done(cb) },
      remove: (keys, cb) => { for (const k of [].concat(keys)) mem.delete(k); return done(cb) },
      clear: (cb) => { mem.clear(); return done(cb) }
    }
  }

  c.runtime.onMessage.addListener((msg, sender, respond) => {
    // Only our helper page (an extension page, not a content script) may trigger a click
    const fromHelper = String(sender.url || '').startsWith('chrome-extension://' + c.runtime.id + '/__orbit_action.html')
    if (!msg || msg.__orbitAction !== true || sender.id !== c.runtime.id || !fromHelper) return false
    for (const f of clicked) {
      try { f(msg.tab) } catch (e) { console.error(e) }
    }
    respond({ ok: true })
    return false
  })
})()
`

const ACTION_HTML = `<!doctype html><meta charset="utf-8"><title>action</title><script src="__orbit_action.js"></script>`

const ACTION_JS = `/* TCT Orbit: forwards a toolbar click to the service worker shim, then closes */
try {
  const tab = JSON.parse(decodeURIComponent(location.hash.slice(1)))
  chrome.runtime.sendMessage({ __orbitAction: true, tab }, () => {
    void chrome.runtime.lastError
    window.close()
  })
} catch (e) {
  window.close()
}
`

/** Add the shim to an installed copy of a built-in (rewrites its manifest's background entry) */
export function applyActionShim(dir: string): void {
  const manifestPath = path.join(dir, 'manifest.json')
  let m: any
  try {
    m = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''))
  } catch {
    return
  }
  const action = m.action || m.browser_action
  const sw: string | undefined = m.background?.service_worker
  if (!action || action.default_popup || !sw) return

  fs.writeFileSync(path.join(dir, '__orbit_shim.js'), SHIM, 'utf8')
  fs.writeFileSync(path.join(dir, ACTION_PAGE), ACTION_HTML, 'utf8')
  fs.writeFileSync(path.join(dir, '__orbit_action.js'), ACTION_JS, 'utf8')

  const isModule = m.background.type === 'module'
  const original = sw.replace(/^\/+/, '')
  const entry = isModule
    ? `import './__orbit_shim.js'\nimport './${original}'\n`
    : `importScripts('__orbit_shim.js', '${original}')\n`
  fs.writeFileSync(path.join(dir, '__orbit_sw.js'), entry, 'utf8')
  m.background.service_worker = '__orbit_sw.js'
  fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8')
}

/** True when this installed copy carries the shim (toolbar clicks can be forwarded) */
export function hasActionShim(dir: string): boolean {
  return fs.existsSync(path.join(dir, ACTION_PAGE))
}
