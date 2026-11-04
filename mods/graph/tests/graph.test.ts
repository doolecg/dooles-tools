import { describe, expect, mock, test } from 'claude-code/testing'

import {
  BAD_URL_TEXT,
  DEFAULTS,
  DOWN_TEXT,
  NO_PROJECT_TEXT,
  OFF_TEXT,
  PNG_REFUSED_TEXT,
  SPINNER,
  altOf,
  animateSvg,
  bandDetail,
  cardsOf,
  cellsFor,
  checkPng,
  configFrom,
  cyclePick,
  fingerprint,
  fillSize,
  folderParam,
  fitSize,
  graphUrl,
  logLines,
  loopbackOrigin,
  needsPicture,
  parsePanel,
  paneSize,
  pngSize,
  segmentsOf,
  spun,
  svgBox,
  svgSize,
  withSize,
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
    expect(DEFAULTS).toEqual({ isEnabled: true, viewerUrl: 'http://127.0.0.1:4779', refreshMs: 1500, layout: 'auto', showBand: false, showLog: false, animate: true, animFps: 6, animFpsTerminal: 3 })
  })

  test('the refresh never goes under 500 ms and a bad layout is auto', () => {
    expect(configFrom({ refreshMs: 100 }).refreshMs).toBe(500)
    expect(configFrom({ refreshMs: '2500' }).refreshMs).toBe(2500)
    expect(configFrom({ refreshMs: 'soon' }).refreshMs).toBe(1500)
    expect(configFrom({ layout: 'sideways' }).layout).toBe('auto')
    expect(configFrom({ layout: 'Tall' }).layout).toBe('tall')
    expect(configFrom({ showBand: 'true' }).showBand).toBe(true)
    expect(configFrom({ showLog: 'true' }).showLog).toBe(true)
    expect(configFrom({ showLog: 'nope' }).showLog).toBe(false)
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
  test('the picture is asked for at the pane’s pixels, less the header row', () => {
    expect(paneSize(56, 40)).toEqual({ width: 448, height: 624 })
    expect(paneSize(120, 30)).toEqual({ width: 960, height: 464 })
    expect(paneSize(10, 40).width).toBe(320)
    expect(paneSize(900, 200)).toEqual({ width: 1400, height: 1400 })
    expect(paneSize(56, 0)).toEqual({ width: 448, height: 336 })
    expect(paneSize(56, 40, 4).height).toBe(576)
  })

  test('a picture fits the pane keeping its shape, for a portrait and a landscape pane', () => {
    const portrait = paneSize(56, 60)
    const fitP = fitSize({ width: 900, height: 600 }, portrait)
    expect(fitP.width).toBeLessThanOrEqual(portrait.width)
    expect(fitP.height).toBeLessThanOrEqual(portrait.height)
    expect(Math.abs(fitP.width / fitP.height - 1.5)).toBeLessThan(0.05)
    const landscape = paneSize(140, 24)
    const fitL = fitSize({ width: 600, height: 900 }, landscape)
    expect(fitL.height).toBeLessThanOrEqual(landscape.height)
    expect(Math.abs(fitL.width / fitL.height - 2 / 3)).toBeLessThan(0.05)
    expect(fitSize({ width: 100, height: 50 }, { width: 400, height: 400 })).toEqual({ width: 100, height: 50 })
  })

  test('the size an Svg states is read from its root', () => {
    expect(svgSize('<svg width="448" height="300"></svg>')).toEqual({ width: 448, height: 300 })
    expect(svgSize('<svg xmlns="x" width="448px" height="300.5"><g width="1"/></svg>')).toEqual({ width: 448, height: 300.5 })
    expect(svgSize('<svg viewBox="0 0 1 1"></svg>')).toBe(null)
  })

  test('urls carry the folder, layout, size, log and a transparent background', () => {
    const o = 'http://127.0.0.1:4779'
    expect(graphUrl(o, 'state', { folder: CWD })).toBe(`${o}/panel/state?folder=${encodeURIComponent(CWD)}`)
    expect(graphUrl(o, 'svg', { folder: 'p1', layout: 'auto', width: 448, height: 600 })).toBe(`${o}/panel/graph.svg?folder=p1&layout=auto&width=448&height=600&log=0&bg=transparent`)
    expect(graphUrl(o, 'svg', { folder: 'p1', layout: 'auto', width: 448, height: 600, showLog: true })).toContain('&log=1&bg=transparent')
    expect(graphUrl(o, 'png', { folder: 'p1', layout: 'wide', width: 900, height: 500, scale: 2 })).toBe(`${o}/panel/graph.png?folder=p1&layout=wide&width=900&height=500&log=0&bg=transparent&scale=2`)
  })

  test('the picture’s size comes from its PNG header and fits the pane’s cells', () => {
    expect(pngSize(pngOf(896, 640))).toEqual({ width: 896, height: 640 })
    expect(pngSize(btoa('not a picture at all, really not'))).toBe(null)
    expect(pngSize('%%%')).toBe(null)
    expect(cellsFor({ width: 896, height: 640 }, 56)).toEqual({ columns: 56, rows: 20 })
    expect(cellsFor({ width: 896, height: 640 }, 56, 39)).toEqual({ columns: 56, rows: 20 })
    expect(cellsFor({ width: 896, height: 640 }, 56, 10)).toEqual({ columns: 28, rows: 10 })
    expect(cellsFor({ width: 10, height: 10000 }, 300).rows).toBe(255)
    expect(cellsFor({ width: 10, height: 10000 }, 300).columns).toBe(255)
  })
})

