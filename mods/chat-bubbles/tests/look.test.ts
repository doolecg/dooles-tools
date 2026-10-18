import { expect, test } from 'claude-code/testing'

import { clip, groupLine, isCommandText, isQuiet, pathLine, subject, userLabel } from '../hooks/look'

test('a run of calls reads as counts in the order the tools first appeared', () => {
  expect(groupLine([{ tool: 'Read' }, { tool: 'Bash' }, { tool: 'Read' }, { tool: 'Read' }])).toBe('read 3, ran 1')
  expect(groupLine([{ tool: 'Custom' }])).toBe('custom 1')
  expect(groupLine([{ tool: 'Grep' }, { tool: 'Glob' }, { tool: 'Bash' }, { tool: 'PowerShell' }])).toBe('searched 2, ran 2')
})

test('a call is summed up by its command, path or pattern, and long text is cut', () => {
  expect(subject({ command: 'ls -la' })).toBe('ls -la')
  expect(subject({ file_path: 'a/b.ts', offset: 3 })).toBe('a/b.ts')
  expect(subject({ pattern: 'foo', path: 'src' })).toBe('foo')
  expect(subject({ url: 'https://x.dev' })).toBe('https://x.dev')
  expect(subject(null)).toBe('')
  expect(clip('one\n  two   three', 40)).toBe('one two three')
  expect(clip('x'.repeat(50), 10)).toBe('xxxxxxxxx…')
})

test('the folder line is cut from the left when it is too wide', () => {
  expect(pathLine('F:\\a\\b', 40)).toBe('F:\\a\\b')
  expect(pathLine('F:\\PROGRAMMING\\REPOS\\TerraOS', 12)).toBe('…POS\\TerraOS')
  expect(pathLine('x'.repeat(30), 12).length).toBe(12)
})

test('only reads, searches and commands are quiet', () => {
  expect(isQuiet('Read')).toBe(true)
  expect(isQuiet('Edit')).toBe(false)
})

test('shell lines and slash commands keep the folder; the name falls back to Doole', () => {
  expect(isCommandText('!ls')).toBe(true)
  expect(isCommandText('  /doole_settings')).toBe(true)
  expect(isCommandText('fix the bug')).toBe(false)
  expect(userLabel('')).toBe('Doole')
  expect(userLabel(undefined)).toBe('Doole')
  expect(userLabel(' Sam ')).toBe('Sam')
})
