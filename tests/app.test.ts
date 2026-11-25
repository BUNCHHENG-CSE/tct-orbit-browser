import { describe, expect, it, vi } from 'vitest'
import { buildGroupBackup, restoreGroups, sanitizeBookmarks, sanitizeGroups, sanitizeNotes } from '../electron/storage/backupContent'
import { SHORTCUT_ACTIONS } from '../shared/shortcuts'
import type { Tab, TabGroup } from '../src/types/api'

vi.mock('electron', () => ({ app: { getPreferredSystemLanguages: () => [] } }))
vi.mock('@/store/useBrowserStore', () => ({ useBrowserStore: Object.assign(() => null, { getState: () => ({ settings: {} }) }) }))

const group = (id: string, spaceId: string, parentId: string | null = null): TabGroup => ({
  id,
  spaceId,
  parentId,
  name: id.toUpperCase(),
  color: null,
  collapsed: false,
  order: 0,
  openLinksInGroup: false,
  createdAt: ''
})

describe('backup: tab groups', () => {
  const spaces = new Map([['s1', 'Personal']])

  it('round-trips nested groups into a space with another id', () => {
    const { groups, keyById } = buildGroupBackup([group('child', 's1', 'top'), group('top', 's1'), group('other', 'gone')], spaces)
    expect(groups).toHaveLength(2)
    const r = restoreGroups(sanitizeGroups(JSON.parse(JSON.stringify(groups))), new Map([['personal', 'new-space']]), [])
    const child = r.groups.find((g) => g.name === 'CHILD')!
    const top = r.groups.find((g) => g.name === 'TOP')!
    expect(child.parentId).toBe(top.id)
    expect(top.spaceId).toBe('new-space')
    expect(r.idFor(keyById.get('child'), 'new-space')).toBe(child.id)
    expect(r.idFor(keyById.get('child'), 'elsewhere')).toBeNull()
    expect(r.idFor(undefined, 'new-space')).toBeNull()
  })

  it('survives hostile files: loops, endless nesting, unknown spaces, wrong types', () => {
    const loop = [
      { key: 'a', parentKey: 'b', spaceName: 'Personal', name: 'A' },
      { key: 'b', parentKey: 'a', spaceName: 'Personal', name: 'B' }
    ]
    expect(restoreGroups(sanitizeGroups(loop), new Map([['personal', 'x']]), []).groups).toEqual([])
    const deep = Array.from({ length: 30 }, (_, i) => ({ key: `k${i}`, parentKey: i ? `k${i - 1}` : undefined, spaceName: 'Personal', name: 'n' }))
    const r = restoreGroups(sanitizeGroups(deep), new Map([['personal', 'x']]), [])
    const depth = (g: TabGroup): number => (g.parentId ? 1 + depth(r.groups.find((p) => p.id === g.parentId)!) : 1)
    expect(Math.max(...r.groups.map(depth))).toBeLessThanOrEqual(8)
    expect(sanitizeGroups('x')).toEqual([])
    expect(sanitizeGroups([null, 3, {}, { key: 'a' }])).toEqual([])
  })

  it('keeps existing groups and drops imported ones without tabs', () => {
    const { groups } = buildGroupBackup([group('top', 's1'), group('child', 's1', 'top'), group('empty', 's1')], spaces)
    const r = restoreGroups(groups, new Map([['personal', 's1']]), [group('mine', 's1')])
    const child = r.groups.find((g) => g.name === 'CHILD')!
    const kept = r.withTabs([{ groupId: child.id } as Tab]).map((g) => g.name)
    expect(kept.sort()).toEqual(['CHILD', 'MINE', 'TOP'])
  })
})

describe('backup: bookmarks and notes', () => {
  it('accepts web addresses only', () => {
    const list = sanitizeBookmarks([
      { id: '1', url: 'https://a.com', title: 'A', folder: 'F', order: 2, favicon: 'file:///x' },
      { url: 'javascript:alert(1)' },
      { url: 'file:///etc/passwd' },
      null
    ])
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ url: 'https://a.com', folder: 'F', order: 2, favicon: null })
  })

  it('needs a space and text for notes', () => {
    expect(sanitizeNotes([{ spaceName: 'A', content: 'x' }, { spaceName: 'A' }, { content: 'x' }, 5])).toHaveLength(1)
    expect(sanitizeNotes(undefined)).toEqual([])
  })
})

describe('spellcheck languages', async () => {
  const { pickLanguages } = await import('../electron/essentials/spellcheck')
  const available = ['en-US', 'en-GB', 'fr', 'de', 'pt-BR']
  it.each([
    [[], ['fr-FR'], ['fr']],
    [[], ['km-KH'], ['en-US']],
    [['de'], ['fr-FR'], ['de']],
    [['xx'], ['en-GB'], ['en-GB']],
    [[], ['pt-PT'], ['pt-BR']]
  ])('chosen %j, system %j -> %j', (chosen, system, out) => expect(pickLanguages(chosen, system, available)).toEqual(out))
})

describe('interface language', async () => {
  const { resolveLanguage, translate } = await import('../src/lib/i18n')
  const { TRANSLATIONS } = await import('../src/lib/locales')

  it('is English unless chosen', () => {
    expect(resolveLanguage(undefined, 'de-DE')).toBe('en')
    expect(resolveLanguage('system', 'de-AT')).toBe('de')
    expect(resolveLanguage('system', 'ja')).toBe('en')
  })

  it('falls back to English and has no empty texts', () => {
    expect(translate('Settings', 'fr')).toBe('Paramètres')
    expect(translate('Not translated', 'fr')).toBe('Not translated')
    for (const [key, row] of Object.entries(TRANSLATIONS)) for (const text of row) expect(text.trim(), key).not.toBe('')
  })

  it('translates every shortcut label', () => {
    for (const a of SHORTCUT_ACTIONS) expect(TRANSLATIONS[a.label], a.label).toBeDefined()
  })
})

describe('dropped links', async () => {
  vi.doMock('@/lib/ipc', () => ({ api: {} }))
  vi.doMock('@/lib/tabPlacement', () => ({ placeNewTab: () => {} }))
  vi.doMock('sonner', () => ({ toast: {} }))
  const { linkFromData } = await import('../src/lib/linkDrop')

  it('takes the first web address', () => {
    expect(linkFromData('# comment\r\nhttps://youtube.com/watch?v=1\r\nhttps://b.com', 'x')).toBe('https://youtube.com/watch?v=1')
    expect(linkFromData('', ' https://a.com/ ')).toBe('https://a.com/')
  })

  it('refuses everything else', () => {
    for (const bad of ['file:///C:/x', 'javascript:alert(1)', 'data:text/html,x', 'some words', 'https://a b', '']) expect(linkFromData(bad, '')).toBeNull()
  })
})

describe('load errors', async () => {
  const { describeLoadError } = await import('../src/lib/netErrors')

  it.each([
    [-105, 'This site can’t be found'],
    [-106, 'You are offline'],
    [-102, 'The site refused to connect'],
    [-118, 'The site took too long'],
    [-201, 'Your connection is not private'],
    [-999, 'Unable to reach webpage']
  ])('%i -> %s', (code, title) => expect(describeLoadError(code, 'ERR_X', 'https://a.com/x').title).toBe(title))

  it('survives odd addresses', () => expect(describeLoadError(-105, '', 'not a url').text).toContain('The site'))
})
