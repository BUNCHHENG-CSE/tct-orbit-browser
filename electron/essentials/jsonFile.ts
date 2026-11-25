import { app } from 'electron'
import fs from 'fs'
import path from 'path'

/** Small JSON file in the profile folder with atomic, debounced writes */
export class JsonFile<T> {
  private timer: NodeJS.Timeout | null = null
  private file = ''
  public data: T

  constructor(
    private readonly name: string,
    private readonly parse: (raw: unknown) => T
  ) {
    this.data = parse(undefined)
  }

  public load(): void {
    this.file = path.join(app.getPath('userData'), this.name)
    let raw: string
    try {
      raw = fs.readFileSync(this.file, 'utf8')
    } catch {
      return // first run
    }
    try {
      this.data = this.parse(JSON.parse(raw))
    } catch (err) {
      console.error(`[${this.name}] Unreadable, keeping a copy:`, err)
      // The next save would overwrite it: keep the damaged file so nothing is silently lost
      try {
        fs.copyFileSync(this.file, `${this.file}.damaged`)
      } catch {}
    }
  }

  public save(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 250)
  }

  public flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (!this.file) return
    const tmp = `${this.file}.tmp`
    try {
      fs.writeFileSync(tmp, JSON.stringify(this.data), { encoding: 'utf8', mode: 0o600 })
      fs.renameSync(tmp, this.file)
    } catch (err) {
      console.error(`[${this.name}] Could not save:`, err)
    }
  }

  /** Save now if a write is waiting (on quit) */
  public flushPending(): void {
    if (this.timer) this.flush()
  }
}
