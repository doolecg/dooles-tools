import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, StateWrite, Timer } from 'claude-code'

import type { SbJob } from '../types'
import { CATALOG, SIDEBAR_TAB, blocksOf, entryOf, footerOf, installedFrom, jobOf, move, orderedIds, parseArg, pickTab, tabsFor } from './logic'
import { EMPTY_STRIP, SIDEBAR_COLUMNS, sbActions, sbFrame, sbKit, sbPalette, sbRows } from './sidebar-kit'
import { configIdsOf, offNames, optionsOf, settingsPath, withOption } from './plugin-config'
import { viewRows } from './tabs'

type Dollar = EngineInterface

const PANE = 'sidebar'
const TITLE = 'Main Menu'

const stripAtom = atom({ plugin: 'sidebar', key: 'strip' } as const, EMPTY_STRIP)
const viewAtom = atom({ plugin: 'sidebar', key: 'view' } as const, SIDEBAR_TAB)
const tickAtom = atom({ plugin: 'sidebar', key: 'tick' } as const, 0)
const modesAtom = atom({ plugin: 'sidebar', key: 'modes' } as const, {})
const badgesAtom = atom({ plugin: 'sidebar', key: 'badges' } as const, {})
const jobAtom = atom({ plugin: 'sidebar', key: 'job' } as const, null)
const enhanceAtom = atom({ plugin: 'sidebar', key: 'enhance' } as const, null)
const hiddenAtom = atom({ plugin: 'sidebar', key: 'hidden' } as const, [])
const orderAtom = atom({ plugin: 'sidebar', key: 'order' } as const, [])
const installedAtom = atom({ plugin: 'sidebar', key: 'installed' } as const, [])
const offAtom = atom({ plugin: 'sidebar', key: 'off' } as const, [])
const turnedOnAtom = atom({ plugin: 'sidebar', key: 'turnedOn' } as const, [])
const blocksAtom = atom({ plugin: 'sidebar', key: 'blocks' } as const, [])

/** The commands each mod registers, so a mod loaded with --plugin-dir counts as installed too. */
const COMMAND_OF: Record<string, string> = {
  flightdeck: 'flightdeck',
  'self-improve': 'learn',
  'idea-shelf': 'ideas',
  graph: 'doole_graph',
  'clean-view': 'simple',
  context: 'passes',
  'mod-settings': 'doole_settings',
}

let ticker: Timer | undefined

/** The mod's settings, read from `userConfig` each time the module loads. */
type Config = { isEnabled: boolean; reopen: boolean; startTab: string; showFooter: boolean; showBadges: boolean }
let cfg: Config = { isEnabled: true, reopen: true, startTab: 'last', showFooter: true, showBadges: true }

const flag = (v: unknown, fallback: boolean): boolean => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : fallback)

function configFrom(options: Record<string, unknown> | undefined): Config {
  const o = options ?? {}
  const tab = typeof o.startTab === 'string' ? o.startTab : 'last'
  return {
    isEnabled: flag(o.enabled, true),
    reopen: flag(o.reopenOnStart, true),
    startTab: tab === SIDEBAR_TAB || CATALOG.some(c => c.id === tab && !c.footer) ? tab : 'last',
    showFooter: flag(o.showFooter, true),
    showBadges: flag(o.showBadges, true),
  }
}

const OFF_TEXT = 'Main Menu is off. Turn it on in Mod Settings (/doole_settings) or /config.'
const footerFor = (value: unknown) => (cfg.showFooter ? footerOf(value) : null)

async function quiet(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch {}
}

/** Rebuilds the strip every tab draws from: the tabs, their badges, the open one, the look. */
async function syncStrip($: Dollar, patch: { isOn?: boolean; active?: string } = {}): Promise<void> {
  const tabs = tabsFor(await read($, installedAtom), await read($, orderAtom), await read($, hiddenAtom), cfg.showBadges ? await read($, badgesAtom) : {}, await read($, offAtom))
  await update($, stripAtom, s => ({ ...(s ?? EMPTY_STRIP), ...patch, tabs }))
  // Tells the bottom bar (and any mod that reads it) whether the sidebar is open.
  const isOn = (await read($, stripAtom)).isOn
  if ((await read($, modesAtom)).sidebar?.isOn !== isOn) await update($, modesAtom, () => ({ sidebar: { label: 'Main Menu', isOn } }))
}

/** The 250ms frame clock runs while the sidebar's own pane shows a moving Task View job. */
async function syncTicker($: Dollar): Promise<void> {
  const strip = await read($, stripAtom)
  const job = await read($, jobAtom)
  const moving = strip.isOn && (await read($, viewAtom)) === 'clean-view' && job !== null && job.phase !== 'done'
  if (moving && !ticker) ticker = $.clock.every(250, () => void quiet(() => update($, tickAtom, n => n + 1)))
  else if (!moving && ticker) {
    ticker.cancel()
    ticker = undefined
  }
}

