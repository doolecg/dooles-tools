// Pure logic for Graph: settings, the loopback rule, the viewer's replies, project choice, sizes and the text cards.

export const DEFAULT_URL = 'http://127.0.0.1:4779'
export const PANE = 'graph'
export const TITLE = 'Graph'
export const OFF_TEXT = 'Graph is off. Turn it on in Mod Settings (/doole_settings) or /config.'
export const DOWN_TEXT =
  'Graph viewer is not running. It starts with your next Claude activity once the hooks are installed (scripts/install-hooks.js in the Model Engine folder).'
export const NO_PROJECT_TEXT = 'Waiting for Claude activity in this project'
export const PNG_REFUSED_TEXT = 'Picture too large, showing cards instead.'
export const BAD_URL_TEXT = 'Graph only talks to a viewer on this computer. Set viewerUrl to a loopback address such as http://127.0.0.1:4779.'

/** One cell of a terminal, in pixels: the engine reports no cell size, so this is the common default. */
export const CELL_W = 8
export const CELL_H = 16
/** The most pixels a side of the picture is asked for: at scale 2 a PNG stays inside the PNG limits. */
export const PIC_MAX = 1400
/** The pane's slim header, in rows: the picture gets the rest of the height. */
export const HEADER_ROWS = 1
/** Rows the Main Menu frame (title and footer) takes from a pane shown as a tab. */
export const TAB_CHROME_ROWS = 3
/** The most markup an Svg element takes. */
export const SVG_LIMIT = 131072

/** The most a PNG may be in bytes, and the most its header may claim: each side, and all pixels. */
export const PNG_LIMIT = 2 * 1024 * 1024
export const PNG_MAX_SIDE = 4096
export const PNG_MAX_PIXELS = 8_000_000
/** How long one request to the viewer may take, and the slowest the pane then asks again. */
export const FETCH_TIMEOUT_MS = 5000
export const BACKOFF_MAX_MS = 10000

export type Layout = 'auto' | 'wide' | 'tall'
export type Config = { isEnabled: boolean; viewerUrl: string; refreshMs: number; layout: Layout; showBand: boolean; showLog: boolean; animate: boolean; animFps: number; animFpsTerminal: number }

export const DEFAULTS: Config = { isEnabled: true, viewerUrl: DEFAULT_URL, refreshMs: 1500, layout: 'auto', showBand: false, showLog: false, animate: true, animFps: 6, animFpsTerminal: 3 }

const flag = (v: unknown, fallback: boolean): boolean => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : fallback)

/** `v` (a number or numeric text) rounded and held to lo..hi; `fallback` when it is neither. */
function ranged(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : fallback
}

export function configFrom(options: Record<string, unknown> | undefined): Config {
  const o = options ?? {}
  const n = typeof o.refreshMs === 'string' && o.refreshMs.trim() !== '' ? Number(o.refreshMs) : o.refreshMs
  const layout = typeof o.layout === 'string' ? o.layout.trim().toLowerCase() : ''
  return {
    isEnabled: flag(o.enabled, true),
    viewerUrl: typeof o.viewerUrl === 'string' && o.viewerUrl.trim() !== '' ? o.viewerUrl.trim() : DEFAULT_URL,
    refreshMs: typeof n === 'number' && Number.isFinite(n) ? Math.max(500, Math.min(60000, Math.round(n))) : 1500,
    layout: layout === 'wide' || layout === 'tall' ? layout : 'auto',
    showBand: flag(o.showBand, false),
    showLog: flag(o.showLog, false),
    animate: flag(o.animate, true),
    animFps: ranged(o.animFps, 0, 12, 6),
    animFpsTerminal: ranged(o.animFpsTerminal, 1, 6, 3),
  }
}

