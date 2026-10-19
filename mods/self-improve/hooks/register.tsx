import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, StateWrite } from 'claude-code'

import type { BandInfo, PaneUi, SessionInfo } from '../types'
import { approveDraft, approveLesson, deleteLessons, editDraft, editLesson, mergeLessons, moveLesson, rejectDraft, rejectLesson, rollback, soulAdd, soulEdit, soulPending, soulRemove, testModel } from './core/actions'
import { lessonsBrief, localRecall, recentFiles, sessionBrief } from './core/brief'
import { connectHindsight, Hindsight, parseHindsightConfig, type HindsightState } from './core/hindsight'
import type { Io, ModelReply } from './core/io'
import { errText } from './core/io'
import { claimJob, finishJob, isDue, listJobs, writeJob, workerArgv } from './core/jobs'
import { bandLine, learn, type Job } from './core/learner'
import { folderKey, hostConfigDir, joinPath, projectBank, projectSoulPath, transcriptPathFor } from './core/paths'
import { DEFAULT_SETTINGS, settingsFrom, type Settings } from './core/settings'
import { validateDraft } from './core/skills'
import { migrateV1, readSoul, seedSoul, syncSoul } from './core/soulSync'
import { loadState, saveState, type Run } from './core/state'
import { clean } from './core/text'
import { messageEvents, type MessageRow } from './core/transcript'
import { drawPane, type Els, type PaneActions } from './pane'
import { isSidebarTab, sbAsker, sbPaneMove, sbPalette, sbRows, SIDEBAR_COLUMNS, type SbStrip } from './sidebar-kit'

const PLUGIN = 'self-improve'
const PANE = 'self-improve'

const sessionAtom = atom({ plugin: 'self-improve', key: 'session' } as const, null as SessionInfo | null)
const briefAtom = atom({ plugin: 'self-improve', key: 'brief' } as const, '')
const bandAtom = atom({ plugin: 'self-improve', key: 'band' } as const, { line: '', isRunning: false } as BandInfo)
const badgeAtom = atom({ plugin: 'self-improve', key: 'sidebarBadge' } as const, 0)
const askAtom = atom({ plugin: 'self-improve', key: 'sidebarAsk' } as const, { args: '', n: 0 })

/** Asks the Sidebar to do what `/sidebar <args>` does, through this mod's own state: no command is run. */
const askSidebar = ($: EngineInterface, args: string) => update($, askAtom, v => ({ args, n: (v?.n ?? 0) + 1 }))
const uiAtom = atom({ plugin: 'self-improve', key: 'ui' } as const, {
  tab: 'lessons',
  kind: 'all',
  store: 'all',
  query: '',
  confirm: null,
  editing: null,
  section: 'How to respond',
  message: '',
} as PaneUi)

const OFF_TEXT = 'Self Improve is off. Turn it on in Mod Settings (/doole_settings) or /config.'

const EDIT_TOOLS = /^(Edit|MultiEdit|Write|NotebookEdit)$/
// The app stopped or archived the session; `clear` and `resume` go on in the same process and learn nothing.
const LEARN_ON_END = new Set(['prompt_input_exit', 'logout', 'other'])

// What the hooks share. Module variables start over on a reload; the session's own values live in $.state.
const rt: { s: Settings; isWorker: boolean; isLearning: boolean; lastHindsight: HindsightState | null } = {
  s: DEFAULT_SETTINGS,
  isWorker: false,
  isLearning: false,
  lastHindsight: null,
}


async function hindsight(io: Io): Promise<HindsightState> {
  rt.lastHindsight = await connectHindsight(io, rt.s.hindsightUrl)
  return rt.lastHindsight
}

async function readStrip($: EngineInterface): Promise<SbStrip | undefined> {
  try {
    return (await $.state.get({ plugin: 'sidebar', key: 'strip' } as const)).value as SbStrip | undefined
  } catch {
    return undefined
  }
}

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'Self Improve', closeOnEscape: true, columns: SIDEBAR_COLUMNS })

async function openLearn($: EngineInterface): Promise<Record<string, never>> {
  const strip = await readStrip($)
  await $.ui.open({ id: PANE, title: 'Self Improve', closeOnEscape: true, ...(strip?.isOn ? { columns: SIDEBAR_COLUMNS } : {}) })
  return {}
}

