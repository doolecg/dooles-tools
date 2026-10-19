import { expect, mock, test } from 'claude-code/testing'

const ROOT = 'F:/code/game'
const CONFIG = 'C:/cfg'
const INSTALLED = JSON.stringify({ version: 2, plugins: { 'godot@awesome-gamedev-agent-skills': [], 'router@awesome-gamedev-agent-skills': [], 'disciplines@awesome-gamedev-agent-skills': [] } })

const norm = (path: unknown) => String(path).split(String.fromCharCode(92)).join('/')

// The host beneath the mod: a few files, `claude plugin enable` recorded, toasts recorded.
function host(on: any, files: Record<string, string> = {}, exitCode = 0) {
  const all: Record<string, string> = { [`${CONFIG}/plugins/installed_plugins.json`]: INSTALLED, ...files }
  const runs: { argv: readonly string[]; cwd?: string }[] = []
  const toasts: string[] = []
  mock.env(on, { CLAUDE_CONFIG_DIR: CONFIG })
  on('fs.read', (_$: any, e: any) => {
    const key = norm(e.path)
    if (!(key in all)) throw new Error(`ENOENT: ${key}`)
    return { value: all[key] }
  })
  on('process.run', (_$: any, e: any) => {
    runs.push({ argv: e.argv, cwd: e.init?.cwd })
    return { value: { exitCode, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.toast', (_$: any, e: any) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('classic.SessionStart', () => ({}))
  on('classic.UserPromptSubmit', () => ({}))
  return { runs, toasts }
}

test('a Godot prompt enables the installed Godot plugins at local scope, toasts and tells Claude', async ($, on) => {
  const h = host(on)
  const r = await $.classic.UserPromptSubmit({ prompt: 'add a jump to the godot player', cwd: ROOT, source: 'user' } as never)
  expect(h.runs.map(x => x.argv.join(' '))).toEqual([
    'claude plugin enable godot@awesome-gamedev-agent-skills --scope local',
    'claude plugin enable router@awesome-gamedev-agent-skills --scope local',
    'claude plugin enable disciplines@awesome-gamedev-agent-skills --scope local',
  ])
  expect(h.runs.every(x => x.cwd === ROOT)).toBe(true)
  expect(h.toasts).toEqual(['Auto Plugins turned on godot, router, disciplines for this project. Run /reload-plugins or restart Claude Code to load them.'])
  expect((r.additionalContext ?? []).join('\n')).toContain('/reload-plugins')
})

test('session start reads project.godot; plugins already on in settings.local.json are skipped', async ($, on) => {
  const h = host(on, {
    [`${ROOT}/project.godot`]: 'config_version=5',
    [`${ROOT}/.claude/settings.local.json`]: JSON.stringify({ enabledPlugins: { 'godot@awesome-gamedev-agent-skills': true, 'router@awesome-gamedev-agent-skills': true } }),
  })
  await $.classic.SessionStart({ source: 'startup', cwd: ROOT } as never)
  expect(h.runs.map(x => x.argv[3])).toEqual(['disciplines@awesome-gamedev-agent-skills'])
})

test('an unrelated prompt, a peer message or a failed enable does nothing visible', async ($, on) => {
  const h = host(on, {}, 1)
  const r1 = await $.classic.UserPromptSubmit({ prompt: 'fix the api tests', cwd: ROOT, source: 'user' } as never)
  await $.classic.UserPromptSubmit({ prompt: 'godot', cwd: ROOT, source: 'system' } as never)
  expect(h.runs).toEqual([])
  const r2 = await $.classic.UserPromptSubmit({ prompt: 'godot', cwd: ROOT, source: 'user' } as never)
  expect(h.runs.length).toBe(3)
  expect(h.toasts).toEqual([])
  expect(r1.additionalContext ?? []).toEqual([])
  expect(r2.additionalContext ?? []).toEqual([])
})

test('a plugin that is not installed is never enabled', async ($, on) => {
  const h = host(on)
  await $.classic.UserPromptSubmit({ prompt: 'open report.docx', cwd: ROOT, source: 'user' } as never)
  expect(h.runs).toEqual([])
})

test('suggest mode: a hard UI prompt shows a note and tells Claude to use opus', async ($, on) => {
  const h = host(on)
  const r = await $.classic.UserPromptSubmit({ prompt: 'design the inventory screen layout from this mockup', cwd: ROOT, source: 'user' } as never)
  expect(h.toasts.some(t => t.includes('Opus'))).toBe(true)
  expect((r.additionalContext ?? []).join('\n')).toContain('model: "opus"')
})

test('suggest mode: an ordinary prompt adds no model note', async ($, on) => {
  const h = host(on)
  const r = await $.classic.UserPromptSubmit({ prompt: 'fix the typo in the readme', cwd: ROOT, source: 'user' } as never)
  expect(h.toasts).toEqual([])
  expect(r.additionalContext ?? []).toEqual([])
})
