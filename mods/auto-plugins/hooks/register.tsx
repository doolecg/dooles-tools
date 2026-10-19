import type { EngineInterface, Register } from 'claude-code'

import { PROJECT_FILES, contextText, enabledIn, installedIn, pluginsToEnable, toastText } from './rules'
import type { Files } from './rules'

async function readOrNull($: EngineInterface, path: string): Promise<string | null> {
  try {
    return await $.fs.read(path)
  } catch {
    return null
  }
}

// `claude plugin enable` at local scope (the gitignored settings.local.json). Plugin ids come from the rule
// table only; on Windows an npm install of claude is a .cmd shim, so cmd runs it when the exe is not found.
async function enable($: EngineInterface, cwd: string, plugin: string): Promise<boolean> {
  const args = ['plugin', 'enable', plugin, '--scope', 'local']
  for (const argv of [['claude', ...args], ['cmd.exe', '/d', '/c', 'claude', ...args]]) {
    try {
      return (await $.process.run(argv, { cwd, timeoutMs: 30_000 })).exitCode === 0
    } catch {
      // could not start: try the next form
    }
  }
  return false
}

// Switches on what the rules want; returns the plugins that were turned on. Failures are silent.
async function turnOn($: EngineInterface, cwd: string, input: { files?: Files; prompt?: string }): Promise<string[]> {
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${(await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || ''}/.claude`
  const installed = installedIn(await readOrNull($, `${config}/plugins/installed_plugins.json`))
  const enabled = enabledIn(await readOrNull($, `${cwd}/.claude/settings.local.json`))
  const on: string[] = []
  for (const p of pluginsToEnable(input, enabled, installed)) if (await enable($, cwd, p)) on.push(p)
  if (on.length) $.ui.toast(toastText(on))
  return on
}

export const register: Register = (on, options) => {
  if (options.enabled === false) return

  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    const files: Files = {}
    for (const f of PROJECT_FILES) {
      const text = await readOrNull($, `${e.cwd}/${f}`)
      if (text !== null) files[f] = text
    }
    const turned = await turnOn($, e.cwd, { files })
    return turned.length ? { ...r, additionalContext: [...(r.additionalContext ?? []), contextText(turned)] } : r
  }).catch(($, e, next) => next(e))

  on('classic.UserPromptSubmit', async ($, e, next) => {
    const r = await next(e)
    // Only prompts a person typed (or -p); not peer messages, loop wake-ups or schedules.
    if (e.source && e.source !== 'user' && e.source !== 'sdk') return r
    const turned = await turnOn($, e.cwd, { prompt: e.prompt })
    return turned.length ? { ...r, additionalContext: [...(r.additionalContext ?? []), contextText(turned)] } : r
  }).catch(($, e, next) => next(e))
}
