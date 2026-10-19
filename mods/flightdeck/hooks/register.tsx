import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, StateWrite, Timer } from 'claude-code'

import type { FdAgent, FdCall } from '../types'
import {
  EMPTY_MAIN,
  EMPTY_USAGE,
  addCall,
  agentNow,
  applyStep,
  callOf,
  diffOf,
  effortWord,
  finish,
  headline,
  isEditCall,
  isFileCall,
  isWorking,
  limitOf,
  newAgent,
  noteUses,
  paletteFor,
  parseGitStatus,
  pendingText,
  reconcile,
  statusFromReason,
  stepText,
  touchFile,
  usesOf,
  wantOpen,
} from './logic'
import { drawPane, type PaneLayout } from './pane'
import { SIDEBAR_COLUMNS, isSidebarTab, sbAsker, sbPaneMove, type SbStrip } from './sidebar-kit'

type Dollar = EngineInterface

const PANE = 'flightdeck'
const TITLE = 'Flightdeck'

const isOpenAtom = atom({ plugin: 'flightdeck', key: 'isOpen' } as const, false)
const mainAtom = atom({ plugin: 'flightdeck', key: 'main' } as const, EMPTY_MAIN)
const usageAtom = atom({ plugin: 'flightdeck', key: 'usage' } as const, EMPTY_USAGE)
const agentsAtom = atom({ plugin: 'flightdeck', key: 'agents' } as const, [])
const tickAtom = atom({ plugin: 'flightdeck', key: 'tick' } as const, 0)
const themeAtom = atom({ plugin: 'flightdeck', key: 'theme' } as const, 'dark')
const modesAtom = atom({ plugin: 'flightdeck', key: 'modes' } as const, {})
const askAtom = atom({ plugin: 'flightdeck', key: 'sidebarAsk' } as const, { args: '', n: 0 })
const runOffsetAtom = atom({ plugin: 'flightdeck', key: 'runOffset' } as const, 0)
const doneOffsetAtom = atom({ plugin: 'flightdeck', key: 'doneOffset' } as const, 0)
const clearedAtom = atom({ plugin: 'flightdeck', key: 'cleared' } as const, [])
const callsAtom = atom({ plugin: 'flightdeck', key: 'calls' } as const, [])
const filesAtom = atom({ plugin: 'flightdeck', key: 'files' } as const, [])
const usesAtom = atom({ plugin: 'flightdeck', key: 'uses' } as const, [])
const lastEditAtom = atom({ plugin: 'flightdeck', key: 'lastEdit' } as const, null)
const pendingAtom = atom({ plugin: 'flightdeck', key: 'pending' } as const, null)
const gitAtom = atom({ plugin: 'flightdeck', key: 'git' } as const, null)

/** Where the last draw put the two lists, so a wheel over one scrolls that list alone. */
let layout: PaneLayout | undefined
/** The first row the engine's window showed at the last draw. */
let bodyOffset = 0

/** Asks the Sidebar to do what `/sidebar <args>` does, through this mod's own state: no command is run. */
const askSidebar = ($: Dollar, args: string) => update($, askAtom, v => ({ args, n: (v?.n ?? 0) + 1 }))

let ticker: Timer | undefined
let frames = 0
/** When git was last asked, so it is asked at most every few seconds. */
let gitAt = 0

/** The mod's settings, read from `userConfig` each time the module loads. */
type Config = { isEnabled: boolean; recentActions: number; recentFiles: number; showRepository: boolean; gitMs: number; checkEvery: number; reopen: boolean }
const DEFAULTS: Config = { isEnabled: true, recentActions: 5, recentFiles: 5, showRepository: true, gitMs: 4000, checkEvery: 8, reopen: true }
let cfg: Config = DEFAULTS

const count = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback
}
const flag = (v: unknown, fallback: boolean): boolean => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : fallback)

function configFrom(options: Record<string, unknown> | undefined): Config {
  const o = options ?? {}
  return {
    isEnabled: flag(o.enabled, true),
    recentActions: count(o.recentActions, 5, 0, 12),
    recentFiles: count(o.recentFiles, 5, 0, 50),
    showRepository: flag(o.showRepository, true),
    gitMs: count(o.gitSeconds, 4, 1, 120) * 1000,
    checkEvery: count(o.agentCheckSeconds, 2, 1, 30) * 4,
    reopen: flag(o.reopenOnStart, true),
  }
}

const OFF_TEXT = 'Flightdeck is off. Turn it on in Mod Settings (/doole_settings) or /config.'

