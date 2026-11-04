import { describe, expect, mock, test } from 'claude-code/testing'

import {
  BAD_URL_TEXT,
  DEFAULTS,
  DOWN_TEXT,
  NO_PROJECT_TEXT,
  OFF_TEXT,
  PNG_REFUSED_TEXT,
  altOf,
  bandDetail,
  cardsOf,
  cellsFor,
  checkPng,
  configFrom,
  cyclePick,
  fingerprint,
  folderParam,
  graphUrl,
  layoutFor,
  logLines,
  loopbackOrigin,
  needsPicture,
  parsePanel,
  pixelWidth,
  pngSize,
  segmentsOf,
} from '../hooks/graph'

const T0 = 1_800_000_000_000
const CWD = 'F:/work/Model Engine'

const state = (over: Record<string, unknown> = {}) => ({
  orch: 'thinking',
  builder: 'idle',
  opus: 'idle',
  verdict: null,
  calls: 2,
  council: { ui: 'idle', code: 'idle', run: 'idle' },
  recall: { cg: 3, hs: 2, grep: 1, saved: 0, run: false },
  ...over,
})

const reply = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    project: { id: 'p1', name: 'Model Engine' },
    projects: [
      { id: 'p1', name: 'Model Engine' },
      { id: 'p2', name: 'Other' },
    ],
    state: state(),
    log: [['10:00:01', 'session', 'startup']],
    changes: [],
    at: T0,
    sessions: 1,
    idle: false,
    ...over,
  })

/** The first bytes of a PNG: signature, IHDR length, the name, then width and height. */
function pngOf(width: number, height: number): string {
  const bytes = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]
  for (const n of [width, height]) bytes.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255)
  bytes.push(8, 6, 0, 0, 0, 0, 0, 0, 0)
  return btoa(String.fromCharCode(...bytes))
}

// ---------------------------------------------------------------- pure behaviour

describe('settings', () => {
  test('defaults are the ones in plugin.json', () => {
    expect(configFrom(undefined)).toEqual(DEFAULTS)
    expect(DEFAULTS).toEqual({ isEnabled: true, viewerUrl: 'http://127.0.0.1:4779', refreshMs: 1500, layout: 'auto', showBand: false })
  })

  test('the refresh never goes under 500 ms and a bad layout is auto', () => {
    expect(configFrom({ refreshMs: 100 }).refreshMs).toBe(500)
    expect(configFrom({ refreshMs: '2500' }).refreshMs).toBe(2500)
    expect(configFrom({ refreshMs: 'soon' }).refreshMs).toBe(1500)
    expect(configFrom({ layout: 'sideways' }).layout).toBe('auto')
    expect(configFrom({ layout: 'Tall' }).layout).toBe('tall')
    expect(configFrom({ showBand: 'true' }).showBand).toBe(true)
    expect(configFrom({ enabled: false }).isEnabled).toBe(false)
  })
})

describe('the loopback rule', () => {
  test('accepts this computer only', () => {
    expect(loopbackOrigin('http://127.0.0.1:4779')).toBe('http://127.0.0.1:4779')
    expect(loopbackOrigin('http://127.0.0.1:4779/')).toBe('http://127.0.0.1:4779')
    expect(loopbackOrigin(' HTTP://LOCALHOST:8080/panel ')).toBe('http://localhost:8080')
    expect(loopbackOrigin('http://[::1]:4779')).toBe('http://[::1]:4779')
    expect(loopbackOrigin('http://127.4.5.6')).toBe('http://127.4.5.6')
  })

  test('refuses everything else', () => {
    for (const url of [
      'http://example.com:4779',
      'http://192.168.1.5:4779',
      'http://10.0.0.1',
      'http://0.0.0.0:4779',
      'http://127.0.0.1.evil.com:4779',
      'http://localhost.evil.com',
      'http://localhost@evil.com',
      'http://user:pw@127.0.0.1:4779',
      'ftp://127.0.0.1',
      'http://127.0.0.999:4779',
      'http://127.0.0.1:0',
      'http://127.0.0.1:99999',
      'not a url',
      '',
    ]) {
      expect(loopbackOrigin(url), url).toBe(null)
    }
  })
})