async function loadLook($: Dollar): Promise<void> {
  const s = (await $.settings.read()) as Record<string, unknown>
  const theme = typeof s.theme === 'string' ? s.theme : 'dark'
  const saved = await $.settings.read({ source: 'user' }).catch(() => ({}))
  const barId = configIdsOf(saved, 'bottom-bar')[0]
  const savedColour = barId ? optionsOf(saved, barId).colour : undefined
  const colour = typeof savedColour === 'string' ? savedColour : 'Coral'
  const strip = await read($, stripAtom)
  if (strip.theme !== theme || strip.colour !== colour) await update($, stripAtom, st => ({ ...st, theme, colour }))
}

/** The mods switched off: those whose saved `enabled` option is false in settings.json. Returns whether the list changed. */
async function loadOff($: Dollar): Promise<boolean> {
  const saved = await $.settings.read({ source: 'user' }).catch(() => ({}))
  const names = offNames(saved)
  const off = CATALOG.map(c => c.id).filter(id => names.includes(id))
  const before = await read($, offAtom)
  if (before.length === off.length && before.every(id => off.includes(id))) return false
  await update($, offAtom, () => off)
  return true
}

/** The installed mods: `claude plugin list`, plus any whose commands or options are loaded here. */
async function loadInstalled($: Dollar): Promise<void> {
  const found = new Set<string>()
  await quiet(async () => {
    for (const c of await $.command.list()) {
      for (const [id, command] of Object.entries(COMMAND_OF)) if (c.name === command) found.add(id)
      if (c.plugin) found.add(c.plugin)
    }
  })
  await quiet(async () => {
    for (const r of await $.config.list()) if (r.provider.plugin) found.add(r.provider.plugin)
  })
  // What is loaded here shows at once; `claude plugin list` takes a few seconds and adds the rest.
  const known = (await read($, installedAtom)).filter(id => found.has(id) || CATALOG.some(c => c.id === id))
  await update($, installedAtom, () => CATALOG.map(c => c.id).filter(id => found.has(id) || known.includes(id)))
  await quiet(() => loadOff($))
  await syncStrip($)
  await quiet(async () => {
    const ran = await $.process.run(['claude', 'plugin', 'list', '--json'], { timeoutMs: 30000 })
    if (ran.exitCode === 0) for (const id of installedFrom(JSON.parse(ran.stdout))) found.add(id)
  })
  const ids = CATALOG.map(c => c.id).filter(id => found.has(id))
  await update($, installedAtom, () => ids)
  await syncStrip($)
}

const openOwnPane = ($: Dollar) => $.ui.open({ id: PANE, title: TITLE, columns: SIDEBAR_COLUMNS })

async function closeOwnPane($: Dollar): Promise<void> {
  if ((await $.ui.panes()).some(p => p.id === PANE)) await $.ui.close({ id: PANE })
}

/** Whether a pane mod is loaded here: its command is registered. */
async function isLoaded($: Dollar, command: string): Promise<boolean> {
  try {
    return (await $.command.list()).some(c => c.name === command)
  } catch {
    return false
  }
}

/**
 * Shows tab `id`. A pane mod draws its own tab: it opens its pane when the strip names it and closes it when
 * the strip moves on (state, never a command), and the sidebar's own pane goes. A pane mod that is not loaded
 * here shows on the sidebar's pane.
 */
async function showTab($: Dollar, id: string): Promise<void> {
  const entry = id === SIDEBAR_TAB ? undefined : entryOf(id)
  await quiet(() => loadOff($))
  // A mod that is off draws nothing: the Main Menu's pane shows its off page.
  const hasPane = !!entry?.pane && !(await read($, offAtom)).includes(id) && (await isLoaded($, entry.pane.command))

  await syncStrip($, { isOn: true, active: id })
  await quiet(() => $.store.set('active', id))
  await quiet(() => $.store.set('isOn', true))

  if (hasPane) await quiet(() => closeOwnPane($))
  else {
    await update($, viewAtom, () => id)
    await quiet(() => openOwnPane($))
  }
  await syncTicker($)
}

/** Switches a mod on from its off page: saves `enabled: true` in settings.json. The mod itself loads after /reload-plugins. */
async function turnOn($: Dollar, id: string): Promise<void> {
  const saved = await $.settings.read({ source: 'user' })
  const isWindows = (await $.env.get('OS')) === 'Windows_NT'
  const home = (isWindows ? await $.env.get('USERPROFILE') : await $.env.get('HOME')) ?? (await $.env.get('HOME')) ?? ''
  const path = settingsPath(await $.env.get('CLAUDE_CONFIG_DIR'), home)
  for (const pid of configIdsOf(saved, id)) await $.fs.write(path, withOption((await $.fs.exists(path)) ? await $.fs.read(path) : '', pid, 'enabled', true))
  await update($, turnedOnAtom, list => [...list.filter(t => t !== id), id])
}

