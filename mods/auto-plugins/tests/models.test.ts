import { expect, test } from 'claude-code/testing'

import { aliasFor, suggestion, tierFor } from '../hooks/models'

test('tiers follow the worker presets', () => {
  expect(tierFor('commit and push the changes')).toBe('haiku')
  expect(tierFor('run the tests and rename the folder')).toBe('haiku')
  expect(tierFor('add a null check to the parser')).toBe('sonnet')
  expect(tierFor('build the HUD layout from the mockup')).toBe('opus')
  expect(tierFor('a tricky race condition in the save code')).toBe('opus')
  expect(tierFor('a big refactor of the renderer')).toBe('ask')
})

test('only haiku and opus are passed on; very hard work is left to ask', () => {
  expect(aliasFor('haiku')).toBe('haiku')
  expect(aliasFor('opus')).toBe('opus')
  expect(aliasFor('sonnet')).toBeUndefined()
  expect(aliasFor('ask')).toBeUndefined()
  expect(suggestion('sonnet')).toBeNull()
  expect(suggestion('ask')).toContain('Check with the user')
})
