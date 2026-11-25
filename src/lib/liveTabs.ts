/**
 * Live Work badges: many web apps put an unread count in the page title
 * ("(3) Slack", "Inbox (12) - me@mail.com", "(99+) WhatsApp"). Read it so the sidebar can
 * show a badge without the tab being open.
 */

const LEADING_COUNT = /^\s*[([](\d{1,5})(\+?)[)\]]\s*/
// Gmail / Outlook style: "Inbox (12) - ..." or "Inbox (12)"
const INBOX_COUNT = /^\s*(?:inbox|posteingang|boîte de réception|bandeja de entrada)\s*\((\d{1,5})(\+?)\)/i

export function getUnreadCount(title: string | null | undefined): string | null {
  if (!title) return null
  const m = title.match(LEADING_COUNT) || title.match(INBOX_COUNT)
  if (!m) return null
  const n = parseInt(m[1], 10)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n > 99) return '99+'
  return `${n}${m[2] || ''}`
}

/** Title without the unread prefix, so "(3) Slack" reads as "Slack" next to the badge */
export function stripUnreadPrefix(title: string): string {
  return title.replace(LEADING_COUNT, '')
}
