import type { Register } from 'claude-code'

import { ACCENT, CORNER, EDGE, SOFT, clip, editVerb, groupLine, isQuiet, pathLine, subject } from './look'

const COMMAND = 'doole_chat-bubbles'

export const register: Register = (on, options) => {
  const isOn = options.enabled !== false
  const wantBubbles = isOn && options.bubbles !== false
  const wantQuiet = isOn && options.quietTools !== false
  const wantLine = isOn && options.lineUnderReply !== false

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

  // Your message: a soft rounded bubble with a small arrow, as the Operant shell draws its prompt.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!wantBubbles || e.props.origin.kind !== 'composer') return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const folder = pathLine(await $.session.cwd(), (e.viewport?.columns ?? 80) - 4)
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color={ACCENT} bold>{folder}</Text>
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

  // A run of reads, searches and commands becomes one dim line.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (!wantQuiet || e.props.isExpanded) return next(e)
    if (e.props.calls.some(c => c.isErrored || c.isInterrupted)) return next(e)
    const { Text } = $.ui.resolve(e)
    return (
      <Text color={SOFT} dimColor>
        {`  ${e.props.isActive ? '… ' : '· '}${groupLine(e.props.calls)}`}
      </Text>
    )
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const p = e.props
    const verb = editVerb(p.tool)
    if (wantQuiet && verb && !p.isErrored && !p.isInterrupted) {
      const { Text } = $.ui.resolve(e)
      const room = Math.max(20, (e.viewport?.columns ?? 80) - verb.length - 8)
      return (
        <Text color={SOFT}>
          {'  '}
          <Text bold color={ACCENT}>{p.isRunning ? `${verb}…` : verb}</Text>
          {` ${clip(subject(p.input), room)}`}
        </Text>
      )
    }
    if (!wantQuiet || !isQuiet(p.tool) || p.isErrored || p.isInterrupted) return next(e)
    const { Text } = $.ui.resolve(e)
    const room = Math.max(20, (e.viewport?.columns ?? 80) - p.tool.length - 8)
    return (
      <Text color={SOFT} dimColor>
        {`  ${p.isRunning ? '… ' : '· '}${p.tool} ${clip(subject(p.input), room)}`}
      </Text>
    )
  }).catch(($, e, next) => next(e))

  // The output under a quiet call or an edit is left out; a failed call keeps its error.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!wantQuiet || !(isQuiet(e.props.tool) || editVerb(e.props.tool)) || e.props.isErrored) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  }).catch(($, e, next) => next(e))

  // The line under a finished reply, in place of "Baked for 3s".
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!wantLine) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const seconds = Math.max(0, Math.round(e.props.durationMs / 1000))
    const folder = pathLine(await $.session.cwd(), (e.viewport?.columns ?? 80) - 4)
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color={ACCENT} bold>{folder}</Text>
        <Text bold color={ACCENT}>{`${CORNER}${seconds}s`}</Text>
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
