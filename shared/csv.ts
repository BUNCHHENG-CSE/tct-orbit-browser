/** Password CSV files (Chrome, Edge, Firefox, Safari, Bitwarden ... export formats) */

export interface CsvLogin {
  url: string
  username: string
  password: string
}

/** RFC 4180 parser: quoted fields, doubled quotes, newlines inside quotes, CRLF or LF, BOM */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const endRow = () => {
    row.push(field)
    field = ''
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
  }
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (src[i + 1] === '"') {
        field += '"'
        i++
      } else quoted = false
    } else if (c === '"' && field === '') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      endRow()
    } else field += c
  }
  endRow()
  return rows
}

const URL_COLS = ['url', 'login_uri', 'website', 'web site', 'origin', 'hostname', 'login url', 'site']
const USER_COLS = ['username', 'login_username', 'user', 'login', 'email', 'login name', 'user name']
const PASS_COLS = ['password', 'login_password', 'pass']

export function parseLoginsCsv(text: string): { logins: CsvLogin[]; skipped: number; error?: string } {
  const rows = parseCsv(text)
  if (rows.length === 0) return { logins: [], skipped: 0, error: 'The file is empty.' }
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const find = (names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1
  const u = find(URL_COLS)
  const n = find(USER_COLS)
  const p = find(PASS_COLS)
  if (u < 0 || p < 0) return { logins: [], skipped: 0, error: 'This file has no "url" and "password" columns.' }
  const logins: CsvLogin[] = []
  let skipped = 0
  for (const r of rows.slice(1)) {
    const raw = (r[u] ?? '').trim()
    const password = r[p] ?? ''
    const url = raw && !/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? `https://${raw}` : raw
    if (!password || password.length > 1000 || !/^https?:\/\/[^\s/]+/i.test(url)) {
      skipped++
      continue
    }
    logins.push({ url, username: (n >= 0 ? r[n] ?? '' : '').trim().slice(0, 300), password })
  }
  return { logins, skipped }
}

const cell = (v: string) => (/[",\r\n]|^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** Same columns Chrome and Edge use, so the file imports anywhere */
export function formatLoginsCsv(logins: CsvLogin[]): string {
  const lines = ['name,url,username,password']
  for (const l of logins) {
    const name = l.url.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
    lines.push([name, l.url, l.username, l.password].map(cell).join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}
