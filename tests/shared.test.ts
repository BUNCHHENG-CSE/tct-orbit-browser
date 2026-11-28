import { describe, expect, it } from 'vitest'
import {
  BROWSER_FIRST,
  buildKeymap,
  keySignature,
  comboFromInput,
  isAssignableCombo,
  matchShortcut,
  sanitizeOverrides,
  splitCombo,
  SHORTCUT_ACTIONS
} from '../shared/shortcuts'
import { formatLoginsCsv, parseCsv, parseLoginsCsv } from '../shared/csv'
import { matchesPattern, normalizePattern, pageKey, routeFor } from '../shared/siteRules'
import { isListedHost, parseHostsList } from '../shared/hostsList'
import { isExtraSpaceId, newExtraSpaceId } from '../shared/extraWindow'

const press = (key: string, code: string, mods: Partial<Record<'control' | 'meta' | 'shift' | 'alt', boolean>> = {}) => ({
  key,
  code,
  control: false,
  meta: false,
  shift: false,
  alt: false,
  ...mods
})

describe('shortcuts', () => {
  const map = buildKeymap()

  it('has no default used by two actions', () => {
    const all = SHORTCUT_ACTIONS.flatMap((a) => a.defaults)
    expect(new Set(all).size).toBe(all.length)
  })

  it.each([
    [press('t', 'KeyT', { control: true }), 'new-tab'],
    [press('T', 'KeyT', { control: true, shift: true }), 'reopen-tab'],
    [press('t', 'KeyT', { meta: true }), 'new-tab'],
    [press('3', 'Digit3', { control: true }), 'switch-tab-3'],
    [press('9', 'Numpad9', { control: true }), 'switch-tab-last'],
    [press('0', 'Numpad0', { control: true }), 'zoom-reset'],
    [press('+', 'NumpadAdd', { control: true }), 'zoom-in'],
    [press('+', 'Equal', { control: true, shift: true }), 'zoom-in'],
    [press('_', 'Minus', { control: true, shift: true }), 'zoom-out'],
    [press('Tab', 'Tab', { control: true, shift: true }), 'prev-tab'],
    [press('ArrowLeft', 'ArrowLeft', { alt: true }), 'back'],
    [press('\\', 'Backslash', { control: true }), 'toggle-split-view'],
    [press('N', 'KeyN', { alt: true, shift: true }), 'new-private-tab'],
    [press('N', 'KeyN', { control: true, shift: true }), 'new-private-tab'],
    [press('s', 'KeyS', { control: true }), 'save-page'],
    [press('<', 'Comma', { control: true, shift: true }), 'toggle-sidebar'],
    [press('M', 'KeyM', { control: true, shift: true }), 'toggle-notes'],
    [press('F5', 'F5', { control: true }), 'hard-reload'],
    [press('Escape', 'Escape', { shift: true }), 'open-task-manager']
  ])('%o -> %s', (input, action) => expect(matchShortcut(input, map)).toBe(action))

  it('leaves text formatting to pages', () => {
    for (const k of ['b', 'i']) expect(matchShortcut(press(k, 'Key' + k.toUpperCase(), { control: true }), map)).toBeNull()
  })

  it('keeps tab and window keys for the browser only', () => {
    expect([...BROWSER_FIRST].every((id) => id.startsWith('switch-tab-') || SHORTCUT_ACTIONS.some((a) => a.id === id))).toBe(true)
    expect(BROWSER_FIRST.has('open-command-bar')).toBe(false)
    expect(keySignature('KeyK', true, false, false, false)).toBe('KeyK|1000')
  })

  it('works on non-Latin layouts and leaves typing alone', () => {
    expect(matchShortcut(press('е', 'KeyT', { control: true }), map)).toBe('new-tab')
    expect(matchShortcut(press('t', 'KeyT'), map)).toBeNull()
    expect(comboFromInput(press('Control', 'ControlLeft', { control: true }))).toBeNull()
  })

  it('lets an override win and frees the old combo', () => {
    const m = buildKeymap({ 'new-tab': ['Mod+Shift+K'], 'open-history': ['Mod+J'] })
    expect(m.get('Mod+Shift+K')).toBe('new-tab')
    expect(m.get('Mod+T')).toBeUndefined()
    expect(m.get('Mod+J')).toBe('open-history')
  })

  it('rejects bad overrides', () => {
    expect(isAssignableCombo('A')).toBe(false)
    expect(isAssignableCombo('Shift+A')).toBe(false)
    expect(isAssignableCombo('F8')).toBe(true)
    expect(sanitizeOverrides({ 'new-tab': ['Mod+C', 'Q', 'Mod+E'], nope: ['Mod+E'], reload: 'x' })).toEqual({ 'new-tab': ['Mod+E'] })
    expect(splitCombo('Mod++')).toEqual(['Mod', '+'])
  })
})

