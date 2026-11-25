import { session, type Session } from 'electron'
import { PRIVATE_PARTITION } from './privacy/types'

/**
 * Registry of browsing sessions used by web tabs.
 *
 * - SHARED_TAB_PARTITION: the normal persistent session shared by every space
 * - PRIVATE_PARTITION:    in-memory session for private tabs
 * - persist:space-<id>:   a separate profile for a space marked "isolated"
 *                         (own cookies, logins, storage and cache)
 *
 * Profile sessions are created lazily. Every subsystem that must configure a tab session
 * (privacy filters, permissions, proxy, downloads) registers with onTabSessionCreated() so
 * new profile sessions get exactly the same protection as the shared one.
 */

export const SHARED_TAB_PARTITION = 'persist:browser-tabs'
const PROFILE_PREFIX = 'persist:space-'
const PROFILE_PARTITION_RE = /^persist:space-[A-Za-z0-9_-]{1,80}$/

type SessionHook = (ses: Session, partition: string) => void

const hooks: SessionHook[] = []
const profileSessions = new Map<string, Session>()
let profileValidator: ((spaceId: string) => boolean) | null = null

export function profilePartitionFor(spaceId: string): string {
  return `${PROFILE_PREFIX}${spaceId}`
}

export function isProfilePartition(partition: unknown): partition is string {
  return typeof partition === 'string' && PROFILE_PARTITION_RE.test(partition)
}

export function spaceIdFromPartition(partition: string): string | null {
  return isProfilePartition(partition) ? partition.slice(PROFILE_PREFIX.length) : null
}

/** Only spaces that actually exist and are marked isolated may get a profile session */
export function setProfileValidator(fn: (spaceId: string) => boolean): void {
  profileValidator = fn
}

/** Run `hook` for every tab session that exists now and for each one created later */
export function onTabSessionCreated(hook: SessionHook): void {
  hooks.push(hook)
  for (const [partition, ses] of profileSessions) {
    try {
      hook(ses, partition)
    } catch (err) {
      console.error('[Sessions] Session hook failed:', err)
    }
  }
}

/**
 * Returns the partition a webview may use. Anything that is not a known tab partition
 * (or a profile for a space that is not isolated) falls back to the shared session.
 */
export function resolveTabPartition(requested: unknown): string {
  if (requested === SHARED_TAB_PARTITION || requested === PRIVATE_PARTITION) return requested
  if (isProfilePartition(requested)) {
    const spaceId = spaceIdFromPartition(requested)
    if (spaceId && (!profileValidator || profileValidator(spaceId))) {
      ensureProfileSession(requested)
      return requested
    }
  }
  return SHARED_TAB_PARTITION
}

/** Create (once) and configure the session for a profile partition */
export function ensureProfileSession(partition: string): Session {
  const existing = profileSessions.get(partition)
  if (existing) return existing
  const ses = session.fromPartition(partition)
  profileSessions.set(partition, ses)
  for (const hook of hooks) {
    try {
      hook(ses, partition)
    } catch (err) {
      console.error('[Sessions] Session hook failed:', err)
    }
  }
  console.log(`[Sessions] Profile session ready: ${partition}`)
  return ses
}

export function getProfileSessions(): Session[] {
  return Array.from(profileSessions.values())
}

/** Shared persistent session plus every profile session created so far */
export function getPersistentTabSessions(): Session[] {
  return [session.fromPartition(SHARED_TAB_PARTITION), ...getProfileSessions()]
}

/** Partition name of a tab session (for popups that must stay in the same profile) */
export function partitionOfSession(ses: Session): string {
  if (ses === session.fromPartition(PRIVATE_PARTITION)) return PRIVATE_PARTITION
  for (const [partition, s] of profileSessions) {
    if (s === ses) return partition
  }
  return SHARED_TAB_PARTITION
}

/** Session used by a space's (non-private) tabs */
export function sessionForSpace(spaceId: string | undefined, isolated: boolean): Session {
  if (spaceId && isolated) return ensureProfileSession(profilePartitionFor(spaceId))
  return session.fromPartition(SHARED_TAB_PARTITION)
}

/** Wipe a profile's data on disk (space deleted or isolation turned off) */
export async function clearProfileSession(spaceId: string): Promise<void> {
  const partition = profilePartitionFor(spaceId)
  const ses = profileSessions.get(partition) || session.fromPartition(partition)
  try {
    await ses.clearStorageData()
    await ses.clearCache()
    await ses.clearAuthCache()
    await ses.closeAllConnections()
  } catch (err) {
    console.warn(`[Sessions] Failed to clear profile ${partition}:`, err)
  }
}
