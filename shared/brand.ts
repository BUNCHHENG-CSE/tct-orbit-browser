export type ReleaseChannel = 'stable' | 'nova' | 'deep' | 'canary'

export interface ChannelMeta {
  channel: ReleaseChannel
  name: string
  displayName: string
  appId: string
  /** Legacy folder name / URL scheme (tct-orbit, tct-orbit-nova, …). Also the Linux data folder. */
  userDataDirName: string
  /** Data folder name on Windows + macOS (e.g. %LOCALAPPDATA%\TCTOrbit\User Data) */
  dataFolder: string
  badgeLabel?: string
  badgeColor?: string
  description: string
}

export const BRAND = {
  name: 'TCT Orbit',
  version: '0.1.2',
  description: 'TCT Orbit (v0.1.2) — A fast, clean, and modern web browser built for smooth navigation and distraction-free workflows.',
  homepage: 'https://github.com/arzurlab/tct-orbit-browser',
  repository: 'https://github.com/arzurlab/tct-orbit-browser',
  author: 'TCT <arzurlab@users.noreply.github.com>',
  defaultChannel: 'stable' as ReleaseChannel
} as const

export const CHANNELS: Record<ReleaseChannel, ChannelMeta> = {
  stable: {
    channel: 'stable',
    name: 'TCT Orbit',
    displayName: 'TCT Orbit',
    appId: 'com.tctorbit.browser',
    userDataDirName: 'tct-orbit',
    dataFolder: 'TCTOrbit',
    badgeLabel: 'Stable',
    badgeColor: '#10b981',
    description: 'Official production release of TCT Orbit.'
  },
  nova: {
    channel: 'nova',
    name: 'TCT Orbit Nova',
    displayName: 'TCT Orbit Nova',
    appId: 'com.tctorbit.browser.nova',
    userDataDirName: 'tct-orbit-nova',
    dataFolder: 'TCTOrbitNova',
    badgeLabel: 'Nova (Beta)',
    badgeColor: '#8b5cf6',
    description: 'Public beta channel featuring upcoming innovations and UI enhancements.'
  },
  deep: {
    channel: 'deep',
    name: 'TCT Orbit Deep',
    displayName: 'TCT Orbit Deep',
    appId: 'com.tctorbit.browser.deep',
    userDataDirName: 'tct-orbit-deep',
    dataFolder: 'TCTOrbitDeep',
    badgeLabel: 'Deep (Nightly)',
    badgeColor: '#06b6d4',
    description: 'Nightly builds with bleeding-edge features and experimental performance flags.'
  },
  canary: {
    channel: 'canary',
    name: 'TCT Orbit Canary',
    displayName: 'TCT Orbit Canary',
    appId: 'com.tctorbit.browser.canary',
    userDataDirName: 'tct-orbit-canary',
    dataFolder: 'TCTOrbitCanary',
    badgeLabel: 'Canary',
    badgeColor: '#f59e0b',
    description: 'Developer preview channel with raw, uncurated changes.'
  }
}

export function resolveChannel(channelInput?: string | null): ChannelMeta {
  const normalized = (channelInput || '').trim().toLowerCase() as ReleaseChannel
  if (normalized in CHANNELS) {
    return CHANNELS[normalized]
  }
  return CHANNELS.stable
}

export interface AppInfo {
  name: string
  version: string
  channel: ReleaseChannel
}

/** Where users report problems (Help menu) */
export const ISSUES_URL = 'https://github.com/arzurlab/tct-orbit-browser/issues'
