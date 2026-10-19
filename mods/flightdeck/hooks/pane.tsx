import type { RenderElement } from 'claude-code'
import type { FdAgent, FdCall, FdFile, FdGit, FdMain, FdUsage, FdUse } from '../types'
import { critterOf, critterPixels, rasterOf, smallPixels, svgOf } from './critter'
import { barSvg } from './pixel-bar'
import {
  actionOf,
  agentMetrics,
  agoText,
  fmtDuration,
  fmtUsd,
  groupAgents,
  limitLabel,
  modelName,
  paletteFor,
  recentActions,
  summaryOf,
  useRows,
  windowLabel,
  windowOf,
  type Headline,
  type Palette,
} from './logic'
import {
  sbFooterRows,
  sbFrame,
  sbFramedBar,
  sbKit,
  sbLevel,
  sbMeter,
  sbMix,
  sbStripRows,
  sbSweep,
  sbTitle,
  sbWarm,
  sbActions,
  sbPalette,
  type SbLook,
  type SbSeg,
  type SbStrip,
} from './sidebar-kit'

export type PaneData = {
  pal: Palette
  main: FdMain
  usage: FdUsage
  agents: FdAgent[]
  /** The main session's recent tool calls and files, the repository, and what Claude is doing this moment. */
  calls: FdCall[]
  files: FdFile[]
  /** The skills, plugins and MCP servers this session has used. */
  uses: FdUse[]
  git: FdGit | null
  /** Self Improve's one-line summary; undefined without that mod. */
  lessons?: string
  /** How many recent actions and files to list (0 hides the list), and whether the branch and memory lines show. */
  recentCount?: number
  fileCount?: number
  showRepo?: boolean
  right: Headline
  tick: number
  now: number
  columns: number
  /** The rows the pane's body shows at once. */
  bodyRows: number
  /** The first running card and the first finished row the two lists show. */
  runOffset: number
  doneOffset: number
  /** The Sidebar's strip when this pane is its open tab; the pane then draws as a tab. */
  strip?: SbStrip
  theme: unknown
  /** Asks the Sidebar for a tab (see `sbAsker`). */
  ask: (args: string) => void
  onStop: (id: string) => void
  onStopAll: () => void
  onClear: (id: string) => void
  onClearAll: () => void
}

/** Where the two lists sit in the pane's rows, for the scroll hook: `[first, end)` rows and how far each can scroll. */
export type PaneLayout = { run: [number, number]; done: [number, number]; runMax: number; doneMax: number }

/** Rows a running agent's outlined card takes. */
export const RUN_ROWS = 3

/** How many rows each list gets: both whole when they fit, else the running list first, keeping some for the finished one. */
export function splitRows(avail: number, runNeed: number, doneNeed: number): { run: number; done: number } {
  if (runNeed + doneNeed <= avail) return { run: runNeed, done: doneNeed }
  const doneFloor = Math.min(doneNeed, Math.max(3, Math.floor(avail / 3)))
  let run = Math.min(runNeed, Math.max(RUN_ROWS, avail - doneFloor))
  run -= run % RUN_ROWS
  run = Math.max(Math.min(runNeed, RUN_ROWS), run)
  const done = Math.min(doneNeed, Math.max(Math.min(doneNeed, 3), avail - run))
  return { run, done }
}

/** The thumb of a one-column scrollbar `rows` tall over `total` items, `shown` of them from `offset`. */
export function scrollThumb(rows: number, total: number, shown: number, offset: number): [number, number] {
  if (total <= shown || rows <= 0) return [0, rows]
  const size = Math.max(1, Math.round((rows * shown) / total))
  const top = Math.min(rows - size, Math.round(((rows - size) * offset) / Math.max(1, total - shown)))
  return [top, top + size]
}

/** The git line's words: `4 changed`, or `clean`, and `2 ahead of main` when known. */
const changedText = (git: FdGit): string => (git.changed.length > 0 ? `${git.changed.length} changed` : 'clean')
const aheadText = (git: FdGit): string => (git.ahead > 0 ? `${git.ahead} ahead of main` : '')

/** The accent look for a Task View style pixel meter in the terminal: pixels from the track toward the accent, scattered more than the kit's. */
const accentLook = (pal: Palette | { track: string; accent: string; tint: string }, tick: number, seed = 0): SbLook => ({
  stops: [sbMix(pal.track, pal.accent, 0.55), pal.accent],
  track: pal.track,
  tint: pal.tint,
  tick,
  seed,
  jitter: 0.8,
})

