import { session } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { SHARED_TAB_PARTITION } from './sessions'

/**
 * Install extensions from browser stores (Chrome Web Store, Microsoft Edge Add-ons, Opera
 * add-ons) or from a .crx / .zip file.
 *
 * Stores are only used through their public download endpoints (the same ones the browsers use)
 * over HTTPS. A .crx is a zip with a signed header: we skip the header and unzip. Firefox and
 * Safari use other formats and are not supported.
 */

export type ExtensionStore = 'chrome' | 'edge' | 'opera' | 'file'

export interface StoreTarget {
  store: ExtensionStore
  /** Store extension id (32 chars a-p) or Opera slug */
  id: string
  downloadUrl: string
}

const CHROME_ID = /^[a-p]{32}$/
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024
const MAX_UNPACKED_BYTES = 300 * 1024 * 1024
const MAX_FILES = 10_000

function chromeDownloadUrl(id: string): string {
  const prodversion = process.versions.chrome || '130.0.0.0'
  return `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${prodversion}&acceptformat=crx2,crx3&x=id%3D${id}%26uc`
}

function edgeDownloadUrl(id: string): string {
  return `https://edge.microsoft.com/extensionwebstorebase/v1/crx?response=redirect&prod=chromiumcrx&prodchannel=&x=id%3D${id}%26installsource%3Dondemand%26uc`
}

/** Store detail page URL (or a bare extension id) -> where to download it */
export function parseStoreInput(input: string): StoreTarget | { error: string } {
  const raw = input.trim()
  if (CHROME_ID.test(raw)) return { store: 'chrome', id: raw, downloadUrl: chromeDownloadUrl(raw) }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { error: 'Paste a link to an extension page, or its 32-letter ID' }
  }
  const host = url.hostname.toLowerCase()
  const parts = url.pathname.split('/').filter(Boolean)
  const idInPath = parts.find((p) => CHROME_ID.test(p))

  if (host === 'chromewebstore.google.com' || (host === 'chrome.google.com' && parts[0] === 'webstore')) {
    if (!idInPath) return { error: 'Open an extension\'s own page in the Chrome Web Store first' }
    return { store: 'chrome', id: idInPath, downloadUrl: chromeDownloadUrl(idInPath) }
  }
  if (host === 'microsoftedge.microsoft.com') {
    if (!idInPath) return { error: 'Open an extension\'s own page in Edge Add-ons first' }
    return { store: 'edge', id: idInPath, downloadUrl: edgeDownloadUrl(idInPath) }
  }
  if (host === 'addons.opera.com') {
    // /en/extensions/details/<slug>/
    const i = parts.indexOf('details')
    const slug = i >= 0 ? parts[i + 1] : undefined
    if (!slug || !/^[a-z0-9-]{1,120}$/i.test(slug)) return { error: 'Open an extension\'s own page on Opera add-ons first' }
    return { store: 'opera', id: slug, downloadUrl: `https://addons.opera.com/extensions/download/${slug}/` }
  }
  if (host === 'addons.mozilla.org') return { error: 'Firefox add-ons use a different format and can\'t run in TCT Orbit' }
  if (host.endsWith('apps.apple.com')) return { error: 'Safari extensions can\'t run in TCT Orbit' }
  return { error: 'Supported: Chrome Web Store, Microsoft Edge Add-ons and Opera add-ons' }
}

/** True for an extension detail page the "Add to TCT Orbit" button can install */
export function isStoreDetailUrl(url: string): boolean {
  const t = parseStoreInput(url)
  return !('error' in t) && /^https:/.test(url)
}

/** Download through the browsing session (honors proxy / Tor settings) */
export async function downloadPackage(url: string): Promise<Buffer> {
  const res = await session.fromPartition(SHARED_TAB_PARTITION).fetch(url, {
    redirect: 'follow',
    cache: 'no-store'
  } as RequestInit)
  if (!res.ok) {
    throw new Error(res.status === 204 || res.status === 404 ? 'The store has no download for this extension' : `Store returned HTTP ${res.status}`)
  }
  const length = Number(res.headers.get('content-length') || 0)
  if (length > MAX_DOWNLOAD_BYTES) throw new Error('Extension is too large')
  // Stop reading as soon as it is too big (content-length is optional and not trusted)
  const chunks: Buffer[] = []
  let received = 0
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    received += chunk.length
    if (received > MAX_DOWNLOAD_BYTES) throw new Error('Extension is too large')
    chunks.push(Buffer.from(chunk))
  }
  const buf = Buffer.concat(chunks)
  if (buf.length === 0) throw new Error('The store sent an empty file (the extension may be unavailable in your region)')
  return buf
}

