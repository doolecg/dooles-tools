import type { Register } from 'claude-code'

import { ACCENT, CORNER, EDGE, SOFT, clip, detailLines, duration, groupLine, isCommandText, keepsRow, kindOf, pathLine, shortName, subject, userLabel } from './look'

const COMMAND = 'doole_chat-bubbles'

// At the top of the file: the engine only lets `$` be passed to a function declared here.
function toggle($: { ui: { invalidate: (e: 'ui.render') => void } }, opened: Set<string>, id: string) {
  return () => {
    if (!opened.delete(id)) opened.add(id)
    $.ui.invalidate('ui.render')
  }
}

export const register: Register = (on, options) => {
  const isOn = options.enabled !== false
  const wantBubbles = isOn && options.bubbles !== false
  const wantQuiet = isOn && options.quietTools !== false
  const wantLine = isOn && options.lineUnderReply !== false
  const name = userLabel(options.userName)
  // Calls and runs the person opened with a press, by tool_use_id; lives as long as the session's mod.
  const opened = new Set<string>()

  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await $.command.register({ name: COMMAND, description: 'Chat Bubbles: how to change its look' })
    return ran
  })

  on('command.run', { command: COMMAND }, async () => ({
    text: isOn
      ? 'Chat Bubbles is on. Change bubbles, quiet tool calls and the line under replies in Mod Settings (/doole_settings) or /config. Errors always show in full.'
      : 'Chat Bubbles is off. Turn it on in Mod Settings (/doole_settings) or /config.',
  })).catch(() => ({}))

  // Your message: your name (or the folder, for a shell line or slash command) over a corner line, as the Operant shell draws its prompt.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!wantBubbles || e.props.origin.kind !== 'composer') return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const head = isCommandText(e.props.text) ? pathLine(await $.session.cwd(), (e.viewport?.columns ?? 80) - 4) : name
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color={ACCENT} bold>{head}</Text>
        <Box>
          <Text bold color={ACCENT}>{CORNER}</Text>
          <Text color={ACCENT}>{'› '}</Text>
          <Text bold color={SOFT}>{e.props.text}</Text>
        </Box>
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // Claude's reply: the same bubble, its markdown drawn as usual inside.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!wantBubbles || e.props.isSummary) return next(e)
    const { Box, Markdown } = $.ui.resolve(e)
    return (
      <Box borderStyle="round" borderColor={EDGE} paddingX={1} marginTop={e.props.isFirstOfReply ? 1 : 0}>
        <Markdown text={e.props.text} />
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // A run of calls becomes one line of marks and counts; pressing it unfolds the run into one line per call.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (!wantQuiet || e.props.isExpanded) return next(e)
    if (e.props.calls.some(c => c.isErrored || c.isInterrupted)) return next(e)
    const id = e.props.calls[0]?.tool_use_id
    if (id && opened.has(id)) return next({ ...e, props: { ...e.props, isExpanded: true } })
    const { Text, Button } = $.ui.resolve(e)
    const line = `${e.props.isActive ? '… ' : ''}${groupLine(e.props.calls)}`
    if (!id) return <Text color={SOFT} dimColor>{`  ▸ ${line}`}</Text>
    return (
      <Button key={`cbg:${id}`} plain onPress={toggle($, opened, id)}>
        <Text color={SOFT}>{'  ▸ '}</Text>
        <Text color={ACCENT}>{line}</Text>
      </Button>
    )
  }).catch(($, e, next) => next(e))

  // One call: its mark and name (Code Edited, Hindsight Recall, Tool Used) and what it was about; pressing it shows what was done.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const p = e.props
    if (!wantQuiet || keepsRow(p.tool) || p.isErrored || p.isInterrupted) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const kind = kindOf(p.tool)
    const isOpen = opened.has(p.tool_use_id)
    const cols = e.viewport?.columns ?? 80
    const about = clip(subject(p.input) || shortName(p.tool), Math.max(20, cols - 8))
    // The named call, then a corner line with its text; opened, what was done follows under the corner.
    return (
      <Box flexDirection="column">
        <Button key={`cbt:${p.tool_use_id}`} plain onPress={toggle($, opened, p.tool_use_id)}>
          <Text color={SOFT}>{isOpen ? '  ▾ ' : '  ▸ '}</Text>
          <Text bold color={ACCENT}>{`${kind.icon} ${kind.label}${p.isRunning ? '…' : ''}`}</Text>
        </Button>
        <Text color={SOFT}>{`  ${CORNER}${about}`}</Text>
        {isOpen &&
          detailLines(p.tool, p.input, p.output, cols - 8).map((l, i) => (
            <Text key={`d${i}`} color={SOFT} dimColor>{`      ${l}`}</Text>
          ))}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // The output under a folded call is left out (an opened call shows it); a failed call keeps its error.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!wantQuiet || keepsRow(e.props.tool) || e.props.isErrored) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  }).catch(($, e, next) => next(e))

  // The line under a finished reply, in place of "Baked for 3s": the folder, then a corner line with a mark and the time.
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!wantLine) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box marginBottom={1}>
        <Text bold color={ACCENT}>{`${CORNER}✻ ${duration(e.props.durationMs)}`}</Text>
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