/** The pane as the Claude app draws it (desktop, editor and mobile): the same facts and buttons as native boxes, text and Svg meters. */
function drawApp(els: Record<string, any>, surface: string, d: PaneData): { el: RenderElement; layout: PaneLayout } {
  const { Box, Text, Button } = els
  const Svg = 'Svg' in els ? els.Svg : undefined
  const { main, usage, tick, now, strip } = d
  const k = sbKit(els, surface, sbPalette(strip?.theme ?? d.theme, strip?.colour), d.columns, tick, strip ? d.bodyRows : 0)
  const pal = strip ? k.pal : d.pal
  const groups = groupAgents(d.agents)
  const working = groups.working.length
  const level = (pct: number) => (pct >= 80 ? pal.bad : pct >= 60 ? pal.warn : pal.good)
  // Every bar is Task View's pixel loader, drawn at its real size so its dots are never stretched.
  // Never wider than the pane: about 7 pixels a column, less the card's border and padding.
  // Text cut to the pane in code too: the app does not always clip a long line without spaces (a path,
  // a command), so it would run past the card's edge.
  const room = Math.max(16, d.columns - 10)
  const cut = (text: string, n: number) => (text.length > Math.max(8, n) ? `${text.slice(0, Math.max(8, n) - 1)}…` : text)
  const fit = (width: number) => (d.columns > 0 ? Math.max(60, Math.min(width, (d.columns - 6) * 7)) : width)
  const meter = (key: string, fraction: number, color: string, alt: string, wide = 300, isSweep = false) => {
    const width = fit(wide)
    return Svg ? (
      <Svg key={key} source={barSvg(width, fraction, sbMix(pal.track, color, 0.55), color, pal.track, isSweep, pal.tint, tick)} alt={alt} width={width} height={9} />
    ) : null
  }
  // A section's title: an accent icon and the name in small capitals.
  const section = (key: string, icon: string, label: string) => (
    <Box key={key} columnGap={1}>
      <Text color={pal.accent}>{icon}</Text>
      <Text color={pal.dim} bold>
        {label.toUpperCase()}
      </Text>
    </Box>
  )
  // A label on the left and its value on the right.
  const pair = (key: string, label: string, value: JSX.Element) => (
    <Box key={key} columnGap={2} justifyContent="space-between">
      <Box flexShrink={0}>
        <Text color={pal.dim}>{label}</Text>
      </Box>
      <Box flexShrink={1} minWidth={0} justifyContent="flex-end">
        {value}
      </Box>
    </Box>
  )

  const fx = paletteFor(strip?.theme ?? d.theme)
  const status = working > 0 ? `${working} agent${working === 1 ? '' : 's'} working` : 'no agents working'
  const header = strip ? (
    sbTitle(k, { icon: '✈', name: 'Flightdeck', status })
  ) : (
    <Box key="header" columnGap={1} flexWrap="wrap">
      <Text color={pal.accent} bold>
        Flightdeck
      </Text>
      <Text color={pal.dim}>{status}</Text>
    </Box>
  )

  const model = modelName(main.model) || 'Main session'
  const size = windowLabel(usage.window)
  const pct = usage.ctxPct ?? 0
  const turnMs = main.turnStartedAt > 0 ? (main.turnEndedAt > 0 ? main.turnEndedAt : now) - main.turnStartedAt : 0
  const turnText = main.turnStartedAt > 0 ? `${main.isRunning ? 'turn' : 'last turn'} ${fmtDuration(turnMs)}` : 'no turn yet'
  const mainCard = (
    <Box key="main" flexDirection="column" borderStyle="round" borderColor={pal.sep} paddingX={1}>
      <Box columnGap={1} flexWrap="wrap" justifyContent="space-between">
        <Box columnGap={1} flexWrap="wrap">
          <Text color={pal.text} bold>
            {model}
          </Text>
          {size ? <Text color={pal.dim}>{size}</Text> : null}
          {main.effort ? <Text color={pal.info}>{`effort ${main.effort}`}</Text> : null}
        </Box>
        <Text color={main.isRunning ? pal.good : pal.dim}>{main.isRunning ? 'working' : 'idle'}</Text>
      </Box>
      {pair(
        'main-ctx-l',
        'Context',
        <Text color={level(pct)} bold>
          {usage.ctxPct === null ? '—' : `${Math.round(pct)}%`}
        </Text>,
      )}
      {meter('main-ctx', pct / 100, level(pct), `Context ${usage.ctxPct === null ? 'unknown' : `${Math.round(pct)} percent used`}`)}
      <Box columnGap={1} flexWrap="wrap" justifyContent="space-between">
        <Text color={pal.dim}>{usage.costUsd !== null ? `session cost ${fmtUsd(usage.costUsd)}` : ''}</Text>
        <Text color={pal.dim}>{`${turnText} · ${main.steps} ${main.steps === 1 ? 'request' : 'requests'}`}</Text>
      </Box>
    </Box>
  )
  const limits = usage.limits.slice(0, 2)
  const limitName = (kind: string) => (kind === 'five_hour' ? '5-hour limit' : kind === 'seven_day' ? '7-day limit' : `${limitLabel(kind)} limit`)
  const limitCards =
    limits.length > 0 ? (
      <Box key="limits" columnGap={1} rowGap={1} flexWrap="wrap">
        {limits.map((l, i) => (
          <Box key={`lim${i}`} flexDirection="column" borderStyle="round" borderColor={pal.sep} paddingX={1} flexGrow={1}>
            {pair(
              `lim-l${i}`,
              limitName(l.kind),
              <Text color={level(l.pct)} bold>
                {`${Math.round(l.pct)}%`}
              </Text>,
            )}
            {meter(`lim-m${i}`, l.pct / 100, level(l.pct), `${limitName(l.kind)} ${Math.round(l.pct)} percent used`, 150)}
          </Box>
        ))}
      </Box>
    ) : null

  const sum = summaryOf(d.agents, now)
  const tile = (label: string, value: string) => (
    <Box key={`tile-${label}`} flexDirection="column" borderStyle="round" borderColor={pal.sep} paddingX={1} flexGrow={1}>
      <Text color={pal.dim}>{label}</Text>
      <Text color={pal.text} bold>
        {value}
      </Text>
    </Box>
  )
  const totals = (
    <Box key="totals" columnGap={1}>
      {tile('Cost', sum.cost)}
      {tile('Tokens', sum.tokens)}
      {tile('Time', sum.time)}
    </Box>
  )

  // ---- Right now: what Claude is doing, its last few actions, the repository and the files ----
  const rn = d.right
  const actionRow = (c: FdCall) => {
    const a = actionOf(c)
    const color = a.kind === 'edit' ? fx.edit : a.kind === 'read' ? fx.read : a.kind === 'agent' ? pal.accent : pal.dim
    return (
      <Box key={`act:${c.id}`} columnGap={1} justifyContent="space-between">
        <Box columnGap={1} flexGrow={1} flexShrink={1} minWidth={0}>
          <Box width={2} flexShrink={0}>
            <Text color={color}>{a.glyph}</Text>
          </Box>
          <Box flexShrink={0}>
            <Text color={pal.text}>{a.verb}</Text>
          </Box>
          {a.target ? (
            <Box flexShrink={1} minWidth={0}>
              <Text color={a.isCode ? pal.info : pal.text} bold={!a.isCode} wrap="truncate-end">
                {cut(a.target, room - a.verb.length - 6)}
              </Text>
            </Box>
          ) : null}
        </Box>
        <Box flexShrink={0}>
          <Text color={pal.dim}>{agoText(now - c.at)}</Text>
        </Box>
      </Box>
    )
  }
  const recentCount = d.recentCount ?? 5
  const showRepo = d.showRepo !== false
  const acts = recentActions(d.calls, recentCount)
  const uses = (d.fileCount ?? 5) > 0 ? useRows(d.uses) : []
  const isEditingNow = rn.title.startsWith('Claude is editing')
  const rightNow = (
    <Box key="right-now" flexDirection="column" borderStyle="round" borderColor={pal.sep} paddingX={1} rowGap={1}>
      <Box flexDirection="column">
        {section('rn-h', '✶', 'Right now')}
        <Text color={rn.isWaiting ? pal.warn : pal.text} bold wrap="wrap">
          {rn.title}
        </Text>
        {rn.detail ? (
          <Text color={pal.dim} wrap="wrap">
            {rn.detail}
          </Text>
        ) : null}
        {rn.editName ? (
          <Box columnGap={1} flexWrap="wrap">
            <Text color={pal.dim}>{isEditingNow ? 'This edit:' : 'Last edit:'}</Text>
            {isEditingNow ? null : (
              <Text color={pal.text} bold>
                {rn.editName}
              </Text>
            )}
            {rn.added !== undefined ? <Text color={pal.good}>{`+${rn.added}`}</Text> : null}
            {rn.removed !== undefined ? <Text color={pal.bad}>{`−${rn.removed}`}</Text> : null}
          </Box>
        ) : null}
        {rn.step ? <Text color={pal.dim}>{`Task View: ${rn.step}`}</Text> : null}
      </Box>
      {recentCount > 0 ? (
        <Box flexDirection="column">
          {section('ra-h', '↻', 'Recent actions')}
          {acts.length > 0 ? acts.map(actionRow) : <Text color={pal.dim}>Nothing yet.</Text>}
        </Box>
      ) : null}
      {showRepo && (d.git || d.lessons) ? (
        <Box flexDirection="column">
          {section('repo-h', '⎇', 'Repository')}
          {d.git
            ? pair(
                'git',
                'Branch',
                <Box columnGap={1}>
                  <Text color={pal.text} bold>
                    {d.git.branch}
                  </Text>
                  <Text color={d.git.changed.length > 0 ? fx.dirty : pal.good}>{`· ${changedText(d.git)}`}</Text>
                  {aheadText(d.git) ? <Text color={pal.dim}>{`· ${aheadText(d.git)}`}</Text> : null}
                </Box>,
              )
            : null}
          {d.lessons ? pair('lessons', 'Memory', <Text color={pal.text}>{d.lessons.replace(/^Memory:\s*/, '')}</Text>) : null}
        </Box>
      ) : null}
      {uses.length > 0 ? (
        <Box flexDirection="column">
          {section('uses-h', '▤', 'In use this session')}
          {uses.map(u => pair(`use:${u.kind}`, u.label, <Text color={u.names.length > 0 ? pal.text : pal.dim}>{u.names.length > 0 ? u.names.join(', ') : 'none yet'}</Text>))}
        </Box>
      ) : null}
    </Box>
  )

  const heading = (key: string, label: string, n: number, isLive: boolean, action?: { label: string; onPress: () => void }) => (
    <Box key={key} columnGap={1} alignItems="center" justifyContent="space-between">
      <Box columnGap={1}>
        <Text color={pal.accent}>{label === 'Running' ? '▶' : '✓'}</Text>
        <Text color={isLive ? pal.text : pal.dim} bold>
          {`${label.toUpperCase()} · ${n}`}
        </Text>
      </Box>
      {action ? <Button key={`${key}-btn`} label={action.label} onPress={action.onPress} /> : null}
    </Box>
  )

  const mark = (a: FdAgent): [string, string] =>
    a.status === 'running'
      ? ['✳', pal.accent]
      : a.status === 'waiting'
        ? ['‖', pal.warn]
        : a.status === 'done'
          ? ['✓', pal.good]
          : a.status === 'failed'
            ? ['✗', pal.bad]
            : ['■', pal.dim]
  const critter = (a: FdAgent) => {
    if (!Svg) return null
    const c = critterOf(a.id)
    return <Svg key={`critter:${a.id}`} source={svgOf(a.id, a.status === 'running')} alt={`${c.name}, a ${c.tint} critter in a ${c.hat}`} width={36} height={36} />
  }
  // Task View's pixel bar: running agents sweep in the accent colour, finished ones sit full in the good colour.
  const pixelBar = (a: FdAgent) => {
    if (!Svg) return null
    const isRun = a.status === 'running' || a.status === 'waiting'
    const to = a.status === 'waiting' ? pal.warn : isRun ? pal.accent : pal.good
    // The critter takes about 44 pixels beside the bar.
    const width = Math.max(60, fit(300) - 44)
    return (
      <Svg
        key={`agent-m:${a.id}`}
        source={barSvg(width, isRun ? 0 : 1, sbMix(pal.track, to, 0.55), to, pal.track, isRun, pal.tint, tick)}
        alt={isRun ? 'Working' : 'Finished'}
        width={width}
        height={9}
      />
    )
  }
  const agentCard = (a: FdAgent, isRun: boolean) => {
    const [glyph, glyphColor] = mark(a)
    const win = windowOf(a.model, main.model, usage.window)
    const name = modelName(a.model)
    const metrics = agentMetrics(a, win, now).split('  ')
    const time = metrics.pop() ?? ''
    return (
      <Box key={`row:${a.id}`} borderStyle="round" borderColor={a.status === 'waiting' ? pal.warn : pal.sep} paddingX={1} columnGap={1} alignItems="center">
        {critter(a)}
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <Box columnGap={1} justifyContent="space-between" alignItems="center">
            <Box columnGap={1} flexShrink={1} minWidth={0}>
              <Text color={glyphColor}>{glyph}</Text>
              <Text color={pal.text} bold>
                {cut(a.description || a.type || 'Subagent', room - 20)}
              </Text>
            </Box>
            <Box columnGap={1} alignItems="center">
              <Text color={pal.dim}>{time}</Text>
              {isRun ? <Button key={`stop:${a.id}`} label="Stop" onPress={() => d.onStop(a.id)} /> : <Button key={`clear:${a.id}`} label="Clear" onPress={() => d.onClear(a.id)} />}
            </Box>
          </Box>
          <Box columnGap={1} flexWrap="wrap">
            <Text color={pal.info}>{critterOf(a.id).name}</Text>
            <Text color={pal.dim}>{`· ${name}${a.type ? ` · ${a.type}` : ''}`}</Text>
          </Box>
          {isRun && a.now ? (
            <Text color={pal.accent} wrap="truncate-end">
              {cut(`Now: ${a.now}`, room - 7)}
            </Text>
          ) : null}
          {pixelBar(a)}
          {metrics.length > 0 ? <Text color={pal.dim}>{metrics.join(' · ')}</Text> : null}
        </Box>
      </Box>
    )
  }
  const runCard = (a: FdAgent) => agentCard(a, true)
  const doneRow = (a: FdAgent) => agentCard(a, false)

  const parts: unknown[] = [
    header,
    rightNow,
    totals,
    mainCard,
    limitCards,
    heading('run-head', 'Running', working, working > 0, working > 0 ? { label: 'Stop all', onPress: d.onStopAll } : undefined),
    working === 0 ? (
      <Text key="run-empty" color={pal.dim}>
        {d.agents.length === 0 ? 'Subagents show here while they work.' : 'None running.'}
      </Text>
    ) : (
      <Box key="run-list" flexDirection="column" rowGap={1}>
        {groups.working.map(runCard)}
      </Box>
    ),
    heading('done-head', 'Done', groups.finished.length, false, groups.finished.length > 0 ? { label: 'Clear all', onPress: d.onClearAll } : undefined),
    groups.finished.length === 0 ? (
      <Text key="done-empty" color={pal.dim}>
        Nothing finished yet.
      </Text>
    ) : (
      <Box key="done-list" flexDirection="column" rowGap={1}>
        {groups.finished.map(doneRow)}
      </Box>
    ),
  ]
  const layout: PaneLayout = { run: [0, 0], done: [0, 0], runMax: 0, doneMax: 0 }
  if (strip) return { el: sbFrame(k, strip, sbActions(d.ask), parts), layout }
  return {
    el: (
      <Box flexDirection="column" width="100%" rowGap={1}>
        {parts}
      </Box>
    ),
    layout,
  }
}

