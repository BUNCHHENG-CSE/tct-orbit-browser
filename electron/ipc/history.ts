import type { IpcMain } from 'electron'
import type {
  RecordVisitData,
  HistoryFilterOptions,
  HistoryClearRange
} from '../../src/types/api'
import { historyService } from '../storage/historyService'
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
    return historyService.deleteItem(id)
  })

  // Delete by URL
  secureHandle(ipcMain, 'history:deleteByUrl', Schemas.historyDeleteByUrl, async (_, url: string) => {
    return historyService.deleteByUrl(url)
  })

  // Clear history by time range
  secureHandle(ipcMain, 'history:clear', Schemas.historyClear, async (_, range?: HistoryClearRange) => {
    return historyService.clearHistory(range || 'all')
  })
}