async function closePane($: EngineInterface): Promise<void> {
  if ((await $.ui.panes()).some(p => p.id === PANE)) await $.ui.close({ id: PANE })
}

async function refreshBand($: EngineInterface, io: Io, isRunning = false): Promise<void> {
  const session = await read($, sessionAtom)
  const state = await loadState(io)
  const waiting = state.lessons.filter(l => l.status === 'pending').length + state.drafts.filter(d => d.status === 'pending').length
  if ((await read($, badgeAtom)) !== waiting) await update($, badgeAtom, () => waiting)
  const hs = rt.lastHindsight ? (rt.lastHindsight.on ? { on: true, reason: '' } : { on: false, reason: rt.lastHindsight.reason }) : null
  const line = rt.s.mode === 'off' || !rt.s.enabled ? '' : bandLine(state, session?.cwd ?? '', hs)
  await update($, bandAtom, () => ({ line, isRunning }))
}

async function buildBrief($: EngineInterface, io: Io, cwd: string): Promise<string> {
  const state = await loadState(io)
  const key = folderKey(cwd)
  const since = state.lastStart[key] ?? 0
  state.lastStart[key] = await io.now()
  await saveState(io, state).catch(() => undefined)
  const recent = await recentFiles(io, cwd)
  const brief = sessionBrief(await readSoul(io), rt.s.soulCap, lessonsBrief(state, cwd, recent, since), await io.read(projectSoulPath(io.config, cwd, io.isWindows)).catch(() => null))
  await update($, briefAtom, () => brief)
  return brief
}

// One learn run, in this session, in the background. The job file is written first so a crash leaves it for later.
async function learnNow($: EngineInterface, trigger: string): Promise<string> {
  if (!rt.s.enabled) return OFF_TEXT
  if (rt.s.mode === 'off') return 'Self Improve is off (mode: off in its settings).'
  const session = await read($, sessionAtom)
  if (!session) return 'Self Improve has no session record yet; try again in a moment.'
  if (rt.isLearning) return 'Self Improve is already learning from this session.'
  rt.isLearning = true
  $.clock.after(10, () => {
    void (async () => {
      const io = await engineIo($)
      try {
        await refreshBand($, io, true)
        const job: Job = { sessionId: session.id, folder: session.cwd, transcriptPath: session.transcriptPath, startHead: session.startHead, note: session.note, trigger, createdAt: await io.now() }
        await writeJob(io, job)
        await claimJob(io, job.sessionId, await io.now(), `session-${session.id}`)
        const rows = (await $.session.messages()) as unknown as MessageRow[]
        const run = await learn(io, job, rt.s, { events: messageEvents(rows), hindsight: await hindsight(io) })
        await finishJob(io, job.sessionId)
        await update($, sessionAtom, x => (x ? { ...x, editsAtLearn: x.edits, learnedAt: Date.now() } : x))
        if (run) $.ui.toast(`Self Improve: ${runSummary(run)}`)
      } catch (e) {
        $.ui.toast(`Self Improve: learning failed: ${clean(errText(e))}`)
      } finally {
        rt.isLearning = false
        await refreshBand($, io).catch(() => undefined)
        $.ui.invalidate('ui.render')
      }
    })()
  })
  return `Learning from this session in the background (${trigger}). /learn status shows the result; /learn to review.`
}

// Jobs left by sessions that ended while their learner could not run (slept, crashed): each runs once, here.
async function pickUpJobs($: EngineInterface, io: Io, current: string): Promise<void> {
  const now = await io.now()
  for (const j of await listJobs(io)) {
    if (!isDue(j, now, current)) continue
    const job = await claimJob(io, j.sessionId, now, `session-${current}`)
    if (!job) continue
    await learn(io, job, job.settings ?? rt.s, { hindsight: rt.lastHindsight ?? (await hindsight(io)) }).catch(() => null)
    await finishJob(io, job.sessionId)
  }
}