describe('password csv', () => {
  it('round-trips awkward values', () => {
    const logins = [{ url: 'https://a.com', username: 'me, "x"', password: 'p"w,\n2 ' }]
    expect(parseLoginsCsv(formatLoginsCsv(logins)).logins).toEqual(logins)
  })

  it('reads Chrome, Firefox and Bitwarden headers', () => {
    expect(parseLoginsCsv('name,url,username,password,note\r\nA,https://a.com/login,u,p,\r\n').logins).toHaveLength(1)
    expect(parseLoginsCsv('"url","username","password","httpRealm"\n"https://b.com","u","p",""').logins[0].url).toBe('https://b.com')
    expect(parseLoginsCsv('folder,name,login_uri,login_username,login_password\n,x,c.com,u,p').logins[0]).toEqual({
      url: 'https://c.com',
      username: 'u',
      password: 'p'
    })
  })

  it('skips rows without a password or web address, and reports bad files', () => {
    const r = parseLoginsCsv('url,username,password\nhttps://a.com,u,\nandroid://x@app/,u,p\nhttps://b.com,u,p')
    expect(r.skipped).toBe(2)
    expect(r.logins.map((l) => l.url)).toEqual(['https://b.com'])
    expect(parseLoginsCsv('foo,bar\n1,2').error).toBeTruthy()
    expect(parseLoginsCsv('').error).toBeTruthy()
  })

  it('handles a BOM and newlines in quotes', () => expect(parseCsv('﻿a,"b\nc"\n')).toEqual([['a', 'b\nc']]))
})

describe('site rules', () => {
  it('normalizes what people type', () => {
    expect(normalizePattern(' https://WWW.GitHub.com/org/?x=1 ')).toBe('github.com/org')
    expect(normalizePattern('*.corp.com')).toBe('corp.com')
    expect(normalizePattern('localhost:3000')).toBe('localhost:3000')
    for (const bad of ['', 'hello', 'a b.com', '.com', 'javascript:alert(1)']) expect(normalizePattern(bad)).toBeNull()
  })

  it('matches hosts, subdomains and whole path segments only', () => {
    expect(matchesPattern('https://gist.github.com/x', 'github.com')).toBe(true)
    expect(matchesPattern('https://notgithub.com', 'github.com')).toBe(false)
    expect(matchesPattern('https://github.com.evil.com', 'github.com')).toBe(false)
    expect(matchesPattern('https://google.com/calendar/u/0', 'google.com/calendar')).toBe(true)
    expect(matchesPattern('https://google.com/calendars', 'google.com/calendar')).toBe(false)
    expect(matchesPattern('file:///github.com', 'github.com')).toBe(false)
  })

  it('prefers the most specific route', () => {
    const r = [
      { id: '1', pattern: 'google.com', spaceId: 'a' },
      { id: '2', pattern: 'google.com/calendar', spaceId: 'b' }
    ]
    expect(routeFor('https://www.google.com/calendar', r)).toBe('b')
    expect(routeFor('https://mail.google.com', r)).toBe('a')
    expect(routeFor('https://example.com', r)).toBeNull()
  })

  it('keys pages without the fragment', () => {
    expect(pageKey('https://a.com/x?y=1#z')).toBe('https://a.com/x?y=1')
    expect(pageKey('orbit://start')).toBeNull()
  })
})

describe('blocklists', () => {
  it('parses hosts files', () => {
    expect(parseHostsList('# c\n0.0.0.0 Bad.example # note\nplain.example\n0.0.0.0 localhost\n0.0.0.0 <x>\n')).toEqual([
      'bad.example',
      'plain.example'
    ])
  })

  it('matches exact hosts, not parents', () => {
    const l = new Set(['evil.weebly.com'])
    expect(isListedHost('evil.weebly.com', l)).toBe(true)
    expect(isListedHost('www.evil.weebly.com', l)).toBe(true)
    expect(isListedHost('weebly.com', l)).toBe(false)
    expect(isListedHost('good.weebly.com', l)).toBe(false)
  })
})

it('extra window ids', () => {
  expect(isExtraSpaceId(newExtraSpaceId())).toBe(true)
  for (const bad of ['__private-window__', 'space-1', '__window-__', null]) expect(isExtraSpaceId(bad)).toBe(false)
})
