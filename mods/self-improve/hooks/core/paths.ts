// Where things live. Every path the mod writes is built here, from the host's config folder.

export type Host = 'claude-code' | 'opencode'

export type HostEnv = {
  // HOME on macOS and Linux, USERPROFILE on Windows.
  home: string
  isWindows: boolean
  // CLAUDE_CONFIG_DIR when set (Claude Code moves its whole config folder there).
  claudeConfigDir?: string
  // XDG_CONFIG_HOME when set (OpenCode reads ~/.config/opencode, or $XDG_CONFIG_HOME/opencode).
  xdgConfigHome?: string
}

export const sepOf = (isWindows: boolean): string => (isWindows ? '\\' : '/')

// Joins path parts with the platform's separator, trimming separators at the joins.
export function joinPath(isWindows: boolean, ...parts: string[]): string {
  const sep = sepOf(isWindows)
  const kept = parts.filter(p => p !== '')
  return kept
    .map((p, i) => {
      let s = p.replace(/[\\/]+/g, sep)
      if (i > 0) s = s.replace(/^[\\/]+/, '')
      // A trailing separator goes, except on a root (`/`, `C:\`).
      if (i < kept.length - 1 || !/^([A-Za-z]:)?[\\/]+$/.test(s)) s = s.replace(/[\\/]+$/, '')
      return s
    })
    .join(sep)
}

const expandHome = (p: string, home: string): string => (p === '~' || /^~[\\/]/.test(p) ? home + p.slice(1) : p)

// The host's config folder: ~/.claude for Claude Code (or CLAUDE_CONFIG_DIR), ~/.config/opencode for OpenCode.
export function hostConfigDir(host: Host, env: HostEnv): string {
  if (host === 'opencode') {
    const base = env.xdgConfigHome?.trim() ? expandHome(env.xdgConfigHome.trim(), env.home) : joinPath(env.isWindows, env.home, '.config')
    return joinPath(env.isWindows, base, 'opencode')
  }
  const dir = env.claudeConfigDir?.trim()
  return dir ? joinPath(env.isWindows, expandHome(dir, env.home)) : joinPath(env.isWindows, env.home, '.claude')
}

// The mod's own folder inside the config folder: state, drafts, run history and job files.
export const modDir = (config: string, isWindows: boolean): string => joinPath(isWindows, config, 'self-improve')

export const soulPath = (config: string, isWindows: boolean): string => joinPath(isWindows, config, 'soul.md')

// Claude Code keeps a project's sessions and memory under projects/<the folder with every other character a dash>.
export const encodeProjectDir = (folder: string): string => folder.replace(/[^A-Za-z0-9]/g, '-')

export const projectDir = (config: string, folder: string, isWindows: boolean): string =>
  joinPath(isWindows, config, 'projects', encodeProjectDir(folder))

export const memoryDirFor = (config: string, folder: string, isWindows: boolean): string =>
  joinPath(isWindows, projectDir(config, folder, isWindows), 'memory')

// Optional, hand-written: the project's own soul, loaded read-only into the session brief.
export const projectSoulPath = (config: string, folder: string, isWindows: boolean): string =>
  joinPath(isWindows, projectDir(config, folder, isWindows), 'soul.md')

export const transcriptPathFor = (config: string, folder: string, sessionId: string, isWindows: boolean): string =>
  joinPath(isWindows, projectDir(config, folder, isWindows), `${sessionId}.jsonl`)

// A folder as a key: forward slashes, no trailing slash, lower case (Windows and macOS folders match case-insensitively).
export const folderKey = (folder: string): string => folder.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

export const folderName = (folder: string): string => folder.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || folder

// The project's Hindsight bank: the same name the hindsight MCP and hooks use.
export const projectBank = (folder: string): string => `coding-agent::${folderName(folder)}`

export const relativeTo = (folder: string, path: string): string => {
  const f = folderKey(folder)
  const p = path.replace(/\\/g, '/')
  return p.toLowerCase().startsWith(f + '/') ? p.slice(f.length + 1) : p
}
