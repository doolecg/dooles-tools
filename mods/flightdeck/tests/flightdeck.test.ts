import { describe, expect, mock, test } from 'claude-code/testing'

import { NAMES, critterOf, critterPixels, rasterOf } from '../hooks/critter'
import {
  DARK,
  EMPTY_MAIN as EMPTY,
  LIGHT,
  agentMetrics,
  actionOf,
  agentNow,
  agoText,
  applyStep,
  callOf,
  costOf,
  fileRows,
  fmtDuration,
  fmtTokens,
  groupAgents,
  headline,
  modelName,
  newAgent,
  paletteFor,
  parseGitStatus,
  recentActions,
  reconcile,
  statusFromList,
  stepText,
  summaryOf,
  noteUses,
  useRows,
  usesOf,
  wantOpen,
  windowOf,
} from '../hooks/logic'
import { RUN_ROWS, scrollThumb, splitRows } from '../hooks/pane'
import { DENSE_FULL, sbMeter, sbRasterCells, sbSweep } from '../hooks/sidebar-kit'

const PLUGIN = 'flightdeck'
const T0 = 1_800_000_000_000
const SESSION = { cwd: 'F:/proj', surface: 'terminal', isInteractive: true } as any
const USAGE = { input_tokens: 10, output_tokens: 900, cache_read_input_tokens: 30_000, cache_creation_input_tokens: 5_000 }

const pane = (bodyColumns = 60) =>
  ({
    plugin: PLUGIN,
    component: 'Pane' as const,
    requestId: 'flightdeck',
    props: { title: 'Flightdeck', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
  }) as any

const command = (args = '') =>
  ({ command: 'flightdeck', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 160 } }) as any

// ---------------------------------------------------------------- pure behaviour

