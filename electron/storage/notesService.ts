import fs from 'fs'
import path from 'path'
import { getAppPaths } from './paths'
import type { SpaceNote } from '../../src/types/api'

class NotesService {
  private notes: Record<string, SpaceNote> = {}
  private filePath: string = ''
  private saveTimeout: NodeJS.Timeout | null = null

  public init(): void {
    try {
      const paths = getAppPaths()
      this.filePath = path.join(paths.userProfileDir, 'notes.json')

      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8')
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          this.notes = parsed
          console.log(`[NotesService] Loaded space notes from:`, this.filePath)
        }
      }
    } catch (err) {
      console.warn('[NotesService] Failed to load notes, initializing fresh:', err)
      this.notes = {}
    }
  }

  private scheduleSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }
    this.saveTimeout = setTimeout(() => {
      this.persist()
    }, 400)
  }

  private persist(): void {
    if (!this.filePath) return
    try {
      const tmp = `${this.filePath}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(this.notes, null, 2), 'utf-8')
      fs.renameSync(tmp, this.filePath)
    } catch (err) {
      console.error('[NotesService] Failed to persist notes:', err)
    }
  }

  public getNote(spaceId: string): string {
    if (!spaceId) return ''
    return this.notes[spaceId]?.content || ''
  }

  public saveNote(spaceId: string, content: string): boolean {
    if (!spaceId) return false
    this.notes[spaceId] = {
      spaceId,
      content,
      updatedAt: new Date().toISOString()
    }
    this.scheduleSave()
    return true
  }

  /** Note from a backup. Merge never overwrites: different text is added below the current note. */
  public restoreNote(spaceId: string, content: string, mode: 'merge' | 'replace'): boolean {
    const current = this.getNote(spaceId)
    if (mode === 'merge' && current.trim()) {
      if (current.includes(content.trim())) return false
      return this.saveNote(spaceId, `${current.trimEnd()}\n\n${content}`)
    }
    return this.saveNote(spaceId, content)
  }

  public getAllNotes(): Record<string, SpaceNote> {
    return { ...this.notes }
  }

  public restoreNotes(imported: Record<string, SpaceNote>, mode: 'merge' | 'replace'): number {
    if (!imported || typeof imported !== 'object') return 0
    if (mode === 'replace') {
      this.notes = { ...imported }
    } else {
      this.notes = {
        ...imported,
        ...this.notes
      }
    }
    this.persist()
    return Object.keys(this.notes).length
  }
}

export const notesService = new NotesService()