// The background work of a session start: first seed, the old plugin's data, leftover jobs, the soul sync.
async function background($: EngineInterface, current: string): Promise<void> {
  const io = await engineIo($)
  const hs = await hindsight(io)
  try {
    const state = await loadState(io)
    if (!state.seededAt) {
      const r = await seedSoul(io, state, rt.s, hs)
      // Saved at once: a headless run may end before the rest, and the seed must not run twice.
      await saveState(io, state)
      $.ui.toast(`Self Improve: soul.md seeded with ${r.added} facts${r.error ? ` (${r.error})` : ''}`)
    }
    if (!state.migratedAt) {
      const old = await oldBanks($, io, hs)
      const m = await migrateV1(io, state, rt.s, hs, old)
      await saveState(io, state)
      if (m.soul || m.lessons) $.ui.toast(`Self Improve: imported ${m.soul} facts and ${m.lessons} lessons from the old self-improve plugin`)
    }
    await syncSoul(io, state, rt.s, hs)
    await saveState(io, state)
    if (rt.s.mode !== 'off') await pickUpJobs($, io, current)
  } catch (e) {
    $.ui.log(`self-improve: start-up work failed: ${clean(errText(e))}`, { to: 'debug' })
  }
  await refreshBand($, io).catch(() => undefined)
}