describe('logic', () => {
  test('model names, tokens and times read plainly', () => {
    expect(modelName('claude-haiku-5-5')).toBe('Haiku 5.5')
    expect(modelName('claude-opus-5-5[1m]')).toBe('Opus 5.5')
    expect(modelName('haiku')).toBe('Haiku')
    expect(modelName('inherit')).toBe('')
    expect(fmtTokens(35_900)).toBe('35.9k')
    expect(fmtTokens(812)).toBe('812')
    expect(fmtDuration(6_000)).toBe('0:06')
    expect(fmtDuration(3_725_000)).toBe('1:02:05')
  })

  test('the palette is Bottom Bar’s, picked by the theme', () => {
    expect(paletteFor('dark')).toBe(DARK)
    expect(paletteFor('light-daltonized')).toBe(LIGHT)
    expect(DARK.border).toBe('#4E4943')
    expect(DARK.panel).toBe('#24201D')
    expect(LIGHT.accent).toBe('#C15F3C')
  })

  test('an agent step sets its context and adds up its cost', () => {
    const a = applyStep(newAgent('a1', T0), { model: 'claude-haiku-5-5', usage: { ...USAGE, model: 'claude-haiku-5-5' } })
    expect(a.ctxTokens).toBe(35_910)
    expect(a.steps).toBe(1)
    expect(a.isCostKnown).toBe(true)
    expect(Math.abs(a.costUsd - costOf(USAGE, 'claude-haiku-5-5')!) < 1e-12).toBe(true)
    const b = applyStep(a, { model: 'claude-haiku-5-5', usage: { ...USAGE, model: 'claude-haiku-5-5' } })
    expect(Math.abs(b.costUsd - a.costUsd * 2) < 1e-12).toBe(true)
    const unpriced = applyStep(newAgent('a2', T0), { model: 'some-other-model', usage: { ...USAGE, model: 'some-other-model' } })
    expect(unpriced.isCostKnown).toBe(false)
    expect(windowOf('claude-haiku-4-5', '', 0)).toBe(200_000)
    expect(windowOf('claude-opus-5-5', 'claude-opus-5-5[1m]', 1_000_000)).toBe(1_000_000)
  })

  test('the agent list fills in what the hooks missed', () => {
    const known = [newAgent('a1', T0, { description: 'Say hi' })]
    const listed = [
      { id: 'a1', description: 'Say hi', type: 'general-purpose', status: 'completed' },
      { id: 'a2', description: 'Look around', type: 'Explore', status: 'running' },
      { id: 'mate', description: 'team', type: 'teammate', status: 'running', teammateId: 'x@team' },
    ]
    const out = reconcile(known, listed, T0 + 5000)
    expect(out.map(a => [a.id, a.status])).toEqual([
      ['a1', 'done'],
      ['a2', 'running'],
    ])
    expect(out[0]!.endedAt).toBe(T0 + 5000)
    expect(reconcile(out, listed, T0 + 9000)).toBe(out)
    expect(statusFromList('killed')).toBe('stopped')
    expect(statusFromList('idle')).toBe('waiting')
  })

  test('groups, totals and the metrics line', () => {
    const run = applyStep(newAgent('r', T0 + 2000), { model: 'claude-haiku-5-5', usage: { ...USAGE, model: 'claude-haiku-5-5' } })
    const done = { ...newAgent('d', T0, { status: 'done' as const, endedAt: T0 + 6000 }) }
    const g = groupAgents([done, run])
    expect(g.working.map(a => a.id)).toEqual(['r'])
    expect(g.finished.map(a => a.id)).toEqual(['d'])
    const s = summaryOf([done, run], T0 + 8000)
    expect(s.tokens).toBe('35.9k')
    expect(s.time).toBe('0:08')
    expect(agentMetrics(run, 200_000, T0 + 8000)).toBe('ctx 18% · 35.9k  ≈$0.001  0:06')
    expect(wantOpen('', false)).toBe(true)
    expect(wantOpen('', true)).toBe(false)
    expect(wantOpen('open', true)).toBe(true)
    expect(wantOpen('off', false)).toBe(false)
  })

  test('the running and finished lists share the rows left, each scrolling on its own', () => {
    expect(splitRows(30, 9, 4)).toEqual({ run: 9, done: 4 })
    const tight = splitRows(20, 10 * RUN_ROWS, 12)
    expect(tight.run % RUN_ROWS).toBe(0)
    expect(tight.run + tight.done).toBeLessThanOrEqual(20)
    expect(tight.done).toBeGreaterThanOrEqual(3)
    expect(splitRows(2, 6, 5)).toEqual({ run: 3, done: 3 })
    expect(scrollThumb(6, 3, 6, 0)).toEqual([0, 6])
    expect(scrollThumb(6, 12, 6, 0)).toEqual([0, 3])
    expect(scrollThumb(6, 12, 6, 6)).toEqual([3, 6])
  })

  test('pixel meters and critters have the size they are drawn at', () => {
    const look = { stops: ['#E8A06A', '#D9667F'], track: '#3A3531', tint: '#FFF6EC', tick: 3 }
    expect(sbMeter(20, 0.4, look)).toHaveLength(20)
    expect(sbSweep(20, look)).toHaveLength(20)
    expect(sbMeter(8, 1, look).every(p => p.ch === DENSE_FULL)).toBe(true)
    // Three 32-bit words per cell, base64: 12 bytes is 16 characters.
    expect(sbRasterCells(sbMeter(5, 0.5, look), '#24201D')).toHaveLength(5 * 16)
    const r = rasterOf(critterPixels('agent-1'))
    expect([r.columns, r.rows]).toEqual([12, 6])
    expect(critterOf('agent-1')).toEqual(critterOf('agent-1'))
    expect(NAMES).toContain(critterOf('agent-1').name)
    expect(critterPixels('agent-1', true)[0]!.every(c => c === -1)).toBe(true)
  })
})

