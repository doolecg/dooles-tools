import type { EngineInterface, Register } from 'claude-code'

import { PROJECT_FILES, contextText, isDotnetFile, enabledIn, installedIn, pluginsToEnable, toastText } from './rules'
import type { Files } from './rules'
import { aliasFor, suggestion, tierFor } from './models'
import type { ModelMode } from './models'

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
  const modelMode = (options.modelMode as ModelMode | undefined) ?? 'suggest'

  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    const files: Files = {}
    for (const f of PROJECT_FILES) {
      const text = await readOrNull($, `${e.cwd}/${f}`)
      if (text !== null) files[f] = text
    }
    // .NET solution and project files have no fixed name: note any at the top level (empty text is enough).
    try {
      for (const entry of await $.fs.list(e.cwd)) if (entry.kind === 'file' && isDotnetFile(entry.name)) files[entry.name] = ''
    } catch {
      // folder not listable: the fixed names above still count
    }
    const turned = await turnOn($, e.cwd, { files })
    return turned.length ? { ...r, additionalContext: [...(r.additionalContext ?? []), contextText(turned)] } : r
  }).catch(($, e, next) => next(e))

  on('classic.UserPromptSubmit', async ($, e, next) => {
    const r = await next(e)
    // Only prompts a person typed (or -p); not peer messages, loop wake-ups or schedules.
    if (e.source && e.source !== 'user' && e.source !== 'sdk') return r
    const turned = await turnOn($, e.cwd, { prompt: e.prompt })
    const notes = turned.length ? [contextText(turned)] : []
    // Suggest mode: tell the person and Claude which model tier the prompt calls for. Auto mode acts at agent.spawn.
    const hint = modelMode === 'suggest' ? suggestion(tierFor(e.prompt)) : null
    if (hint) {
      $.ui.toast(hint)
      notes.push(hint)
    }
    return notes.length ? { ...r, additionalContext: [...(r.additionalContext ?? []), ...notes] } : r
  }).catch(($, e, next) => next(e))

  // Auto mode: a subagent started without a model gets the tier its task calls for. A model the caller named,
  // a fork, a resume and a teammate are left alone; very hard work is never moved on its own.
  if (modelMode === 'auto') {
    on('agent.spawn', async ($, e, next) => {
      if (e.model || e.resume || e.isTeammate) return next(e)
      const alias = aliasFor(tierFor(`${e.description}
${e.prompt}`))
      return next(alias ? { ...e, model: alias } : e)
    }).catch(($, e, next) => next(e))
  }
}
