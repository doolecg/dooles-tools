export const SOFT = '#8b95a7'
export const EDGE = '#3f4756'
export const ACCENT = '#d9a77e'

const VERB: Record<string, string> = {
  Read: 'read',
  Grep: 'searched',
  Glob: 'searched',
  Bash: 'ran',
  PowerShell: 'ran',
}

const EDIT_VERB: Record<string, string> = { Edit: 'Edited', MultiEdit: 'Edited', Write: 'Wrote' }

/** Code changes fold to one line too; the verb is what the line leads with. */
export const editVerb = (tool: string): string | undefined => EDIT_VERB[tool]

/** Reads, searches and commands fold to one line; edits fold through `editVerb`, the rest keep their results. */
export const isQuiet = (tool: string): boolean => tool in VERB

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

/** "read 3, ran 2" for a run of calls, in the order each tool first appeared. */
export function groupLine(calls: ReadonlyArray<{ tool: string }>): string {
  const counts = new Map<string, number>()
  for (const c of calls) {
    const verb = VERB[c.tool] ?? c.tool.toLowerCase()
    counts.set(verb, (counts.get(verb) ?? 0) + 1)
  }
  return [...counts].map(([verb, n]) => `${verb} ${n}`).join(', ')
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
