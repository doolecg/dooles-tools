import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, StateWrite, Timer } from 'claude-code'

import type { GraphView } from '../types'
import {
  BACKOFF_MAX_MS,
  BAD_URL_TEXT,
  DEFAULTS,
  DOWN_TEXT,
  FETCH_TIMEOUT_MS,
  NO_PROJECT_TEXT,
  OFF_TEXT,
  PANE,
  PNG_REFUSED_TEXT,
  HEADER_ROWS,
  SVG_LIMIT,
  TAB_CHROME_ROWS,
  TITLE,
  SPINNER,
  altOf,
  animateSvg,
  cardsOf,
  bandDetail,
  cellsFor,
  checkPng,
  configFrom,
  cyclePick,
  fillSize,
  fingerprint,
  folderParam,
  graphUrl,
  logLines,
  loopbackOrigin,
  needsPicture,
  paneSize,
  parsePanel,
  segmentsOf,
  spun,
  svgBox,
  type Config,
  type Panel,
  type Tone,
  withSize,
  type Want,
} from './graph'
import { SIDEBAR_COLUMNS, isSidebarTab, sbActions, sbAsker, sbCard, sbClip, sbFrame, sbKit, sbPaneMove, sbPalette, sbRows, sbTitle } from './sidebar-kit'
import type { SbStrip } from './sidebar-kit'

type Dollar = EngineInterface

const EMPTY_VIEW: GraphView = { phase: 'loading', pick: null, projects: [], projectName: '', noImages: false, rev: 0 }

const viewAtom = atom({ plugin: 'graph', key: 'view' } as const, EMPTY_VIEW)
type Published = Record<string, { label: string; detail?: string; command: string; state?: 'idle' | 'working' | 'done' | 'error' }>
const segmentsAtom = atom({ plugin: 'graph', key: 'segments' } as const, {} as Published)
const askAtom = atom({ plugin: 'graph', key: 'sidebarAsk' } as const, { args: '', n: 0 })

/** Asks the Sidebar to do what `/sidebar <args>` does, through this mod's own state: no command is run. */
const askSidebar = ($: Dollar, args: string) => update($, askAtom, v => ({ args, n: (v?.n ?? 0) + 1 }))

let cfg: Config = DEFAULTS
let timer: Timer | undefined
let isOpen = false
let isPolling = false
/** Requests that timed out and have not answered yet; no new poll starts while three are still out. */
let orphans = 0
/** How often the timer fires now: refreshMs, doubled (up to 10 s) while the viewer does not answer in time. */
let period = DEFAULTS.refreshMs
let timedOut = false
/** Why the last PNG was not shown, if it was refused. */
let picNote: string | null = null
/** The viewer's last good answer. Kept outside the atom so a quiet refresh does not redraw the pane. */
let latest: Panel | null = null
type Pic = { data: string; want: Want; print: string; columns?: number; rows?: number; fit?: { width: number; height: number } }
const pics: { svg: Pic | null; png: Pic | null } = { svg: null, png: null }
/** How big each kind of surface drew the pane last (columns, and the picture's rows; 0 when unknown), so the picture is asked for at that size. */
type Seen = { columns: number; rows: number }
const seen: { terminal?: Seen; remote?: Seen } = {}
/** The Image the terminal has mounted, as cells; a new picture of that size is swapped in rather than redrawn. */
let mounted: { columns: number; rows: number } | null = null
let denied = 0
/** The per-process temp folder, once made; each picture gets its own random file name in it. */
let tempDir: string | null = null
let fetching = false

/** Live animation. Which surface drew last, and the markup the Svg shows now when it is not the viewer's own (null: the viewer's). */
let surface: 'terminal' | 'remote' | null = null
let shown: string | null = null
let svgTimer: Timer | undefined
let svgTick = 0
/** The terminal's frame loop: one frame in flight at most, a phase counter, and the rate it runs at now (it slows when frames are slow). */
let pngTimer: Timer | undefined
let frameBusy = false
let phaseN = 0
let pngRate = DEFAULTS.animFpsTerminal
let slowRun = 0
let fastRun = 0
/** The text cards' spinner, and whether the cards are what the pane shows. */
let spinTimer: Timer | undefined
let spin = 0
let cardsShown = false