/** Task View's current step and Self Improve's one-line summary, read when the pane draws; each is undefined without its mod. */
async function sideNotes($: Dollar): Promise<{ step?: string; lessons?: string }> {
  const out: { step?: string; lessons?: string } = {}
  try {
    out.step = stepText((await $.state.get({ plugin: 'clean-view', key: 'checklist' })).value)
  } catch {}
  try {
    const band = (await $.state.get({ plugin: 'self-improve', key: 'band' })).value as { line?: unknown } | undefined
    if (typeof band?.line === 'string' && band.line.trim() !== '') out.lessons = band.line.trim()
  } catch {}
  return out
}

/** The branch, what changed and how far ahead of main; null (and nothing drawn) when this is not a git repo. */
async function refreshGit($: Dollar, force = false): Promise<void> {
  const at = await $.clock.now()
  if (!force && at - gitAt < cfg.gitMs) return
  gitAt = at
  try {
    const cwd = await $.session.cwd()
    const git = (args: string[]) => $.process.run(['git', ...args], { cwd, timeoutMs: 4000 })
    const top = await git(['rev-parse', '--show-toplevel'])
    const status = top.exitCode === 0 ? await git(['status', '--porcelain=v1', '--branch', '--untracked-files=all']) : top
    if (status.exitCode !== 0) return void (await update($, gitAtom, () => null))
    const parsed = parseGitStatus(status.stdout, top.stdout.trim())
    let ahead = -1
    if (parsed.branch !== 'main') {
      const count = await git(['rev-list', '--count', 'main..HEAD'])
      if (count.exitCode === 0 && /^\d+$/.test(count.stdout.trim())) ahead = Number(count.stdout.trim())
    }
    await update($, gitAtom, () => ({ ...parsed, ahead }))
  } catch {
    await update($, gitAtom, () => null)
  }
}

/** The Sidebar's strip; undefined when that mod is not installed. */
async function stripOf($: Dollar): Promise<SbStrip | undefined> {
  try {
    return (await $.state.get({ plugin: 'sidebar', key: 'strip' })).value
  } catch {
    return undefined
  }
}

/** A failure in the sidebar's own bookkeeping never reaches the session. */
async function quiet(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch {}
}

async function isLive($: Dollar): Promise<boolean> {
  if (!(await read($, isOpenAtom))) return false
  if ((await read($, mainAtom)).isRunning) return true
  return (await read($, agentsAtom)).some(isWorking)
}

/** The 250ms frame clock runs only while the sidebar is open and something in it moves. */
async function syncTicker($: Dollar): Promise<void> {
  const live = cfg.isEnabled && (await isLive($))
  if (live && !ticker) {
    ticker = $.clock.every(250, () => {
      frames += 1
      void quiet(async () => {
        await update($, tickAtom, n => n + 1)
        if (frames % cfg.checkEvery === 0) {
          await reconcileAgents($)
          await refreshGit($)
        }
        if (!(await isLive($))) await syncTicker($)
      })
    })
  } else if (!live && ticker) {
    ticker.cancel()
    ticker = undefined
  }
}

async function changeAgents($: Dollar, fn: (list: FdAgent[]) => FdAgent[]): Promise<void> {
  await update($, agentsAtom, list => fn(list ?? []))
  await syncTicker($)
}

async function reconcileAgents($: Dollar): Promise<void> {
  const cleared = await read($, clearedAtom)
  const listed = (await $.agent.list()).filter(l => !cleared.includes(l.id))
  const now = await $.clock.now()
  const was = await read($, agentsAtom)
  const next = reconcile(was, listed, now)
  if (next !== was) await changeAgents($, () => next)
}

async function refreshUsage($: Dollar): Promise<void> {
  const u = await $.session.usage()
  await update($, usageAtom, () => ({
    ctxPct: u.context.percent ?? null,
    ctxTokens: u.context.tokens ?? null,
    window: u.context.window,
    costUsd: u.cost?.usd ?? null,
    limits: u.rateLimits.map(limitOf),
  }))
}

async function readSettings($: Dollar): Promise<void> {
  const s = (await $.settings.read()) as Record<string, unknown>
  if (typeof s.theme === 'string' && s.theme !== (await read($, themeAtom))) await update($, themeAtom, () => s.theme as string)
  const model = (await read($, mainAtom)).model || (await $.session.model())
  const perModel = (s.modelSettings as Record<string, { effortLevel?: unknown }> | undefined)?.[model.replace(/\[[^\]]*\]$/, '')]
  const effort = effortWord(perModel?.effortLevel ?? s.effortLevel)
  if (effort && !(await read($, mainAtom)).effort) await update($, mainAtom, m => ({ ...m, effort }))
}