/** The viewer's origin when `url` is http(s) on a loopback host (localhost, 127.x.x.x or [::1]); otherwise null. */
export function loopbackOrigin(url: string): string | null {
  const m = /^(https?):\/\/(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::(\d{1,5}))?(?:[/?#].*)?$/i.exec(url.trim())
  if (!m) return null
  if (m[2]!.startsWith('127') && m[2]!.split('.').some(p => Number(p) > 255)) return null
  const port = m[3] === undefined ? '' : Number(m[3])
  if (port !== '' && (port < 1 || port > 65535)) return null
  return `${m[1]!.toLowerCase()}://${m[2]!.toLowerCase()}${port === '' ? '' : `:${port}`}`
}

// ---------------------------------------------------------------- the viewer's reply

export type Row = [string, string, string]
export type ProjectRef = { id: string; name: string }
export type Council = { ui: string; code: string; run: string }
export type Recall = { cg: number; hs: number; grep: number; saved: number; run: boolean }
export type GraphState = {
  orch: string
  builder: string
  opus: string
  verdict: string | null
  calls: number
  council: Council
  recall: Recall
}
export type Panel = { project: ProjectRef; projects: ProjectRef[]; state: GraphState; log: Row[]; changes: Row[]; at: number; sessions: number; idle: boolean; animating: boolean }

const text = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const rowsOf = (v: unknown): Row[] =>
  Array.isArray(v) ? v.filter(Array.isArray).map(r => [text(r[0]), text(r[1]), text(r[2])] as Row) : []
const refOf = (v: unknown): ProjectRef | null => {
  const o = v as { id?: unknown; name?: unknown } | null
  return o && (typeof o.id === 'string' || typeof o.id === 'number') ? { id: String(o.id), name: text(o.name, String(o.id)) } : null
}

/** The viewer's `/panel/state` JSON, checked; null when it is not that shape. */
export function parsePanel(raw: string): Panel | null {
  let j: any
  try {
    j = JSON.parse(raw)
  } catch {
    return null
  }
  const project = refOf(j?.project)
  if (!project || !j.state || typeof j.state !== 'object') return null
  const s = j.state
  const c = s.council ?? {}
  const r = s.recall ?? {}
  return {
    project,
    projects: (Array.isArray(j.projects) ? j.projects : []).map(refOf).filter((p: ProjectRef | null): p is ProjectRef => p !== null),
    state: {
      orch: text(s.orch, 'idle'),
      builder: text(s.builder, 'idle'),
      opus: text(s.opus, 'idle'),
      verdict: typeof s.verdict === 'string' ? s.verdict : null,
      calls: num(s.calls),
      council: { ui: text(c.ui, 'idle'), code: text(c.code, 'idle'), run: text(c.run, 'idle') },
      recall: { cg: num(r.cg), hs: num(r.hs), grep: num(r.grep), saved: num(r.saved), run: r.run === true },
    },
    log: rowsOf(j.log),
    changes: rowsOf(j.changes),
    at: num(j.at),
    sessions: num(j.sessions),
    idle: j.idle === true,
    animating: j.activity?.animating === true,
  }
}

// ---------------------------------------------------------------- what to ask for

/** The `folder` the viewer is asked about: the picked project's id, else the session's folder (it finds the project). */
export const folderParam = (cwd: string, picked: string | null): string => picked ?? cwd

/**
 * The next pick when cycling: the session's own folder (null) first, then each project in the viewer's order,
 * then round to the folder again. A pick the viewer no longer lists counts as the folder.
 */
export function cyclePick(projects: readonly ProjectRef[], picked: string | null, step: 1 | -1 = 1): string | null {
  const order: (string | null)[] = [null, ...projects.map(p => p.id)]
  const at = Math.max(0, order.indexOf(picked))
  return order[(at + step + order.length) % order.length] ?? null
}

/** The picture size in pixels for a pane `columns` by `rows` cells; `rows` 0 (unknown) gives a landscape box. */
export function paneSize(columns: number, rows: number, chromeRows = HEADER_ROWS, ratio = 0.75): { width: number; height: number } {
  const width = Math.max(320, Math.min(PIC_MAX, Math.round(Number.isFinite(columns) ? columns : 0) * CELL_W))
  const room = Math.floor(rows) - chromeRows
  return { width, height: room > 0 ? Math.max(160, Math.min(PIC_MAX, room * CELL_H)) : Math.min(PIC_MAX, Math.round(width * ratio)) }
}

/** `size` scaled down, keeping its shape, until it fits `box`; centred by the caller. Never scaled up. */
export function fitSize(size: { width: number; height: number }, box: { width: number; height: number }): { width: number; height: number } {
  const k = Math.min(1, box.width / size.width, box.height / size.height)
  return { width: Math.max(1, Math.round(size.width * k)), height: Math.max(1, Math.round(size.height * k)) }
}

/** The width and height an SVG's root element states, when both are plain numbers. */
export function svgSize(markup: string): { width: number; height: number } | null {
  const root = /^\s*<svg\b[^>]*>/i.exec(markup)?.[0]
  const w = root && /\swidth="(\d+(?:\.\d+)?)(?:px)?"/i.exec(root)
  const h = root && /\sheight="(\d+(?:\.\d+)?)(?:px)?"/i.exec(root)
  return w && h && Number(w[1]) > 0 && Number(h[1]) > 0 ? { width: Number(w[1]), height: Number(h[1]) } : null
}

/** The size an SVG states on its root, else its viewBox's; null when neither is usable. */
export function svgBox(markup: string): { width: number; height: number } | null {
  const own = svgSize(markup)
  if (own) return own
  const root = /^\s*<svg\b[^>]*>/i.exec(markup)?.[0]
  const v = root && /\sviewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)\s*"/i.exec(root)
  return v && Number(v[1]) > 0 && Number(v[2]) > 0 ? { width: Number(v[1]), height: Number(v[2]) } : null
}

/** `size` scaled, keeping its shape, to the biggest that fits `box` (up as well as down), so the drawing fills the pane. */
export function fillSize(size: { width: number; height: number }, box: { width: number; height: number }): { width: number; height: number } {
  const k = Math.min(box.width / size.width, box.height / size.height)
  return { width: Math.max(1, Math.round(size.width * k)), height: Math.max(1, Math.round(size.height * k)) }
}

/** The markup with `width` and `height` stated on its root (and a viewBox when it had none), so it never draws at a default size. */
export function withSize(markup: string, size: { width: number; height: number }, natural: { width: number; height: number } | null = svgBox(markup)): string {
  const m = /^(\s*)<svg\b([^>]*)>/i.exec(markup)
  if (!m) return markup
  let attrs = m[2]!.replace(/\s(?:width|height)="[^"]*"/gi, '')
  if (natural && !/\sviewBox=/i.test(attrs)) attrs += ` viewBox="0 0 ${natural.width} ${natural.height}"`
  return `${m[1]}<svg width="${size.width}" height="${size.height}"${attrs}>${markup.slice(m[0].length)}`
}

/** One whole pulse (dim and bright) in milliseconds. */
export const PULSE_MS = 1200

/**
 * The animated elements of an `anim=attr` SVG (those with `data-flow="<period>"`) moved on to `tick`:
 * `stroke-dashoffset` is -((tick * 2) mod period). Elements with `data-pulse` are bright for the first half of
 * each PULSE_MS of `elapsedMs` and dim for the second. Nothing else in the markup is touched.
 */
export function animateSvg(markup: string, tick: number, elapsedMs: number): string {
  return markup.replace(/<[a-zA-Z][^<>]*\bdata-(?:flow|pulse)=[^<>]*>/g, tag => {
    const period = Number(/\sdata-flow="(\d+(?:\.\d+)?)"/.exec(tag)?.[1])
    if (period > 0) {
      const m = (tick * 2) % period
      tag = tag.replace(/(\sstroke-dashoffset=")[^"]*(")/, `$1${m === 0 ? 0 : -Math.round(m * 1000) / 1000}$2`)
    }
    if (/\sdata-pulse="1"/.test(tag)) {
      const opacity = elapsedMs % PULSE_MS < PULSE_MS / 2 ? '1' : '.35'
      tag = /\sopacity="[^"]*"/.test(tag) ? tag.replace(/(\sopacity=")[^"]*(")/, `$1${opacity}$2`) : tag.replace(/\s*(\/?>)$/, ` opacity="${opacity}"$1`)
    }
    return tag
  })
}

