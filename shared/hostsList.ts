/** Hosts-file blocklists ("0.0.0.0 bad.example") used for phishing / malware protection */

export function parseHostsList(text: string): string[] {
  const out: string[] = []
  for (const line of text.split('\n')) {
    const clean = line.replace(/#.*$/, '').trim().toLowerCase()
    if (!clean) continue
    const parts = clean.split(/\s+/)
    const host = parts.length > 1 ? parts[1] : parts[0]
    if (host.length <= 253 && /^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/.test(host)) out.push(host)
  }
  return out
}

/**
 * Exact host or its www. form. Parent domains are not matched: the lists contain abused
 * subdomains of good hosts (e.g. one bad site on weebly.com).
 */
export function isListedHost(host: string, list: ReadonlySet<string>): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')
  return list.has(h) || (h.startsWith('www.') ? list.has(h.slice(4)) : list.has(`www.${h}`))
}