describe('right now', () => {
  const main = { ...EMPTY, isRunning: true, turnStartedAt: T0 }
  const call = (tool: string, input: Record<string, unknown>, at = T0 + 1000) => callOf(`id-${at}`, tool, input, at)

  test('the headline says what Claude is doing in plain words', () => {
    const edit = call('Edit', { file_path: 'F:/proj/mods/hooks/desktop.tsx' })
    expect(headline([edit], null, main, { path: 'x', added: 18, removed: 6 }, 'step 2 of 4: Make the bars longer')).toMatchObject({
      title: 'Claude is editing desktop.tsx in hooks',
      added: 18,
      removed: 6,
      step: 'step 2 of 4: Make the bars longer',
    })
    expect(headline([call('Read', { file_path: 'F:/proj/a/clean-draw.tsx' })], null, main, null).title).toBe('Claude is reading clean-draw.tsx in a')
    expect(headline([call('Bash', { command: 'claude plugin test  clean-view' })], null, main, null)).toMatchObject({
      title: 'Claude is running a command',
      detail: 'claude plugin test clean-view',
    })
    expect(headline([call('Grep', { pattern: 'barSvg' })], null, main, null).title).toBe('Claude is searching for barSvg')
    expect(headline([], null, main, null).title).toBe('Claude is thinking')
    expect(headline([], null, { ...main, isRunning: false }, null).title).toBe('Claude is idle')
    expect(headline([edit], { text: 'Allow Bash: ls?', tool: 'Bash' }, main, null)).toMatchObject({ title: 'Waiting for you', detail: 'Allow Bash: ls?', isWaiting: true })
    // A call from an earlier turn does not count as this moment.
    expect(headline([call('Edit', { file_path: 'a.ts' }, T0 - 5000)], null, main, null).title).toBe('Claude is thinking')
  })

  test('the last actions are the five newest, in plain words, with how long ago', () => {
    const calls = [
      call('Read', { file_path: 'F:/p/old.ts' }, T0),
      call('Edit', { file_path: 'F:/p/desktop.tsx' }, T0 + 1000),
      call('Read', { file_path: 'F:/p/clean-draw.tsx' }, T0 + 2000),
      call('Bash', { command: 'claude plugin test clean-view' }, T0 + 3000),
      call('Grep', { pattern: 'barSvg' }, T0 + 4000),
      call('Agent', { description: 'Check repo git status' }, T0 + 5000),
    ]
    const acts = recentActions(calls).map(actionOf)
    expect(acts).toHaveLength(5)
    expect(acts.map(a => `${a.verb} ${a.target}`)).toEqual([
      'Started agent Check repo git status',
      'Searched for barSvg',
      'Ran claude plugin test clean-view',
      'Read clean-draw.tsx',
      'Edited desktop.tsx',
    ])
    expect(agoText(2_000)).toBe('just now')
    expect(agoText(12_000)).toBe('12s')
    expect(agoText(90_000)).toBe('1m')
  })

  test('an agent now line, the Task View step, git and the file rows', () => {
    expect(agentNow(call('Bash', { command: 'git status' }))).toBe('running git status')
    expect(agentNow(call('Read', { file_path: 'F:/p/a.ts' }))).toBe('reading a.ts')
    expect(agentNow(call('Grep', { pattern: 'x' }))).toBe('searching for x')
    const job = { phase: 'working', tasks: [{ name: 'A', status: 'done' }, { name: 'Make the bars longer', status: 'active' }, { name: 'C', status: 'waiting' }, { name: 'D', status: 'waiting' }] }
    expect(stepText(job)).toBe('step 2 of 4: Make the bars longer')
    expect(stepText({ phase: 'idle', tasks: [] })).toBeUndefined()
    const git = parseGitStatus('## dev-1.8.0...origin/dev-1.8.0 [ahead 1]\n M hooks/desktop.tsx\nR  a.ts -> b.ts\n', 'F:\\proj')
    expect(git).toEqual({ branch: 'dev-1.8.0', changed: ['F:/proj/hooks/desktop.tsx', 'F:/proj/b.ts'] })
    const rows = fileRows(
      [
        { path: 'F:/proj/hooks/desktop.tsx', kind: 'edit', at: 2 },
        { path: 'F:/proj/other/read.ts', kind: 'read', at: 1 },
      ],
      { ...git, ahead: 1 },
    )
    expect(rows.map(r => [r.name, r.dir, r.kind, r.isUncommitted])).toEqual([
      ['desktop.tsx', 'hooks', 'edit', true],
      ['read.ts', 'other', 'read', false],
    ])
  })
})

// ---------------------------------------------------------------- wiring

