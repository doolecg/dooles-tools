import type { FdAgent, FdCall, FdEdit, FdFile, FdGit, FdLimit, FdMain, FdPending, FdStatus, FdUsage, FdUse } from '../types'

export const EMPTY_MAIN: FdMain = { model: '', effort: '', steps: 0, isRunning: false, turnStartedAt: 0, turnEndedAt: 0 }
export const EMPTY_USAGE: FdUsage = { ctxPct: null, ctxTokens: null, window: 0, costUsd: null, limits: [] }

// ---- colour ----------------------------------------------------------------

/** Bottom Bar's palette, plus the meter colours Clean View's pixel bars use. */
export type Palette = {
  text: string
  dim: string
  sep: string
  border: string
  accent: string
  good: string
  warn: string
  bad: string
  info: string
  pillBg: string
  pillFg: string
  panel: string
  /** Text on a filled chip. */
  ink: string
  track: string
  /** What a lit pixel brightens toward: light on a dark theme, dark on a light one. */
  tint: string
  warmFrom: string
  warmTo: string
  goodFrom: string
  goodTo: string
  /** The Right now card's file marks: read, edited, not committed. */
  read: string
  edit: string
  dirty: string
}

// Claude's warm coral, cream and sage, softened for a dark terminal.
export const DARK: Palette = {
  text: '#E8E3D9',
  dim: '#8C877E',
  sep: '#55514A',
  border: '#4E4943',
  accent: '#D97757',
  good: '#9CC5A1',
  warn: '#E5C07B',
  bad: '#E08A8A',
  info: '#B9B4E8',
  pillBg: '#1F2C3D',
  pillFg: '#C9D3E0',
  panel: '#24201D',
  ink: '#1A1714',
  track: '#3A3531',
  tint: '#FFF6EC',
  warmFrom: '#E8A06A',
  warmTo: '#D9667F',
  goodFrom: '#5E9A6A',
  goodTo: '#A9D6AE',
  read: '#B39DDB',
  edit: '#E08A5A',
  dirty: '#E5C07B',
}

export const LIGHT: Palette = {
  text: '#3D3929',
  dim: '#8A857C',
  sep: '#C9C3B8',
  border: '#D3CCC0',
  accent: '#C15F3C',
  good: '#4E7D57',
  warn: '#9A6B10',
  bad: '#B3474A',
  info: '#5A62B8',
  pillBg: '#E3E9F1',
  pillFg: '#2B3A4C',
  panel: '#FBF8F3',
  ink: '#FBF8F3',
  track: '#E4DED3',
  tint: '#3A1E26',
  warmFrom: '#C9722F',
  warmTo: '#B8435F',
  goodFrom: '#3E7A4A',
  goodTo: '#6FAE7A',
  read: '#8A7BD0',
  edit: '#C15F3C',
  dirty: '#B58A10',
}

export const paletteFor = (theme: unknown): Palette =>
  typeof theme === 'string' && theme.startsWith('light') ? LIGHT : DARK

// ---- models and prices ---------------------------------------------------------

const FAMILIES = ['opus', 'sonnet', 'haiku', 'fable', 'mythos'] as const

/** `claude-opus-5-5[1m]` or `Opus 5.5` → `Opus 5.5`; `haiku` → `Haiku`; anything else as given. */
export function modelName(raw: string): string {
  const id = raw.trim().toLowerCase()
  for (const family of FAMILIES) {
    const at = id.indexOf(family)
    if (at < 0) continue
    const rest = id.slice(at + family.length).replace(/\[[^\]]*\]/g, '')
    const nums = (rest.match(/\d+/g) ?? []).filter(n => n.length < 3).slice(0, 2)
    const name = family[0]!.toUpperCase() + family.slice(1)
    return nums.length > 0 ? `${name} ${nums.join('.')}` : name
  }
  return raw.trim() === 'inherit' ? '' : raw.trim()
}

/** 1000000 → `1M`, 200000 → `200K`, 0 → ``. */
export function windowLabel(tokens: number): string {
  if (!(tokens > 0)) return ''
  if (tokens >= 1_000_000) return `${+(tokens / 1_000_000).toFixed(1)}M`
  return `${Math.round(tokens / 1000)}K`
}