describe('the viewer’s reply', () => {
  test('is read into a panel', () => {
    const p = parsePanel(reply({ state: state({ council: { ui: 'pass', code: 'running', run: 'weird' }, verdict: 'approve' }) }))!
    expect(p.project).toEqual({ id: 'p1', name: 'Model Engine' })
    expect(p.projects.map(x => x.id)).toEqual(['p1', 'p2'])
    expect(p.state.council).toEqual({ ui: 'pass', code: 'running', run: 'weird' })
    expect(p.state.verdict).toBe('approve')
    expect(p.state.recall.cg).toBe(3)
    expect(p.log).toEqual([['10:00:01', 'session', 'startup']])
    expect(p.at).toBe(T0)
  })

  test('anything that is not that shape is refused, and gaps get defaults', () => {
    expect(parsePanel('<html>not json</html>')).toBe(null)
    expect(parsePanel('{"error":"no such project"}')).toBe(null)
    expect(parsePanel('{"project":{"id":"p"},"state":5}')).toBe(null)
    const p = parsePanel('{"project":{"id":"p","name":"P"},"state":{}}')!
    expect(p.state.orch).toBe('idle')
    expect(p.state.council).toEqual({ ui: 'idle', code: 'idle', run: 'idle' })
    expect(p.projects).toEqual([])
    expect(p.log).toEqual([])
  })
})

describe('which project', () => {
  test('the session folder is asked about unless a project was picked', () => {
    expect(folderParam(CWD, null)).toBe(CWD)
    expect(folderParam(CWD, 'p2')).toBe('p2')
  })

  test('cycling goes folder, each project, then round to the folder', () => {
    const list = [
      { id: 'p1', name: 'A' },
      { id: 'p2', name: 'B' },
    ]
    expect(cyclePick(list, null)).toBe('p1')
    expect(cyclePick(list, 'p1')).toBe('p2')
    expect(cyclePick(list, 'p2')).toBe(null)
    expect(cyclePick(list, null, -1)).toBe('p2')
    expect(cyclePick(list, 'gone')).toBe('p1')
    expect(cyclePick([], null)).toBe(null)
  })
})

describe('sizes and addresses', () => {
  test('a narrow pane gets the tall layout unless the setting says otherwise', () => {
    expect(layoutFor('auto', 56)).toBe('tall')
    expect(layoutFor('auto', 120)).toBe('wide')
    expect(layoutFor('wide', 40)).toBe('wide')
    expect(layoutFor('tall', 200)).toBe('tall')
    expect(pixelWidth(56)).toBe(448)
    expect(pixelWidth(10)).toBe(320)
    expect(pixelWidth(900)).toBe(2400)
  })

  test('urls carry the folder, layout and width', () => {
    const o = 'http://127.0.0.1:4779'
    expect(graphUrl(o, 'state', { folder: CWD })).toBe(`${o}/panel/state?folder=${encodeURIComponent(CWD)}`)
    expect(graphUrl(o, 'svg', { folder: 'p1', layout: 'tall', width: 448 })).toBe(`${o}/panel/graph.svg?folder=p1&layout=tall&width=448`)
    expect(graphUrl(o, 'png', { folder: 'p1', layout: 'wide', width: 900, scale: 2 })).toBe(`${o}/panel/graph.png?folder=p1&layout=wide&width=900&scale=2`)
  })

  test('the picture’s size comes from its PNG header and fills the pane’s cells', () => {
    expect(pngSize(pngOf(896, 640))).toEqual({ width: 896, height: 640 })
    expect(pngSize(btoa('not a picture at all, really not'))).toBe(null)
    expect(pngSize('%%%')).toBe(null)
    expect(cellsFor({ width: 896, height: 640 }, 56)).toEqual({ columns: 56, rows: 20 })
    expect(cellsFor({ width: 10, height: 10000 }, 300).rows).toBe(255)
    expect(cellsFor({ width: 10, height: 10000 }, 300).columns).toBe(255)
  })
})