export const register: Register = (on, options) => {
  const s: Settings = settingsFrom(options as Record<string, unknown> | undefined)
  rt.s = s

  on('session.start', async ($, e, next) => {
    try {
      rt.isWorker = (await $.env.get('SELF_IMPROVE_WORKER')) === '1'
      await $.command.register({ name: 'self-improve-run', description: 'Self Improve: run a saved learn job (used by the background learner)', argumentHint: '<session id>' })
      if (!rt.isWorker) {
        await $.command.register({ name: 'done', description: 'Mark this session done and learn from it (Self Improve)', argumentHint: '[what was achieved]', immediate: true })
        await $.command.register({ name: 'learn-now', description: 'Learn from this session now (Self Improve)', immediate: true })
        await $.command.register({ name: 'learn-off', description: 'Turn Self Improve off for this session', immediate: true })
        await $.command.register({ name: 'learn', description: 'Self Improve: review lessons, skill drafts, the scorecard, changes, runs and soul.md', argumentHint: '[open|close|status|approve <id>|reject <id>]', immediate: true })
        await $.command.register({ name: 'doole_self-improve', description: 'Open Self Improve', immediate: true })
        await $.tool.register({
          name: 'recall',
          description: 'Search what past sessions learned about this project and about the user: lessons, decisions, preferences. Searches Hindsight (when set up), then soul.md and the local lessons. Set why=true to ask Hindsight to reflect on why something was decided.',
          inputSchema: { type: 'object', properties: { query: { type: 'string' }, why: { type: 'boolean' } }, required: ['query'] },
        })
        if (!s.enabled) return next(e)
        const io = await engineIo($)
        const id = await $.session.id()
        let startHead = ''
        try {
          const r = await io.run(['git', 'rev-parse', 'HEAD'], { cwd: e.cwd, timeoutMs: 3000 })
          if (r.code === 0) startHead = r.stdout.trim()
        } catch {
          // not a repo
        }
        await update($, sessionAtom, x =>
          x && x.id === id
            ? x
            : { id, cwd: e.cwd, startHead, transcriptPath: transcriptPathFor(io.config, e.cwd, id, io.isWindows), edits: 0, editsAtLearn: 0, learnedAt: 0, note: '', isOff: false },
        )
        await buildBrief($, io, e.cwd).catch(() => '')
        await refreshBand($, io).catch(() => undefined)
        $.clock.after(3000, () => {
          void background($, id)
        })
      }
    } catch (err) {
      $.ui.log(`self-improve: session start: ${clean(errText(err))}`, { to: 'debug' })
    }
    return next(e)
  })

  // The brief goes in as SessionStart context: at start, and again after /clear and compaction.
  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    if (rt.isWorker || s.mode === 'off' || !s.enabled) return r
    try {
      const io = await engineIo($)
      const session = await read($, sessionAtom)
      if (e.transcript_path || (session && session.id !== e.session_id)) {
        await update($, sessionAtom, x =>
          x ? { ...x, id: e.session_id || x.id, transcriptPath: e.transcript_path || x.transcriptPath, ...(x.id !== e.session_id && e.session_id ? { edits: 0, editsAtLearn: 0, note: '' } : {}) } : x,
        )
      }
      const brief = (await read($, briefAtom)) || (await buildBrief($, io, e.cwd))
      if (!brief) return r
      return { ...r, additionalContext: [...(r.additionalContext ?? []), brief] }
    } catch (err) {
      $.ui.log(`self-improve: SessionStart brief: ${clean(errText(err))}`, { to: 'debug' })
      return r
    }
  }).catch(($, e, next) => next(e))

  // Edits are counted, never changed: a session with none learns nothing when it is closed.
  on('tool.call', { tool: EDIT_TOOLS }, async ($, e, next) => {
    const r = await next(e)
    if (!s.enabled) return r
    if (!('deny' in r && r.deny) && !e.agentId) await update($, sessionAtom, x => (x ? { ...x, edits: x.edits + 1 } : x))
    return r
  }).catch(($, e, next) => next(e))

  // Each Skill load is counted in the plugin store (the scorecard's "times loaded").
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const r = await next(e)
    if (!s.enabled) return r
    try {
      const name = String((e as unknown as { skill?: unknown }).skill ?? '').replace(/^\//, '')
      if (name && !('deny' in r && r.deny)) {
        const loads = ((await $.store.get('skillLoads')) ?? {}) as Record<string, number>
        loads[name] = (loads[name] ?? 0) + 1
        await $.store.set('skillLoads', loads)
      }
    } catch {
      // counting never breaks a call
    }
    return r
  }).catch(($, e, next) => next(e))

  // Claude marked the session completed in the app's sidebar because the person asked: learn once it succeeded.
  on('tool.call', { tool: /^mcp__ccd_sidebar__mark_completed$/ }, async ($, e, next) => {
    const r = await next(e)
    if (s.enabled && !rt.isWorker && !('deny' in r && r.deny) && !('isError' in r && r.isError)) {
      const session = await read($, sessionAtom)
      if (session && !session.isOff) void learnNow($, 'marked completed')
    }
    return r
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'mcp__self-improve__recall' }, async ($, ev) => {
    if (!s.enabled) return { result: OFF_TEXT }
    const e = ev as unknown as { query?: unknown; why?: unknown }
    const query = typeof e.query === 'string' ? clean(e.query).slice(0, 400) : ''
    if (!query) return { result: 'Give a query.' }
    try {
      const io = await engineIo($)
      const session = await read($, sessionAtom)
      const cwd = session?.cwd ?? (await $.session.cwd())
      const out: string[] = []
      const hs = rt.lastHindsight ?? (await hindsight(io))
      if (hs.on) {
        if (e.why === true) {
          const r = await hs.client.reflect(projectBank(cwd), query)
          if (r.ok && r.value) out.push(r.value)
        }
        for (const bank of [projectBank(cwd), s.soulBank]) {
          const r = await hs.client.recall(bank, query, 6)
          if (r.ok) out.push(...r.value.map(t => clean(t).slice(0, 400)))
        }
      }
      for (const t of localRecall(await loadState(io), await readSoul(io), query, cwd)) if (!out.includes(t)) out.push(t)
      return { result: out.length ? out.map(x => `- ${x}`).join('\n').slice(0, 6000) : 'Nothing found in past knowledge.' }
    } catch (err) {
      return { result: `Recall is unavailable right now: ${clean(errText(err))}` }
    }
  })

  on('command.run', { command: 'done' }, async ($, e) => {
    if (!s.enabled) return { text: OFF_TEXT }
    const note = clean(e.args ?? '').slice(0, 500)
    await update($, sessionAtom, x => (x ? { ...x, note: note || x.note } : x))
    const session = await read($, sessionAtom)
    if (session?.isOff) return { text: 'Marked done. Self Improve is off for this session (/learn-off), so nothing is learned.' }
    return { text: `Marked done${note ? `: ${note}` : ''}. ${await learnNow($, '/done')}` }
  })

  on('command.run', { command: 'learn-now' }, async $ => ({ text: await learnNow($, '/learn-now') }))

  on('command.run', { command: 'learn-off' }, async $ => {
    if (!s.enabled) return { text: OFF_TEXT }
    await update($, sessionAtom, x => (x ? { ...x, isOff: true } : x))
    return { text: 'Self Improve is off for this session: closing it learns nothing. /learn-now still runs by hand.' }
  })

  on('command.run', { command: 'learn' }, async ($, e) => {
    if (!s.enabled) return { text: OFF_TEXT }
    const io = await engineIo($)
    const [verb = '', arg = ''] = (e.args ?? '').trim().split(/\s+/)
    const id = Number(arg)
    if (verb === 'status') {
      await refreshBand($, io)
      const st = await loadState(io)
      const band = await read($, bandAtom)
      const waiting = st.lessons.filter(l => l.status === 'pending').length
      const drafts = st.drafts.filter(d => d.status === 'pending').length
      return { text: `${band.line || 'Self Improve is off.'}\nMode: ${s.mode}. Waiting for review: ${waiting} lessons, ${drafts} skill drafts, ${st.soul.pending.length} Soul Bank facts.` }
    }
    if ((verb === 'approve' || verb === 'reject') && Number.isInteger(id)) {
      const st = await loadState(io)
      const isDraft = st.drafts.some(d => d.id === id && d.status === 'pending')
      const hs = rt.lastHindsight ?? (await hindsight(io))
      const r = isDraft ? (verb === 'approve' ? await approveDraft(io, id) : await rejectDraft(io, id)) : verb === 'approve' ? await approveLesson(io, hs, id) : await rejectLesson(io, id)
      await refreshBand($, io)
      $.ui.invalidate('ui.render')
      return { text: r.message }
    }
    if (verb === 'close') {
      await $.ui.close({ id: PANE })
      return {}
    }
    return openLearn($)
  })

  on('command.run', { command: 'doole_self-improve' }, $ => (s.enabled ? openLearn($) : { text: OFF_TEXT }))

  // The Sidebar's strip names this tab, or moves on from it: the pane opens or closes with it.
  on('state.set', { key: 'strip' } as never, async ($, e, next) => {
    const ran = await next(e)
    const w = e as unknown as StateWrite
    const move = w.plugin === 'sidebar' ? sbPaneMove(PLUGIN, w.value, w.previous) : undefined
    try {
      if (!s.enabled) return ran
      if (move === 'open') await openPane($)
      else if (move === 'close') await closePane($)
    } catch {}
    return ran
  }).catch(($, e, next) => next(e))

  // The person closing the tab in the sidebar (Escape, its close mark) tells the sidebar, so its strip lets go too.
  on('ui.close', async ($, e, next) => {
    const ran = await next(e)
    if (e.id === PANE && e.origin.kind === 'person') {
      try {
        const strip = await readStrip($)
        if (strip && strip.isOn && strip.active === PLUGIN) await askSidebar($, 'closed self-improve')
      } catch {
        // the sidebar is not there
      }
    }
    return ran
  })

  // The detached learner's command: runs one saved job to the end, then the headless run exits.
  on('command.run', { command: 'self-improve-run' }, async ($, e) => {
    const sessionId = (e.args ?? '').trim()
    if (!sessionId) return { text: 'Give a session id.', exitCode: 2 }
    const io = await engineIo($)
    const job = await claimJob(io, sessionId, await io.now(), `worker-${await $.session.id()}`)
    if (!job) return { text: `No job for ${sessionId}, or another learner has it.`, exitCode: 0 }
    try {
      const run = await learn(io, job, job.settings ?? s, { hindsight: await hindsight(io) })
      await finishJob(io, sessionId)
      return { text: run ? runSummary(run) : 'Self Improve is off.', exitCode: 0 }
    } catch (err) {
      return { text: `Learning failed: ${clean(errText(err))}`, exitCode: 1 }
    }
  })

  // session.end has 1.5 s: write the job and start the detached learner; the real work happens there.
  on('session.end', async ($, e, next) => {
    try {
      if (rt.isWorker || s.mode === 'off' || !s.enabled || !LEARN_ON_END.has(e.reason)) return await next(e)
      const session = await read($, sessionAtom)
      if (!session || session.isOff || rt.isLearning) return await next(e)
      // Closing a chat that did nothing learns nothing: it needs an edit since the last learn, or a /done note not yet learned.
      const hasWork = session.edits > session.editsAtLearn || (!!session.note && !session.learnedAt)
      if (!hasWork) return await next(e)
      const io = await engineIo($)
      const job: Job = { sessionId: e.sessionId, folder: session.cwd, transcriptPath: session.transcriptPath, startHead: session.startHead, note: session.note, trigger: `session end (${e.reason})`, createdAt: await io.now(), settings: s }
      await writeJob(io, job)
      const root = $.plugin.root
      const installed = folderKey(root).startsWith(folderKey(joinPath(io.isWindows, io.config, 'plugins')))
      await $.process.run(workerArgv({ isWindows: io.isWindows, sessionId: e.sessionId, pluginDir: installed ? null : root, cwd: session.cwd }), {
        env: { SELF_IMPROVE_WORKER: '1' },
        timeoutMs: 1200,
      })
    } catch {
      // the job file stays; the next session start picks it up
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const io = await engineIo($)
    const strip = await readStrip($)
    const sb = isSidebarTab(strip, PLUGIN) && strip ? { strip, pal: sbPalette(strip.theme, strip.colour), columns: e.props.bodyColumns, rows: sbRows(e.props), surface: e.surface, ask: sbAsker(args => askSidebar($, args), PLUGIN, () => closePane($)) } : undefined
    const state = await loadState(io)
    const soulText = await readSoul(io)
    const ui = await read($, uiAtom)
    const session = await read($, sessionAtom)
    const loads = ((await $.store.get('skillLoads').catch(() => ({}))) ?? {}) as Record<string, number>
    const set = (patch: Partial<PaneUi>) => update($, uiAtom, x => ({ ...x, ...patch }))
    const done = async (p: Promise<{ ok: boolean; message: string }>) => {
      try {
        const r = await p
        await set({ message: r.message, confirm: null, editing: null })
      } catch (err) {
        await set({ message: `Failed: ${clean(errText(err))}` })
      }
      await refreshBand($, io).catch(() => undefined)
      $.ui.invalidate('ui.render')
    }
    const hs = async () => rt.lastHindsight ?? (await hindsight(io))
    const actions: PaneActions = {
      set,
      approveLesson: async id => done(approveLesson(io, await hs(), id)),
      rejectLesson: id => done(rejectLesson(io, id)),
      editLesson: async (id, text) => done(editLesson(io, await hs(), id, text)),
      mergeLessons: (keep, ids) => done(mergeLessons(io, keep, ids)),
      moveLesson: async (id, to) => done(moveLesson(io, await hs(), id, to, session?.cwd ?? '')),
      deleteLessons: ids => done(deleteLessons(io, ids)),
      approveDraft: id => done(approveDraft(io, id)),
      rejectDraft: id => done(rejectDraft(io, id)),
      reloadDraft: async id => {
        const d = state.drafts.find(x => x.id === id)
        const path = joinPath(io.isWindows, io.config, 'self-improve', 'drafts', `${id}-${d?.name ?? ''}.md`)
        const text = (await io.read(path)) ?? ''
        const body = text.replace(/^(<!--[\s\S]*?-->\s*\n)+/, '')
        await done(editDraft(io, id, body, b => (d ? validateDraft({ ...d, body: b }, { takenNames: [], previous: d.kind === 'new' ? null : d.previousBody ?? null, corrections: [] }) : 'draft not found')))
      },
      rollback: async id => done(rollback(io, await hs(), id)),
      soulAdd: (section, text) => done(soulAdd(io, section, text)),
      soulEdit: (before, after) => done(soulEdit(io, before, after)),
      soulRemove: text => done(soulRemove(io, text)),
      soulPending: (id, take) => done(soulPending(io, id, take)),
      soulSync: async () => {
        const st = await loadState(io)
        const r = await syncSoul(io, st, s, await hindsight(io))
        await saveState(io, st)
        await done(Promise.resolve({ ok: !r.error, message: r.error ? `Sync: ${r.error}` : `Synced: ${r.pushed} sent to the Soul Bank, ${r.pulled} added, ${r.queued} waiting` }))
      },
      test: () => done(testModel(io, s)),
    }
    return drawPane($.ui.resolve(e) as unknown as Els, e.surface, { state, soulText, ui, settings: s, loads, folder: session?.cwd ?? '', soulFile: joinPath(io.isWindows, io.config, 'soul.md'), draftsDir: joinPath(io.isWindows, io.config, 'self-improve', 'drafts'), hindsight: rt.lastHindsight, actions, sb })
  })
}