type World = { opened: any[]; closed: string[]; panes: string[]; modes: unknown[]; listed: any[]; stopped: string[] }

function world(on: any): World {
  const w: World = { opened: [], closed: [], panes: [], modes: [], listed: [], stopped: [] }
  on('tool.call', { tool: 'TaskStop' } as any, (_$: any, e: any) => {
    w.stopped.push(e.task_id)
    return { result: { message: 'stopped' }, text: 'stopped' }
  })
  const clock = mock.clock(on, { now: T0 })
  void clock
  mock.store(on)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.end', (_$: any, e: any) => ({ sessionId: e.sessionId }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  on('settings.read', () => ({ value: { theme: 'dark', effortLevel: 'high' } }))
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }))
  on('session.usage', () => ({
    value: {
      startedAt: T0,
      context: { window: 1_000_000, tokens: 230_000, percent: 23 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 31 },
        { kind: 'seven_day', percentUsed: 12 },
      ],
      cost: { usd: 1.42 },
    },
  }))
  on('agent.list', () => ({ value: w.listed }))
  on('agent.spawn', (_$: any, e: any) => ({ agentId: `agent-${e.tool_use_id}`, model: 'claude-haiku-5-5' }))
  on('turn.start', (_$: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', (_$: any, e: any) => ({ text: e.answer }))
  on('turn.step', async function* (_$: any, e: any) {
    const usage = { ...USAGE, model: e.model }
    yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage }
    return { turnId: e.turnId, index: e.index, answer: 'hi', toolUses: [], stopReason: 'end_turn' as const, usage }
  })
  on('ui.open', (_$: any, e: any) => {
    w.opened.push(e)
    if (!w.panes.includes(e.id)) w.panes.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_$: any, e: any) => {
    w.closed.push(e.id)
    w.panes = w.panes.filter(p => p !== e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: w.panes.map(id => ({ id, title: 'Flightdeck', isShown: true, isFocused: false, isPlaced: true })) }))
  on('session.cwd', () => ({ value: 'F:/proj' }))
  on('process.run', (_$: any, e: any) => {
    const argv = (e.argv as string[]).join(' ')
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (argv.includes('--show-toplevel')) return ok('F:/proj\n')
    if (argv.includes('status')) return ok('## dev-1.8.0...origin/dev-1.8.0\n M hooks/desktop.tsx\n?? notes.txt\n')
    if (argv.includes('rev-list')) return ok('2\n')
    return { value: { exitCode: 1, stdout: '', stderr: 'no', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('tool.call', { tool: 'Edit' } as any, () => ({ result: { structuredPatch: [{ lines: ['+a', '+b', '+c', '-d'] }] }, text: 'ok' }))
  on('tool.call', { tool: 'Read' } as any, () => ({ result: {}, text: 'ok' }))
  on('tool.call', { tool: 'Bash' } as any, () => ({ result: {}, text: 'ok' }))
  on('state.set', { key: 'modes' }, async (_$: any, e: any, next: any) => {
    w.modes.push(e.value)
    return next(e)
  })
  return w
}

const spawn = ($: any, id: string, description = 'Say hi (agent one)') =>
  $.agent.spawn({ tool_use_id: id, prompt: 'say hi', description, subagentType: 'general-purpose', provider: { plugin: 'engine', tier: 'core' } })

async function step($: any, agentId: string | undefined) {
  const s = $.turn.step({ turnId: 'S1', index: 0, model: 'claude-haiku-5-5', messageCount: 1, ...(agentId ? { agentId } : {}) })
  for await (const _ of s) void _
  await s.result
}

async function texts($: any, surface: 'terminal' | 'desktop' = 'terminal', cols = 60) {
  const ui = await $.ui.mount({ ...pane(cols), surface })
  const all = (await ui.findAll({ type: 'Text' })).map((t: any) => String(t.text)).join('\n')
  return { ui, all }
}

// A stand-in for the Sidebar: `/sb-strip <json>` writes its `strip` state.
const SIDEBAR = {
  name: 'sidebar',
  register: ((on: any) => {
    on('command.run', { command: 'sb-strip' }, async ($: any, e: any) => {
      await $.state.set({ plugin: 'sidebar', key: 'strip' }, JSON.parse(e.args))
      return {}
    })
  }) as any,
}
const setStrip = ($: any, isOn: boolean, active: string) =>
  $.command.run({
    command: 'sb-strip',
    args: JSON.stringify({ isOn, active, tabs: [], theme: 'dark', colour: 'Coral' }),
    origin: { kind: 'composer' as const },
  })

describe('wiring', () => {
  test('the pane follows the sidebar’s strip: opened for its tab, closed when the strip moves on, no command run', { plugins: [SIDEBAR] }, async ($, on) => {
    const w = world(on)
    const ran: string[] = []
    on('command.run', (_$: any, e: any) => {
      ran.push(`${e.command} ${e.args}`.trim())
      return { text: '' }
    })
    await $.session.start(SESSION)
    await setStrip($, true, 'flightdeck')
    expect(w.opened.at(-1)).toMatchObject({ id: 'flightdeck', columns: 56 })
    expect(w.modes.at(-1)).toEqual({ flightdeck: { label: 'Flightdeck', isOn: true } })
    await setStrip($, true, 'clean-view')
    expect(w.closed).toEqual(['flightdeck'])
    expect(w.modes.at(-1)).toEqual({ flightdeck: { label: 'Flightdeck', isOn: false } })
    await setStrip($, true, 'flightdeck')
    await setStrip($, false, 'flightdeck')
    expect(w.closed).toEqual(['flightdeck', 'flightdeck'])
    expect(ran).toEqual([])
  })

  test('a pane opened by /flightdeck with the sidebar off is left alone by the strip', { plugins: [SIDEBAR] }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await $.command.run(command('open'))
    await setStrip($, false, '')
    await setStrip($, true, 'clean-view')
    expect(w.closed).toEqual([])
  })

  test('/flightdeck opens the sidebar, publishes the mode on, and closes it again', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    expect(w.modes.at(-1)).toEqual({ flightdeck: { label: 'Flightdeck', isOn: false } })
    const opened = await $.command.run(command())
    expect(opened.text).toBe('Flightdeck opened.')
    expect(w.opened[0]).toMatchObject({ id: 'flightdeck', title: 'Flightdeck', columns: 56 })
    expect(w.modes.at(-1)).toEqual({ flightdeck: { label: 'Flightdeck', isOn: true } })
    const closed = await $.command.run(command())
    expect(closed.text).toBe('Flightdeck closed.')
    expect(w.closed).toEqual(['flightdeck'])
    expect(w.modes.at(-1)).toEqual({ flightdeck: { label: 'Flightdeck', isOn: false } })
  })

  test('/doole_flightdeck does the same as /flightdeck', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    const opened = await $.command.run({ ...command(), command: 'doole_flightdeck' })
    expect(opened.text).toBe('Flightdeck opened.')
    expect(w.opened[0]).toMatchObject({ id: 'flightdeck', title: 'Flightdeck', columns: 56 })
    const closed = await $.command.run({ ...command(), command: 'doole_flightdeck' })
    expect(closed.text).toBe('Flightdeck closed.')
  })

  test('the main card shows the model, effort, context, cost and limits', async ($, on) => {
    world(on)
    await $.session.start(SESSION)
    await $.command.run(command('open'))
    for (const surface of ['terminal', 'desktop'] as const) {
      const { ui, all } = await texts($, surface)
      expect(all).toContain(surface === 'terminal' ? 'FLIGHTDECK' : 'Flightdeck')
      expect(all).toContain('Opus 5.5')
      expect(all).toContain('high')
      expect(all).toContain('23%')
      expect(all).toContain('$1.42')
      expect(all).toContain(surface === 'terminal' ? '5h' : '5-hour limit')
      expect(all).toContain(surface === 'terminal' ? '7d' : '7-day limit')
      if (surface === 'terminal') expect(all).toContain('╭')
      expect(all).toContain('Subagents show here while they work.')
      await ui.unmount()
    }
  })

  test('a subagent shows while it works and moves to finished when it ends', async ($, on) => {
    world(on)
    await $.session.start(SESSION)
    await $.command.run(command('open'))
    await $.turn.start({ text: 'use two agents', turnId: 't1' })
    await spawn($, 'one')
    await spawn($, 'two', 'Say hi (agent two)')
    await step($, 'agent-one')
    const name = critterOf('agent-one').name

    const during = await texts($)
    expect(during.all).toContain('RUNNING')
    expect(during.all).toContain('■ stop')
    expect(during.all).toContain('■ Stop all')
    expect(during.all).toContain('Say hi (agent one)')
    expect(during.all).toContain('Say hi (agent two)')
    expect(during.all).toContain(name)
    expect(during.all).toContain('Haiku 5.5')
    expect(during.all).toMatch(/ctx 4% · 35\.9k/)
    expect(during.all).toContain('2 agents working')
    expect(await during.ui.findAll({ type: 'Raster' })).not.toHaveLength(0)
    await during.ui.unmount()

    await $.turn.complete({ answer: 'hi', durationMs: 6000, isAborted: false, reason: 'answer', turnId: 'S1', agentId: 'agent-one' } as any)
    const after = await texts($)
    expect(after.all).toContain('DONE')
    expect(after.all).toContain('✓ ')
    expect(after.all).toContain('1 agent working')
    await after.ui.unmount()
  })

  test('stop asks TaskStop for that agent, and clear takes finished agents off for the session', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await $.command.run(command('open'))
    await $.turn.start({ text: 'use two agents', turnId: 't1' })
    await spawn($, 'one')
    await spawn($, 'two', 'Say hi (agent two)')
    const ui = await $.ui.mount({ ...pane(60), surface: 'terminal' })
    await ui.press({ key: 'stop:agent-one' })
    expect(w.stopped).toEqual(['agent-one'])
    let all = (await ui.findAll({ type: 'Text' })).map((t: any) => String(t.text)).join('\n')
    expect(all).toContain('DONE')
    expect(all).toContain('1 agent working')
    w.listed = [{ id: 'agent-one', description: 'Say hi (agent one)', type: 'general-purpose', status: 'killed' }]
    await ui.press({ key: 'done-head-btn' })
    all = (await ui.findAll({ type: 'Text' })).map((t: any) => String(t.text)).join('\n')
    expect(all).not.toContain('Say hi (agent one)')
    expect(all).toContain('Nothing finished yet.')
    await ui.unmount()
  })

  test('a narrow sidebar still draws every card', async ($, on) => {
    world(on)
    await $.session.start(SESSION)
    await $.command.run(command('open'))
    await spawn($, 'one')
    await step($, 'agent-one')
    for (const cols of [30, 44, 90]) {
      const { ui, all } = await texts($, 'terminal', cols)
      expect(all).toContain('FLIGHTDECK')
      expect(all).toContain(critterOf('agent-one').name)
      await ui.unmount()
    }
  })

  test('both surfaces draw the Right now card, and each running agent shows what it is doing now', async ($, on) => {
    world(on)
    await $.session.start(SESSION)
    await $.command.run(command('open'))
    await $.turn.start({ text: 'edit it', turnId: 't1' })
    await spawn($, 'one')
    await step($, 'agent-one')
    await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: 'F:/proj/hooks/clean-draw.tsx' } as any)
    await $.tool.call({ tool: 'Edit', tool_use_id: 'u2', file_path: 'F:/proj/hooks/desktop.tsx', old_string: 'a', new_string: 'b' } as any)
    await $.tool.call({ tool: 'Bash', tool_use_id: 'u3', agentId: 'agent-one', command: 'git status' } as any)
    for (const surface of ['terminal', 'desktop'] as const) {
      const { ui, all } = await texts($, surface, 100)
      expect(all).toContain('RIGHT NOW')
      expect(all).toContain('Claude is editing desktop.tsx in hooks')
      expect(all).toContain('+3')
      expect(all).toContain('RECENT ACTIONS')
      expect(all).toContain('Edited')
      expect(all).toContain('clean-draw.tsx')
      expect(all).toContain('dev-1.8.0')
      expect(all).toContain('2 changed')
      expect(all).toContain('2 ahead of main')
      // Skills, plugins and MCPs in use replace the file list.
      expect(all).toContain('Skills')
      expect(all).toContain('Plugins')
      expect(all).toContain('MCPs')
      expect(all.toLowerCase()).toContain('now: running git status')
      expect(all).toContain('Cost')
      expect(all).toContain('Time')
      if (surface === 'desktop') expect(await ui.findAll({ type: 'Svg' })).not.toHaveLength(0)
      await ui.unmount()
    }
    // In a narrow pane every bar fits inside it.
    const narrow = await texts($, 'desktop', 40)
    const widths = ((await narrow.ui.findAll({ type: 'Svg' })) as any[]).map(x => Number(x.props.width))
    expect(widths.length).toBeGreaterThan(0)
    for (const w of widths) expect(w).toBeLessThanOrEqual((40 - 6) * 7)
    await narrow.ui.unmount()
  })

  test('with nothing happening the card says Claude is idle', async ($, on) => {
    world(on)
    await $.session.start(SESSION)
    await $.command.run(command('open'))
    for (const surface of ['terminal', 'desktop'] as const) {
      const { ui, all } = await texts($, surface)
      expect(all).toContain('Claude is idle')
      expect(all).toContain('Nothing yet.')
      await ui.unmount()
    }
  })
})

