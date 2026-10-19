import { describe, expect, test } from 'claude-code/testing'

import { lessonsBrief, rankLessons } from '../hooks/core/brief'
import { parseLessons, riskOf } from '../hooks/core/lessons'
import { hostConfigDir, encodeProjectDir, projectBank, transcriptPathFor } from '../hooks/core/paths'
import { afterChange, correctionRate, emptyCard, newSkillDrafts, parseFrontmatter, rewriteDue, trend, validateDraft, withCorrection } from '../hooks/core/skills'
import { settingsFrom } from '../hooks/core/settings'
import { emptyState, type Lesson, type SkillUse } from '../hooks/core/state'
import { isDuplicate, scrubSecrets } from '../hooks/core/text'
import { corrections, gateReason, parseJsonl, sinceTurn, skillLoads, userTurns } from '../hooks/core/transcript'
import { isDue, workerArgv } from '../hooks/core/jobs'
import { jsonl, turns } from './fakeIo'

describe('host folder', () => {
  test('Claude Code: ~/.claude, or CLAUDE_CONFIG_DIR when set', () => {
    expect(hostConfigDir('claude-code', { home: '/home/me', isWindows: false })).toBe('/home/me/.claude')
    expect(hostConfigDir('claude-code', { home: '/home/me', isWindows: false, claudeConfigDir: '/data/claude/' })).toBe('/data/claude')
    expect(hostConfigDir('claude-code', { home: '/home/me', isWindows: false, claudeConfigDir: '~/alt' })).toBe('/home/me/alt')
    expect(hostConfigDir('claude-code', { home: 'C:\\Users\\me', isWindows: true })).toBe('C:\\Users\\me\\.claude')
  })

  test('OpenCode: ~/.config/opencode, or $XDG_CONFIG_HOME/opencode', () => {
    expect(hostConfigDir('opencode', { home: '/home/me', isWindows: false })).toBe('/home/me/.config/opencode')
    expect(hostConfigDir('opencode', { home: '/home/me', isWindows: false, xdgConfigHome: '/x' })).toBe('/x/opencode')
    expect(hostConfigDir('opencode', { home: 'C:\\Users\\me', isWindows: true })).toBe('C:\\Users\\me\\.config\\opencode')
  })

  test('project folders and banks are named as Claude Code and the hindsight hooks name them', () => {
    expect(encodeProjectDir('C:\\Users\\Dayle Frost')).toBe('C--Users-Dayle-Frost')
    expect(transcriptPathFor('/home/me/.claude', '/code/shop', 's1', false)).toBe('/home/me/.claude/projects/-code-shop/s1.jsonl')
    expect(projectBank('F:\\REPOS\\Big Haul\\')).toBe('coding-agent::Big Haul')
  })
})

describe('settings', () => {
  test('defaults: controlled mode, a neutral soul bank, and the spec budgets', () => {
    expect(settingsFrom(undefined)).toMatchObject({ mode: 'controlled', soulBank: 'soul', maxCalls: 4, maxTokens: 60000, maxChanges: 5, dailyUsd: 0.5 })
    expect(settingsFrom({ mode: 'bogus', soulBank: 'my-soul', maxCalls: -3 })).toMatchObject({ mode: 'controlled', soulBank: 'my-soul', maxCalls: 0 })
  })
})