const runSummary = (r: Run): string =>
  r.error && !r.error.startsWith('Stopped:')
    ? r.error
    : `learned ${r.extracted} lesson${r.extracted === 1 ? '' : 's'}: ${r.saved} saved, ${r.queued} to review, ${r.merged} merged, ${r.drafts} skill drafts${r.error ? ` (${r.error})` : ''}`

// The banks the old self-improve plugin (1.0.0) was set to use, each with a client for the server its own settings
// named. Its default bank was `self-improve`.
async function oldBanks($: EngineInterface, io: Io, hs: HindsightState): Promise<{ client: Hindsight; bank: string }[]> {
  const out: { client: Hindsight; bank: string }[] = []
  let configs: Record<string, { options?: Record<string, unknown> }> = {}
  try {
    configs = ((await $.settings.read()) as { pluginConfigs?: typeof configs }).pluginConfigs ?? {}
  } catch {
    configs = {}
  }
  const seen = new Set<string>()
  for (const [key, cfg] of Object.entries(configs)) {
    if (!key.startsWith(`${PLUGIN}@`)) continue
    const o = cfg.options ?? {}
    const url = typeof o.hindsightBaseUrl === 'string' ? o.hindsightBaseUrl : ''
    const bank = typeof o.hindsightBank === 'string' && o.hindsightBank ? o.hindsightBank : 'self-improve'
    const config = parseHindsightConfig(JSON.stringify({ apiUrl: url }))
    const client = config ? new Hindsight(io, config) : hs.on ? hs.client : null
    if (!client || seen.has(`${client.config.url}|${bank}`)) continue
    seen.add(`${client.config.url}|${bank}`)
    out.push({ client, bank })
  }
  if (hs.on && !seen.has(`${hs.client.config.url}|self-improve`)) out.push({ client: hs.client, bank: 'self-improve' })
  return out
}

