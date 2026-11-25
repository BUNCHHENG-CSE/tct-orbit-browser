const fs = require('fs')
const { version } = require('./package.json')

/**
 * Microsoft Store package: npm run dist:store -> dist/store/*.appx (upload it in Partner Center).
 * Not signed here: the Store signs it after certification. The normal installer is unchanged
 * (electron-builder.yml).
 *
 * Identity values come from Partner Center > Product identity and must match exactly.
 */

// The Store refuses versions starting with 0 and reserves the 4th number, so the package version
// is one major ahead of the app: 0.1.2 -> 1.1.2.0, 1.0.0 -> 2.0.0.0. Always increasing.
const [major, minor, patch] = version.split('-')[0].split('.').map(Number)
const storeVersion = `${major + 1}.${minor}.${patch}.0`

module.exports = {
  extends: './electron-builder.yml',
  directories: { output: 'dist/store' },
  // The Store delivers updates itself
  publish: null,
  extraMetadata: { author: { name: 'HANG BUNCHHENG' } },
  // Installer-only settings: the Store package declares links in its own manifest
  protocols: [],
  win: {
    target: [{ target: 'appx', arch: ['x64'] }],
    legalTrademarks: ''
  },
  appx: {
    artifactName: 'tct-orbit-${version}-${arch}-store.${ext}',
    identityName: 'HANGBUNCHHENG.TCTOrbitBrowser',
    publisher: 'CN=71DD220F-8418-4CA5-B7F3-99ABAE33C044',
    publisherDisplayName: 'HANG BUNCHHENG',
    // Must be the name reserved in Partner Center
    displayName: 'TCT Orbit Browser',
    applicationId: 'TCTOrbit',
    backgroundColor: 'transparent',
    languages: ['en-US'],
    customManifestPath: 'store/appxmanifest.xml'
  },
  appxManifestCreated: async (file) => {
    const xml = fs.readFileSync(file, 'utf8')
    const out = xml.replace(/(<Identity\b[^>]*\bVersion=")[^"]*(")/, `$1${storeVersion}$2`)
    if (out === xml && !xml.includes(`Version="${storeVersion}"`)) throw new Error('Could not set the Store version')
    fs.writeFileSync(file, out)
    console.log(`[Store] Package version ${storeVersion} (app ${version})`)
  }
}
