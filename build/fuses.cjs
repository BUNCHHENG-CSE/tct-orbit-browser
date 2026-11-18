const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
const path = require('path')
const fs = require('fs')

/**
 * Electron Builder afterPack hook:
 * Flips Electron fuses on the packaged binary for production anti-tampering:
 * - RunAsNode: false (disables ELECTRON_RUN_AS_NODE environment exploit)
 * - EnableCookieEncryption: true (enables OS-level cookie encryption)
 * - EnableNodeOptionsEnvironmentVariable: false (prevents injecting malicious NODE_OPTIONS)
 * - EnableNodeCliInspectArguments: false (prevents attaching debugger via --inspect flag)
 * - EnableEmbeddedAsarIntegrityValidation: true (validates ASAR checksums before loading)
 * - OnlyLoadAppFromAsar: true (blocks loading loose files outside the .asar package)
 */
module.exports = async function (context) {
  const { appOutDir, packager } = context
  const platform = context.electronPlatformName || process.platform
  const isWin = platform === 'win32' || packager.platform.name === 'windows' || packager.platform.buildConfigurationKey === 'win'
  const isMac = platform === 'darwin' || packager.platform.name === 'mac'

  let executablePath = ''

  if (isMac) {
    const appBundleName = `${packager.appInfo.productFilename}.app`
    executablePath = path.join(
      appOutDir,
      appBundleName,
      'Contents',
      'MacOS',
      packager.appInfo.productFilename
    )
  } else if (isWin) {
    executablePath = path.join(
      appOutDir,
      `${packager.executableName || 'tct-orbit'}.exe`
    )
    if (!fs.existsSync(executablePath)) {
      executablePath = path.join(
        appOutDir,
        `${packager.appInfo.productFilename}.exe`
      )
    }
  } else {
    // Linux
    executablePath = path.join(
      appOutDir,
      packager.executableName || 'tct-orbit'
    )
  }

  if (!fs.existsSync(executablePath)) {
    console.warn(`[Fuses] Executable not found at ${executablePath}, skipping fuses.`)
    return
  }

  console.log(`[Fuses] Applying production Electron security fuses to: ${executablePath}`)

  await flipFuses(executablePath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true
  })

  console.log('[Fuses] Production Electron security fuses successfully applied.')
}