describe('transcript and gate', () => {
  test('rows become events; meta rows, command records and reminders are not user turns', () => {
    const text = [
      jsonl(turns(2)),
      JSON.stringify({ type: 'user', isMeta: true, message: { role: 'user', content: 'hidden' } }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: '<command-name>/done</command-name>' } }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } }),
      '{ half a line',
    ].join('\n')
    const evs = parseJsonl(text)
    expect(userTurns(evs)).toBe(2)
    expect(evs.filter(e => e.kind === 'interrupt').length).toBe(1)
  })

  test('a prompt typed while Claude worked (a queued_command attachment) is a user turn too', () => {
    const queued = JSON.stringify({ type: 'attachment', attachment: { type: 'queued_command', prompt: "No, don't use arrow functions" } })
    const evs = parseJsonl([jsonl([{ user: 'add subtract', assistant: 'working' }]), queued].join(String.fromCharCode(10)))
    expect(userTurns(evs)).toBe(2)
    expect(corrections(evs)).toEqual(["No, don't use arrow functions"])
  })

  test('the gate: user turns, tokens, then git changes or corrections', () => {
    const g = { minUserTurns: 3, minTokens: 500 }
    expect(gateReason(parseJsonl(jsonl(turns(2))), 1, g)).toBe('only 2 user turns (minimum 3)')
    expect(gateReason(parseJsonl(jsonl([{ user: 'a' }, { user: 'b' }, { user: 'c' }])), 1, g)).toMatch(/^only about \d+ tokens/)
    expect(gateReason(parseJsonl(jsonl(turns(3))), 0, g)).toBe('no git changes and no corrections')
    expect(gateReason(parseJsonl(jsonl(turns(3))), 2, g)).toBe('')
    const corrected = parseJsonl(jsonl([...turns(3), { user: "no, don't use floats for money", assistant: 'ok' }]))
    expect(gateReason(corrected, 0, g)).toBe('')
  })

  test('corrections are the prompts right after a reply that push back', () => {
    const evs = parseJsonl(jsonl([{ user: 'fix the cart', assistant: 'done' }, { user: 'No, I said cents not floats', assistant: 'ok' }, { user: 'thanks, now the tests' }]))
    expect(corrections(evs)).toEqual(['No, I said cents not floats'])
  })

  test('sinceTurn reads only the turns after the last learn', () => {
    const evs = parseJsonl(jsonl(turns(4)))
    expect(userTurns(sinceTurn(evs, 3))).toBe(1)
    expect(sinceTurn(evs, 4)).toEqual([])
  })

  test('skill loads carry the interrupts after them and the failures in their turn', () => {
    const evs = parseJsonl(
      jsonl([
        { user: 'go', tools: [{ name: 'Skill', input: { skill: 'cart-check' } }, { name: 'Bash', input: { command: 'x' }, error: true }], assistant: 'done' },
        { user: 'next', assistant: 'ok' },
      ]) + '\n' + JSON.stringify({ type: 'user', message: { role: 'user', content: '[Request interrupted by user]' } }),
    )
    expect(skillLoads(evs)).toEqual([{ skill: 'cart-check', interrupts: 1, failures: 1, turnsToEnd: 1 }])
  })

  test('secrets are scrubbed', () => {
    expect(scrubSecrets('token: abcdefgh12345678 and ghp_abcdefghijklmnopqrstuv')).toBe('token: [secret] and [secret]')
  })
})

describe('lesson parsing', () => {
  test('tolerates prose, drops malformed items, keeps at most 8', () => {
    const raw = `Sure! [${[
      { kind: 'pitfall', text: 'The build breaks on Windows paths', files: ['a.ts'], symbols: [] },
      { kind: 'nonsense', text: 'dropped' },
      { kind: 'correction', text: '' },
      { kind: 'correction', text: 'Reply in plain words', scope: 'user', section: 'respond' },
      ...Array.from({ length: 10 }, (_, i) => ({ kind: 'convention', text: `rule ${i}` })),
    ]
      .map(x => JSON.stringify(x))
      .join(',')}] hope that helps`
    const out = parseLessons(raw)
    expect(out.length).toBe(8)
    expect(out[0]).toMatchObject({ kind: 'pitfall', scope: 'project', files: ['a.ts'] })
    expect(out[1]).toMatchObject({ scope: 'user', section: 'respond' })
    expect(parseLessons('no json here')).toEqual([])
  })

  test('risk for controlled mode: commands, links, always and never', () => {
    expect(riskOf('Cart totals are in cents')).toBe('')
    expect(riskOf('Run `pnpm test` first')).toBe('it names a command')
    expect(riskOf('See https://example.com')).toBe('it names a link')
    expect(riskOf('Never push to main')).toBe('it says always or never')
  })

  test('duplicates: alike text on the same code', () => {
    const a = { text: 'Cart totals are computed in cents, not floats', files: ['core/cart.ts'], symbols: [] }
    expect(isDuplicate(a, { ...a, text: 'Cart totals are computed in cents, never floats' })).toBe(true)
    expect(isDuplicate(a, { ...a, files: ['other.ts'] })).toBe(false)
  })
})

