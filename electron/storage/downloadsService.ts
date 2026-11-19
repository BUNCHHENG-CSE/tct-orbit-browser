import fs from 'fs'
import path from 'path'
import { getAppPaths } from './paths'
import type { DownloadRecord } from '../../src/types/api'

const MAX_DOWNLOAD_RECORDS = 500

class DownloadsService {
  private records: DownloadRecord[] = []
  private filePath: string = ''
  private saveTimeout: NodeJS.Timeout | null = null

  public init(): void {
    try {
      const paths = getAppPaths()
      this.filePath = path.join(paths.userProfileDir, 'downloads.json')

      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8')
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          this.records = parsed
          console.log(`[DownloadsService] Loaded ${this.records.length} download records from:`, this.filePath)
        }
      }
    } catch (err) {
      console.warn('[DownloadsService] Failed to load downloads, initializing fresh:', err)
      this.records = []
    }
  }

  private scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }
    this.saveTimeout = setTimeout(() => {
      this.persist()
    }, 500)
  }

  private persist(): void {
    if (!this.filePath) return
    try {
      const tmp = `${this.filePath}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(this.records, null, 2), 'utf-8')
      fs.renameSync(tmp, this.filePath)
    } catch (err) {
      console.error('[DownloadsService] Failed to persist downloads:', err)
    }
  }

  public addOrUpdate(data: Partial<DownloadRecord> & { id: string; filename?: string }): DownloadRecord {
    const idx = this.records.findIndex((r) => r.id === data.id)
    let record: DownloadRecord

    if (idx !== -1) {
      record = {
        ...this.records[idx],
        ...data
      }
      this.records[idx] = record
    } else {
      record = {
        id: data.id,
        filename: data.filename || 'download',
        savePath: data.savePath || '',
        totalBytes: data.totalBytes || 0,
        receivedBytes: data.receivedBytes || 0,
        state: data.state || 'progressing',
        startTime: data.startTime || new Date().toISOString(),
        endTime: data.endTime,
        url: data.url
      }
      this.records.unshift(record)
    }

    if (this.records.length > MAX_DOWNLOAD_RECORDS) {
      this.records = this.records.slice(0, MAX_DOWNLOAD_RECORDS)
    }

    this.scheduleSave()
    return record
  }

  public list(): DownloadRecord[] {
    return [...this.records]
  }

  public delete(id: string, deleteDiskFile = false): boolean {
    const idx = this.records.findIndex((r) => r.id === id)
    if (idx !== -1) {
      const target = this.records[idx]
      this.records.splice(idx, 1)

      if (deleteDiskFile && target.savePath && fs.existsSync(target.savePath)) {
        try {
          fs.unlinkSync(target.savePath)
        } catch (err) {
          console.warn('[DownloadsService] Failed to delete file on disk:', err)
        }
      }

      this.scheduleSave()
      return true
    }
    return false
  }

  public clear(): boolean {
    this.records = []
    this.scheduleSave()
    return true
  }
}

export const downloadsService = new DownloadsService()
