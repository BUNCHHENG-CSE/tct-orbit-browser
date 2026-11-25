/**
 * Line diff (longest common subsequence) for comparing two pages' text.
 * Inputs are capped so the O(n·m) table stays small (≤ 1500 × 1500 lines).
 */

export type DiffOp = { type: 'same' | 'left' | 'right'; text: string }

const MAX_LINES = 1500

export function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, MAX_LINES)
}

export function diffLines(a: string[], b: string[]): DiffOp[] {
  // Trim the shared start and end first: pages usually share header/footer
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  const n = midA.length
  const m = midB.length

  // lcs[i][j] = LCS length of midA[i..] and midB[j..], in one flat typed array
  const w = m + 1
  const lcs = new Uint16Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * w + j] = midA[i] === midB[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1])
    }
  }

  const ops: DiffOp[] = a.slice(0, start).map((text) => ({ type: 'same' as const, text }))
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      ops.push({ type: 'same', text: midA[i] })
      i++
      j++
    } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) {
      ops.push({ type: 'left', text: midA[i++] })
    } else {
      ops.push({ type: 'right', text: midB[j++] })
    }
  }
  while (i < n) ops.push({ type: 'left', text: midA[i++] })
  while (j < m) ops.push({ type: 'right', text: midB[j++] })
  for (const text of a.slice(endA)) ops.push({ type: 'same', text })
  return ops
}

export function diffStats(ops: DiffOp[]) {
  let same = 0
  let left = 0
  let right = 0
  for (const op of ops) {
    if (op.type === 'same') same++
    else if (op.type === 'left') left++
    else right++
  }
  const total = same + Math.max(left, right)
  return { same, left, right, similarity: total === 0 ? 1 : same / total }
}

/** Split a single-line text (watched area) into sentence-ish chunks for a readable diff */
export function toChunks(text: string): string[] {
  return text
    .split(/(?<=[.!?|•·])\s+|\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_LINES)
}