const hex = (bytes = 8): string => {
  const a = new Uint8Array(bytes)
  globalThis.crypto.getRandomValues(a)
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('')
}

/** `p`'s answer, or a rejection after `ms`; a late answer is dropped, and counted until it lands. */
function bounded<T>($: Dollar, p: Promise<T>, ms = FETCH_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let late = false
    const timer = $.clock.after(ms, () => {
      late = true
      timedOut = true
      orphans += 1
      reject(new Error('viewer not responding'))
    })
    const landed = () => {
      timer.cancel()
      if (late) orphans = Math.max(0, orphans - 1)
    }
    p.then(
      v => (landed(), late || resolve(v)),
      e => (landed(), late || reject(e)),
    )
  })
}

async function quiet(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch {}
}

const redraw = ($: Dollar, patch: Partial<GraphView> = {}) => update($, viewAtom, v => ({ ...v, ...patch, rev: v.rev + 1 }))

async function readStrip($: Dollar): Promise<SbStrip | undefined> {
  try {
    return (await $.state.get({ plugin: 'sidebar', key: 'strip' } as const)).value
  } catch {
    return undefined
  }
}

const isWindows = (path: string): boolean => /^[A-Za-z]:|\\/.test(path)
const winPath = (path: string): string => path.split('/').join('\\')

/** Removes the temp folder if it is empty; a file still in it keeps it. */
async function cleanTemp($: Dollar): Promise<void> {
  if (!tempDir || fetching) return
  const dir = tempDir
  tempDir = null
  await quiet(() => $.process.run(isWindows(dir) ? ['cmd', '/c', 'rmdir', winPath(dir)] : ['rmdir', dir], { timeoutMs: 5000 }))
}

/** The PNG as base64: the host's fetch only hands back text, so curl writes the file and the engine reads its bytes. */
async function fetchPng($: Dollar, url: string): Promise<string | null> {
  const base = ((await $.env.get('TEMP')) ?? (await $.env.get('TMPDIR')) ?? '/tmp').replace(/[\\/]+$/, '')
  const win = isWindows(base)
  if (!tempDir) {
    const dir = `${base}/doole-graph-${hex()}`
    const made = await $.process.run(win ? ['cmd', '/c', 'mkdir', winPath(dir)] : ['mkdir', '-m', '700', dir], { timeoutMs: 5000 })
    if (made.exitCode !== 0) return null
    tempDir = dir
  }
  const file = `${tempDir}/${hex()}.png`
  fetching = true
  try {
    const ran = await bounded($, $.process.run(['curl', '--silent', '--show-error', '--fail', '--noproxy', '*', '--max-filesize', '4194304', '--max-time', '8', '-o', file, url], { timeoutMs: 9000 }), 10000)
    if (ran.exitCode !== 0) return null
    return (await $.fs.read(file, { as: 'bytes' })).base64
  } finally {
    await quiet(() => $.process.run(win ? ['cmd', '/c', 'del', '/f', '/q', winPath(file)] : ['rm', '-f', file], { timeoutMs: 5000 }))
    fetching = false
  }
}

async function publishSegments($: Dollar): Promise<void> {
  const next = cfg.showBand ? segmentsOf(latest?.state ?? null) : {}
  const now = await read($, segmentsAtom)
  if (JSON.stringify(now) !== JSON.stringify(next)) await update($, segmentsAtom, () => next)
}