export type PicKind = 'svg' | 'png'
/** What a picture was drawn for: it is fetched again only when this, or the viewer's state, changes. */
export type Want = { folder: string; layout: Layout; width: number; height: number; showLog: boolean; kind: PicKind }

export function graphUrl(origin: string, kind: 'state' | 'svg' | 'png', o: { folder: string; layout?: Layout; width?: number; height?: number; showLog?: boolean; scale?: number; anim?: boolean; phase?: number }): string {
  const q = [`folder=${encodeURIComponent(o.folder)}`]
  if (kind !== 'state') q.push(`layout=${o.layout ?? 'auto'}`, `width=${Math.round(o.width ?? 1024)}`, `height=${Math.round(o.height ?? 768)}`, `log=${o.showLog ? 1 : 0}`, 'bg=transparent')
  if (kind === 'png') q.push(`scale=${o.scale ?? 2}`)
  if (kind === 'svg' && o.anim) q.push('anim=attr')
  if (kind !== 'state' && o.phase !== undefined) q.push(`phase=${Math.max(0, Math.min(1000, Math.round(o.phase)))}`)
  return `${origin}/panel/${kind === 'state' ? 'state' : `graph.${kind}`}?${q.join('&')}`
}

/** A fingerprint of everything the picture shows (the log only when it is shown). `at` is left out: the viewer stamps it with its clock on every reply. */
export const fingerprint = (p: Panel, showLog = false): string => JSON.stringify([p.project.id, p.state, showLog ? p.log : null])

