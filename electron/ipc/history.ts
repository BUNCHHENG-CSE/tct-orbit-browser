import type { IpcMain } from 'electron'
import type {
  RecordVisitData,
  HistoryFilterOptions,
  HistoryClearRange
} from '../../src/types/api'
import { historyService } from '../storage/historyService'
import { pageIndex } from '../smart/pageIndex'
import { secureHandle, Schemas } from '../security'

export function register(ipcMain: IpcMain): void {
  // Record visit
  secureHandle(ipcMain, 'history:record', Schemas.historyRecord, async (_, data: RecordVisitData) => {
    return historyService.recordVisit(data)
  })

  // Get filtered/paginated history
  secureHandle(ipcMain, 'history:get', Schemas.historyGet, async (_, options?: HistoryFilterOptions) => {
    return historyService.getHistory(options || {})
  })

  // Search history
  secureHandle(ipcMain, 'history:search', Schemas.historySearch, async (_, data: { query: string; limit?: number }) => {
    return historyService.searchHistory(data.query, data.limit)
  })

  // Delete single history item
  secureHandle(ipcMain, 'history:delete', Schemas.historyDelete, async (_, id: string) => {
    const entry = historyService.getAllEntries().find((e) => e.id === id)
    if (entry) pageIndex.removeUrl(entry.url)
    return historyService.deleteItem(id)
  })

  // Delete by URL
  secureHandle(ipcMain, 'history:deleteByUrl', Schemas.historyDeleteByUrl, async (_, url: string) => {
    // Forgetting a page also forgets its text in the "pages you've read" search
    pageIndex.removeUrl(url)
    return historyService.deleteByUrl(url)
  })

  // Clear history by time range
  secureHandle(ipcMain, 'history:clear', Schemas.historyClear, async (_, range?: HistoryClearRange) => {
    const r = range || 'all'
    const now = Date.now()
    if (r === 'all') pageIndex.clear()
    else if (r === 'last-hour') pageIndex.removeSince(now - 3600_000)
    else if (r === 'last-7-days') pageIndex.removeSince(now - 7 * 86_400_000)
    else if (r === 'today') {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      pageIndex.removeSince(d.getTime())
    }
    return historyService.clearHistory(r)
  })
}