/** Asks the viewer once; draws again only when what the pane shows has changed. */
async function poll($: Dollar): Promise<void> {
  if (isPolling || orphans >= 3) return
  isPolling = true
  timedOut = false
  try {
    const origin = loopbackOrigin(cfg.viewerUrl)
    const view = await read($, viewAtom)
    if (!origin) {
      latest = null
      if (view.phase !== 'badUrl') await redraw($, { phase: 'badUrl' })
      return
    }
    const folder = folderParam(await $.session.cwd(), view.pick)
    let panel: Panel | null = null
    let phase: GraphView['phase'] = 'down'
    try {
      const r = await bounded($, $.http.fetch(graphUrl(origin, 'state', { folder })))
      if (r.ok) {
        panel = parsePanel(r.text)
        phase = panel ? 'ok' : 'down'
      } else if (r.status === 404) phase = 'none'
    } catch {}
    if (!panel) {
      const hadPanel = latest !== null
      latest = null
      pics.svg = pics.png = null
      await publishSegments($)
      if (hadPanel || view.phase !== phase || (phase === 'none' && view.pick !== null)) await redraw($, { phase, ...(phase === 'none' ? { pick: null } : {}) })
      return
    }

    const print = fingerprint(panel, cfg.showLog)
    const changed = !latest || fingerprint(latest, cfg.showLog) !== print || view.phase !== 'ok'
    latest = panel
    let must = changed || view.projectName !== panel.project.name || view.projects.length !== panel.projects.length
    let swapped = false

    if (seen.remote !== undefined) {
      const want: Want = { folder, layout: cfg.layout, ...paneSize(seen.remote.columns, seen.remote.rows, 0, 1.6), showLog: cfg.showLog, kind: 'svg' }
      if (needsPicture(pics.svg, want, print)) {
        const r = await bounded($, $.http.fetch(graphUrl(origin, 'svg', { ...want, anim: cfg.animate }))).catch(() => null)
        const raw = r !== null && r.ok && r.text.length <= SVG_LIMIT && r.text.trimStart().startsWith('<svg') ? r.text : null
        const fit = raw ? fillSize(svgBox(raw) ?? want, want) : null
        const data = raw && fit ? withSize(raw, fit) : null
        pics.svg = data && fit && data.length <= SVG_LIMIT ? { data, want, print, fit } : null
        shown = null
        must = true
      }
    }
    if (seen.terminal !== undefined && !view.noImages) {
      const want: Want = { folder, layout: cfg.layout, ...paneSize(seen.terminal.columns, seen.terminal.rows, 0), showLog: cfg.showLog, kind: 'png' }
      if (needsPicture(pics.png, want, print)) {
        const data = await fetchPng($, graphUrl(origin, 'png', { ...want, scale: 2 })).catch(() => null)
        const checked = data ? checkPng(data) : null
        picNote = checked && 'refused' in checked && checked.refused !== 'format' ? PNG_REFUSED_TEXT : null
        if (!data || !checked || 'refused' in checked) {
          pics.png = null
          must = true
        } else {
          const size = checked.size
          const cells = cellsFor(size, seen.terminal.columns, seen.terminal.rows)
          const same = mounted !== null && mounted.columns === cells.columns && mounted.rows === cells.rows
          pics.png = { data, want, print, ...cells }
          if (same) {
            const r = await $.ui.blit({ requestId: PANE, key: 'graph', source: { png: data } }).catch(() => ({ deny: 'refused' }))
            if ('deny' in r && r.deny) {
              denied += 1
              if (denied >= 2) await redraw($, { noImages: true })
            } else denied = 0
            swapped = true
          } else must = true
        }
      }
    }
    await publishSegments($)
    if (must || (!swapped && changed)) {
      await redraw($, { phase: 'ok', projects: panel.projects, projectName: panel.project.name })
    }
  } finally {
    isPolling = false
    retime($)
    syncAnim($)
    if (!isOpen) await cleanTemp($)
  }
}

/** Asks less often while the viewer is too slow to answer, and as usual again once it does. */
function retime($: Dollar): void {
  const next = timedOut ? Math.min(BACKOFF_MAX_MS, Math.max(cfg.refreshMs, period * 2)) : cfg.refreshMs
  if (next === period) return
  period = next
  if (timer) {
    timer.cancel()
    timer = $.clock.every(period, () => void quiet(() => poll($)))
  }
}

function syncTimer($: Dollar): void {
  const live = cfg.isEnabled && (isOpen || cfg.showBand)
  if (live && !timer) {
    period = cfg.refreshMs
    timer = $.clock.every(period, () => void quiet(() => poll($)))
    void quiet(() => poll($))
  } else if (!live && timer) {
    timer.cancel()
    timer = undefined
    void quiet(() => cleanTemp($))
  }
  syncAnim($)
}

