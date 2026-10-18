export const SOFT = '#8b95a7'
export const EDGE = '#3f4756'
export const ACCENT = '#d9a77e'

export type Kind = { icon: string; label: string }

const KINDS: Record<string, Kind> = {
  Read: { icon: '▤', label: 'File Read' },
  Grep: { icon: '⌕', label: 'Searched' },
  Glob: { icon: '⌕', label: 'Searched' },
  Bash: { icon: '❯', label: 'Command Run' },
  PowerShell: { icon: '❯', label: 'Command Run' },
  Edit: { icon: '✎', label: 'Code Edited' },
  MultiEdit: { icon: '✎', label: 'Code Edited' },
  Write: { icon: '✚', label: 'Code Added' },
  NotebookEdit: { icon: '✎', label: 'Code Edited' },
  Agent: { icon: '❖', label: 'Agent' },
  WebFetch: { icon: '◎', label: 'Web' },
  WebSearch: { icon: '◎', label: 'Web' },
}

const HINDSIGHT_SAVE = /ingest|capture|retain/

/** The mark and the name a call goes by: Code Edited, Hindsight Recall, Tool Used. */
export function kindOf(tool: string): Kind {
  if (KINDS[tool]) return KINDS[tool]
  if (tool.startsWith('mcp__hindsight__')) return { icon: '◈', label: HINDSIGHT_SAVE.test(tool) ? 'Hindsight Saved' : 'Hindsight Recall' }
  if (tool === 'mcp__self-improve__recall') return { icon: '◈', label: 'Hindsight Recall' }
  if (tool.startsWith('mcp__codegraph__')) return { icon: '◇', label: 'CodeGraph' }
  return { icon: '⚙', label: 'Tool Used' }
}

/** A tool's own name without the `mcp__server__` front, for the line when a call has no path or command. */
export const shortName = (tool: string): string => tool.replace(/^mcp__[^_]+(?:-[^_]+)*__/, '')

/** The engine's own rows stay: checklists, plans and questions are not folded. */
export const keepsRow = (tool: string): boolean => /^(Todo|Task|ExitPlanMode|AskUserQuestion)/.test(tool)

export function clip(text: string, width: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= width ? flat : `${flat.slice(0, Math.max(1, width - 1))}…`
}

/** The one thing a call is about: a command, a path or a pattern. */
export function subject(input: unknown): string {
  if (typeof input !== 'object' || input === null) return ''
  const o = input as Record<string, unknown>
  for (const key of ['command', 'file_path', 'pattern', 'url', 'path', 'query', 'description']) {
    if (typeof o[key] === 'string') return o[key] as string
  }
  return ''
}

/** "▤ File Read 3  ❯ Command Run 2" for a run of calls, in the order each kind first appeared. */
export function groupLine(calls: ReadonlyArray<{ tool: string }>): string {
  const counts = new Map<string, number>()
  for (const c of calls) {
    const k = kindOf(c.tool)
    const key = `${k.icon} ${k.label}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts].map(([key, n]) => `${key} ${n}`).join('  ')
}

/** A turn's time: `6s`, `1m 4s`. */
export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

/** What a call returned, as text: a shell's output, a content block's text, else the data. */
export function outputText(out: unknown): string {
  if (out == null) return ''
  if (typeof out === 'string') return out
  if (typeof out === 'object') {
    const o = out as Record<string, unknown>
    const parts = [o.stdout, o.stderr, o.content, o.text].filter((v): v is string => typeof v === 'string' && v !== '')
    if (parts.length) return parts.join('\n')
  }
  try {
    return JSON.stringify(out, null, 1)
  } catch {
    return ''
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** The first `rows` lines of `text`, each cut to `width`, with a "more" line when there is more. */
export function head(text: string, rows: number, width: number): string[] {
  const all = text.replace(/\r/g, '').split('\n')
  const out = all.slice(0, rows).map(l => clip(l, width))
  return all.length > rows ? [...out, `… ${all.length - rows} more lines`] : out
}

/** What an expanded call shows: the change for an edit, the command for a shell, the input otherwise, then what came back. */
export function detailLines(tool: string, input: unknown, output: unknown, width: number): string[] {
  const o = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const out: string[] = []
  if (tool === 'Edit' || tool === 'MultiEdit') {
    if (str(o.old_string)) out.push(...head(str(o.old_string), 6, width).map(l => `- ${l}`))
    if (str(o.new_string)) out.push(...head(str(o.new_string), 6, width).map(l => `+ ${l}`))
  } else if (tool === 'Write') {
    out.push(...head(str(o.content), 8, width))
  } else if (tool === 'Bash' || tool === 'PowerShell') {
    out.push(...head(str(o.command), 4, width).map(l => `$ ${l}`))
  } else {
    try {
      out.push(...head(JSON.stringify(input, null, 1) ?? '', 8, width))
    } catch {}
  }
  if (tool !== 'Edit' && tool !== 'MultiEdit' && tool !== 'Write') {
    const text = outputText(output).trim()
    if (text) out.push('', ...head(text, 10, width))
  }
  return out
}

export const CORNER = '╰─ '

/** The folder as the shell prompt shows it, cut from the left when it is wider than `width`. */
export function pathLine(cwd: string, width: number): string {
  const w = Math.max(8, width)
  return cwd.length <= w ? cwd : `…${cwd.slice(cwd.length - (w - 1))}`
}

/** A shell line (`!ls`, or the engine's bash-input wrapper) or a slash command: these keep the folder above them. */
export const isCommandText = (text: string): boolean => /^\s*(?:[!/]|<bash-input>)/.test(text)

/** The name shown above your messages; a blank setting gives "Doole". */
export const userLabel = (name: unknown): string => (typeof name === 'string' && name.trim() ? name.trim() : 'Doole')
