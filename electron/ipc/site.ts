import { session, type IpcMain } from 'electron'
import { secureHandle, Schemas } from '../security'
import { getPersistentTabSessions, sessionForSpace } from '../sessions'
import { localStorageService } from '../storage/localStorage'
import type { SiteInfoResult, ClearSiteDataResult } from '../../src/types/api'

export function register(ipcMain: IpcMain): void {
  // 1. Get site info (security, cookies count, storage)
  secureHandle(ipcMain, 'site:get-info', Schemas.siteGetInfo, async (_, targetUrl: string, spaceId?: string): Promise<SiteInfoResult> => {
    try {
      const parsed = new URL(targetUrl)
      // Cookies live in the space's own profile when the space is isolated
      const tabSession = sessionForSpace(spaceId, !!spaceId && localStorageService.isSpaceIsolated(spaceId))

      let cookiesCount = 0
      try {
        const cookies = await tabSession.cookies.get({ url: targetUrl })
        cookiesCount = cookies.length
      } catch (err) {
        console.warn('[SiteIPC] Error getting cookies:', err)
      }

      return {
        origin: parsed.origin,
        protocol: parsed.protocol,
        isSecure: parsed.protocol === 'https:',
        cookiesCount,
        hasStorage: cookiesCount > 0
      }
    } catch {
      return {
        origin: targetUrl,
        protocol: 'http:',
        isSecure: false,
        cookiesCount: 0,
        hasStorage: false
      }
    }
  })

  // 2. Clear storage specifically for target origin
  secureHandle(ipcMain, 'site:clear-data', Schemas.siteClearData, async (_, origin: string): Promise<ClearSiteDataResult> => {
    try {
      const targetSessions = [...getPersistentTabSessions(), session.defaultSession]

      for (const ses of targetSessions) {
        if (!ses) continue
        await ses.clearStorageData({
          origin,
          storages: ['cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'serviceworkers', 'cachestorage']
        })
      }

      return { success: true, origin }
    } catch (err) {
      console.error('[SiteIPC] Error clearing site data for origin:', origin, err)
      return { success: false, origin }
    }
  })
}
