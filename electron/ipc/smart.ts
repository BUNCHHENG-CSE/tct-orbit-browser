import type { IpcMain } from 'electron'
import { z } from 'zod'
import { secureHandle } from '../security'
import { smartService } from '../smart/smartService'
import { pageIndex } from '../smart/pageIndex'
import type { AddPageWatchData, IndexPageData, SnoozeTabData, SpaceFocusRule } from '../../src/types/smart'

const url = z.string().min(1).max(4096)
const id = z.string().min(1).max(64)
const spaceId = z.string().min(1).max(120)

const S = {
  id,
  bool: z.boolean(),
  snoozeAdd: z.object({
    url,
    title: z.string().max(2000),
    favicon: z.string().max(4096).nullable().optional(),
    spaceId,
    wakeAt: z.number().int().nonnegative().nullable(),
    wakeOnSpaceOpen: z.boolean()
  }),
  takeDue: spaceId.optional(),
  pageIndex: z.object({
    url,
    title: z.string().max(2000),
    favicon: z.string().max(4096).nullable().optional(),
    spaceId: spaceId.optional(),
    text: z.string().max(200_000)
  }),
  pageSearch: z.tuple([z.string().min(1).max(300), z.number().int().min(1).max(20).optional()]).or(z.string().min(1).max(300)),
  watchAdd: z.object({
    url,
    title: z.string().max(2000),
    selector: z.string().max(1000).nullable(),
    label: z.string().max(2000),
    intervalMin: z.number().int().min(1).max(100_000),
    spaceId: spaceId.nullable(),
    initialText: z.string().max(100_000)
  }),
  watchUpdate: z.tuple([id, z.object({ intervalMin: z.number().int().min(1).max(100_000).optional(), unseen: z.boolean().optional() })]),
  focusRules: z
    .array(
      z.object({
        spaceId,
        enabled: z.boolean(),
        when: z.enum(['always', 'sprint']),
        domains: z.array(z.string().max(253)).max(500)
      })
    )
    .max(200)
}

export function register(ipcMain: IpcMain): void {
  // Snoozed tabs
  secureHandle(ipcMain, 'smart:snooze-add', S.snoozeAdd, async (_, data: SnoozeTabData) => smartService.snoozeAdd(data))
  secureHandle(ipcMain, 'smart:snooze-list', null, async () => smartService.snoozeList())
  secureHandle(ipcMain, 'smart:snooze-remove', S.id, async (_, snoozeId: string) => smartService.snoozeRemove(snoozeId))
  secureHandle(ipcMain, 'smart:snooze-take-due', S.takeDue, async (_, sid?: string) => smartService.snoozeTakeDue(sid))

  // Full-text search over pages you've read
  secureHandle(ipcMain, 'smart:page-index', S.pageIndex, async (_, data: IndexPageData) => pageIndex.add(data))
  secureHandle(ipcMain, 'smart:page-search', S.pageSearch, async (_, query: string, limit?: number) => pageIndex.search(query, limit ?? 5))
  secureHandle(ipcMain, 'smart:page-index-status', null, async () => pageIndex.status())
  secureHandle(ipcMain, 'smart:page-index-enabled', S.bool, async (_, enabled: boolean) => pageIndex.setEnabled(enabled))
  secureHandle(ipcMain, 'smart:page-index-clear', null, async () => pageIndex.clear())

  // Page watchers
  secureHandle(ipcMain, 'smart:watch-list', null, async () => smartService.watchList())
  secureHandle(ipcMain, 'smart:watch-add', S.watchAdd, async (_, data: AddPageWatchData) => smartService.watchAdd(data))
  secureHandle(ipcMain, 'smart:watch-update', S.watchUpdate, async (_, watchId: string, patch: { intervalMin?: number; unseen?: boolean }) =>
    smartService.watchUpdate(watchId, patch)
  )
  secureHandle(ipcMain, 'smart:watch-remove', S.id, async (_, watchId: string) => smartService.watchRemove(watchId))
  secureHandle(ipcMain, 'smart:watch-check', S.id, async (_, watchId: string) => smartService.watchCheckNow(watchId))

  // Focus rules per space
  secureHandle(ipcMain, 'smart:focus-rules-get', null, async () => smartService.focusRulesGet())
  secureHandle(ipcMain, 'smart:focus-rules-set', S.focusRules, async (_, rules: SpaceFocusRule[]) => smartService.focusRulesSet(rules))
}