/** Starts or stops each animation loop to match what is true now; safe to call at any time. */
function syncAnim($: Dollar): void {
  const live = cfg.isEnabled && cfg.animate && isOpen && latest?.animating === true
  const svgOn = live && cfg.animFps > 0 && surface === 'remote' && pics.svg !== null
  if (svgOn && !svgTimer) {
    svgTick = 0
    svgTimer = $.clock.every(Math.round(1000 / cfg.animFps), () => void quiet(() => svgStep($)))
  } else if (!svgOn && svgTimer) {
    svgTimer.cancel()
    svgTimer = undefined
    // one last draw with the viewer's own offsets, so a stopped graph does not freeze mid-motion
    if (shown !== null) {
      shown = null
      if (isOpen) void quiet(() => redraw($))
    }
  }

  const pngOn = live && surface === 'terminal' && pics.png?.columns !== undefined
  if (pngOn && !pngTimer) {
    pngRate = cfg.animFpsTerminal
    slowRun = fastRun = 0
    pngTimer = $.clock.every(Math.round(1000 / pngRate), () => void quiet(() => pngFrame($)))
  } else if (!pngOn && pngTimer) {
    pngTimer.cancel()
    pngTimer = undefined
  }

  const spinOn = live && cardsShown
  if (spinOn && !spinTimer) {
    spinTimer = $.clock.every(500, () => {
      spin += 1
      void quiet(() => redraw($))
    })
  } else if (!spinOn && spinTimer) {
    spinTimer.cancel()
    spinTimer = undefined
    spin = 0
  }
}

/** One desktop tick: the markup's offsets move on locally and the Svg is drawn again. No network. */
async function svgStep($: Dollar): Promise<void> {
  if (!pics.svg) return
  svgTick += 1
  const next = animateSvg(pics.svg.data, svgTick, (svgTick * 1000) / cfg.animFps)
  if (next === (shown ?? pics.svg.data)) return
  shown = next
  await redraw($)
}

/** Slows the frame loop when two frames in a row took over twice the interval (down to 1 fps), and speeds it back up after ten quick ones. */
function pace($: Dollar, took: number): void {
  const interval = 1000 / pngRate
  slowRun = took > interval * 2 ? slowRun + 1 : 0
  fastRun = took <= interval ? fastRun + 1 : 0
  const next = slowRun >= 2 ? Math.max(1, pngRate / 2) : fastRun >= 10 ? Math.min(cfg.animFpsTerminal, pngRate * 2) : pngRate
  if (next === pngRate) return
  pngRate = next
  slowRun = fastRun = 0
  if (pngTimer) {
    pngTimer.cancel()
    pngTimer = $.clock.every(Math.round(1000 / pngRate), () => void quiet(() => pngFrame($)))
  }
}

/** One terminal frame: the PNG for the next phase, swapped into the mounted Image. Skipped while the last one is still out. */
async function pngFrame($: Dollar): Promise<void> {
  const origin = loopbackOrigin(cfg.viewerUrl)
  if (frameBusy || isPolling || !origin || !pics.png || !mounted || !seen.terminal) return
  frameBusy = true
  try {
    const t0 = await $.clock.now()
    phaseN = (phaseN + 1) % 1001
    const data = await fetchPng($, graphUrl(origin, 'png', { ...pics.png.want, scale: 2, phase: phaseN })).catch(() => null)
    const checked = data ? checkPng(data) : null
    if (data && checked && !('refused' in checked) && pngTimer && mounted && pics.png) {
      const cells = cellsFor(checked.size, seen.terminal.columns, seen.terminal.rows)
      if (cells.columns === mounted.columns && cells.rows === mounted.rows) {
        pics.png = { ...pics.png, data }
        const r = await $.ui.blit({ requestId: PANE, key: 'graph', source: { png: data } }).catch(() => ({ deny: 'refused' }))
        if ('deny' in r && r.deny) {
          denied += 1
          if (denied >= 2) await redraw($, { noImages: true })
        } else denied = 0
      }
    }
    pace($, (await $.clock.now()) - t0)
  } finally {
    frameBusy = false
    if (!isOpen) await cleanTemp($)
  }
}