describe('refetching the picture', () => {
  const want = { folder: CWD, layout: 'tall' as const, width: 448, kind: 'svg' as const }
  const p1 = parsePanel(reply())!

  test('the viewer’s clock reading alone never asks for a new picture', () => {
    const prev = { want, print: fingerprint(p1) }
    const later = parsePanel(reply({ at: T0 + 1500 }))!
    expect(later.at).not.toBe(p1.at)
    expect(needsPicture(prev, want, fingerprint(later))).toBe(false)
  })

  test('none yet, a changed state, folder, layout, width or kind each ask for one', () => {
    const prev = { want, print: fingerprint(p1) }
    expect(needsPicture(null, want, fingerprint(p1))).toBe(true)
    expect(needsPicture(prev, want, fingerprint(parsePanel(reply({ state: state({ builder: 'building' }) }))!))).toBe(true)
    expect(needsPicture(prev, want, fingerprint(parsePanel(reply({ log: [['1', 'a', 'b']] }))!))).toBe(true)
    expect(needsPicture(prev, { ...want, folder: 'p2' }, prev.print)).toBe(true)
    expect(needsPicture(prev, { ...want, layout: 'wide' }, prev.print)).toBe(true)
    expect(needsPicture(prev, { ...want, width: 500 }, prev.print)).toBe(true)
    expect(needsPicture(prev, { ...want, kind: 'png' }, prev.print)).toBe(true)
  })
})

describe('the cards in text', () => {
  test('every card the picture has is there, with the states in plain words', () => {
    const cards = cardsOf(parsePanel(reply({ state: state({ builder: 'building', opus: 'awake', verdict: 'reject', council: { ui: 'running', code: 'note', run: 'fail' }, recall: { cg: 5, hs: 4, grep: 0, saved: 0, run: true } }) }))!.state)
    expect(cards.map(c => c.title)).toEqual(['ORCHESTRATOR', 'BRAIN', 'RECALL', 'BUILDER', 'COUNCIL'])
    const text = (title: string) => cards.find(c => c.title === title)!.lines.map(l => l.text)
    expect(text('ORCHESTRATOR')).toEqual(['thinking'])
    expect(text('BRAIN')).toEqual(['awake', 'calls 2 · REJECT'])
    expect(text('RECALL')).toEqual(['running…', 'codegraph 5 · hindsight 4'])
    expect(text('BUILDER')).toEqual(['building'])
    expect(text('COUNCIL')).toEqual(['ui running…', 'code note', 'run fail'])
  })

  test('idle and pass read as such, and the log shows only the last six rows', () => {
    const cards = cardsOf(parsePanel(reply({ state: state({ orch: 'idle', council: { ui: 'pass', code: 'idle', run: 'idle' } }) }))!.state)
    expect(cards.find(c => c.title === 'COUNCIL')!.lines[0]).toEqual({ text: 'ui pass', tone: 'good' })
    expect(cards.find(c => c.title === 'ORCHESTRATOR')!.lines[0]!.text).toBe('idle')
    const rows = Array.from({ length: 9 }, (_, i) => [`t${i}`, 'unit', `m${i}`] as [string, string, string])
    expect(logLines(rows)).toEqual(['t3 unit m3', 't4 unit m4', 't5 unit m5', 't6 unit m6', 't7 unit m7', 't8 unit m8'])
  })

  test('the alt text names the project and the cards', () => {
    expect(altOf(parsePanel(reply())!)).toContain('Model Engine graph for Model Engine')
  })
})

describe('the status segment', () => {
  test('says what runs and how many council members have finished', () => {
    expect(bandDetail(parsePanel(reply({ state: state({ orch: 'idle' }) }))!.state)).toBe('idle')
    expect(bandDetail(parsePanel(reply({ state: state({ orch: 'writing', builder: 'building', council: { ui: 'pass', code: 'running', run: 'idle' } }) }))!.state)).toBe('building · council 1/3')
    const seg = segmentsOf(parsePanel(reply({ state: state({ orch: 'idle' }) }))!.state)
    expect(seg.graph).toEqual({ label: 'Graph', detail: 'idle', command: 'doole_graph', state: 'idle' })
    expect(segmentsOf(null)).toEqual({})
  })
})