describe('refetching the picture', () => {
  const want = { folder: CWD, layout: 'auto' as const, width: 448, height: 600, showLog: false, kind: 'svg' as const }
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
    const logged = parsePanel(reply({ log: [['1', 'a', 'b']] }))!
    expect(needsPicture(prev, want, fingerprint(logged))).toBe(false)
    expect(needsPicture({ want: { ...want, showLog: true }, print: fingerprint(p1, true) }, { ...want, showLog: true }, fingerprint(logged, true))).toBe(true)
    expect(needsPicture(prev, { ...want, folder: 'p2' }, prev.print)).toBe(true)
    expect(needsPicture(prev, { ...want, layout: 'wide' }, prev.print)).toBe(true)
    expect(needsPicture(prev, { ...want, width: 500 }, prev.print)).toBe(true)
    expect(needsPicture(prev, { ...want, height: 500 }, prev.print)).toBe(true)
    expect(needsPicture(prev, { ...want, showLog: true }, prev.print)).toBe(true)
    expect(needsPicture(prev, { ...want, kind: 'png' }, prev.print)).toBe(true)
  })
})

describe('live animation, pure parts', () => {
  const flowing = '<svg width="448" height="300"><path d="M0 0" stroke-dasharray="4 7" stroke-dashoffset="0" data-flow="11"/><rect stroke-dasharray="2 2" stroke-dashoffset="-3" data-flow="4"/><circle r="3" data-pulse="1"/><circle r="2" opacity="1" data-pulse="1" fill="red"/><line stroke-dasharray="1 1" stroke-dashoffset="-5"/></svg>'

  test('settings: animate, animFps (0 to 12, 0 is off) and animFpsTerminal (1 to 6) are held to their ranges', () => {
    expect(configFrom({ animate: false }).animate).toBe(false)
    expect(configFrom({ animate: 'false' }).animate).toBe(false)
    expect(configFrom({}).animFps).toBe(6)
    expect(configFrom({ animFps: 99 }).animFps).toBe(12)
    expect(configFrom({ animFps: 0 }).animFps).toBe(0)
    expect(configFrom({ animFps: -4 }).animFps).toBe(0)
    expect(configFrom({ animFps: '8' }).animFps).toBe(8)
    expect(configFrom({ animFps: 'fast' }).animFps).toBe(6)
    expect(configFrom({ animFpsTerminal: 0 }).animFpsTerminal).toBe(1)
    expect(configFrom({ animFpsTerminal: 50 }).animFpsTerminal).toBe(6)
    expect(configFrom({ animFpsTerminal: '2' }).animFpsTerminal).toBe(2)
  })

  test('the offsets move by -(tick * 2) mod the element’s own period and wrap', () => {
    const at = (tick: number) => animateSvg(flowing, tick, 0)
    expect(at(0)).toContain('stroke-dashoffset="0" data-flow="11"')
    expect(at(3)).toContain('stroke-dashoffset="-6" data-flow="11"')
    expect(at(5)).toContain('stroke-dashoffset="-10" data-flow="11"')
    expect(at(6)).toContain('stroke-dashoffset="-1" data-flow="11"')
    expect(at(11)).toContain('stroke-dashoffset="0" data-flow="11"')
    expect(at(1)).toContain('stroke-dashoffset="-2" data-flow="4"')
    expect(at(2)).toContain('stroke-dashoffset="0" data-flow="4"')
    expect(at(3)).toContain('stroke-dashoffset="-2" data-flow="4"')
  })

  test('data-pulse elements are bright for the first 600 ms of 1.2 s and dim for the rest; others keep their opacity', () => {
    expect(animateSvg(flowing, 1, 0)).toContain('<circle r="3" data-pulse="1" opacity="1"/>')
    expect(animateSvg(flowing, 1, 599)).toContain('data-pulse="1" opacity="1"/>')
    expect(animateSvg(flowing, 1, 600)).toContain('<circle r="3" data-pulse="1" opacity=".35"/>')
    expect(animateSvg(flowing, 1, 1199)).toContain('opacity=".35"/>')
    expect(animateSvg(flowing, 1, 1200)).toContain('opacity="1"/>')
    expect(animateSvg(flowing, 1, 700)).toContain('<circle r="2" opacity=".35" data-pulse="1" fill="red"/>')
  })

  test('markup without data-flow or data-pulse is left exactly as it is', () => {
    const still = '<svg width="10" height="10"><path stroke-dasharray="4 7" stroke-dashoffset="-3"/><g opacity="1"><rect/></g></svg>'
    for (const tick of [0, 1, 7, 200]) expect(animateSvg(still, tick, tick * 170)).toBe(still)
    expect(animateSvg(flowing, 4, 0)).toContain('<line stroke-dasharray="1 1" stroke-dashoffset="-5"/>')
  })

  test('urls ask for anim=attr and a phase only when told to', () => {
    const o = 'http://127.0.0.1:4779'
    expect(graphUrl(o, 'svg', { folder: 'p1', width: 448, height: 600, anim: true })).toBe(`${o}/panel/graph.svg?folder=p1&layout=auto&width=448&height=600&log=0&bg=transparent&anim=attr`)
    expect(graphUrl(o, 'png', { folder: 'p1', width: 448, height: 600, scale: 2, phase: 7 })).toBe(`${o}/panel/graph.png?folder=p1&layout=auto&width=448&height=600&log=0&bg=transparent&scale=2&phase=7`)
    expect(graphUrl(o, 'png', { folder: 'p1', phase: 5000 })).toContain('&phase=1000')
    expect(graphUrl(o, 'state', { folder: 'p1', phase: 3, anim: true })).toBe(`${o}/panel/state?folder=p1`)
  })

  test('the state’s activity.animating is read, and is false when absent', () => {
    expect(parsePanel(reply())!.animating).toBe(false)
    expect(parsePanel(reply({ activity: { animating: true, frameMs: 250 } }))!.animating).toBe(true)
  })

  test('a text card line with a running state gets the spinner glyph, others do not', () => {
    expect(SPINNER).toEqual(['-', String.fromCharCode(92), '|', '/'])
    expect(spun('building', '|')).toBe('| building')
    expect(spun('code running…', '/')).toBe('/ code running…')
    expect(spun('idle', '|')).toBe('idle')
    expect(spun('building', '')).toBe('building')
  })
})

