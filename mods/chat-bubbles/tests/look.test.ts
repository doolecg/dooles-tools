import { expect, test } from 'claude-code/testing'

import { clip, detailLines, duration, groupLine, isCommandText, keepsRow, kindOf, outputText, pathLine, subject, userLabel } from '../hooks/look'

test('a run of calls reads as marks and counts in the order each kind first appeared', () => {
  expect(groupLine([{ tool: 'Read' }, { tool: 'Bash' }, { tool: 'Read' }, { tool: 'Read' }])).toBe('▤ File Read 3  ❯ Command Run 1')
  expect(groupLine([{ tool: 'Grep' }, { tool: 'Glob' }, { tool: 'Bash' }, { tool: 'PowerShell' }])).toBe('⌕ Searched 2  ❯ Command Run 2')
})

test('each tool goes by a plain name', () => {
  expect(kindOf('Edit').label).toBe('Code Edited')
  expect(kindOf('Write').label).toBe('Code Added')
  expect(kindOf('mcp__hindsight__hindsight_search_knowledge_pages').label).toBe('Hindsight Recall')
  expect(kindOf('mcp__hindsight__hindsight_ingest_document').label).toBe('Hindsight Saved')
  expect(kindOf('mcp__rea__xrefs').label).toBe('Tool Used')
})

test('the turn time and the expanded view', () => {
  expect(duration(6400)).toBe('6s')
  expect(duration(64000)).toBe('1m 4s')
  expect(outputText({ stdout: 'hi', stderr: '' })).toBe('hi')
  expect(detailLines('Edit', { old_string: 'a', new_string: 'b' }, undefined, 40)).toEqual(['- a', '+ b'])
  expect(detailLines('Bash', { command: 'ls' }, { stdout: 'x' }, 40)).toEqual(['$ ls', '', 'x'])
  expect(keepsRow('TodoWrite')).toBe(true)
  expect(keepsRow('Read')).toBe(false)
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

test('shell lines and slash commands keep the folder; the name falls back to Doole', () => {
  expect(isCommandText('!ls')).toBe(true)
  expect(isCommandText('  /doole_settings')).toBe(true)
  expect(isCommandText('fix the bug')).toBe(false)
  expect(userLabel('')).toBe('Doole')
  expect(userLabel(undefined)).toBe('Doole')
  expect(userLabel(' Sam ')).toBe('Sam')
})