/** Tells the bottom bar (and any mod that reads it) whether the sidebar is open. */
const publishMode = ($: Dollar, isOn: boolean) => update($, modesAtom, () => ({ flightdeck: { label: 'Flightdeck', isOn } }))

async function setOpen($: Dollar, isOn: boolean): Promise<void> {
  if ((await read($, isOpenAtom)) !== isOn) await update($, isOpenAtom, () => isOn)
  await publishMode($, isOn)
  await quiet(() => $.store.set('isOpen', isOn))
  await syncTicker($)
}

/** Stops a subagent the way the TaskStop tool does, as the person's own press; a refusal is toasted. */
async function stopAgent($: Dollar, id: string): Promise<void> {
  const agent = (await read($, agentsAtom)).find(a => a.id === id)
  let why = ''
  try {
    const r = await $.tool.call({ tool: 'TaskStop', task_id: id, consent: `The user pressed "Stop" on the agent "${agent?.description ?? id}" in Flightdeck.` } as never)
    if ('deny' in r && r.deny) why = r.deny
    else if (r.isError) why = r.text ?? 'the agent did not stop'
  } catch (err) {
    why = err instanceof Error ? err.message : String(err)
  }
  if (why) {
    $.ui.toast(`Could not stop ${agent?.description || 'that agent'}: ${why}`)
    return
  }
  const now = await $.clock.now()
  await changeAgents($, list => list.map(a => (a.id === id ? finish(a, 'stopped', now) : a)))
}

async function stopAll($: Dollar): Promise<void> {
  for (const a of (await read($, agentsAtom)).filter(isWorking)) await stopAgent($, a.id)
}

/** Takes finished agents off the list for the rest of this session. */
async function clearAgents($: Dollar, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  await update($, clearedAtom, list => [...new Set([...(list ?? []), ...ids])].slice(-200))
  await changeAgents($, list => list.filter(a => !ids.includes(a.id)))
}

const openPane = ($: Dollar) => $.ui.open({ id: PANE, title: TITLE, columns: SIDEBAR_COLUMNS })

async function closePane($: Dollar): Promise<void> {
  if (!(await $.ui.panes()).some(p => p.id === PANE)) return
  await $.ui.close({ id: PANE })
  await setOpen($, false)
}