// The learner's Io, built on the engine's `$` (kept in this file: `$` is never passed across an import).

async function hostEnv($: EngineInterface): Promise<{ isWindows: boolean; home: string; config: string }> {
  const isWindows = (await $.env.get('OS')) === 'Windows_NT'
  const home = (isWindows ? await $.env.get('USERPROFILE') : await $.env.get('HOME')) ?? (await $.env.get('HOME')) ?? ''
  const claudeConfigDir = await $.env.get('CLAUDE_CONFIG_DIR')
  return { isWindows, home, config: hostConfigDir('claude-code', { home, isWindows, claudeConfigDir }) }
}

async function engineIo($: EngineInterface): Promise<Io> {
  const env = await hostEnv($)
  const io: Io = {
    ...env,
    now: () => $.clock.now(),
    read: async path => {
      try {
        return await $.fs.read(path)
      } catch {
        return null
      }
    },
    write: (path, text) => $.fs.write(path, text),
    exists: path => $.fs.exists(path),
    list: async path => (await $.fs.list(path)).map(e => ({ name: e.name, kind: e.kind })),
    remove: async path => {
      if (!(await $.fs.exists(path))) return
      const argv = env.isWindows ? ['cmd', '/c', 'del', '/f', '/q', path] : ['rm', '-f', path]
      await $.process.run(argv, { timeoutMs: 10_000 })
    },
    run: async (argv, opts) => {
      const r = await $.process.run(argv, { cwd: opts?.cwd, timeoutMs: opts?.timeoutMs })
      return { code: r.exitCode ?? 1, stdout: r.stdout, stderr: r.stderr }
    },
    fetch: async (url, init) => {
      const late = $.clock.sleep(init.timeoutMs).then(() => null)
      const call = $.http
        .fetch(url, { method: init.method, headers: init.headers, body: init.body })
        .then(r => ({ ok: r.ok, status: r.status, text: r.text }))
        .catch(() => null)
      return Promise.race([call, late])
    },
    model: async ask => {
      try {
        const r = await $.model.complete({ model: ask.model, prompt: ask.prompt, maxTokens: ask.maxTokens, effort: ask.effort, timeoutMs: ask.timeoutMs })
        const u = r.usage
        const inputTokens = (u?.input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0)
        const outputTokens = u?.output_tokens ?? 0
        if (r.isAnswered) return { ok: true, text: r.text, inputTokens, outputTokens } satisfies ModelReply
        const why = r.reason === 'api-error' ? `API error ${'status' in r ? String(r.status) : ''}`.trim() : r.reason
        return { ok: false, error: why, inputTokens, outputTokens } satisfies ModelReply
      } catch (e) {
        return { ok: false, error: errText(e), inputTokens: 0, outputTokens: 0 }
      }
    },
  }
  return io
}