describe('sizing the drawing to the pane', () => {
  test('the box comes from the root’s size, else its viewBox', () => {
    expect(svgBox('<svg width="448" height="300"></svg>')).toEqual({ width: 448, height: 300 })
    expect(svgBox('<svg viewBox="0 0 100 160"></svg>')).toEqual({ width: 100, height: 160 })
    expect(svgBox('<svg viewBox="0,0,50.5,20"></svg>')).toEqual({ width: 50.5, height: 20 })
    expect(svgBox('<svg></svg>')).toBe(null)
  })

  test('fillSize scales up as well as down, keeping the shape', () => {
    expect(fillSize({ width: 100, height: 160 }, { width: 448, height: 717 })).toEqual({ width: 448, height: 717 })
    expect(fillSize({ width: 900, height: 600 }, { width: 450, height: 450 })).toEqual({ width: 450, height: 300 })
    expect(fillSize({ width: 10, height: 10 }, { width: 400, height: 300 })).toEqual({ width: 300, height: 300 })
  })

  test('withSize states width and height on the root, replaces old ones, and adds a viewBox when there is none', () => {
    expect(withSize('<svg viewBox="0 0 100 160"><g/></svg>', { width: 448, height: 717 })).toBe('<svg width="448" height="717" viewBox="0 0 100 160"><g/></svg>')
    expect(withSize('<svg xmlns="x" width="100" height="50" stroke-width="2"><g/></svg>', { width: 400, height: 200 })).toBe('<svg width="400" height="200" xmlns="x" stroke-width="2" viewBox="0 0 100 50"><g/></svg>')
    expect(withSize('<g/>', { width: 4, height: 4 })).toBe('<g/>')
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

type World = { fetched: string[]; curl: string[]; procs: string[]; temp: string; hang: boolean; blits: any[]; segments: unknown[]; opened: any[]; panes: string[]; closed: string[]; up: boolean; slowMs: number; inflight: number; maxInflight: number; starts: number[]; body: () => string; svg: string; png: string | null; deny: string | null; missing: boolean; clock: any }

function world(on: any): World {
  const w: World = { fetched: [], curl: [], procs: [], temp: 'C:/Temp', hang: false, blits: [], segments: [], opened: [], panes: [], closed: [], up: true, slowMs: 0, inflight: 0, maxInflight: 0, starts: [], body: () => reply(), svg: '<svg width="448" height="300"></svg>', png: pngOf(896, 640), deny: null, missing: false, clock: null }
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
  on('process.run', async (_$: any, e: any) => {
    const argv = e.argv as string[]
    w.procs.push(argv.join(' '))
    if (argv[0] !== 'curl') return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    w.curl.push(argv.join(' '))
    w.starts.push(w.clock.now() - T0)
    w.inflight += 1
    w.maxInflight = Math.max(w.maxInflight, w.inflight)
    if (w.slowMs > 0) await w.clock.sleep(w.slowMs)
    w.inflight -= 1
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

  test('desktop: the graph is an Svg, asked for the session folder at the pane’s size, no log, transparent', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'desktop')
    const svgs = await ui.findAll({ type: 'Svg' })
    expect(svgs).toHaveLength(1)
    expect(JSON.stringify(svgs[0])).toContain('<svg')
    expect(await ui.findAll({ type: 'Image' })).toHaveLength(0)
    expect(w.fetched).toContain(`http://127.0.0.1:4779/panel/graph.svg?folder=${encodeURIComponent(CWD)}&layout=auto&width=448&height=624&log=0&bg=transparent&anim=attr`)
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
    expect(w.curl[0]).toContain('layout=auto&width=448&height=624&log=0&bg=transparent&scale=2')
    expect(w.curl[0]).toContain('127.0.0.1:4779')
    await ui.unmount()
  })

  test('terminal that cannot fetch the picture gets just the cards, no log', async ($, on) => {
    const w = world(on)
    w.png = null
    w.body = () => reply({ log: Array.from({ length: 9 }, (_, i) => [`t${i}`, 'unit', `row${i}`]), state: state({ council: { ui: 'pass', code: 'running', run: 'idle' } }) })
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'terminal')
    expect(await ui.findAll({ type: 'Image' })).toHaveLength(0)
    const all = await textsOf(ui)
    for (const word of ['ORCHESTRATOR', 'BRAIN', 'RECALL', 'BUILDER', 'COUNCIL', 'ui pass', 'code running…', 'run idle']) expect(all).toContain(word)
    expect(all).not.toContain('row8')
    expect(all).not.toContain('LOG')
    await ui.unmount()
  })

  test('showLog on: the picture is asked for with log=1 and the cards end with the last six log rows', { options: { showLog: true } }, async ($, on) => {
    const w = world(on)
    w.png = null
    w.body = () => reply({ log: Array.from({ length: 9 }, (_, i) => [`t${i}`, 'unit', `row${i}`]) })
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'terminal')
    expect(w.curl[0]).toContain('&log=1&bg=transparent')
    const all = await textsOf(ui)
    expect(all).toContain('LOG')
    expect(all).toContain('row8')
    expect(all).toContain('row3')
    expect(all).not.toContain('row2')
    await ui.unmount()
  })

  test('the header is one row: arrows, the project name and a status dot', async ($, on) => {
    world(on)
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'desktop')
    const head = (await ui.findAll({ type: 'Box' })).find((b: any) => b.props?.key === 'g-select')
    expect(head).toBeTruthy()
    const text = JSON.stringify(head)
    expect(text).toContain('‹')
    expect(text).toContain('Model Engine (this folder)')
    expect(text).toContain('›')
    expect(text).toContain('●')
    expect(text).not.toMatch(/padding|margin/i)
    await ui.unmount()
  })

  test('a different pane size asks for a new picture', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'desktop', 56)
    const first = w.fetched.filter(u => u.includes('graph.svg')).length
    await ui.unmount()
    const again = await settle($, 'desktop', 70)
    expect(w.fetched.filter(u => u.includes('graph.svg')).length).toBeGreaterThan(first)
    expect(w.fetched.filter(u => u.includes('graph.svg')).at(-1)).toContain('width=560')
    await again.unmount()
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

  // ------------------------------------------------------------ live animation

  const FLOWING_SVG = '<svg width="448" height="300"><path d="M0 0" stroke-dasharray="4 7" stroke-dashoffset="0" data-flow="11"/><circle r="3" data-pulse="1"/><rect stroke-dasharray="2 2" stroke-dashoffset="-3" data-flow="4"/></svg>'
  const BUSY = () => reply({ state: state({ builder: 'building', council: { ui: 'running', code: 'idle', run: 'idle' } }), activity: { animating: true, frameMs: 250 } })
  const QUIET = () => reply({ state: state({ builder: 'building', council: { ui: 'running', code: 'idle', run: 'idle' } }), activity: { animating: false, frameMs: 250 } })
  const svgSource = async (ui: any) => String((await ui.findAll({ type: 'Svg' }))[0]?.props?.source ?? '')
  /** What the Svg would show now: a fresh draw of the pane. */
  const drawnSvg = async ($: any) => {
    const ui = await mountPane($, 'desktop')
    const out = await svgSource(ui)
    await ui.unmount()
    return out
  }
  const stepMs = 167 // 1000 / 6 fps, rounded

  test('desktop: asks for anim=attr, and the ticker moves the offsets with no network call', async ($, on) => {
    const w = world(on)
    w.svg = FLOWING_SVG
    w.body = BUSY
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'desktop')
    await ui.unmount()
    expect(w.fetched.filter(u => u.includes('graph.svg')).every(u => u.endsWith('&anim=attr'))).toBe(true)
    expect(await drawnSvg($)).toContain('stroke-dashoffset="0" data-flow="11"')
    const before = w.fetched.length
    for (let i = 0; i < 3; i++) await w.clock.advance(stepMs)
    expect(w.fetched.length).toBe(before)
    const three = await drawnSvg($)
    expect(three).toContain('stroke-dashoffset="-6" data-flow="11"')
    expect(three).toContain('stroke-dashoffset="-2" data-flow="4"')
    for (let i = 0; i < 3; i++) await w.clock.advance(stepMs)
    expect(await drawnSvg($)).toContain('stroke-dashoffset="-1" data-flow="11"') // tick 6: 12 mod 11
    expect(w.fetched.length).toBe(before)
  })

  test('desktop: data-pulse elements dim and brighten on the 1.2 s cycle', async ($, on) => {
    const w = world(on)
    w.svg = FLOWING_SVG
    w.body = BUSY
    await $.session.start(SESSION)
    await run($)
    await (await settle($, 'desktop')).unmount()
    await w.clock.advance(stepMs)
    expect(await drawnSvg($)).toContain('data-pulse="1" opacity="1"/>')
    for (let i = 0; i < 3; i++) await w.clock.advance(stepMs) // tick 4: 667 ms in
    expect(await drawnSvg($)).toContain('data-pulse="1" opacity=".35"/>')
    for (let i = 0; i < 3; i++) await w.clock.advance(stepMs) // tick 7: 1167 ms in
    expect(await drawnSvg($)).toContain('data-pulse="1" opacity=".35"/>')
    await w.clock.advance(stepMs) // tick 8: 1333 ms in, the next cycle
    expect(await drawnSvg($)).toContain('data-pulse="1" opacity="1"/>')
  })

  test('desktop: nothing moves while the viewer says nothing is animating', async ($, on) => {
    const w = world(on)
    w.svg = FLOWING_SVG
    w.body = QUIET
    await $.session.start(SESSION)
    await run($)
    await (await settle($, 'desktop')).unmount()
    for (let i = 0; i < 4; i++) await w.clock.advance(stepMs)
    const out = await drawnSvg($)
    expect(out).toContain('stroke-dashoffset="0" data-flow="11"')
    expect(out).toContain('<circle r="3" data-pulse="1"/>')
  })

  test('desktop: when animating turns false there is one last draw with the base offsets, then nothing more', async ($, on) => {
    const w = world(on)
    w.svg = FLOWING_SVG
    w.body = BUSY
    await $.session.start(SESSION)
    await run($)
    await (await settle($, 'desktop')).unmount()
    for (let i = 0; i < 3; i++) await w.clock.advance(stepMs)
    expect(await drawnSvg($)).toContain('stroke-dashoffset="-6"')
    w.body = QUIET
    await w.clock.advance(1500 - 3 * stepMs)
    await new Promise(r => setTimeout(r, 30))
    const stopped = await drawnSvg($)
    expect(stopped).toContain('stroke-dashoffset="0" data-flow="11"')
    expect(stopped).toContain('<circle r="3" data-pulse="1"/>')
    for (let i = 0; i < 3; i++) await w.clock.advance(stepMs)
    expect(await drawnSvg($)).toBe(stopped)
  })

  test('desktop: closing the pane clears the timers, so nothing moves afterwards', async ($, on) => {
    const w = world(on)
    w.svg = FLOWING_SVG
    w.body = BUSY
    await $.session.start(SESSION)
    await run($)
    await (await settle($, 'desktop')).unmount()
    await w.clock.advance(stepMs)
    await run($, 'close')
    const asked = w.fetched.length
    for (let i = 0; i < 6; i++) await w.clock.advance(stepMs)
    await w.clock.advance(3000)
    expect(w.fetched.length).toBe(asked)
    expect(await drawnSvg($)).toContain('stroke-dashoffset="0" data-flow="11"')
  })

  test('animate off: the graph is asked for without anim, and stays still', { options: { animate: false } }, async ($, on) => {
    const w = world(on)
    w.svg = FLOWING_SVG
    w.body = BUSY
    await $.session.start(SESSION)
    await run($)
    await (await settle($, 'desktop')).unmount()
    for (let i = 0; i < 4; i++) await w.clock.advance(stepMs)
    expect(w.fetched.filter(u => u.includes('graph.svg')).some(u => u.includes('anim='))).toBe(false)
    expect(await drawnSvg($)).toContain('stroke-dashoffset="0" data-flow="11"')
  })

  test('animFps 0 keeps the desktop graph still', { options: { animFps: 0 } }, async ($, on) => {
    const w = world(on)
    w.svg = FLOWING_SVG
    w.body = BUSY
    await $.session.start(SESSION)
    await run($)
    await (await settle($, 'desktop')).unmount()
    for (let i = 0; i < 4; i++) await w.clock.advance(stepMs)
    expect(await drawnSvg($)).toContain('stroke-dashoffset="0" data-flow="11"')
  })

  test('animFps sets the tick: 2 fps moves once in 500 ms, not in 400', { options: { animFps: 2 } }, async ($, on) => {
    const w = world(on)
    w.svg = FLOWING_SVG
    w.body = BUSY
    await $.session.start(SESSION)
    await run($)
    await (await settle($, 'desktop')).unmount()
    await w.clock.advance(400)
    expect(await drawnSvg($)).toContain('stroke-dashoffset="0" data-flow="11"')
    await w.clock.advance(100)
    expect(await drawnSvg($)).toContain('stroke-dashoffset="-2" data-flow="11"')
  })

  test('desktop: a markup with no data-flow is handed over untouched while animating', async ($, on) => {
    const w = world(on)
    w.svg = '<svg width="448" height="300"><path stroke-dasharray="4 7" stroke-dashoffset="-3"/></svg>'
    w.body = BUSY
    await $.session.start(SESSION)
    await run($)
    await (await settle($, 'desktop')).unmount()
    const first = await drawnSvg($)
    for (let i = 0; i < 4; i++) await w.clock.advance(stepMs)
    expect(await drawnSvg($)).toBe(first)
    expect(first).toContain('stroke-dashoffset="-3"')
  })

  test('desktop: the Svg gets explicit width and height of 300 or more when the pane reports no size', async ($, on) => {
    const w = world(on)
    w.svg = '<svg viewBox="0 0 100 160"><g/></svg>'
    await $.session.start(SESSION)
    await run($)
    const bare = { title: 'Graph', isFocused: false, placement: 'float', view: {} }
    const first = await $.ui.mount({ plugin: 'graph', surface: 'desktop', component: 'Pane', requestId: 'graph', props: bare } as any)
    await first.unmount()
    await new Promise(r => setTimeout(r, 30))
    const ui = await $.ui.mount({ plugin: 'graph', surface: 'desktop', component: 'Pane', requestId: 'graph', props: bare } as any)
    const svg = (await ui.findAll({ type: 'Svg' }))[0]
    expect(svg).toBeTruthy()
    expect(svg.props.width).toBeGreaterThanOrEqual(300)
    expect(svg.props.height).toBeGreaterThanOrEqual(300)
    const root = /^<svg width="(\d+)" height="(\d+)"/.exec(String(svg.props.source))
    expect(root).not.toBe(null)
    expect(Number(root![1])).toBeGreaterThanOrEqual(300)
    expect(Number(root![2])).toBeGreaterThanOrEqual(300)
    const asked = w.fetched.find(u => u.includes('graph.svg'))!
    const [, aw, ah] = /width=(\d+)&height=(\d+)/.exec(asked)!
    expect(Number(aw)).toBeGreaterThanOrEqual(300)
    expect(Number(ah)).toBe(Math.round(Number(aw) * 1.6))
    await ui.unmount()
  })

  test('desktop: a small viewBox-only drawing is scaled up to fill the pane box', async ($, on) => {
    const w = world(on)
    w.svg = '<svg viewBox="0 0 100 160"><g/></svg>'
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'desktop')
    const svg = (await ui.findAll({ type: 'Svg' }))[0]
    expect(svg.props).toMatchObject({ width: 390, height: 624 })
    expect(String(svg.props.source)).toContain('<svg width="390" height="624" viewBox="0 0 100 160">')
    await ui.unmount()
    void w
  })

  // terminal frames
  const framesOf = (w: World) => w.curl.filter(c => c.includes('phase='))

  test('terminal: while animating, PNG frames are asked for with a phase and swapped in place at animFpsTerminal', async ($, on) => {
    const w = world(on)
    w.body = BUSY
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'terminal')
    expect(w.curl.some(c => c.includes('phase='))).toBe(false)
    const blits = w.blits.length
    await w.clock.advance(333)
    await w.clock.advance(333)
    await w.clock.advance(334)
    expect(framesOf(w)).toHaveLength(3)
    expect(framesOf(w).map(c => /phase=(\d+)/.exec(c)![1])).toEqual(['1', '2', '3'])
    expect(w.blits.length).toBe(blits + 3)
    expect(w.blits.at(-1)).toMatchObject({ requestId: 'graph', key: 'graph', source: { png: w.png } })
    for (const c of framesOf(w)) expect(c).toMatch(/-o C:\/Temp\/doole-graph-[0-9a-f]{16}\/[0-9a-f]{16}\.png /)
    expect(w.procs.filter(p => p.startsWith('cmd /c del /f /q ')).length).toBe(w.curl.length)
    await ui.unmount()
  })

  test('terminal: frames stop when nothing is animating', async ($, on) => {
    const w = world(on)
    w.body = BUSY
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'terminal')
    await w.clock.advance(333)
    expect(framesOf(w)).toHaveLength(1)
    w.body = QUIET
    await w.clock.advance(1500 - 333)
    await new Promise(r => setTimeout(r, 30))
    const sofar = framesOf(w).length
    await w.clock.advance(1000)
    await w.clock.advance(1000)
    expect(framesOf(w)).toHaveLength(sofar)
    await ui.unmount()
  })

  test('terminal: never more than one frame in flight, however slow the viewer', async ($, on) => {
    const w = world(on)
    w.body = BUSY
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'terminal')
    w.slowMs = 1000
    for (let i = 0; i < 40; i++) await w.clock.advance(100)
    expect(w.maxInflight).toBe(1)
    expect(framesOf(w).length).toBeGreaterThan(1)
    expect(framesOf(w).length).toBeLessThan(8)
    await ui.unmount()
  })

  test('terminal: two frames slower than twice the interval halve the rate, down to 1 fps', async ($, on) => {
    const w = world(on)
    w.body = BUSY
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'terminal')
    w.starts.length = 0
    w.slowMs = 1200
    for (let i = 0; i < 80; i++) await w.clock.advance(100)
    // 3 fps: frames start on the 333 ms grid; each takes 1200 ms, over twice the interval
    expect(w.starts[0]).toBe(333)
    expect(w.starts[1]).toBe(1665)
    // after the second slow frame ends (2865) the timer runs at 1.5 fps: its first tick is 667 ms later
    expect(w.starts[2]).toBe(2865 + 667)
    expect(w.maxInflight).toBe(1)
    await ui.unmount()
  })

  test('terminal: animate off asks for no frames', { options: { animate: false } }, async ($, on) => {
    const w = world(on)
    w.body = BUSY
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'terminal')
    const first = w.curl.length
    for (let i = 0; i < 6; i++) await w.clock.advance(333)
    expect(w.curl.length).toBe(first)
    await ui.unmount()
  })

  test('terminal: closing the pane stops the frames', async ($, on) => {
    const w = world(on)
    w.body = BUSY
    await $.session.start(SESSION)
    await run($)
    const ui = await settle($, 'terminal')
    await w.clock.advance(333)
    await ui.unmount()
    await run($, 'close')
    const sofar = w.curl.length
    for (let i = 0; i < 6; i++) await w.clock.advance(333)
    expect(w.curl.length).toBe(sofar)
  })

  test('text cards: a running state gets a spinner glyph that turns twice a second while animating, and none otherwise', async ($, on) => {
    const w = world(on)
    w.svg = `<svg>${'x'.repeat(140_000)}</svg>`
    w.body = BUSY
    await $.session.start(SESSION)
    await run($)
    await (await settle($, 'desktop')).unmount()
    const glyphs = /[-|/\x5c] building/
    const textNow = async () => {
      const ui = await mountPane($, 'desktop')
      const t = await textsOf(ui)
      await ui.unmount()
      return t
    }
    expect(await textNow()).toMatch(glyphs)
    const a = (await textNow()).match(/(.) building/)![1]
    await w.clock.advance(500)
    const b = (await textNow()).match(/(.) building/)![1]
    expect(b).not.toBe(a)
    w.body = QUIET
    await w.clock.advance(1500)
    await new Promise(r => setTimeout(r, 30))
    const calm = await textNow()
    expect(calm).not.toMatch(glyphs)
    expect(calm).toContain('building')
    await w.clock.advance(1000)
    expect(await textNow()).toBe(calm)
  })
})