// ---------------------------------------------------------------- settings

describe('settings', () => {
  test('enabled: false opens nothing, draws nothing and the command says it is off', { options: { enabled: false } }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    const ran = await $.command.run(command('open'))
    expect(ran.text).toBe('Flightdeck is off. Turn it on in Mod Settings (/doole_settings) or /config.')
    expect(w.opened).toEqual([])
    const again = await $.command.run({ ...command(), command: 'doole_flightdeck' })
    expect(again.text).toContain('Flightdeck is off.')
    // The render hook passes straight through: with nothing beneath it, there is nothing to draw.
    await expect($.ui.mount({ ...pane(60), surface: 'terminal' })).rejects.toThrow('ui.render')
  })

  test('the lists and lines follow the settings', { options: { recentActions: 0, recentFiles: 0, showRepository: false } }, async ($, on) => {
    world(on)
    await $.session.start(SESSION)
    await $.command.run(command('open'))
    for (const surface of ['terminal', 'desktop'] as const) {
      const { ui, all } = await texts($, surface)
      expect(all.toLowerCase()).not.toContain('recent actions')
      expect(all.toLowerCase()).not.toContain('in use this session')
      expect(all).not.toContain('Skills')
      expect(all).not.toContain('dev-1.8.0')
      await ui.unmount()
    }
  })

  test('by default the recent actions list and the branch show', async ($, on) => {
    world(on)
    await $.session.start(SESSION)
    await $.command.run(command('open'))
    const { ui, all } = await texts($)
    expect(all).toContain('RECENT ACTIONS')
    expect(all).toContain('dev-1.8.0')
    await ui.unmount()
  })
})

describe('skills, plugins and MCPs in use', () => {
  test('reads each from the tool call', () => {
    expect(usesOf('Skill', { skill: 'superpowers:brainstorming' })).toEqual([
      { kind: 'plugin', name: 'superpowers' },
      { kind: 'skill', name: 'brainstorming' },
    ])
    expect(usesOf('Skill', { skill: 'simplify' })).toEqual([{ kind: 'skill', name: 'simplify' }])
    expect(usesOf('mcp__playwright__browser_click', {})).toEqual([{ kind: 'mcp', name: 'playwright' }])
    expect(usesOf('mcp__plugin_context-mode_context-mode__ctx_search', {})).toEqual([{ kind: 'plugin', name: 'context-mode' }])
    expect(usesOf('Read', {})).toEqual([])
  })

  test('lists each once, grouped', () => {
    const list = noteUses(noteUses([], usesOf('mcp__apify__call-actor', {})), usesOf('mcp__apify__search-actors', {}))
    expect(useRows(list)).toEqual([
      { kind: 'skill', label: 'Skills', names: [] },
      { kind: 'plugin', label: 'Plugins', names: [] },
      { kind: 'mcp', label: 'MCPs', names: ['apify'] },
    ])
  })
})