async function closeAll($: Dollar): Promise<void> {
  await syncStrip($, { isOn: false })
  await quiet(() => $.store.set('isOn', false))
  await quiet(() => closeOwnPane($))
  await syncTicker($)
}

async function openSidebar($: Dollar): Promise<void> {
  await quiet(() => $.store.set('isOn', true))
  await quiet(async () => {
    if (await loadOff($)) await syncStrip($)
  })
  const strip = await read($, stripAtom)
  const saved = await $.store.get('active').catch(() => undefined)
  const last = typeof saved === 'string' ? saved : strip.active
  await showTab($, pickTab(cfg.startTab === 'last' ? last : cfg.startTab, strip.tabs))
}

async function setLayout($: Dollar, hidden: string[], order: string[]): Promise<void> {
  await update($, hiddenAtom, () => hidden)
  await update($, orderAtom, () => order)
  await quiet(() => $.store.set('hidden', hidden))
  await quiet(() => $.store.set('order', order))
  await syncStrip($)
}

/** `/sidebar <args>` (or `/doole_main-menu`): what the command hook answers, and what the sidebar's own buttons call directly. */
async function sidebarCommand($: Dollar, args: string): Promise<{ text?: string }> {
  const arg = parseArg(args)
  const strip = await read($, stripAtom)
  if (arg.kind === 'close' || (arg.kind === 'flip' && strip.isOn)) {
    await closeAll($)
    return { text: 'Main Menu closed.' }
  }
  if (arg.kind === 'closed') {
    // A mod's own pane was closed by the person: the sidebar reads off with it.
    if (strip.isOn && strip.active === arg.id) {
      await syncStrip($, { isOn: false })
      await quiet(() => $.store.set('isOn', false))
      await syncTicker($)
    }
    return {}
  }
  if (arg.kind === 'tab') {
    if (arg.id === SIDEBAR_TAB) await loadInstalled($)
    await showTab($, arg.id)
    return {}
  }
  await openSidebar($)
  return { text: 'Main Menu opened.' }
}

/** Another mod's write of a key the sidebar follows; read untyped, as the contract does not declare it. */
const writeOf = (e: unknown) => e as unknown as StateWrite