export const register: Register = (on, options) => {
  cfg = configFrom(options as Record<string, unknown> | undefined)

  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await $.command.register({
      name: 'flightdeck',
      description: 'Open or close the Flightdeck sidebar: the main session and every subagent working now',
      argumentHint: '[open|close]',
    })
    await $.command.register({ name: 'doole_flightdeck', description: 'Open Flightdeck' })
    if (!cfg.isEnabled) {
      await quiet(() => closePane($))
      return ran
    }
    await quiet(() => readSettings($))
    await quiet(() => refreshUsage($))
    await quiet(async () => {
      const model = await $.session.model()
      if (!(await read($, mainAtom)).model) await update($, mainAtom, m => ({ ...m, model }))
    })
    await quiet(() => reconcileAgents($))
    await quiet(() => refreshGit($, true))
    // A reload finds its pane still up; a new session reopens it if it was left open.
    let isOpen = false
    await quiet(async () => {
      isOpen = (await $.ui.panes()).some(p => p.id === PANE)
      if (!isOpen && cfg.reopen && (await $.store.get('isOpen')) === true) {
        await openPane($)
        isOpen = true
      }
    })
    await update($, isOpenAtom, () => isOpen)
    await publishMode($, isOpen)
    await syncTicker($)
    return ran
  })

  on('session.end', async ($, e, next) => {
    if (cfg.isEnabled && e.reason === 'clear') {
      await quiet(async () => {
        await changeAgents($, () => [])
        await update($, clearedAtom, () => [])
        await update($, callsAtom, () => [])
        await update($, filesAtom, () => [])
        await update($, usesAtom, () => [])
        await update($, lastEditAtom, () => null)
        await update($, pendingAtom, () => null)
        await update($, mainAtom, m => ({ ...EMPTY_MAIN, model: m.model, effort: m.effort }))
      })
    }
    return next(e)
  })

  on('command.run', { command: ['flightdeck', 'doole_flightdeck'] }, async ($, e) => {
    if (!cfg.isEnabled) return { text: OFF_TEXT }
    const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
    if (!wantOpen(e.args, isOpen)) {
      await $.ui.close({ id: PANE })
      await setOpen($, false)
      return { text: 'Flightdeck closed.' }
    }
    const opened = await openPane($)
    await setOpen($, true)
    await quiet(() => refreshUsage($))
    await quiet(() => reconcileAgents($))
    await quiet(() => refreshGit($, true))
    return { text: opened.isPlaced ? 'Flightdeck opened.' : `Flightdeck opened; it shows once there is room: ${opened.reason}` }
  })

  on('command.run', async ($, e, next) => {
    const ran = await next(e)
    if (cfg.isEnabled && (e.command === 'theme' || e.command === 'config')) await quiet(() => readSettings($))
    return ran
  }).catch(($, e, next) => next(e))

  // The Sidebar's strip names this tab, or moves on from it: the pane opens or closes with it.
  on('state.set', { key: 'strip' } as never, async ($, e, next) => {
    const ran = await next(e)
    if (!cfg.isEnabled) return ran
    const w = e as unknown as StateWrite
    const move = w.plugin === 'sidebar' ? sbPaneMove(PANE, w.value, w.previous) : undefined
    if (move === 'open') {
      await quiet(async () => {
        await openPane($)
        await setOpen($, true)
        await refreshUsage($)
        await reconcileAgents($)
        await refreshGit($, true)
      })
    } else if (move === 'close') await quiet(() => closePane($))
    return ran
  }).catch(($, e, next) => next(e))

  // The person's close mark or key, or an unload: the mode reads off.
  on('ui.close', async ($, e, next) => {
    const ran = await next(e)
    if (cfg.isEnabled && e.id === PANE && e.origin.kind !== 'unload') {
      await quiet(() => setOpen($, false))
      if (e.origin.kind === 'person') {
        const strip = await stripOf($)
        if (strip && isSidebarTab(strip, PANE)) await quiet(() => askSidebar($, `closed ${PANE}`))
      }
    }
    return ran
  })

  on('turn.start', async ($, e, next) => {
    if (!cfg.isEnabled) return next(e)
    await quiet(async () => {
      const now = await $.clock.now()
      await update($, mainAtom, m => ({ ...m, isRunning: true, turnStartedAt: now, turnEndedAt: 0 }))
      await update($, pendingAtom, () => null)
      await syncTicker($)
    })
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    if (!cfg.isEnabled) return yield* next(e)
    if (id === undefined) {
      await quiet(() =>
        update($, mainAtom, m => ({ ...m, model: e.model || m.model, effort: effortWord(e.effort) || m.effort, steps: m.steps + 1 })),
      )
      return yield* next(e)
    }
    const result = yield* next(e)
    // Ids no agent has (a workflow's agents, compaction and memory forks) are left out.
    await quiet(() =>
      changeAgents($, list => (list.some(a => a.id === id) ? list.map(a => (a.id === id ? applyStep(a, { model: e.model, usage: result.usage }) : a)) : list)),
    )
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (!cfg.isEnabled) return done
    await quiet(async () => {
      const now = await $.clock.now()
      const id = e.agentId
      if (id !== undefined) {
        await changeAgents($, list => list.map(a => (a.id === id ? finish(a, statusFromReason(e.reason), now) : a)))
        return
      }
      await update($, mainAtom, m => ({ ...m, isRunning: false, turnEndedAt: now }))
      await update($, pendingAtom, () => null)
      await refreshUsage($)
      await refreshGit($, true)
      await syncTicker($)
    })
    return done
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    const id = started.agentId
    if (cfg.isEnabled && id) {
      await quiet(async () => {
        const at = await $.clock.now()
        const agent = newAgent(id, at, {
          description: e.description,
          type: e.name ?? e.subagentType,
          model: started.model ?? '',
        })
        await changeAgents($, list => [...list.filter(a => a.id !== id), agent].slice(-40))
      })
    }
    return started
  })

  // Observes every tool call for the Right now card and the agents' "now:" lines; it never blocks or changes one.
  on('tool.call', async ($, e, next) => {
    if (!cfg.isEnabled) return next(e)
    const input = e as unknown as Record<string, unknown>
    const id = e.agentId
    let call: FdCall | undefined
    await quiet(async () => {
      const at = await $.clock.now()
      const made = callOf(String(e.tool_use_id ?? `${e.tool}@${at}`), e.tool, input, at)
      call = made
      const uses = usesOf(e.tool, input)
      if (uses.length > 0) await update($, usesAtom, list => noteUses(list ?? [], uses))
      if (id === undefined) {
        await update($, callsAtom, list => addCall(list ?? [], made))
        if (e.tool === 'AskUserQuestion') await update($, pendingAtom, () => ({ text: pendingText(e.tool, input), tool: e.tool }))
      } else {
        const now = agentNow(made)
        await update($, agentsAtom, list => (list ?? []).map(a => (a.id === id ? { ...a, now } : a)))
      }
    })
    let ran: Awaited<ReturnType<typeof next>> | undefined
    try {
      ran = await next(e)
      return ran
    } finally {
      await quiet(async () => {
        const done = call
        if (!done) return
        if (id === undefined) {
          await update($, callsAtom, list => (list ?? []).map(c => (c.id === done.id ? { ...c, isDone: true } : c)))
          await update($, pendingAtom, p => (p && p.tool === e.tool ? null : p))
        }
        const isOk = ran !== undefined && ran.deny === undefined && ran.isError !== true
        if (isOk && isFileCall(e.tool) && done.path) {
          const kind = isEditCall(e.tool) ? 'edit' : 'read'
          await update($, filesAtom, list => touchFile(list ?? [], done.path!, kind, done.at))
          if (kind === 'edit' && id === undefined) {
            const diff = diffOf(e.tool, ran!.result)
            if (diff) await update($, lastEditAtom, () => ({ path: done.path!, ...diff }))
            await refreshGit($)
          }
        }
      })
    }
  })

  // A permission prompt the person has to answer: the card says Claude is waiting for them.
  on('classic.PermissionRequest', async ($, e, next) => {
    const out = await next(e)
    if (!cfg.isEnabled || out.decision !== undefined || e.agent_id) return out
    await quiet(() => update($, pendingAtom, () => ({ text: pendingText(e.tool_name, e.tool_input), tool: e.tool_name })))
    return out
  }).catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    if (!cfg.isEnabled) return next(e)
    await quiet(() =>
      update($, usageAtom, () => ({
        ctxPct: e.context.percent ?? null,
        ctxTokens: e.context.tokens ?? null,
        window: e.context.window,
        costUsd: e.cost?.usd ?? null,
        limits: e.rateLimits.map(limitOf),
      })),
    )
    return next(e)
  })

  // A wheel over the running or the finished list scrolls that list alone; anywhere else the pane scrolls.
  on('ui.scroll', { requestId: PANE } as never, async ($, e, next) => {
    if (!cfg.isEnabled) return next(e)
    const s = e as unknown as { by: number; pointer?: { row: number } }
    const L = layout
    if (!s.pointer || !L || s.by === 0) return next(e)
    const at = bodyOffset + s.pointer.row
    const which = at >= L.run[0] && at < L.run[1] ? 'run' : at >= L.done[0] && at < L.done[1] ? 'done' : undefined
    if (!which) return next(e)
    const max = which === 'run' ? L.runMax : L.doneMax
    if (max === 0) return next(e)
    const step = which === 'run' ? Math.sign(s.by) : s.by
    const move = (n: number) => Math.max(0, Math.min(max, (n ?? 0) + step))
    if (which === 'run') await update($, runOffsetAtom, move)
    else await update($, doneOffsetAtom, move)
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (!cfg.isEnabled) return next(e)
    const els = $.ui.resolve(e) as unknown as Record<string, any>
    const theme = await read($, themeAtom)
    const strip = await stripOf($)
    bodyOffset = e.props.scroll?.offset ?? 0
    const main = await read($, mainAtom)
    const notes = await sideNotes($)
    const calls = await read($, callsAtom)
    const lastEdit = await read($, lastEditAtom)
    const pending = await read($, pendingAtom)
    const drawn = drawPane(els, e.surface, {
      pal: paletteFor(theme),
      theme,
      strip: isSidebarTab(strip, PANE) ? strip : undefined,
      ask: sbAsker(args => askSidebar($, args), 'flightdeck', () => closePane($)),
      main,
      calls,
      files: await read($, filesAtom),
      uses: await read($, usesAtom),
      git: await read($, gitAtom),
      lessons: notes.lessons,
      recentCount: cfg.recentActions,
      fileCount: cfg.recentFiles,
      showRepo: cfg.showRepository,
      right: headline(calls, pending, main, lastEdit, notes.step),
      usage: await read($, usageAtom),
      agents: await read($, agentsAtom),
      tick: await read($, tickAtom),
      now: await $.clock.now(),
      columns: e.props.bodyColumns,
      bodyRows: e.props.scroll?.bodyRows ?? 40,
      runOffset: await read($, runOffsetAtom),
      doneOffset: await read($, doneOffsetAtom),
      onStop: id => void quiet(() => stopAgent($, id)),
      onStopAll: () => void quiet(() => stopAll($)),
      onClear: id => void quiet(() => clearAgents($, [id])),
      onClearAll: () =>
        void quiet(async () => clearAgents($, (await read($, agentsAtom)).filter(a => !isWorking(a)).map(a => a.id))),
    })
    layout = drawn.layout
    return drawn.el
  })
}