/** Length-delimited protobuf fields of a message: [field number, bytes] (varints are skipped) */
function protoFields(buf: Buffer): Array<[number, Buffer]> {
  const out: Array<[number, Buffer]> = []
  let p = 0
  const varint = (): number => {
    let value = 0
    for (let shift = 0; shift < 35; shift += 7) {
      if (p >= buf.length) throw new Error('Corrupt extension signature')
      const byte = buf[p++]
      value += (byte & 0x7f) * 2 ** shift
      if (byte < 0x80) return value
    }
    throw new Error('Corrupt extension signature')
  }
  while (p < buf.length) {
    const tag = varint()
    const wire = tag & 7
    if (wire === 0) varint()
    else if (wire === 2) {
      const len = varint()
      if (p + len > buf.length) throw new Error('Corrupt extension signature')
      out.push([tag >>> 3, buf.subarray(p, p + len)])
      p += len
    } else throw new Error('Corrupt extension signature')
  }
  return out
}

/**
 * CRX3 check: the package must be signed by the key its id is derived from, and that id must be
 * the one the user asked for. A tampered or swapped download is refused.
 */
export function verifyCrx3(buf: Buffer, expectedId: string): void {
  const fail = () => new Error('This package is not signed by the extension you chose, so it was not installed')
  if (buf.length < 16 || buf.toString('latin1', 0, 4) !== 'Cr24' || buf.readUInt32LE(4) !== 3) throw fail()
  const headerSize = buf.readUInt32LE(8)
  if (headerSize > 1024 * 1024 || 12 + headerSize >= buf.length) throw fail()
  const header = protoFields(buf.subarray(12, 12 + headerSize))
  const payload = buf.subarray(12 + headerSize)

  // CrxFileHeader: 2 = RSA proofs, 3 = ECDSA proofs, 10000 = SignedData { 1 = crx id }
  const signedData = header.find(([n]) => n === 10000)?.[1]
  const crxId = signedData && protoFields(signedData).find(([n]) => n === 1)?.[1]
  if (!signedData || !crxId || crxId.length !== 16) throw fail()
  // Extension ids are hex written with a-p
  const id = [...crxId.toString('hex')].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('')
  if (id !== expectedId) throw fail()

  const length = Buffer.alloc(4)
  length.writeUInt32LE(signedData.length)
  const prefix = Buffer.concat([Buffer.from('CRX3 SignedData\0', 'latin1'), length, signedData])
  for (const [n, proof] of header) {
    if (n !== 2 && n !== 3) continue
    const fields = protoFields(proof)
    const publicKey = fields.find(([f]) => f === 1)?.[1]
    const signature = fields.find(([f]) => f === 2)?.[1]
    if (!publicKey || !signature) continue
    // Only the developer key counts: the one the id is the hash of
    if (!crypto.createHash('sha256').update(publicKey).digest().subarray(0, 16).equals(crxId)) continue
    const key = crypto.createPublicKey({ key: publicKey, format: 'der', type: 'spki' })
    const verifier = crypto.createVerify('sha256')
    verifier.update(prefix)
    verifier.update(payload)
    if (verifier.verify(key, signature)) return
    throw fail()
  }
  throw fail()
}

/**
 * Strip the CRX header (v2 or v3) and return the zip payload; plain zips pass through.
 * With expectedId (store downloads) the signature is verified first.
 */
export function crxToZip(buf: Buffer, expectedId?: string): Buffer {
  if (expectedId) verifyCrx3(buf, expectedId)
  if (buf.length >= 4 && buf.toString('latin1', 0, 2) === 'PK') return buf
  if (buf.length < 16 || buf.toString('latin1', 0, 4) !== 'Cr24') throw new Error('Not a valid extension package (.crx or .zip)')
  const version = buf.readUInt32LE(4)
  let offset: number
  if (version === 3) offset = 12 + buf.readUInt32LE(8)
  else if (version === 2) offset = 16 + buf.readUInt32LE(8) + buf.readUInt32LE(12)
  else throw new Error(`Unsupported CRX version ${version}`)
  if (offset >= buf.length) throw new Error('Corrupt extension package')
  return buf.subarray(offset)
}