/** `opus-4-8` from `claude-opus-4-8`, `claude-opus-4-8[1m]` or a dated id; undefined for anything else. */
export function modelKey(model: string | undefined): string | undefined {
  if (!model) return undefined
  const m = model.toLowerCase().replace(/\[1m\]$/, '').replace(/-\d{8}$/, '')
  const hit = /(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?$/.exec(m)
  return hit ? `${hit[1]}-${hit[2]}${hit[3] ? `-${hit[3]}` : ''}` : undefined
}

type Price = { input: number; output: number; cacheRead: number }

// US dollars per million tokens, the Claude API's list prices (cache writes at 1.25 times input).
const FABLE: Price = { input: 10, output: 50, cacheRead: 0.25 }
const OPUS: Price = { input: 5, output: 25, cacheRead: 0.5 }
const OPUS_OLD: Price = { input: 15, output: 75, cacheRead: 1.5 }
const SONNET: Price = { input: 2, output: 10, cacheRead: 0.2 }
const SONNET_OLD: Price = { input: 3, output: 15, cacheRead: 0.3 }
const PRICES: Record<string, Price> = {
  'fable-5': FABLE,
  'fable-5-1': FABLE,
  'mythos-5': FABLE,
  'mythos-5-1': FABLE,
  'opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'opus-5': OPUS,
  'opus-4-8': OPUS,
  'opus-4-7': OPUS,
  'opus-4-6': OPUS,
  'opus-4-5': OPUS,
  'opus-4-1': OPUS_OLD,
  'opus-4': OPUS_OLD,
  'sonnet-5-5': SONNET,
  'sonnet-5': SONNET,
  'sonnet-4-6': SONNET_OLD,
  'sonnet-4-5': SONNET_OLD,
  'sonnet-4': SONNET_OLD,
  'haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'haiku-4-5': { input: 1, output: 5, cacheRead: 0.1 },
}

const WINDOW_200K = new Set(['haiku-4-5', 'sonnet-4-5', 'sonnet-4', 'opus-4-5', 'opus-4-1', 'opus-4'])

export type Tokens = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export function costOf(usage: Tokens, model: string | undefined): number | undefined {
  const key = modelKey(model)
  const p = key ? PRICES[key] : undefined
  if (!p) return undefined
  return (
    (usage.input_tokens * p.input +
      usage.cache_creation_input_tokens * p.input * 1.25 +
      usage.cache_read_input_tokens * p.cacheRead +
      usage.output_tokens * p.output) /
    1_000_000
  )
}

/** Tokens in the context after a response: everything it was answered over, plus what it wrote. */
export const contextOf = (u: Tokens): number =>
  u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens + u.output_tokens

/** The context window an agent's model has: the session's own when it runs the main model, else the model's published one. */
export function windowOf(model: string, mainModel: string, sessionWindow: number): number | undefined {
  if (!model) return undefined
  if (sessionWindow > 0 && mainModel && modelKey(model) === modelKey(mainModel)) return sessionWindow
  if (/\[1m\]$/i.test(model)) return 1_000_000
  const key = modelKey(model)
  if (!key || !PRICES[key]) return undefined
  return WINDOW_200K.has(key) ? 200_000 : 1_000_000
}

// ---- formatting ----------------------------------------------------------------

export function fmtTokens(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 100_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

/** An estimate, marked ≈. */
export function fmtCost(usd: number): string {
  if (usd >= 0.01) return `≈$${usd.toFixed(2)}`
  if (usd >= 0.001) return `≈$${usd.toFixed(3)}`
  return '≈<$0.001'
}

/** The session's own figure, as /cost has it. */
export const fmtUsd = (usd: number): string => `$${usd >= 100 ? usd.toFixed(0) : usd.toFixed(2)}`

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export function clip(text: string, room: number): string {
  const chars = [...text]
  if (room <= 0) return ''
  return chars.length <= room ? text : `${chars.slice(0, Math.max(0, room - 1)).join('')}…`
}

export const width = (text: string): number => [...text].length

export function effortWord(effort: unknown): string {
  if (typeof effort === 'string') return effort
  if (typeof effort === 'number') return `${effort} tokens`
  return ''
}

export function limitOf(r: { kind: string; percentUsed: number }): FdLimit {
  return { kind: r.kind, pct: r.percentUsed }
}

/** `five_hour` → `5h`, `seven_day` → `7d`; another window by its own name. */
export const limitLabel = (kind: string): string =>
  kind === 'five_hour' ? '5h' : kind === 'seven_day' ? '7d' : kind.replace(/_/g, ' ')

// ---- subagents -------------------------------------------------------------------

export const isFinished = (a: FdAgent): boolean => a.status === 'done' || a.status === 'failed' || a.status === 'stopped'
export const isWorking = (a: FdAgent): boolean => !isFinished(a)

/** `$.agent.list()`'s status in the sidebar's words. */
export function statusFromList(status: string): FdStatus | undefined {
  switch (status) {
    case 'pending':
    case 'running':
      return 'running'
    case 'waiting':
    case 'idle':
      return 'waiting'
    case 'completed':
      return 'done'
    case 'failed':
      return 'failed'
    case 'killed':
      return 'stopped'
    default:
      return undefined
  }
}

export const statusFromReason = (reason: string): FdStatus =>
  reason === 'answer' ? 'done' : reason === 'aborted' ? 'stopped' : 'failed'

export function newAgent(id: string, at: number, fields: Partial<FdAgent> = {}): FdAgent {
  return {
    id,
    description: '',
    type: '',
    status: 'running',
    startedAt: at,
    endedAt: 0,
    model: '',
    ctxTokens: 0,
    steps: 0,
    costUsd: 0,
    isCostKnown: true,
    ...fields,
  }
}

/** One answered request of an agent: its context, its cost so far, and back to running if it had finished. */
export function applyStep(a: FdAgent, step: { model: string; usage: (Tokens & { model?: string }) | null }): FdAgent {
  const model = step.usage?.model || step.model || a.model
  const next: FdAgent = { ...a, model, steps: a.steps + 1 }
  if (isFinished(a)) {
    next.status = 'running'
    next.endedAt = 0
  }
  if (step.usage) {
    next.ctxTokens = contextOf(step.usage)
    const cost = costOf(step.usage, model)
    next.costUsd = a.costUsd + (cost ?? 0)
    next.isCostKnown = a.isCostKnown && cost !== undefined
  }
  return next
}

export function finish(a: FdAgent, status: FdStatus, at: number): FdAgent {
  return isFinished(a) && a.status === status ? a : { ...a, status, endedAt: at }
}

/** `$.agent.list()` laid over what the hooks saw: new agents join, finished ones are marked so. */
export function reconcile(
  agents: readonly FdAgent[],
  listed: readonly { id: string; description: string; type: string; status: string; teammateId?: string }[],
  now: number,
): FdAgent[] {
  const byId = new Map(agents.map(a => [a.id, a]))
  let changed = false
  const out = agents.map(a => {
    const l = listed.find(x => x.id === a.id)
    const status = l ? statusFromList(l.status) : undefined
    if (!status || status === a.status) return a
    if (isFinished(a) && !isFinished({ ...a, status })) return a
    changed = true
    return status === 'running' || status === 'waiting' ? { ...a, status } : finish(a, status, now)
  })
  for (const l of listed) {
    if (byId.has(l.id) || l.teammateId) continue
    const status = statusFromList(l.status)
    if (!status) continue
    changed = true
    out.push(newAgent(l.id, now, { description: l.description, type: l.type, status, endedAt: status === 'running' || status === 'waiting' ? 0 : now }))
  }
  return changed ? out.slice(-40) : (agents as FdAgent[])
}

export function ctxPercent(a: FdAgent, window: number | undefined): number | undefined {
  if (!a.ctxTokens || !window) return undefined
  return Math.min(100, Math.round((a.ctxTokens / window) * 100))
}

export const elapsedOf = (a: FdAgent, now: number): number => (a.endedAt > 0 ? a.endedAt : isFinished(a) ? a.startedAt : now) - a.startedAt

export function groupAgents(agents: readonly FdAgent[]) {
  const working = agents.filter(isWorking).sort((x, y) => y.startedAt - x.startedAt)
  const finished = agents.filter(isFinished).sort((x, y) => y.endedAt - x.endedAt)
  return { working, finished }
}

export type Summary = { cost: string; tokens: string; time: string }

/** Cost, Tokens and Time over the session's subagents, `—` where none is known. */
export function summaryOf(agents: readonly FdAgent[], now: number): Summary {
  const priced = agents.filter(a => a.isCostKnown && a.steps > 0)
  const counted = agents.filter(a => a.ctxTokens > 0)
  let time = '—'
  if (agents.length > 0) {
    const first = Math.min(...agents.map(a => a.startedAt))
    const end = agents.some(isWorking) ? now : Math.max(...agents.map(a => a.endedAt || a.startedAt))
    time = fmtDuration(end - first)
  }
  return {
    cost: priced.length ? fmtCost(priced.reduce((s, a) => s + a.costUsd, 0)) : '—',
    tokens: counted.length ? fmtTokens(counted.reduce((s, a) => s + a.ctxTokens, 0)) : '—',
    time,
  }
}

/** `ctx 18% · 35.9k  ≈$0.01  0:06`, leaving out what is not known. */
export function agentMetrics(a: FdAgent, window: number | undefined, now: number): string {
  const parts: string[] = []
  const head: string[] = []
  const pct = ctxPercent(a, window)
  if (pct !== undefined) head.push(`ctx ${pct}%`)
  if (a.ctxTokens > 0) head.push(fmtTokens(a.ctxTokens))
  if (head.length) parts.push(head.join(' · '))
  if (a.isCostKnown && a.steps > 0) parts.push(fmtCost(a.costUsd))
  parts.push(fmtDuration(elapsedOf(a, now)))
  return parts.join('  ')
}

export const STATUS_WORD: Record<FdStatus, string> = {
  running: 'working',
  waiting: 'waiting',
  done: 'done',
  failed: 'failed',
  stopped: 'stopped',
}

/** The toggle's argument: `open`/`on` and `close`/`off`, anything else flips it. */
export function wantOpen(arg: string, isOpen: boolean): boolean {
  const a = arg.trim().toLowerCase()
  if (a === 'open' || a === 'on' || a === 'show') return true
  if (a === 'close' || a === 'off' || a === 'hide') return false
  return !isOpen
}

// ---- what Claude is doing now ---------------------------------------------------------

const READ_TOOLS = new Set(['Read', 'NotebookRead'])
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
const SEARCH_TOOLS = new Set(['Grep', 'Glob', 'LS', 'ToolSearch', 'WebSearch'])
const AGENT_TOOLS = new Set(['Agent', 'Task'])

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined)

export const oneLine = (s: string, max = 80): string => {
  const line = s.replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

const norm = (p: string): string => p.replace(/\\/g, '/')
const trimmed = (p: string): string => norm(p).replace(/\/+$/, '')
export const baseName = (p: string): string => trimmed(p).split('/').pop() ?? p
export const dirName = (p: string): string => baseName(trimmed(p).split('/').slice(0, -1).join('/'))
const pathKey = (p: string): string => norm(p).toLowerCase()

/** What a tool call works on: a file, a command, a pattern, a query or an agent's task. */
export function callOf(id: string, tool: string, input: Record<string, unknown>, at: number): FdCall {
  const call: FdCall = { id, tool, at, isDone: false }
  if (READ_TOOLS.has(tool) || EDIT_TOOLS.has(tool)) call.path = str(input.file_path) ?? str(input.notebook_path)
  else if (SHELL_TOOLS.has(tool)) {
    call.text = str(input.command)
    call.about = str(input.description)
  }
  else if (SEARCH_TOOLS.has(tool)) call.text = str(input.pattern) ?? str(input.query) ?? str(input.path)
  else if (AGENT_TOOLS.has(tool)) call.text = str(input.description) ?? str(input.subagent_type)
  else if (tool === 'WebFetch') call.text = str(input.url)
  return call
}

export const isEditCall = (tool: string): boolean => EDIT_TOOLS.has(tool)
export const isFileCall = (tool: string): boolean => READ_TOOLS.has(tool) || EDIT_TOOLS.has(tool)

/** Lines added and removed by an edit, from the tool's own record; undefined when it does not say. */
export function diffOf(tool: string, result: unknown): { added: number; removed: number } | undefined {
  if (!result || typeof result !== 'object') return undefined
  const r = result as Record<string, unknown>
  const hunks = r.structuredPatch
  if (Array.isArray(hunks) && hunks.length > 0) {
    let added = 0
    let removed = 0
    for (const hunk of hunks) {
      const lines = (hunk as { lines?: unknown })?.lines
      if (!Array.isArray(lines)) return undefined
      for (const line of lines) {
        if (typeof line !== 'string') continue
        if (line.startsWith('+')) added++
        else if (line.startsWith('-')) removed++
      }
    }
    return { added, removed }
  }
  if (tool === 'Write' && r.type === 'create' && typeof r.content === 'string') {
    const body = r.content as string
    return { added: body === '' ? 0 : body.replace(/\n$/, '').split('\n').length, removed: 0 }
  }
  return undefined
}

/** Adds or refreshes a file at the top of the list; edited wins over read. */
export function touchFile(files: readonly FdFile[], path: string, kind: 'read' | 'edit', at: number): FdFile[] {
  const key = pathKey(path)
  const old = files.find(f => pathKey(f.path) === key)
  const rest = files.filter(f => pathKey(f.path) !== key)
  return [{ path, kind: old?.kind === 'edit' || kind === 'edit' ? 'edit' : 'read', at }, ...rest].slice(0, 50)
}

/** What a tool call shows in use: a skill, the plugin it or an MCP server comes from, or an MCP server. */
export function usesOf(tool: string, input: unknown): FdUse[] {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const out: FdUse[] = []
  if (tool === 'Skill' && typeof i.skill === 'string' && i.skill) {
    const [head, ...rest] = i.skill.split(':')
    if (rest.length > 0) out.push({ kind: 'plugin', name: head! })
    out.push({ kind: 'skill', name: rest.length > 0 ? rest.join(':') : head! })
  } else if (tool.startsWith('mcp__')) {
    const server = tool.split('__')[1] ?? ''
    const fromPlugin = /^plugin_(.+?)_[^_]+(?:-[^_]+)*$/.exec(server)
    if (server.startsWith('plugin_')) out.push({ kind: 'plugin', name: fromPlugin?.[1] ?? server.slice(7) })
    else if (server) out.push({ kind: 'mcp', name: server.replace(/^claude_ai_/, '').replace(/_/g, ' ') })
  }
  return out
}

/** Adds the uses a call shows to the session's list, once each. */
export const noteUses = (list: readonly FdUse[], uses: readonly FdUse[]): FdUse[] => {
  const next = [...list]
  for (const u of uses) if (!next.some(x => x.kind === u.kind && x.name === u.name)) next.push(u)
  return next.slice(-60)
}

/** The three lines of the pane: each kind and what was used, in the order it first appeared. */
export const useRows = (list: readonly FdUse[]): { kind: FdUse['kind']; label: string; names: string[] }[] =>
  (['skill', 'plugin', 'mcp'] as const).map(kind => ({
    kind,
    label: kind === 'skill' ? 'Skills' : kind === 'plugin' ? 'Plugins' : 'MCPs',
    names: list.filter(u => u.kind === kind).map(u => u.name),
  }))

/** Adds a call, or replaces the one with its id, keeping the newest few. */
export const addCall = (calls: readonly FdCall[], call: FdCall): FdCall[] => [...calls.filter(c => c.id !== call.id), call].slice(-12)

/** Tools whose calls read better as a whole phrase than as "Used <tool>". */
const TOOL_PHRASES: Record<string, string> = {
  TodoWrite: 'Updated the to-do list',
  TaskCreate: 'Updated the to-do list',
  TaskUpdate: 'Updated the to-do list',
  Skill: 'Loaded a skill',
  ToolSearch: 'Loaded more tools',
  AskUserQuestion: 'Asked you a question',
  ExitPlanMode: 'Showed you the plan',
  plan_steps: 'Planned the steps',
  report_progress: 'Reported progress',
  update_plan: 'Updated the task list',
  wrap_up: 'Wrapped up the turn',
  start_session: 'Proposed a new session',
  SendUserFile: 'Sent you a file',
}

/** A tool's last name part (`mcp__server__start_session` → `start_session`). */
const toolLeaf = (tool: string): string => (tool.startsWith('mcp__') ? tool.split('__').pop() ?? tool : tool)

/** A tool name in words: `mcp__server__start_session` → `start session`, `NotebookEdit` → `notebook edit`. */
const toolWords = (tool: string): string =>
  toolLeaf(tool)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()

/** A call in plain words for a list of actions: the verb, what it names, and whether the name is code. */
export type Action = { kind: 'read' | 'edit' | 'command' | 'search' | 'agent' | 'other'; glyph: string; verb: string; target: string; isCode: boolean }

export function actionOf(c: FdCall): Action {
  const name = c.path ? baseName(c.path) : ''
  if (READ_TOOLS.has(c.tool)) return { kind: 'read', glyph: '◉', verb: 'Read', target: name, isCode: false }
  if (EDIT_TOOLS.has(c.tool)) return { kind: 'edit', glyph: '✎', verb: c.tool === 'Write' ? 'Wrote' : 'Edited', target: name, isCode: false }
  if (SHELL_TOOLS.has(c.tool)) {
    // What the command is for reads better than the command itself; the command is the fallback.
    if (c.about) return { kind: 'command', glyph: '>_', verb: 'Ran:', target: oneLine(c.about, 60), isCode: false }
    return { kind: 'command', glyph: '>_', verb: 'Ran', target: c.text ? oneLine(c.text, 60) : 'a command', isCode: !!c.text }
  }
  if (c.tool === 'WebSearch') return { kind: 'search', glyph: '⌕', verb: 'Searched the web for', target: c.text ? oneLine(c.text, 50) : '', isCode: !!c.text }
  if (c.tool === 'WebFetch') return { kind: 'search', glyph: '⌕', verb: 'Fetched', target: c.text ? oneLine(c.text, 50) : 'a page', isCode: false }
  if (SEARCH_TOOLS.has(c.tool)) return { kind: 'search', glyph: '⌕', verb: 'Searched for', target: c.text ? oneLine(c.text, 50) : 'files', isCode: !!c.text }
  if (AGENT_TOOLS.has(c.tool)) return { kind: 'agent', glyph: '◆', verb: 'Started agent', target: c.text ? oneLine(c.text, 50) : '', isCode: false }
  const phrase = TOOL_PHRASES[toolLeaf(c.tool)]
  if (phrase) return { kind: 'other', glyph: '·', verb: phrase, target: '', isCode: false }
  return { kind: 'other', glyph: '·', verb: 'Used', target: toolWords(c.tool), isCode: false }
}

/** How long ago, short: `just now`, `12s`, `3m`, `2h`. */
export function agoText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

/** The most recent calls, newest first. */
export const recentActions = (calls: readonly FdCall[], n = 5): FdCall[] =>
  calls
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.at - a.c.at || b.i - a.i)
    .slice(0, n)
    .map(x => x.c)

/** A subagent's latest call in plain words, for its card: `running git status`. */
export function agentNow(c: FdCall): string {
  const a = actionOf(c)
  switch (a.kind) {
    case 'read':
      return `reading ${a.target || 'a file'}`
    case 'edit':
      return `editing ${a.target || 'a file'}`
    case 'command':
      return c.about ? oneLine(c.about.charAt(0).toLowerCase() + c.about.slice(1), 40) : c.text ? `running ${oneLine(c.text, 40)}` : 'running a command'
    case 'search':
      return c.text ? `searching for ${oneLine(c.text, 40)}` : 'searching'
    case 'agent':
      return c.text ? `starting agent ${oneLine(c.text, 30)}` : 'starting an agent'
    default:
      return a.target ? `using ${a.target}` : a.verb.charAt(0).toLowerCase() + a.verb.slice(1)
  }
}

export type Headline = {
  title: string
  detail?: string
  isWaiting: boolean
  /** The last edit's file name and size, for its own "Last edit" line. */
  editName?: string
  added?: number
  removed?: number
  step?: string
}

/** "step 2 of 4: Make the bars longer" from Task View's `checklist` state; undefined with no job under way. */
export function stepText(value: unknown): string | undefined {
  const v = value as { phase?: unknown; tasks?: unknown } | null
  if (!v || typeof v !== 'object' || typeof v.phase !== 'string' || v.phase === 'idle' || v.phase === 'done' || !Array.isArray(v.tasks)) return undefined
  const tasks = v.tasks as { name?: unknown; status?: unknown }[]
  const at = tasks.findIndex(t => t?.status === 'active')
  if (at < 0) return undefined
  const name = typeof tasks[at]!.name === 'string' ? (tasks[at]!.name as string) : ''
  return `step ${at + 1} of ${tasks.length}${name ? `: ${name}` : ''}`
}

/** What Claude is doing this moment, for the Right now card. */
export function headline(calls: readonly FdCall[], pending: FdPending | null, main: FdMain, lastEdit: FdEdit | null, step?: string): Headline {
  const base = { isWaiting: false, step, ...(lastEdit ? { editName: baseName(lastEdit.path), added: lastEdit.added, removed: lastEdit.removed } : {}) }
  if (pending) return { ...base, title: 'Waiting for you', detail: pending.text, isWaiting: true }
  const call = main.isRunning ? recentActions(calls, 1).find(c => c.at >= main.turnStartedAt) : undefined
  if (call) {
    const a = actionOf(call)
    const where = call.path ? `${baseName(call.path)} in ${dirName(call.path)}` : ''
    if (a.kind === 'read') return { ...base, title: where ? `Claude is reading ${where}` : 'Claude is reading' }
    if (a.kind === 'edit') return { ...base, title: where ? `Claude is editing ${where}` : 'Claude is editing' }
    if (a.kind === 'command') return { ...base, title: 'Claude is running a command', detail: call.about ? oneLine(call.about) : call.text ? oneLine(call.text) : undefined }
    if (a.kind === 'search') return { ...base, title: call.text ? `Claude is searching for ${oneLine(call.text, 50)}` : 'Claude is searching' }
    if (a.kind === 'agent') return { ...base, title: 'Claude is starting an agent', detail: call.text ? oneLine(call.text) : undefined }
    return { ...base, title: 'Claude is working', detail: a.target || a.verb }
  }
  return { ...base, title: main.isRunning ? 'Claude is thinking' : 'Claude is idle' }
}

/** The text of a permission prompt or question. */
export function pendingText(tool: string, input: unknown): string {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  if (tool === 'AskUserQuestion') {
    const q = (Array.isArray(i.questions) ? i.questions[0] : undefined) as { question?: unknown } | undefined
    return typeof q?.question === 'string' ? oneLine(q.question, 120) : 'Claude has a question'
  }
  if (tool === 'ExitPlanMode') return 'Approve the plan?'
  const command = str(i.command)
  if (command) return `Allow ${tool}: ${oneLine(command, 70)}?`
  const path = str(i.file_path)
  if (path) return `Allow ${tool} on ${baseName(path)}?`
  return `Allow ${toolWords(tool)}?`
}

// ---- git and files ----------------------------------------------------------------

/** `git status --porcelain=v1 --branch`: the branch and the changed files as absolute paths under `root`. */
export function parseGitStatus(stdout: string, root: string): { branch: string; changed: string[] } {
  let branch = ''
  const changed: string[] = []
  const base = trimmed(root)
  for (const raw of stdout.split(/\r?\n/)) {
    if (raw === '') continue
    if (raw.startsWith('## ')) {
      const head = raw.slice(3)
      if (head.startsWith('No commits yet on ')) branch = head.slice('No commits yet on '.length)
      else if (head.startsWith('HEAD (no branch)')) branch = 'detached HEAD'
      else branch = head.split('...')[0]!.split(' ')[0]!
      continue
    }
    let path = raw.slice(3)
    const arrow = path.indexOf(' -> ')
    if (arrow >= 0) path = path.slice(arrow + 4)
    if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1).replace(/\\(.)/g, '$1')
    changed.push(`${base}/${path}`)
  }
  return { branch, changed }
}

export const isUncommitted = (path: string, git: FdGit | null): boolean => !!git && git.changed.some(c => pathKey(c) === pathKey(path))

export type FileRow = { path: string; name: string; dir: string; kind: 'read' | 'edit'; isUncommitted: boolean }

/** The most recent files, newest first, each marked read or edited and whether git has it uncommitted. */
export const fileRows = (files: readonly FdFile[], git: FdGit | null, n = 5): FileRow[] =>
  [...files]
    .sort((a, b) => b.at - a.at)
    .slice(0, n)
    .map(f => ({ path: f.path, name: baseName(f.path), dir: dirName(f.path), kind: f.kind, isUncommitted: isUncommitted(f.path, git) }))
