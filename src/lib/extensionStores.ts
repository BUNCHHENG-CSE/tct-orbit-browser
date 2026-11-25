/** Extension stores TCT Orbit can install from (Chromium-format extensions) */
export const EXTENSION_STORES = [
  { id: 'chrome', name: 'Chrome Web Store', url: 'https://chromewebstore.google.com/category/extensions' },
  { id: 'edge', name: 'Edge Add-ons', url: 'https://microsoftedge.microsoft.com/addons/Microsoft-Edge-Extensions-Home' },
  { id: 'opera', name: 'Opera add-ons', url: 'https://addons.opera.com/en/extensions/' }
] as const

export const STORE_LABEL: Record<string, string> = {
  chrome: 'Chrome Web Store',
  edge: 'Edge Add-ons',
  opera: 'Opera add-ons',
  file: 'Package file',
  builtin: 'Built-in'
}

const CHROME_ID = /^[a-p]{32}$/

/** Is this an extension's own page in a supported store? (shows "Add to TCT Orbit") */
export function isStoreDetailUrl(url: string | null | undefined): boolean {
  if (!url) return false
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  const parts = u.pathname.split('/').filter(Boolean)
  const host = u.hostname.toLowerCase()
  if (host === 'chromewebstore.google.com' || (host === 'chrome.google.com' && parts[0] === 'webstore')) {
    return parts.some((p) => CHROME_ID.test(p))
  }
  if (host === 'microsoftedge.microsoft.com') return parts.includes('detail') && parts.some((p) => CHROME_ID.test(p))
  if (host === 'addons.opera.com') {
    const i = parts.indexOf('details')
    return i >= 0 && !!parts[i + 1] && parts[i - 1] === 'extensions'
  }
  return false
}

/** Plain-language description of a manifest permission or host pattern */
export function describePermission(p: string): string {
  const known: Record<string, string> = {
    '<all_urls>': 'Read and change all your data on all websites',
    '*://*/*': 'Read and change all your data on all websites',
    'http://*/*': 'Read and change your data on all http websites',
    'https://*/*': 'Read and change your data on all https websites',
    tabs: 'Read your browsing history',
    history: 'Read and change your browsing history',
    bookmarks: 'Read and change your bookmarks',
    cookies: 'Read and change cookies',
    downloads: 'Manage your downloads',
    storage: 'Store data locally',
    unlimitedStorage: 'Store unlimited data locally',
    clipboardRead: 'Read data you copy',
    clipboardWrite: 'Change data you copy',
    notifications: 'Show notifications',
    webRequest: 'Observe network requests',
    declarativeNetRequest: 'Block or change network requests',
    declarativeNetRequestWithHostAccess: 'Block or change network requests',
    scripting: 'Run scripts on pages',
    activeTab: 'Access the current page when you use it',
    contextMenus: 'Add items to right-click menus',
    geolocation: 'Know your location',
    management: 'Manage your other extensions',
    privacy: 'Change privacy settings',
    proxy: 'Change proxy settings',
    nativeMessaging: 'Talk to apps on your computer',
    identity: 'Know your signed-in identity',
    alarms: 'Run tasks on a schedule',
    offscreen: 'Run in the background',
    sidePanel: 'Show a side panel (not supported in TCT Orbit)'
  }
  if (known[p]) return known[p]
  if (/^(\*|https?):\/\//.test(p)) {
    const host = p.replace(/^(\*|https?):\/\//, '').split('/')[0].replace(/^\*\./, '')
    return `Read and change your data on ${host || 'some sites'}`
  }
  return p
}