/** Minimal, safe unzip (stored + deflate). Rejects absolute paths, "..", zip64 and zip bombs. */
export function unzipTo(zip: Buffer, destDir: string): void {
  // End of central directory: search the last 64 KB
  let eocd = -1
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Corrupt extension package (no zip directory)')
  const count = zip.readUInt16LE(eocd + 10)
  let p = zip.readUInt32LE(eocd + 16)
  if (count === 0xffff || p === 0xffffffff) throw new Error('Zip64 packages are not supported')
  if (count > MAX_FILES) throw new Error('Extension has too many files')

  const root = path.resolve(destDir)
  fs.mkdirSync(root, { recursive: true })
  let total = 0

  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt zip directory')
    const method = zip.readUInt16LE(p + 10)
    const compSize = zip.readUInt32LE(p + 20)
    const size = zip.readUInt32LE(p + 24)
    const nameLen = zip.readUInt16LE(p + 28)
    const extraLen = zip.readUInt16LE(p + 30)
    const commentLen = zip.readUInt16LE(p + 32)
    const localOffset = zip.readUInt32LE(p + 42)
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen).replace(/\\/g, '/')
    p += 46 + nameLen + extraLen + commentLen

    const target = path.resolve(root, name)
    if (path.isAbsolute(name) || name.split('/').includes('..') || (target !== root && !target.startsWith(root + path.sep))) {
      throw new Error(`Unsafe path in package: ${name}`)
    }
    if (name.endsWith('/')) {
      fs.mkdirSync(target, { recursive: true })
      continue
    }

    total += size
    if (total > MAX_UNPACKED_BYTES) throw new Error('Extension is too large when unpacked')

    if (zip.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Corrupt zip entry')
    const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28)
    const data = zip.subarray(dataStart, dataStart + compSize)
    let out: Buffer
    if (method === 0) out = Buffer.from(data)
    else if (method === 8) out = zlib.inflateRawSync(data, { maxOutputLength: Math.max(size, 1) })
    else throw new Error(`Unsupported compression in package (${method})`)
    if (out.length !== size) throw new Error(`Corrupt file in package: ${name}`)

    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, out)
  }
}

export interface ManifestSummary {
  name: string
  version: string
  description: string
  manifestVersion: number
  permissions: string[]
  /** Small icon as a data: URL, if the extension has one */
  icon?: string
  /** Toolbar popup page (relative path), if any */
  popup?: string
  /** Options page (relative path), if any */
  options?: string
  /** Declares a toolbar button (action / browser_action) */
  hasAction?: boolean
}

const relPage = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() && !/^[a-z]+:/i.test(v) ? v.trim().replace(/^\/+/, '') : undefined

/** Read manifest.json, resolving __MSG_x__ names from _locales */
export function readManifestSummary(dir: string): ManifestSummary | null {
  let m: any
  try {
    m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8').replace(/^﻿/, ''))
  } catch {
    return null
  }
  let messages: Record<string, { message?: string }> = {}
  const locales = [m.default_locale, 'en', 'en_US'].filter((l) => typeof l === 'string' && /^[A-Za-z0-9_-]{1,20}$/.test(l))
  for (const loc of locales) {
    try {
      messages = JSON.parse(fs.readFileSync(path.join(dir, '_locales', String(loc), 'messages.json'), 'utf8').replace(/^﻿/, ''))
      break
    } catch {}
  }
  const lower = Object.fromEntries(Object.entries(messages).map(([k, v]) => [k.toLowerCase(), v]))
  const t = (v: unknown): string => {
    if (typeof v !== 'string') return ''
    const match = v.match(/^__MSG_(.+)__$/)
    return match ? lower[match[1].toLowerCase()]?.message || '' : v
  }

  const perms = new Set<string>()
  for (const x of [...(m.permissions || []), ...(m.host_permissions || []), ...(m.optional_permissions || [])]) {
    if (typeof x === 'string') perms.add(x)
  }
  for (const cs of m.content_scripts || []) for (const x of cs?.matches || []) if (typeof x === 'string') perms.add(x)

  let icon: string | undefined
  try {
    const icons: Record<string, string> = m.icons || {}
    const best = Object.keys(icons)
      .map(Number)
      .filter((n) => n > 0)
      .sort((a, b) => Math.abs(a - 48) - Math.abs(b - 48))[0]
    if (best) {
      const rel = String(icons[String(best)]).replace(/^\/+/, '')
      const file = path.resolve(dir, rel)
      if (file.startsWith(path.resolve(dir) + path.sep) && /\.png$/i.test(file) && fs.statSync(file).size < 200_000) {
        icon = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`
      }
    }
  } catch {}

  return {
    name: t(m.name) || 'Extension',
    version: String(m.version || ''),
    description: t(m.description).slice(0, 300),
    manifestVersion: Number(m.manifest_version) || 2,
    permissions: [...perms].slice(0, 40),
    icon,
    popup: relPage(m.action?.default_popup ?? m.browser_action?.default_popup),
    options: relPage(m.options_ui?.page ?? m.options_page),
    hasAction: !!(m.action || m.browser_action)
  }
}
