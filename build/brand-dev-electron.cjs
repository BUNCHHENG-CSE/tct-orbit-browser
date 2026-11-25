/**
 * Runs before `npm run dev` / `npm run preview` (Windows): gives the development electron.exe the
 * TCT Orbit icon and name, so Task Manager, the taskbar and file icons don't show Electron's.
 * Only touches node_modules; reinstalling electron restores the original and the next run rebrands
 * it. Packaged builds are branded by electron-builder. Never stops dev from starting.
 */
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const exe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const ico = path.join(__dirname, 'icon.ico')

/**
 * Windows remembers a program's name and company the first time it shows them (Firewall prompt,
 * "Open with"), and keeps showing "Electron" / "GitHub, Inc." after the file was renamed. Remove
 * the two remembered values for this electron.exe only; Windows reads the file again.
 */
function forgetCachedName() {
  const key = 'HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\MuiCache'
  for (const name of ['FriendlyAppName', 'ApplicationCompany']) {
    try {
      const value = `${exe}.${name}`
      const out = execFileSync('reg', ['query', key, '/v', value], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      if (/REG_SZ\s+(Electron|GitHub, Inc\.)\s*$/m.test(out)) execFileSync('reg', ['delete', key, '/v', value, '/f'], { stdio: 'ignore' })
    } catch {
      // not cached
    }
  }
}

function main() {
  if (process.platform !== 'win32' || !fs.existsSync(exe)) return
  const ResEdit = require('resedit')
  const { productName, version, author } = require(path.join(root, 'package.json'))
  const company = String(author || productName).replace(/\s*<.*$/, '')

  const file = ResEdit.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true })
  const res = ResEdit.NtExecutableResource.from(file)
  const info = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0]
  const lang = info && info.getAllLanguagesForStringValues()[0]
  if (!info || !lang) throw new Error('no version info in electron.exe')
  const strings = { ProductName: productName, FileDescription: `${productName} (development)`, CompanyName: company, InternalName: productName }
  const current = info.getStringValues(lang)
  if (Object.keys(strings).every((k) => current[k] === strings[k])) {
    forgetCachedName()
    return // already branded
  }

  const icons = ResEdit.Data.IconFile.from(fs.readFileSync(ico)).icons.map((i) => i.data)
  for (const group of ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, group.id, group.lang, icons)
  }
  info.setStringValues(lang, strings)
  info.outputToResourceEntries(res.entries)
  res.outputResource(file)

  // Write next to it and swap, so an interrupted run can't leave a broken electron.exe
  const tmp = `${exe}.branding`
  fs.writeFileSync(tmp, Buffer.from(file.generate()))
  try {
    fs.renameSync(tmp, exe)
  } catch (err) {
    fs.rmSync(tmp, { force: true })
    throw err
  }
  forgetCachedName()
  console.log(`[Brand] Development electron.exe now uses the ${productName} icon (v${version})`)
}

try {
  main()
} catch (err) {
  // e.g. electron.exe is running (locked): try again next time
  console.warn(`[Brand] Could not brand the development electron.exe: ${err && err.message}`)
}