describe('draft validation', () => {
  const old = '---\nname: cart-check\ndescription: Check the cart\n---\n\n# cart-check\n\n- Run the cart tests.\n- Check rounding in cents.\n'
  const args = { takenNames: ['cart-check', 'lint'], previous: old, corrections: [] as string[] }

  test('frontmatter must parse and have a description', () => {
    expect(parseFrontmatter(old)).toMatchObject({ name: 'cart-check', description: 'Check the cart' })
    expect(validateDraft({ kind: 'new', name: 'x', body: 'no frontmatter here at all, just words and more words' }, { ...args, previous: null })).toMatch(/does not parse/)
  })

  test('a new skill needs a unique name', () => {
    expect(validateDraft({ kind: 'new', name: 'lint', body: '---\nname: lint\ndescription: d\n---\n\n1. Lint the changed files only.\n' }, { ...args, previous: null })).toBe('the name lint is already taken')
  })

  test('no secrets, and a description under 1024 characters', () => {
    expect(validateDraft({ kind: 'new', name: 'a', body: '---\nname: new-one\ndescription: d\n---\n\n1. Use key sk-abcdefghijklmnopqrstuvwx.\n' }, { ...args, previous: null })).toMatch(/secret/)
    expect(validateDraft({ kind: 'new', name: 'a', body: `---\nname: new-one\ndescription: ${'x'.repeat(1024)}\n---\n\n1. Do it.\n` }, { ...args, previous: null })).toMatch(/1024/)
  })

  test('a fix may not drop an old rule unless a correction contradicts it', () => {
    const dropped = '---\nname: cart-check\ndescription: Check the cart\n---\n\n# cart-check\n\n- Run the cart tests.\n'
    expect(validateDraft({ kind: 'fix', name: 'cart-check', body: dropped }, args)).toMatch(/drops the rule "Check rounding in cents."/)
    expect(validateDraft({ kind: 'fix', name: 'cart-check', body: dropped }, { ...args, corrections: ['Do not check rounding in cents, the API does it'] })).toBe('')
    expect(validateDraft({ kind: 'fix', name: 'cart-check', body: withCorrection(old, 'Use the fake clock') }, args)).toBe('')
  })

  test('a rewrite stays under the old length plus 20%', () => {
    const long = old + '\n' + '- extra words '.repeat(20)
    expect(validateDraft({ kind: 'rewrite', name: 'cart-check', body: long }, { ...args, maxGrowth: 0.2 })).toMatch(/longer than the original/)
  })
})

describe('scorecard', () => {
  const use = (corrected: boolean, at: number, interrupts = 0): SkillUse => ({ sessionId: `s${at}`, at, corrected, interrupts, failures: 0, turnsToEnd: 2 })

  test('a rewrite is due at 30% corrections over the last five loads', () => {
    const card = { ...emptyCard(), uses: [use(false, 1), use(false, 2), use(true, 3), use(false, 4), use(false, 5)] }
    expect(correctionRate(card.uses)).toBe(0.2)
    expect(rewriteDue(card)).toBe(false)
    card.uses.push(use(true, 6))
    expect(correctionRate(card.uses)).toBe(0.4)
    expect(rewriteDue(card)).toBe(true)
  })

  test('trend compares the last five with the five before', () => {
    const worse = { ...emptyCard(), uses: [...[1, 2, 3, 4, 5].map(i => use(false, i)), ...[6, 7, 8, 9, 10].map(i => use(true, i))] }
    expect(trend(worse)).toBe('worse')
    expect(trend({ ...emptyCard(), uses: [use(true, 1)] })).toBe('new')
  })

  test('after a change: waits for five sessions, then flags "worse" when corrections or interrupts went up', () => {
    const before = [1, 2, 3, 4, 5].map(i => use(false, i))
    const card = { ...emptyCard(), uses: [...before, use(true, 11), use(false, 12, 1)], changedAt: 10 }
    expect(afterChange(card)).toBe('waiting')
    card.uses.push(use(false, 13), use(false, 14), use(false, 15))
    expect(afterChange(card)).toBe('worse')
    expect(afterChange({ ...card, uses: [...before, ...[11, 12, 13, 14, 15].map(i => use(false, i))] })).toBe('ok')
  })

  test('a procedure seen in two sessions becomes one new-skill draft, never a duplicate', () => {
    const st = emptyState()
    const base = { folder: '/code/shop', project: 'shop', scope: 'project' as const, section: '', files: [], symbols: [], skill: null, supersedes: [], status: 'active' as const, stores: [], hindsightPending: false, reviewReason: '', hits: 1, createdAt: 0, updatedAt: 0, kind: 'procedure' as const }
    st.lessons.push({ ...base, id: 1, text: 'Run the vitest suite then the typecheck before handing back', sessions: ['s1'] } as Lesson)
    expect(newSkillDrafts(st, [], 0).length).toBe(0)
    st.lessons.push({ ...base, id: 2, text: 'Run the vitest suite and the typecheck before handing the work back', sessions: ['s2'] } as Lesson)
    const drafts = newSkillDrafts(st, [], 0)
    expect(drafts.length).toBe(1)
    expect(drafts[0]!.sessions).toEqual(['s1', 's2'])
    st.drafts.push({ ...drafts[0]!, id: 9 })
    expect(newSkillDrafts(st, [], 0).length).toBe(0)
  })
})

