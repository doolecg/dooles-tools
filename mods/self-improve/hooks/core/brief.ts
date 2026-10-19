// The brief a session starts with: soul.md (capped, most important first), then up to six active lessons for this
// folder (ranked by the files touched most recently) and the skills changed since the folder's last session.

import type { Io } from './io'
import { folderKey, folderName } from './paths'
import { parseSoul, soulBrief, soulFacts } from './soul'
import type { Lesson, State } from './state'

export const BRIEF_CAP = 1500
export const BRIEF_LESSONS = 6

export async function recentFiles(io: Io, folder: string): Promise<string[]> {
  const out: string[] = []
  const add = (text: string) => {
    for (const f of text.split(/\r?\n/)) if (f.trim() && !out.includes(f.trim())) out.push(f.trim())
  }
  try {
    const d = await io.run(['git', 'diff', '--name-only', 'HEAD'], { cwd: folder, timeoutMs: 3000 })
    if (d.code === 0) add(d.stdout)
    const l = await io.run(['git', 'log', '-n', '30', '--name-only', '--pretty=format:'], { cwd: folder, timeoutMs: 3000 })
    if (l.code === 0) add(l.stdout)
  } catch {
    // not a repo, or git is slow: no ranking by files
  }
  return out
}

export const lessonInFolder = (l: Pick<Lesson, 'folder' | 'project'>, folder: string): boolean =>
  l.folder ? folderKey(l.folder) === folderKey(folder) : !!l.project && l.project.toLowerCase() === folderName(folder).toLowerCase()

export function rankLessons(lessons: readonly Lesson[], folder: string, recent: readonly string[]): Lesson[] {
  const pos = (l: Lesson): number => {
    const at = l.files.map(f => recent.findIndex(r => r.toLowerCase() === f.replace(/\\/g, '/').toLowerCase())).filter(i => i >= 0)
    return at.length ? Math.min(...at) : Number.MAX_SAFE_INTEGER
  }
  return lessons
    .filter(l => l.status === 'active' && l.scope === 'project' && lessonInFolder(l, folder))
    .map(l => ({ l, p: pos(l) }))
    .sort((a, b) => a.p - b.p || b.l.hits - a.l.hits || b.l.updatedAt - a.l.updatedAt)
    .map(x => x.l)
}

export function lessonsBrief(state: State, folder: string, recent: readonly string[], since: number): string {
  const top = rankLessons(state.lessons, folder, recent).slice(0, BRIEF_LESSONS)
  const changed = state.changes.filter(c => c.kind === 'skill' && c.status === 'applied' && c.at > since).map(c => c.title)
  const lines: string[] = []
  if (top.length) {
    lines.push(`Lessons learned in ${folderName(folder)} (Self Improve):`)
    for (const l of top) lines.push(`- [${l.kind}] ${l.text}${l.files.length ? ` (${l.files.slice(0, 3).join(', ')})` : ''}`)
  }
  if (changed.length) lines.push(`Skills changed since last time: ${changed.join('; ')}`)
  let out = ''
  for (const line of lines) {
    if (out.length + line.length + 1 > BRIEF_CAP) break
    out += (out ? '\n' : '') + line
  }
  return out
}

export const PROJECT_SOUL_CAP = 1500

export function sessionBrief(soulText: string | null, soulCap: number, lessons: string, projectSoulText: string | null = null): string {
  return [soulBrief(soulText, soulCap), soulBrief(projectSoulText, PROJECT_SOUL_CAP, 'About this project (from the project soul.md):'), lessons].filter(Boolean).join('\n\n')
}

// The recall tool's local half: soul.md lines and this folder's active lessons, ranked by words shared with the query.
export function localRecall(state: State, soulText: string | null, query: string, folder: string, limit = 8): string[] {
  const q = new Set(query.toLowerCase().split(/[^a-z0-9_]+/).filter(w => w.length > 2))
  if (!q.size) return []
  const pool = [
    ...soulFacts(parseSoul(soulText)).map(f => `soul.md (${f.section}): ${f.text}`),
    ...state.lessons.filter(l => l.status === 'active' && l.scope === 'project' && lessonInFolder(l, folder)).map(l => `lesson [${l.kind}]: ${l.text}`),
  ]
  return pool
    .map(t => ({ t, score: t.toLowerCase().split(/[^a-z0-9_]+/).filter(w => q.has(w)).length }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.t)
}