function setOpen($: Dollar, on: boolean): void {
  if (on && !isOpen) {
    denied = 0
    void quiet(() => update($, viewAtom, v => ({ ...v, noImages: false })))
  }
  isOpen = on
  syncTimer($)
}

const openPane = ($: Dollar) => $.ui.open({ id: PANE, title: TITLE, closeOnEscape: true, columns: SIDEBAR_COLUMNS })

async function closePane($: Dollar): Promise<void> {
  if ((await $.ui.panes()).some(p => p.id === PANE)) await $.ui.close({ id: PANE })
  setOpen($, false)
}

const messageOf = (phase: GraphView['phase']): string =>
  phase === 'down' ? DOWN_TEXT : phase === 'none' ? NO_PROJECT_TEXT : phase === 'badUrl' ? BAD_URL_TEXT : 'Asking the graph viewer...'

export const register: Register = (on, options) => {
  cfg = configFrom(options as Record<string, unknown> | undefined)

  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await quiet(async () => {
      await $.command.register({ name: 'doole_graph', description: 'Open the Model Engine graph from your local viewer', argumentHint: '[open|close]' })
    })
    if (cfg.isEnabled) {
      await quiet(async () => {
        isOpen = (await $.ui.panes()).some(p => p.id === PANE)
      })
      syncTimer($)
    }
    return ran
  })

  on('session.end', async ($, e, next) => {
    isOpen = false
    syncTimer($)
    return next(e)
  })

  on('command.run', { command: 'doole_graph' }, async ($, e) => {
    if (!cfg.isEnabled) return { text: OFF_TEXT }
    if (e.args.trim().toLowerCase() === 'close') {
      await closePane($)
      return { text: 'Graph closed.' }
    }
    const strip = await readStrip($)
    const opened = await $.ui.open({ id: PANE, title: TITLE, closeOnEscape: true, ...(strip?.isOn ? { columns: SIDEBAR_COLUMNS } : {}) })
    setOpen($, true)
    return { text: opened.isPlaced ? 'Graph opened.' : `Graph opened; it shows once there is room: ${opened.reason}` }
  })

  // The Sidebar's strip names this tab, or moves on from it: the pane opens or closes with it.
  on('state.set', { key: 'strip' } as never, async ($, e, next) => {
    const ran = await next(e)
    if (!cfg.isEnabled) return ran
    const w = e as unknown as StateWrite
    const move = w.plugin === 'sidebar' ? sbPaneMove('graph', w.value, w.previous) : undefined
    await quiet(async () => {
      if (move === 'open') {
        await openPane($)
        setOpen($, true)
      } else if (move === 'close') await closePane($)
    })
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.close', async ($, e, next) => {
    const ran = await next(e)
    if (cfg.isEnabled && e.id === PANE && e.origin.kind !== 'unload') {
      setOpen($, false)
      if (e.origin.kind === 'person') {
        const strip = await readStrip($)
        if (strip?.isOn && strip.active === 'graph') await quiet(() => askSidebar($, 'closed graph'))
      }
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (!cfg.isEnabled) return next(e)
    const els = $.ui.resolve(e) as unknown as Record<string, any>
    const { Box, Text, Button } = els
    const view = await read($, viewAtom)
    const strip = await readStrip($)
    const columns = e.props.bodyColumns
    // a surface that does not report its width is drawn for a generous one, not a thumbnail
    const drawColumns = Number.isFinite(columns) && columns > 0 ? columns : 56
    const isTerminal = e.surface === 'terminal'
    surface = isTerminal ? 'terminal' : 'remote'
    cardsShown = false

    const isTab = strip !== undefined && isSidebarTab(strip, 'graph')
    const paneRows = sbRows(e.props)
    const picRows = paneRows > 0 ? Math.max(0, paneRows - HEADER_ROWS - (isTab ? TAB_CHROME_ROWS : 0)) : 0

    // A surface or size not drawn for before: the picture is asked for at this size now, not at the next tick.
    const kind = isTerminal ? 'terminal' : 'remote'
    if (seen[kind]?.columns !== drawColumns || seen[kind]?.rows !== picRows) {
      seen[kind] = { columns: drawColumns, rows: picRows }
      void quiet(() => poll($))
    }

    const k = sbKit(els, e.surface, sbPalette(strip?.theme ?? 'dark', strip?.colour), columns, 0, isTab ? paneRows : 0)
    const tone = (t: Tone) => (t === 'good' ? k.pal.good : t === 'warn' ? k.pal.warn : t === 'bad' ? k.pal.bad : t === 'info' ? k.pal.info : t === 'dim' ? k.pal.dim : k.pal.text)
    const panel = view.phase === 'ok' ? latest : null

    const body: unknown[] = []
    if (isTab) body.push(sbTitle(k, { icon: '◈', name: 'Graph', status: view.projectName || undefined }))

    if (panel) {
      const go = (step: 1 | -1) => () => {
        void quiet(async () => {
          await update($, viewAtom, v => ({ ...v, pick: cyclePick(v.projects, v.pick, step) }))
          await poll($)
        })
      }
      const canCycle = view.projects.length > 1 || view.pick !== null
      const busy = bandDetail(panel.state) !== 'idle'
      body.push(
        <Box key="g-select" columnGap={1}>
          {canCycle && <Button key="g-prev" plain onPress={go(-1)}><Text color={k.pal.accent}>‹</Text></Button>}
          <Text color={k.pal.text} wrap="truncate-end">{sbClip(view.pick === null ? `${view.projectName} (this folder)` : view.projectName, Math.max(8, columns - 10))}</Text>
          {canCycle && <Button key="g-next" plain onPress={go(1)}><Text color={k.pal.accent}>›</Text></Button>}
          <Text color={busy ? k.pal.good : k.pal.dim}>●</Text>
        </Box>,
      )
    }

    mounted = null
    if (!panel) {
      body.push(<Text key="g-msg" color={k.pal.dim}>{messageOf(view.phase)}</Text>)
    } else if (isTerminal && !view.noImages && pics.png?.columns !== undefined) {
      const { Image } = els
      mounted = { columns: pics.png.columns, rows: pics.png.rows! }
      body.push(
        <Box key="g-pic" justifyContent="center">
          <Image key="graph" source={{ png: pics.png.data }} columns={pics.png.columns} rows={pics.png.rows} alt={sbClip(altOf(panel), Math.max(20, columns - 2))} />
        </Box>,
      )
    } else if (!isTerminal && pics.svg) {
      const { Svg } = els
      body.push(
        <Box key="g-pic" justifyContent="center">
          <Svg key="g-svg" source={shown ?? pics.svg.data} alt={altOf(panel)} isInteractive={!cfg.animate} {...(pics.svg.fit ?? {})} />
        </Box>,
      )
    } else {
      cardsShown = true
      const glyph = cfg.animate && latest?.animating ? SPINNER[spin % SPINNER.length]! : ''
      if (isTerminal && picNote) body.push(<Text key="g-note" color={k.pal.warn}>{sbClip(picNote, Math.max(8, columns - 2))}</Text>)
      for (const card of cardsOf(panel.state)) {
        body.push(
          sbCard(
            k,
            `g-card:${card.title}`,
            <Box key={`g-body:${card.title}`} flexDirection="column">
              <Text color={k.pal.accent} bold>{card.title}</Text>
              {card.lines.map((l, i) => <Text key={`${card.title}:${i}`} color={tone(l.tone)}>{sbClip(spun(l.text, glyph), Math.max(8, columns - 6))}</Text>)}
            </Box>,
          ),
        )
      }
      if (cfg.showLog) {
        const rows = logLines(panel.log)
        body.push(
          <Box key="g-log" flexDirection="column">
            <Text color={k.pal.accent} bold>LOG</Text>
            {rows.length === 0 ? <Text color={k.pal.dim}>nothing yet</Text> : rows.map((r, i) => <Text key={`g-log:${i}`} color={k.pal.dim}>{sbClip(r, Math.max(8, columns - 2))}</Text>)}
          </Box>,
        )
      }
    }

    syncAnim($)

    if (isTab) {
      const ask = sbAsker(args => askSidebar($, args), 'graph', () => closePane($))
      return sbFrame(k, strip!, sbActions(ask), body)
    }
    return (
      <Box flexDirection="column">
        {body}
      </Box>
    )
  })
}
