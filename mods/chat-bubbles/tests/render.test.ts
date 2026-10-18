import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

function world(on: On) {
  on('command.register', (_$, e) => ({ value: { command: e.name } }) as any)
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as any)
  // The engine's own rows, so a hook that passes is told apart from one that draws.
  on('ui.render', (($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return (globalThis as any).h(Text, {}, 'vanilla row')
  }) as any)
}

async function texts($: any, component: string, props: unknown) {
  const ui = await $.ui.mount({ plugin: 'chat-bubbles', surface: 'terminal', component, props, viewport: { columns: 100, rows: 40 } } as any)
  const all = (await ui.findAll({ type: 'Text' })).map((t: any) => String(t.text)).join('\n')
  await ui.unmount()
  return all
}

test('your message is drawn under your name', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '.' } as any)
  const all = await texts($, 'UserMessage', { text: 'hi', origin: { kind: 'composer' }, isExpanded: false })
  expect(all).toContain('Doole')
  expect(all).not.toContain('vanilla row')
})

test('a tool call is a named line with a corner line and its text', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '.' } as any)
  const all = await texts($, 'ToolUse', { tool_use_id: 'u1', tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false, output: { stdout: '' } })
  expect(all).toContain('Command Run')
  expect(all).toContain('╰─ ls')
})

test('the line under a reply shows the turn time', async ($, on) => {
  world(on)
  await $.session.start({ cwd: '.' } as any)
  const all = await texts($, 'TurnDuration', { durationMs: 6000 })
  expect(all).toContain('✻ 6s')
})