/**
 * Whether the picture must be fetched again: none yet, a different request, or the viewer's state moved on
 * (its `at` is only a clock reading, so it cannot say that by itself).
 */
export function needsPicture(prev: { want: Want; print: string } | null, want: Want, print: string): boolean {
  return !prev || prev.print !== print || prev.want.folder !== want.folder || prev.want.layout !== want.layout || prev.want.width !== want.width || prev.want.height !== want.height || prev.want.showLog !== want.showLog || prev.want.kind !== want.kind
}

/** Width and height of a PNG from its first 24 bytes (base64 in); null when it is not a PNG. */
export function pngSize(base64: string): { width: number; height: number } | null {
  let bin: string
  try {
    bin = atob(base64.slice(0, 48))
  } catch {
    return null
  }
  if (bin.length < 24 || bin.slice(1, 4) !== 'PNG') return null
  const at = (i: number) => ((bin.charCodeAt(i) << 24) | (bin.charCodeAt(i + 1) << 16) | (bin.charCodeAt(i + 2) << 8) | bin.charCodeAt(i + 3)) >>> 0
  const width = at(16)
  const height = at(20)
  return width > 0 && height > 0 ? { width, height } : null
}

/** Whether `base64` is a PNG this mod will show: its size in bytes (before decoding) and its header's width and height are within the limits. */
export function checkPng(base64: string): { size: { width: number; height: number } } | { refused: string } {
  const pad = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  if (Math.floor((base64.length * 3) / 4) - pad > PNG_LIMIT) return { refused: 'bytes' }
  const size = pngSize(base64)
  if (!size) return { refused: 'format' }
  if (size.width > PNG_MAX_SIDE || size.height > PNG_MAX_SIDE || size.width * size.height > PNG_MAX_PIXELS) return { refused: 'pixels' }
  return { size }
}

/** The cells an Image of `size` pixels takes in a pane `columns` wide, and `maxRows` high when that is known (1 to 255 each way). */
export function cellsFor(size: { width: number; height: number }, columns: number, maxRows = 0): { columns: number; rows: number } {
  let cols = Math.max(1, Math.min(255, Math.floor(columns)))
  if (maxRows > 0 && (cols * CELL_W * size.height) / size.width > maxRows * CELL_H) cols = Math.max(1, Math.floor((maxRows * CELL_H * size.width) / (size.height * CELL_W)))
  const rows = Math.ceil((cols * CELL_W * (size.height / size.width)) / CELL_H)
  return { columns: cols, rows: Math.max(1, Math.min(255, rows)) }
}

// ---------------------------------------------------------------- the cards in text

export type Tone = 'text' | 'dim' | 'good' | 'warn' | 'bad' | 'info'
export type Line = { text: string; tone: Tone }
export type Card = { title: string; lines: Line[] }