/** The sidebar: the main session's outlined meters, then a list of running agents and one of finished agents, each scrolling on its own. */
export function drawPane(els: Record<string, any>, surface: string, d: PaneData): { el: RenderElement; layout: PaneLayout } {
  const { Box, Text, Button } = els
  const isTerminal = surface === 'terminal'
  if (!isTerminal) return drawApp(els, surface, d)
  const Raster = isTerminal && 'Raster' in els ? els.Raster : undefined
  const Svg = !isTerminal && 'Svg' in els ? els.Svg : undefined
  const { main, usage, tick, now, strip } = d
  const k = sbKit(els, surface, sbPalette(strip?.theme ?? d.theme, strip?.colour), d.columns, tick, strip ? d.bodyRows : 0)
  const pal = strip ? k.pal : d.pal
  const full = Math.max(16, d.columns)
  const groups = groupAgents(d.agents)
  const working = groups.working.length
  const fx = paletteFor(strip?.theme ?? d.theme)
  let row = strip ? sbStripRows(k, strip) : 0

  const line = (key: string, children: unknown, w = full) => (
    <Box key={key} height={1} width={w} overflow="hidden">
      {children}
    </Box>
  )
  const split = (key: string, left: unknown, right: unknown, w = full) => (
    <Box key={key} height={1} width={w}>
      <Box flexGrow={1} flexShrink={1} height={1} overflow="hidden">
        {left}
      </Box>
      {right ? (
        <Box flexShrink={0} marginLeft={1}>
          {right}
        </Box>
      ) : null}
    </Box>
  )
  const button = (key: string, label: string, color: string, onPress: () => void) => (
    <Button key={key} plain onPress={onPress}>
      <Text color={color}>{label}</Text>
    </Button>
  )

  // ---- header ----
  const status = working > 0 ? `${working} agent${working === 1 ? '' : 's'} working` : 'no agents working'
  const header = strip
    ? sbTitle(k, { icon: '✈', name: 'Flightdeck', status })
    : split(
        'header',
        <Text wrap="truncate-end">
          <Text color={pal.accent} bold>
            ✈ FLIGHTDECK
          </Text>
          <Text color={pal.dim}>{` · ${status}`}</Text>
        </Text>,
        null,
      )
  row += 1

  // ---- Right now: what Claude is doing, its last few actions, the branch and the files ----
  const rn = d.right
  const recentCount = d.recentCount ?? 5
  const fileCount = d.fileCount ?? 5
  const showRepo = d.showRepo !== false
  const acts = recentActions(d.calls, recentCount)
  const uses = useRows(d.uses)
  const nowRows: unknown[] = [
    line('rn-cap', <Text color={pal.dim} bold>{'✶ RIGHT NOW'}</Text>),
    line('rn-title', <Text color={rn.isWaiting ? pal.warn : pal.text} bold wrap="truncate-end">{rn.title}</Text>),
  ]
  if (rn.detail) nowRows.push(line('rn-detail', <Text color={pal.dim} wrap="truncate-end">{rn.detail}</Text>))
  if (rn.added !== undefined || rn.step !== undefined) {
    nowRows.push(
      line(
        'rn-sub',
        <Text wrap="truncate-end">
          {rn.added !== undefined ? <Text color={pal.good}>{`+${rn.added}`}</Text> : null}
          {rn.removed !== undefined ? <Text color={pal.bad}>{` −${rn.removed}`}</Text> : null}
          {rn.step ? <Text color={pal.dim}>{`${rn.added !== undefined ? ' · ' : ''}${rn.step}`}</Text> : null}
        </Text>,
      ),
    )
  }
  if (recentCount > 0) nowRows.push(line('rn-acts', <Text color={pal.dim} bold>{'↻ RECENT ACTIONS'}</Text>))
  if (recentCount > 0 && acts.length === 0) nowRows.push(line('rn-none', <Text color={pal.dim}>{'  Nothing yet.'}</Text>))
  for (const c of acts) {
    const a = actionOf(c)
    const color = a.kind === 'edit' ? fx.edit : a.kind === 'read' ? fx.read : a.kind === 'agent' ? pal.accent : pal.dim
    nowRows.push(
      split(
        `act:${c.id}`,
        <Text wrap="truncate-end">
          <Text color={color}>{`${a.glyph} `}</Text>
          <Text color={pal.text}>{a.verb}</Text>
          {a.target ? <Text color={a.isCode ? pal.info : pal.text} bold={!a.isCode}>{` ${a.target}`}</Text> : null}
        </Text>,
        <Text color={pal.dim}>{agoText(now - c.at)}</Text>,
      ),
    )
  }
  nowRows.push(line('rn-rule', <Text color={pal.sep}>{'─'.repeat(full)}</Text>))
  if (showRepo && d.git) {
    nowRows.push(
      line(
        'rn-git',
        <Text wrap="truncate-end">
          <Text color={pal.dim}>{'⎇ '}</Text>
          <Text color={pal.text} bold>{d.git.branch}</Text>
          <Text color={d.git.changed.length > 0 ? fx.dirty : pal.dim}>{` ${changedText(d.git)}`}</Text>
          {aheadText(d.git) ? <Text color={pal.dim}>{` · ${aheadText(d.git)}`}</Text> : null}
        </Text>,
      ),
    )
  }
  if (showRepo && d.lessons) {
    nowRows.push(
      line(
        'rn-lessons',
        <Text wrap="truncate-end">
          <Text color={pal.dim}>{'◈ '}</Text>
          <Text color={pal.text}>{d.lessons}</Text>
        </Text>,
      ),
    )
  }
  if (fileCount > 0) {
    for (const u of uses) {
      nowRows.push(
        line(
          `use:${u.kind}`,
          <Text wrap="truncate-end">
            <Text color={pal.dim} bold>{`${u.label} `}</Text>
            <Text color={u.names.length > 0 ? pal.text : pal.dim}>{u.names.length > 0 ? u.names.join(', ') : 'none yet'}</Text>
          </Text>,
        ),
      )
    }
  }
  row += nowRows.length

  // ---- main session: context in an outlined meter, the usage limits beside each other ----
  const model = modelName(main.model) || 'Main session'
  const size = windowLabel(usage.window)
  const pct = usage.ctxPct ?? 0
  const turnMs = main.turnStartedAt > 0 ? (main.turnEndedAt > 0 ? main.turnEndedAt : now) - main.turnStartedAt : 0
  const turnText = main.turnStartedAt > 0 ? `${main.isRunning ? 'turn' : 'last turn'} ${fmtDuration(turnMs)}` : 'no turn yet'
  const ctxFrame = sbFramedBar(k, 'main-ctx', {
    width: full,
    bar: cells => sbMeter(cells, pct / 100, sbLevel(k, pct, 1)),
    top: [
      { text: '◆ ', color: pal.accent },
      { text: model, color: pal.text, bold: true },
      ...(size ? [{ text: ` · ${size}`, color: pal.dim }] : []),
      ...(main.effort ? [{ text: ' · effort ', color: pal.dim }, { text: main.effort, color: pal.info, bold: true }] : []),
    ],
    topRight: [{ text: main.isRunning ? '● working' : '○ idle', color: main.isRunning ? pal.good : pal.dim }],
    bottom: [
      { text: 'ctx ', color: pal.dim },
      { text: usage.ctxPct === null ? '—' : `${Math.round(pct)}%`, color: pal.text },
      ...(usage.costUsd !== null ? [{ text: ` · ${fmtUsd(usage.costUsd)}`, color: pal.text }] : []),
    ],
    bottomRight: [{ text: `${turnText} · ${main.steps} req`, color: pal.dim }],
  })
  row += 3
  const limits = usage.limits.slice(0, 2)
  const half = limits.length > 1 ? Math.floor((full - 1) / 2) : full
  const limitFrames =
    limits.length > 0 ? (
      <Box key="main-limits" columnGap={1}>
        {limits.map((l, i) =>
          sbFramedBar(k, `lim${i}`, {
            width: i === 1 ? full - 1 - half : half,
            bar: cells => sbMeter(cells, l.pct / 100, sbLevel(k, l.pct, 2 + i)),
            top: [{ text: limitLabel(l.kind), color: pal.dim }],
            topRight: [{ text: `${Math.round(l.pct)}%`, color: l.pct >= 80 ? pal.bad : l.pct >= 60 ? pal.warn : pal.text }],
          }),
        )}
      </Box>
    ) : null
  if (limits.length > 0) row += 3

  // ---- the agents' totals and the two lists ----
  const sum = summaryOf(d.agents, now)
  const totals = split(
    'totals',
    <Text wrap="truncate-end">
      <Text color={pal.dim} bold>
        AGENTS
      </Text>
      <Text color={pal.dim}>{d.agents.length > 0 ? '  Cost ' : '  none yet'}</Text>
      {d.agents.length > 0 ? <Text color={pal.text} bold>{sum.cost}</Text> : null}
      {d.agents.length > 0 ? <Text color={pal.dim}>{'  Tokens '}</Text> : null}
      {d.agents.length > 0 ? <Text color={pal.text} bold>{sum.tokens}</Text> : null}
      {d.agents.length > 0 ? <Text color={pal.dim}>{'  Time '}</Text> : null}
      {d.agents.length > 0 ? <Text color={pal.text} bold>{sum.time}</Text> : null}
    </Text>,
    null,
  )
  row += 1

  const heading = (key: string, label: string, n: number, isLive: boolean, action?: { label: string; color: string; onPress: () => void }) => {
    const text = `${label} · ${n} `
    const right = action ? [` ${action.label}`] : []
    const rule = Math.max(0, full - [...text].length - right.reduce((s, t) => s + [...t].length, 0))
    return line(key, [
      <Text key="t" color={isLive ? pal.text : pal.dim} bold>
        {label}
      </Text>,
      <Text key="n" color={isLive ? pal.accent : pal.dim}>{` · ${n} `}</Text>,
      <Text key="r" color={pal.sep}>
        {'─'.repeat(rule)}
      </Text>,
      action ? button(`${key}-btn`, ` ${action.label}`, action.color, action.onPress) : null,
    ])
  }

  row += 1
  const runNeed = Math.max(1, working * RUN_ROWS)
  const doneNeed = Math.max(1, groups.finished.length)
  const avail = Math.max(0, d.bodyRows - row - 1 - sbFooterRows(strip))
  const rows = splitRows(avail, runNeed, doneNeed)
  const runShown = Math.max(1, Math.floor(rows.run / RUN_ROWS))
  const runMax = Math.max(0, working - runShown)
  const runOffset = Math.max(0, Math.min(runMax, d.runOffset))
  const runTop = row
  row += working > 0 ? Math.min(working, runShown) * RUN_ROWS : 1
  const runEnd = row
  row += 1
  const doneShown = Math.max(1, rows.done)
  const doneMax = Math.max(0, groups.finished.length - doneShown)
  const doneOffset = Math.max(0, Math.min(doneMax, d.doneOffset))
  const doneTop = row
  row += groups.finished.length > 0 ? Math.min(groups.finished.length, doneShown) : 1

  const bar = (key: string, rowsTall: number, total: number, shown: number, offset: number) => {
    const [a, b] = scrollThumb(rowsTall, total, shown, offset)
    return (
      <Box key={key} flexDirection="column" width={1} flexShrink={0}>
        {Array.from({ length: rowsTall }, (_, i) => (
          <Text key={i} color={i >= a && i < b ? pal.accent : pal.sep}>
            {i >= a && i < b ? '┃' : '│'}
          </Text>
        ))}
      </Box>
    )
  }

  const mark = (a: FdAgent): [string, string] =>
    a.status === 'running'
      ? ['✳', pal.accent]
      : a.status === 'waiting'
        ? ['‖', pal.warn]
        : a.status === 'done'
          ? ['✓', pal.good]
          : a.status === 'failed'
            ? ['✗', pal.bad]
            : ['■', pal.dim]
  const flat = (stops: string[], seed = 0): SbLook => ({ stops, track: pal.track, tint: pal.tint, tick, seed })

  const runScrolls = working > runShown
  const listWidth = full - (runScrolls ? 1 : 0)
  const critterWidth = Raster ? 6 : Svg ? 3 : 0
  const cardWidth = listWidth - (critterWidth ? critterWidth + 1 : 0)
  const critter = (a: FdAgent) => {
    if (Raster) {
      const r = rasterOf(smallPixels(critterPixels(a.id, Math.floor(tick / 2) % 2 === 1)))
      return <Raster key={`critter:${a.id}`} columns={r.columns} rows={r.rows} cells={r.cells} />
    }
    if (Svg) {
      const c = critterOf(a.id)
      return <Svg key={`critter:${a.id}`} source={svgOf(a.id, true)} alt={`${c.name}, a ${c.tint} critter in a ${c.hat}`} width={18} height={18} />
    }
    return null
  }
  const runCard = (a: FdAgent, i: number) => {
    const [glyph, glyphColor] = mark(a)
    const win = windowOf(a.model, main.model, usage.window)
    const ctx = win && a.ctxTokens > 0 ? Math.min(100, Math.round((a.ctxTokens / win) * 100)) : undefined
    const name = modelName(a.model)
    const metrics = agentMetrics(a, win, now).split('  ')
    const time = metrics.pop() ?? ''
    const stop: SbSeg = { text: '■ stop', color: pal.bad, onPress: () => d.onStop(a.id), key: `stop:${a.id}` }
    const framed = sbFramedBar(k, `agent:${a.id}`, {
      width: cardWidth,
      color: a.status === 'waiting' ? pal.warn : pal.dim,
      bar: cells =>
        a.status === 'running'
          ? sbSweep(cells, accentLook(k.pal, tick, 10 + i))
          : sbMeter(cells, (ctx ?? 0) / 100, flat([pal.warn, pal.warn], 10 + i)),
      top: [
        { text: `${glyph} `, color: glyphColor },
        { text: a.description || a.type || 'Subagent', color: pal.text, bold: true },
      ],
      topRight: [{ text: `${time} `, color: pal.dim }, stop],
      bottom: [
        { text: critterOf(a.id).name, color: pal.info },
        { text: `${name ? ` · ${name}` : ''}${a.now ? '' : a.type ? ` · ${a.type}` : ''}`, color: pal.dim },
        ...(a.now ? [{ text: ` · now: ${a.now}`, color: pal.accent }] : []),
      ],
      bottomRight: metrics.length > 0 ? [{ text: metrics.join(' '), color: pal.dim }] : [],
    })
    if (!critterWidth) return framed
    return (
      <Box key={`row:${a.id}`} width={listWidth} height={RUN_ROWS} columnGap={1}>
        <Box width={critterWidth} height={RUN_ROWS} flexShrink={0} overflow="hidden">
          {critter(a)}
        </Box>
        {framed}
      </Box>
    )
  }

  const doneScrolls = groups.finished.length > doneShown
  const doneWidth = full - (doneScrolls ? 1 : 0)
  const doneLine = (a: FdAgent) => {
    const [glyph, glyphColor] = mark(a)
    const metrics = agentMetrics(a, windowOf(a.model, main.model, usage.window), now).split('  ')
    const time = metrics.pop() ?? ''
    return split(
      `done:${a.id}`,
      <Text wrap="truncate-end">
        <Text color={glyphColor}>{`${glyph} `}</Text>
        <Text color={pal.text}>{a.description || a.type || 'Subagent'}</Text>
        <Text color={pal.dim}>{` · ${critterOf(a.id).name}`}</Text>
      </Text>,
      <Box>
        <Text color={pal.dim}>{`${time} `}</Text>
        {button(`clear:${a.id}`, '✕', pal.dim, () => d.onClear(a.id))}
      </Box>,
      doneWidth,
    )
  }

  const runList =
    working === 0 ? (
      line('run-empty', <Text color={pal.dim}>{d.agents.length === 0 ? '  Subagents show here while they work.' : '  None running.'}</Text>)
    ) : (
      <Box key="run-list" width={full}>
        <Box flexDirection="column" width={listWidth} flexShrink={0}>
          {groups.working.slice(runOffset, runOffset + runShown).map((a, i) => runCard(a, runOffset + i))}
        </Box>
        {runScrolls ? bar('run-scroll', Math.min(working, runShown) * RUN_ROWS, working, runShown, runOffset) : null}
      </Box>
    )
  const doneList =
    groups.finished.length === 0 ? (
      line('done-empty', <Text color={pal.dim}>{'  Nothing finished yet.'}</Text>)
    ) : (
      <Box key="done-list" width={full}>
        <Box flexDirection="column" width={doneWidth} flexShrink={0}>
          {groups.finished.slice(doneOffset, doneOffset + doneShown).map(doneLine)}
        </Box>
        {doneScrolls ? bar('done-scroll', Math.min(groups.finished.length, doneShown), groups.finished.length, doneShown, doneOffset) : null}
      </Box>
    )

  const parts: unknown[] = [
    header,
    ...nowRows,
    totals,
    ctxFrame,
    limitFrames,
    heading('run-head', 'RUNNING', working, working > 0, working > 0 ? { label: '■ Stop all', color: pal.bad, onPress: d.onStopAll } : undefined),
    runList,
    heading('done-head', 'DONE', groups.finished.length, false, groups.finished.length > 0 ? { label: '✕ Clear', color: pal.dim, onPress: d.onClearAll } : undefined),
    doneList,
  ]

  const layout: PaneLayout = { run: [runTop, runEnd], done: [doneTop, row], runMax, doneMax }
  if (strip) return { el: sbFrame(k, strip, sbActions(d.ask), parts), layout }
  return {
    el: (
      <Box flexDirection="column" width="100%">
        {parts}
      </Box>
    ),
    layout,
  }
}