// ---------------------------------------------------------------- wiring

type World = { fetched: string[]; curl: string[]; procs: string[]; temp: string; hang: boolean; blits: any[]; segments: unknown[]; opened: any[]; panes: string[]; closed: string[]; up: boolean; body: () => string; svg: string; png: string | null; deny: string | null; missing: boolean; clock: any }

function world(on: any): World {
  const w: World = { fetched: [], curl: [], procs: [], temp: 'C:/Temp', hang: false, blits: [], segments: [], opened: [], panes: [], closed: [], up: true, body: () => reply(), svg: '<svg width="448" height="300"></svg>', png: pngOf(896, 640), deny: null, missing: false, clock: null }
  w.clock = mock.clock(on, { now: T0 })
  mock.store(on)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.end', (_$: any, e: any) => ({ sessionId: e.sessionId }))
  on('session.cwd', () => ({ value: CWD }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  on('ui.open', (_$: any, e: any) => {
    w.opened.push(e)
    if (!w.panes.includes(e.id)) w.panes.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_$: any, e: any) => {
    w.closed.push(e.id)
    w.panes = w.panes.filter(p => p !== e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: w.panes.map(id => ({ id, title: 'Graph', isShown: true, isFocused: false, isPlaced: true })) }))
  on('http.fetch', (_$: any, e: any) => {
    w.fetched.push(e.url)
    if (w.hang) return new Promise(() => {}) as any
    if (!w.up) return { deny: 'connection refused' } as any
    if (w.missing) return { value: { status: 404, ok: false, headers: {}, text: '{"error":"no such project"}' } }
    const ok = (text: string) => ({ value: { status: 200, ok: true, headers: {}, text } })
    if (e.url.includes('/panel/state')) return ok(w.body())
    if (e.url.includes('/panel/graph.svg')) return ok(w.svg)
    return { value: { status: 404, ok: false, headers: {}, text: '{"error":"x"}' } }
  })
  on('env.get', () => ({ value: w.temp }))
  on('process.run', (_$: any, e: any) => {
    const argv = e.argv as string[]
    w.procs.push(argv.join(' '))
    if (argv[0] !== 'curl') return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    w.curl.push(argv.join(' '))
    return { value: { exitCode: w.png ? 0 : 22, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('fs.read', () => ({ value: { base64: w.png ?? '' } }))
  on('ui.blit', (_$: any, e: any) => {
    w.blits.push(e)
    return w.deny ? ({ deny: w.deny } as any) : { value: {} }
  })
  on('state.set', { key: 'segments' } as any, async (_$: any, e: any, next: any) => {
    w.segments.push(e.value)
    return next(e)
  })
  return w
}

const SESSION = { cwd: CWD, surface: 'terminal', isInteractive: true } as any
const PROPS = (bodyColumns = 56) => ({ title: 'Graph', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} })
const mountPane = ($: any, surface: 'terminal' | 'desktop' | 'mobile', columns = 56) =>
  $.ui.mount({ plugin: 'graph', surface, component: 'Pane', requestId: 'graph', props: PROPS(columns) } as any)
const run = ($: any, args = '') => $.command.run({ command: 'doole_graph', args, origin: { kind: 'composer' as const } } as any)
const textsOf = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => String(t.text)).join('\n')
/** Lets the first draw ask the viewer, then draws the pane again with what came back. */
async function settle($: any, surface: 'terminal' | 'desktop' | 'mobile', columns = 56) {
  const first = await mountPane($, surface, columns)
  await first.unmount()
  await new Promise(r => setTimeout(r, 30))
  return mountPane($, surface, columns)
}

describe('the PNG limits', () => {
  /** Base64 text of `bytes` bytes that opens like a PNG of the stated size. */
  const bigPng = (bytes: number, w = 896, h = 640) => {
    const head = atob(pngOf(w, h))
    return btoa(head + 'x'.repeat(Math.max(0, bytes - head.length)))
  }

  test('a PNG over 2 MiB, or claiming over 4096 a side or 8 megapixels, is refused', () => {
    expect(checkPng(pngOf(896, 640))).toEqual({ size: { width: 896, height: 640 } })
    expect(checkPng(bigPng(2 * 1024 * 1024))).toMatchObject({ size: { width: 896, height: 640 } })
    expect(checkPng(bigPng(2 * 1024 * 1024 + 1))).toEqual({ refused: 'bytes' })
    expect(checkPng(pngOf(4097, 100))).toEqual({ refused: 'pixels' })
    expect(checkPng(pngOf(100, 4097))).toEqual({ refused: 'pixels' })
    expect(checkPng(pngOf(4096, 2048))).toEqual({ refused: 'pixels' })
    expect(checkPng(pngOf(4096, 1953))).toMatchObject({ size: { width: 4096, height: 1953 } })
    expect(checkPng(btoa('not a picture at all, really not'))).toEqual({ refused: 'format' })
  })
})

describe('wiring', () => {
  test('/doole_graph opens the pane and /doole_graph close closes it', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    const out = (await run($)) as any
    expect(out.text).toBe('Graph opened.')
    expect(w.opened.at(-1)).toMatchObject({ id: 'graph', title: 'Graph' })
    expect(((await run($, 'close')) as any).text).toBe('Graph closed.')
    expect(w.closed).toEqual(['graph'])
  })

  test('off: the command says so and nothing is asked of the viewer', { options: { enabled: false } }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    expect(((await run($)) as any).text).toBe(OFF_TEXT)
    expect(w.opened).toHaveLength(0)
    expect(w.fetched).toHaveLength(0)
  })

  test('an unreachable viewer gives one plain message and the pane keeps retrying', async ($, on) => {
    const w = world(on)
    w.up = false
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'desktop')
    expect(await textsOf(ui)).toBe(DOWN_TEXT)
    await ui.unmount()
    expect(w.fetched.length).toBeGreaterThan(0)
  })

  test('a viewer with no project for the folder says so', async ($, on) => {
    const w = world(on)
    w.missing = true
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'desktop')
    expect(await textsOf(ui)).toBe(NO_PROJECT_TEXT)
    await ui.unmount()
  })

  test('a viewer address that is not on this computer is refused and nothing is fetched', { options: { viewerUrl: 'http://example.com:4779' } }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'terminal')
    expect(await textsOf(ui)).toBe(BAD_URL_TEXT)
    await ui.unmount()
    expect(w.fetched).toEqual([])
    expect(w.curl).toEqual([])
  })

  test('desktop: the graph is an Svg, asked for the session folder in the tall layout', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'desktop')
    const svgs = await ui.findAll({ type: 'Svg' })
    expect(svgs).toHaveLength(1)
    expect(JSON.stringify(svgs[0])).toContain('<svg')
    expect(await ui.findAll({ type: 'Image' })).toHaveLength(0)
    expect(w.fetched).toContain(`http://127.0.0.1:4779/panel/graph.svg?folder=${encodeURIComponent(CWD)}&layout=tall&width=448`)
    expect(w.curl).toEqual([])
    await ui.unmount()
  })

  test('desktop: markup too big for an Svg falls back to the cards, in colour', async ($, on) => {
    const w = world(on)
    w.svg = `<svg>${'x'.repeat(140_000)}</svg>`
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'desktop')
    expect(await ui.findAll({ type: 'Svg' })).toHaveLength(0)
    const all = await textsOf(ui)
    for (const word of ['ORCHESTRATOR', 'BRAIN', 'RECALL', 'BUILDER', 'COUNCIL', 'codegraph 3 · hindsight 2']) expect(all).toContain(word)
    await ui.unmount()
  })

  test('terminal: the graph is an Image of the PNG sized to the pane’s cells', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'terminal')
    const images = await ui.findAll({ type: 'Image' })
    expect(images).toHaveLength(1)
    expect(images[0].props).toMatchObject({ key: 'graph', columns: 56, rows: 20 })
    expect(JSON.stringify(images[0])).toContain(w.png!)
    expect(w.curl[0]).toContain('/panel/graph.png?folder=')
    expect(w.curl[0]).toContain('layout=tall&width=448&scale=2')
    expect(w.curl[0]).toContain('127.0.0.1:4779')
    await ui.unmount()
  })

  test('terminal that cannot fetch the picture gets the cards and the last six log rows', async ($, on) => {
    const w = world(on)
    w.png = null
    w.body = () => reply({ log: Array.from({ length: 9 }, (_, i) => [`t${i}`, 'unit', `row${i}`]), state: state({ council: { ui: 'pass', code: 'running', run: 'idle' } }) })
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'terminal')
    expect(await ui.findAll({ type: 'Image' })).toHaveLength(0)
    const all = await textsOf(ui)
    for (const word of ['ORCHESTRATOR', 'BRAIN', 'RECALL', 'BUILDER', 'COUNCIL', 'ui pass', 'code running…', 'run idle']) expect(all).toContain(word)
    expect(all).toContain('row8')
    expect(all).toContain('row3')
    expect(all).not.toContain('row2')
    await ui.unmount()
  })

  test('a terminal that shows no pictures is switched to text after two refused swaps', async ($, on) => {
    const w = world(on)
    const clock = w.clock
    await $.session.start(SESSION)
    await run($)
    let ui = await settle($, 'terminal')
    expect(await ui.findAll({ type: 'Image' })).toHaveLength(1)
    w.deny = 'an Image drawing its alt'
    for (const n of [1, 2]) {
      w.body = () => reply({ state: state({ calls: 10 + n }) })
      await clock.advance(1500)
      await new Promise(r => setTimeout(r, 30))
    }
    expect(w.blits.length).toBeGreaterThanOrEqual(2)
    await ui.unmount()
    ui = await mountPane($, 'terminal')
    expect(await ui.findAll({ type: 'Image' })).toHaveLength(0)
    expect(await textsOf(ui)).toContain('ORCHESTRATOR')
    await ui.unmount()
  })

  test('the picture is swapped in place, not redrawn, and only when the state changed', async ($, on) => {
    const w = world(on)
    const clock = w.clock
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'terminal')
    const pngs = () => w.curl.length
    const first = pngs()
    for (let i = 0; i < 3; i++) {
      await clock.advance(1500)
      await new Promise(r => setTimeout(r, 20))
    }
    expect(pngs()).toBe(first)
    expect(w.blits).toHaveLength(0)
    w.body = () => reply({ state: state({ builder: 'building' }) })
    await clock.advance(1500)
    await new Promise(r => setTimeout(r, 30))
    expect(pngs()).toBe(first + 1)
    expect(w.blits).toHaveLength(1)
    expect(w.blits[0]).toMatchObject({ requestId: 'graph', key: 'graph', source: { png: w.png } })
    await ui.unmount()
  })

  test('the arrows move the pane to the next project by its id', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'desktop')
    expect(await textsOf(ui)).toContain('Model Engine (this folder)')
    await ui.press({ key: 'g-next' })
    await new Promise(r => setTimeout(r, 30))
    expect(w.fetched.some(u => u.includes('/panel/state?folder=p1'))).toBe(true)
    await ui.unmount()
  })

  test('the status segment is published only when Show in the bar is on', { options: { showBand: true } }, async ($, on) => {
    const w = world(on)
    w.body = () => reply({ state: state({ builder: 'building', council: { ui: 'pass', code: 'idle', run: 'idle' } }) })
    await $.session.start(SESSION)
    await new Promise(r => setTimeout(r, 30))
    expect(w.fetched.length).toBeGreaterThan(0)
    expect(w.segments.at(-1)).toEqual({ graph: { label: 'Graph', detail: 'building · council 1/3', command: 'doole_graph', state: 'working' } })
  })

  test('by default there is no segment and a closed pane asks nothing', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await new Promise(r => setTimeout(r, 30))
    expect(w.fetched).toEqual([])
    expect(w.segments).toEqual([])
  })

  test('terminal: curl is called with limits and the URL as one argument, in a private folder, and the file is deleted', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'terminal')
    expect(w.curl).toHaveLength(1)
    const flags = ['--silent', '--show-error', '--fail', '--noproxy *', '--max-filesize 4194304', '--max-time 8']
    for (const f of flags) expect(w.curl[0]).toContain(f)
    const m = /-o (C:\/Temp\/doole-graph-[0-9a-f]{16}\/[0-9a-f]{16}\.png) (http\S+)$/.exec(w.curl[0]!)
    expect(m).not.toBe(null)
    expect(w.procs[0]).toMatch(/^cmd \/c mkdir C:\\Temp\\doole-graph-[0-9a-f]{16}$/)
    expect(w.procs.some(p => p.startsWith('cmd /c del /f /q ') && p.endsWith(m![1]!.split('/').join('\\')))).toBe(true)
    await ui.unmount()
  })

  test('terminal: posix gets a 700 folder, a new random file each time and rm -f', { options: { refreshMs: 500 } }, async ($, on) => {
    const w = world(on)
    w.temp = '/tmp'
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'terminal')
    w.body = () => reply({ state: state({ calls: 99 }) })
    await w.clock.advance(500)
    await new Promise(r => setTimeout(r, 30))
    expect(w.curl.length).toBeGreaterThanOrEqual(2)
    expect(w.procs.filter(p => p.startsWith('mkdir -m 700 /tmp/doole-graph-'))).toHaveLength(1)
    const files = w.curl.map(c => /-o (\S+) /.exec(c)![1]!)
    expect(new Set(files).size).toBe(files.length)
    for (const f of files) expect(w.procs).toContain(`rm -f ${f}`)
    await ui.unmount()
    await run($, 'close')
    await new Promise(r => setTimeout(r, 30))
    expect(w.procs.some(p => /^rmdir \/tmp\/doole-graph-[0-9a-f]{16}$/.test(p))).toBe(true)
  })

  test('terminal: a PNG that is too big gets the cards and a plain message', async ($, on) => {
    const w = world(on)
    w.png = pngOf(5000, 100)
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'terminal')
    expect(await ui.findAll({ type: 'Image' })).toHaveLength(0)
    const all = await textsOf(ui)
    expect(all).toContain(PNG_REFUSED_TEXT)
    expect(all).toContain('ORCHESTRATOR')
    await ui.unmount()
  })

  test('a viewer that never answers is given up on after 5 s, with one request at a time and a slower retry', async ($, on) => {
    const w = world(on)
    w.hang = true
    await $.session.start(SESSION)
    await run($)
    const first = await mountPane($, 'desktop')
    await first.unmount()
    await new Promise(r => setTimeout(r, 30))
    expect(w.fetched).toHaveLength(1)
    await w.clock.advance(1500)
    await w.clock.advance(1500)
    await new Promise(r => setTimeout(r, 30))
    expect(w.fetched).toHaveLength(1)
    await w.clock.advance(2000)
    await new Promise(r => setTimeout(r, 30))
    const ui = await mountPane($, 'desktop')
    expect(await textsOf(ui)).toBe(DOWN_TEXT)
    await ui.unmount()
    // the poll was released: with the viewer back, the next tick is answered and drawn
    w.hang = false
    for (let i = 0; i < 4; i++) {
      await w.clock.advance(3000)
      await new Promise(r => setTimeout(r, 30))
    }
    const again = await mountPane($, 'desktop')
    expect(await again.findAll({ type: 'Svg' })).toHaveLength(1)
    await again.unmount()
  })

  test('before any project exists the pane waits quietly, then draws once one appears', async ($, on) => {
    const w = world(on)
    w.missing = true
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'desktop')
    expect(await textsOf(ui)).toBe('Waiting for Claude activity in this project')
    expect(await textsOf(ui)).not.toContain('no such project')
    await ui.unmount()
    const before = w.fetched.length
    await w.clock.advance(1500)
    await new Promise(r => setTimeout(r, 30))
    expect(w.fetched.length).toBeGreaterThan(before)
    w.missing = false
    await w.clock.advance(1500)
    await new Promise(r => setTimeout(r, 30))
    const again = await mountPane($, 'desktop')
    expect(await again.findAll({ type: 'Svg' })).toHaveLength(1)
    await again.unmount()
  })
})