export const register: Register = (on, options) => {
  cfg = configFrom(options as Record<string, unknown> | undefined)

  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await $.command.register({
      name: 'sidebar',
      description: 'Open or close the Main Menu: one tab per mod (the Sidebar, renamed)',
      argumentHint: '[open|close|<mod>]',
    })
    await $.command.register({ name: 'doole_sidebar', description: 'Open the Main Menu (the Sidebar, renamed)' })
    await $.command.register({ name: 'doole_main-menu', description: 'Open the Main Menu: one tab per mod' })
    if (!cfg.isEnabled) {
      await quiet(() => closeOwnPane($))
      return ran
    }
    await quiet(async () => {
      const hidden = await $.store.get('hidden')
      const order = await $.store.get('order')
      if (Array.isArray(hidden)) await update($, hiddenAtom, () => hidden.filter((x): x is string => typeof x === 'string'))
      if (Array.isArray(order)) await update($, orderAtom, () => order.filter((x): x is string => typeof x === 'string'))
    })
    await quiet(() => loadLook($))
    await quiet(async () => {
      const job = jobOf((await $.state.get({ plugin: 'clean-view', key: 'checklist' })).value)
      await update($, jobAtom, () => job)
    })
    await quiet(async () => {
      const footer = footerFor((await $.state.get({ plugin: 'context', key: 'footer' })).value)
      await update($, stripAtom, s => ({ ...(s ?? EMPTY_STRIP), footer }))
    })
    await quiet(async () => {
      const blocks = blocksOf((await $.state.get({ plugin: 'rule-guard', key: 'blocks' })).value)
      await update($, blocksAtom, () => blocks)
    })
    await quiet(async () => {
      const last = (await $.state.get({ plugin: 'prompt-enhancer', key: 'lastRun' })).value
      if (last) await update($, enhanceAtom, () => ({ counts: String(last.counts ?? ''), ok: last.ok === true }))
    })
    await syncStrip($)
    // The mod list takes a moment (`claude plugin list`); the sidebar reopens once it is in.
    void (async () => {
      await loadInstalled($)
      if (cfg.reopen && (await $.store.get('isOn').catch(() => false)) === true) await openSidebar($)
    })().catch(() => {})
    return ran
  })

  on('command.run', { command: ['sidebar', 'doole_sidebar', 'doole_main-menu'] }, ($, e) => (cfg.isEnabled ? sidebarCommand($, e.args) : { text: OFF_TEXT }))

  on('command.run', async ($, e, next) => {
    const ran = await next(e)
    if (cfg.isEnabled && (e.command === 'theme' || e.command === 'config')) await quiet(() => loadLook($))
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.close', async ($, e, next) => {
    const ran = await next(e)
    if (cfg.isEnabled && e.id === PANE && e.origin.kind === 'person') {
      await quiet(async () => {
        await syncStrip($, { isOn: false })
        await $.store.set('isOn', false)
        await syncTicker($)
      })
    }
    return ran
  }).catch(($, e, next) => next(e))

  // A mod's strip press, written as its own `sidebarAsk`: what `/sidebar <args>` would do, with no command run.
  on('state.set', { key: 'sidebarAsk' } as never, async ($, e, next) => {
    const ran = await next(e)
    const w = writeOf(e)
    if (!cfg.isEnabled) return ran
    const args = (w.value as { args?: unknown } | null)?.args
    if (w.plugin !== 'sidebar' && typeof args === 'string') await quiet(() => sidebarCommand($, args))
    return ran
  }).catch(($, e, next) => next(e))

  // Other mods' tab badges, Task View's job and Prompt Enhancer's last run, followed live.
  on('state.set', { key: 'sidebarBadge' } as never, async ($, e, next) => {
    const ran = await next(e)
    const w = writeOf(e)
    if (cfg.isEnabled && typeof w.value === 'number') {
      await quiet(async () => {
        await update($, badgesAtom, all => ({ ...(all ?? {}), [w.plugin]: w.value as number }))
        await syncStrip($)
      })
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('state.set', { key: 'checklist' } as never, async ($, e, next) => {
    const ran = await next(e)
    const w = writeOf(e)
    if (cfg.isEnabled && w.plugin === 'clean-view') {
      await quiet(async () => {
        await update($, jobAtom, () => jobOf(w.value))
        await syncTicker($)
      })
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('state.set', { key: 'lastRun' } as never, async ($, e, next) => {
    const ran = await next(e)
    const w = writeOf(e)
    const v = w.value as { counts?: unknown; ok?: unknown } | null
    if (cfg.isEnabled && w.plugin === 'prompt-enhancer' && v) await quiet(() => update($, enhanceAtom, () => ({ counts: String(v.counts ?? ''), ok: v.ok === true })))
    return ran
  }).catch(($, e, next) => next(e))

  // Context's footer goes into the strip, so every tab draws it at the bottom.
  on('state.set', { key: 'footer' } as never, async ($, e, next) => {
    const ran = await next(e)
    const w = writeOf(e)
    if (cfg.isEnabled && w.plugin === 'context') await quiet(() => update($, stripAtom, s => ({ ...(s ?? EMPTY_STRIP), footer: footerFor(w.value) })))
    return ran
  }).catch(($, e, next) => next(e))

  on('state.set', { key: 'blocks' } as never, async ($, e, next) => {
    const ran = await next(e)
    const w = writeOf(e)
    if (cfg.isEnabled && w.plugin === 'rule-guard') await quiet(() => update($, blocksAtom, () => blocksOf(w.value)))
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (!cfg.isEnabled) return next(e)
    const els = $.ui.resolve(e) as unknown as Record<string, any>
    const strip = await read($, stripAtom)
    const view = await read($, viewAtom)
    const k = sbKit(els, e.surface, sbPalette(strip.theme, strip.colour), e.props.bodyColumns, await read($, tickAtom), sbRows(e.props))
    const installed = await read($, installedAtom)
    const ask = (args: string) => void sidebarCommand($, args).catch(() => {})
    const body = viewRows(k, {
      view,
      job: (await read($, jobAtom)) as SbJob | null,
      enhance: await read($, enhanceAtom),
      blocks: await read($, blocksAtom),
      installed,
      off: await read($, offAtom),
      turnedOn: await read($, turnedOnAtom),
      all: orderedIds(installed, await read($, orderAtom), await read($, offAtom)),
      hidden: await read($, hiddenAtom),
      tabs: strip.tabs,
      now: await $.clock.now(),
      openTab: id => ask(`tab ${id}`),
      turnOn: id => void turnOn($, id).catch(() => {}),
      setHidden: (id, isHidden) =>
        void (async () => {
          const hidden = await read($, hiddenAtom)
          await setLayout($, isHidden ? [...hidden.filter(h => h !== id), id] : hidden.filter(h => h !== id), await read($, orderAtom))
        })().catch(() => {}),
      moveTab: (id, by) =>
        void (async () => {
          const order = move(orderedIds(await read($, installedAtom), await read($, orderAtom), await read($, offAtom)), id, by)
          await setLayout($, await read($, hiddenAtom), order)
        })().catch(() => {}),
    })
    return sbFrame(k, strip, sbActions(ask), body)
  })
}