describe('brief and jobs', () => {
  test('lessons are ranked by the files touched most recently, six at most, under 1500 characters', () => {
    const st = emptyState()
    const mk = (id: number, file: string): Lesson => ({ id, folder: '/code/shop', project: 'shop', kind: 'convention', supersedes: [], scope: 'project', section: '', text: `lesson ${id} ${'w'.repeat(300)}`, files: [file], symbols: [], skill: null, sessions: [], status: 'active', stores: [], hindsightPending: false, reviewReason: '', hits: 1, createdAt: 0, updatedAt: id })
    for (let i = 1; i <= 8; i++) st.lessons.push(mk(i, `f${i}.ts`))
    expect(rankLessons(st.lessons, '/code/shop', ['f5.ts', 'f2.ts']).slice(0, 2).map(l => l.id)).toEqual([5, 2])
    const brief = lessonsBrief(st, '/code/shop', [], 0)
    expect(brief.length).toBeLessThan(1500)
    expect(lessonsBrief(st, '/elsewhere', [], 0)).toBe('')
  })

  test('a job is picked up after two minutes queued, or fifteen minutes running, and never by its own session', () => {
    const j = { sessionId: 'a', folder: '', transcriptPath: '', startHead: '', note: '', trigger: '', createdAt: 0, status: 'queued' as const, startedAt: 0, attempts: 0 }
    expect(isDue(j, 60_000, 'b')).toBe(false)
    expect(isDue(j, 120_000, 'b')).toBe(true)
    expect(isDue(j, 120_000, 'a')).toBe(false)
    expect(isDue({ ...j, status: 'running', startedAt: 0 }, 10 * 60_000, 'b')).toBe(false)
    expect(isDue({ ...j, attempts: 2 }, 999_999, 'b')).toBe(false)
  })

  test('the detached learner runs hidden, quoting paths with spaces', () => {
    const w = workerArgv({ isWindows: true, sessionId: 's1', pluginDir: 'F:\\My Mods\\self-improve', cwd: 'C:\\Users\\me' })
    expect(w.slice(0, 5)).toEqual(['powershell', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden'])
    expect(w[6]).toContain(`-ArgumentList '-p "/self-improve-run s1" --output-format text --plugin-dir "F:\\My Mods\\self-improve"'`)
    const u = workerArgv({ isWindows: false, sessionId: 's1', pluginDir: null, cwd: '/code' })
    expect(u[2]).toBe(`cd '/code' && nohup claude '-p' '/self-improve-run s1' '--output-format' 'text' >/dev/null 2>&1 &`)
  })
})

test('settingsFrom reads enabled and the session gate', () => {
  expect(settingsFrom({}).enabled).toBe(true)
  expect(settingsFrom({ enabled: false }).enabled).toBe(false)
  const s = settingsFrom({ minUserTurns: 6, minTokens: 0 })
  expect([s.minUserTurns, s.minTokens]).toEqual([6, 0])
})
