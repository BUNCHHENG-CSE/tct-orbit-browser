/**
 * Runs before `npm run dev` / `npm run preview` (Windows): gives the development electron.exe the
 * TCT Orbit icon and name, so Task Manager, the taskbar and file icons don't show Electron's.
 * Only touches node_modules; reinstalling electron restores the original and the next run rebrands
 * it. Packaged builds are branded by electron-builder. Never stops dev from starting.
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const exe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const ico = path.join(__dirname, 'icon.ico')

function main() {
  if (process.platform !== 'win32' || !fs.existsSync(exe)) return
  const ResEdit = require('resedit')
  const { productName, version } = require(path.join(root, 'package.json'))

  const file = ResEdit.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true })
  const res = ResEdit.NtExecutableResource.from(file)
  const info = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0]
  const lang = info && info.getAllLanguagesForStringValues()[0]
  if (!info || !lang) throw new Error('no version info in electron.exe')
  if (info.getStringValues(lang).ProductName === productName) return // already branded

  const icons = ResEdit.Data.IconFile.from(fs.readFileSync(ico)).icons.map((i) => i.data)
  for (const group of ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, group.id, group.lang, icons)
  }
  info.setStringValues(lang, { ProductName: productName, FileDescription: `${productName} (development)` })
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
  console.log(`[Brand] Development electron.exe now uses the ${productName} icon (v${version})`)
}

try {
  main()
} catch (err) {
  // e.g. electron.exe is running (locked): try again next time
  console.warn(`[Brand] Could not brand the development electron.exe: ${err && err.message}`)
}