const COUNCIL_LABEL: Record<string, [string, Tone]> = {
  idle: ['idle', 'dim'],
  running: ['running…', 'good'],
  pass: ['pass', 'good'],
  done: ['done', 'good'],
  note: ['note', 'warn'],
  fail: ['fail', 'bad'],
}
export const councilLabel = (v: string): [string, Tone] => COUNCIL_LABEL[v] ?? COUNCIL_LABEL.idle!

/** The six cards the picture has, in the order it has them. */
export function cardsOf(s: GraphState): Card[] {
  const orchBusy = s.orch === 'thinking' || s.orch === 'writing'
  const verdict = s.verdict === 'approve' ? 'APPROVE' : s.verdict === 'reject' ? 'REJECT' : '—'
  return [
    { title: 'ORCHESTRATOR', lines: [{ text: s.orch === 'done?' ? 'ready' : s.orch, tone: orchBusy ? 'good' : s.orch === 'done?' ? 'info' : 'dim' }] },
    {
      title: 'BRAIN',
      lines: [
        { text: s.opus === 'awake' ? 'awake' : 'asleep', tone: s.opus === 'awake' ? 'good' : 'dim' },
        { text: `calls ${s.calls} · ${verdict}`, tone: s.verdict === 'approve' ? 'good' : s.verdict === 'reject' ? 'bad' : 'dim' },
      ],
    },
    {
      title: 'RECALL',
      lines: [
        { text: s.recall.run ? 'running…' : 'idle', tone: s.recall.run ? 'good' : 'dim' },
        { text: `codegraph ${s.recall.cg} · hindsight ${s.recall.hs}`, tone: 'text' },
      ],
    },
    {
      title: 'BUILDER',
      lines: [{ text: s.builder === 'building' ? 'building' : s.builder === 'done' ? 'done' : 'idle', tone: s.builder === 'idle' ? 'dim' : 'good' }],
    },
    {
      title: 'COUNCIL',
      lines: (['ui', 'code', 'run'] as const).map(k => {
        const [label, tone] = councilLabel(s.council[k])
        return { text: `${k} ${label}`, tone }
      }),
    },
  ]
}

export const SPINNER = ['-', '\\', '|', '/']
/** The card line with a spinner glyph in front when it names a running state and `glyph` is given. */
export const spun = (text: string, glyph: string): string => (glyph && /running|building|thinking|writing/.test(text) ? `${glyph} ${text}` : text)

/** The last `n` log rows as plain lines. */
export const logLines = (log: readonly Row[], n = 6): string[] => log.slice(-n).map(r => [r[0], r[1], r[2]].filter(Boolean).join(' '))

/** The words one picture says to a screen reader or a terminal that cannot draw it. */
export function altOf(p: Panel): string {
  return `Model Engine graph for ${p.project.name}: ${cardsOf(p.state).map(c => `${c.title.toLowerCase()} ${c.lines.map(l => l.text).join(', ')}`).join('; ')}`
}

// ---------------------------------------------------------------- the status band

const FINISHED = new Set(['pass', 'note', 'fail', 'done'])

/** The words after `graph:` in Bottom Bar, e.g. `building · council 1/3`; `idle` when nothing runs. */
export function bandDetail(s: GraphState): string {
  const parts: string[] = []
  if (s.builder === 'building') parts.push('building')
  else if (s.orch === 'thinking' || s.orch === 'writing') parts.push('working')
  if (s.opus === 'awake') parts.push('brain')
  if (s.recall.run) parts.push('recall')
  const council = Object.values(s.council)
  const running = council.filter(v => v === 'running').length
  const finished = council.filter(v => FINISHED.has(v)).length
  if (running + finished > 0) parts.push(`council ${finished}/3`)
  return parts.length > 0 ? parts.join(' · ') : 'idle'
}

export type Segment = { label: string; detail: string; command: string; state: 'idle' | 'working' }

/** The one segment Bottom Bar draws; `{}` (no segment) while the viewer cannot be reached. */
export function segmentsOf(s: GraphState | null): Record<string, Segment> {
  if (!s) return {}
  const detail = bandDetail(s)
  return { graph: { label: 'Graph', detail, command: 'doole_graph', state: detail === 'idle' ? 'idle' : 'working' } }
}
