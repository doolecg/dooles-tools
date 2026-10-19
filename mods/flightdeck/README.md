# Flightdeck

A Claude Code mod that puts a sidebar beside the transcript showing the main session and every subagent working right now. Each running subagent is a small outlined pixel bar, with its pixel critter beside it, showing its task, nickname, model, context, estimated cost, time and a stop button; finished ones take a line each. It uses the Bottom Bar's colours, light or dark to match your theme.

```
✈ FLIGHTDECK · 2 agents working
╭ ◆ Opus 5.5 · 1M · effort high ──────────── ● working ╮
│⠶⠶⠶⠶⠶⠶⠶⠲⠴⠐⠀⠄⠀⠀⠠⠀⠂⠀⠀⠐⠀⠀⠄⠀⠀⠀⠂⠀⠀⠠⠀⠀⠀⠐⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀│
╰ ctx 23% · $1.42 ───────────────── turn 0:57 · 14 req ╯
╭ 5h ──────────────── 31% ╮ ╭ 7d ───────────────── 12% ╮
│⠶⠶⠶⠶⠶⠲⠴⠐⠀⠄⠀⠀⠠⠀⠂⠀⠀⠐⠀⠀⠀⠀⠀│ │⠶⠶⠲⠴⠐⠀⠄⠀⠀⠠⠀⠂⠀⠀⠐⠀⠀⠀⠀⠀⠀⠀⠀⠀│
╰─────────────────────────╯ ╰──────────────────────────╯
AGENTS  ≈$0.02 · 71.9k tokens · 0:06
RUNNING · 2 ───────────────────────────────── ■ Stop all
╭ ✳ Say hi (agent one) ─────────────────── 0:06 ■ stop ╮
│⠀⠂⠀⠶⠶⠲⠴⠐⠀⠄⠀⠀⠠⠀⠂⠀⠀⠐⠀⠀⠄⠀⠀⠀⠂⠀⠀⠠⠀⠀⠀⠐⠀⠀⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀│
╰ Mango · Haiku 5.5 · gene… ─ ctx 4% · 35.9k ≈$0.01 ╯
DONE · 1 ─────────────────────────────────────── ✕ Clear
✓ Read the config · Pickle                        0:04 ✕
```

## Install

```
/plugin install flightdeck --marketplace doolecg/dooles-tools
```

Press `y` to add the marketplace, then pick the user scope so it loads everywhere.

## Opening and closing it

- Type `/flightdeck` to open it, and again to close it. `/flightdeck open` and `/flightdeck close` do just that. `/doole_flightdeck` does the same as `/flightdeck`.
- With the Bottom Bar mod it shows in the toolbox as an on/off mode, and you can add `/flightdeck` as a pill in `✎ choose pills`: ● when the sidebar is open, ○ when it is closed.
- In a fullscreen terminal it docks beside the transcript from 110 columns wide; otherwise it sits above the prompt.
- If you leave it open, it opens again in your next session.

## In the Sidebar

With the Sidebar mod installed, Flightdeck can be one of its tabs. It then draws under the Sidebar's tab strip, with its name and a Settings button in place of its own header, and closing it tells the Sidebar. Without the Sidebar it looks as it always did.

## What it shows

- **Right now:** a card at the top saying what Claude is doing this moment (editing a file, reading, running a command, searching, thinking, waiting for you, or idle), the lines added and removed by its last edit, and the current Task View step when that mod has one.
- **Last few actions:** the five most recent tool calls of the main session, newest first, in plain words with how long ago (Edited desktop.tsx, Ran a command, Started agent...).
- **Branch and files:** the git branch with how many files changed and how far ahead of main it is (left out when the folder is not a git repo), Self Improve's lessons line when that mod is installed, and the skills, plugins and MCP servers this session has used (each line says none yet until one is used).
- **Totals:** Cost, Tokens and Time of the subagents as three tiles.
- **Main session:** the model and its context size, effort, whether Claude is working, a context meter with the session's cost, your 5-hour and 7-day usage meters (when your plan reports them), how long the turn has run and how many requests it made.
- **Running:** one outlined bar per running subagent, newest first: the task, its time and a **■ stop** button on the top edge, a moving pixel bar inside (Task View's flickering look, with a glowing front), and its nickname, model, type and `ctx % · tokens ≈cost` on the bottom edge. While it works, its latest action shows as `now: running git status`. **■ Stop all** in the heading stops every one. Stopping goes through Claude Code's TaskStop tool, so it may ask you first; if an agent cannot be stopped, a toast says why.
- **Done:** one line per finished subagent, ✓ done, ✗ failed or ■ stopped, with its time and an **✕** to clear it. **✕ Clear** in the heading clears them all. Cleared agents stay hidden for the rest of the session.
- The two lists share the room left and each scrolls on its own: the mouse wheel scrolls the list it is over, and a list with more than fits shows a scrollbar. The scroll keys move the whole pane.
- Meters turn amber from 60% and red from 80%.

## Where the numbers come from

- Right now and the last actions: `tool.call` hooks, watched and never changed; git is asked with a short `git status` at most every few seconds.
- Main session: `turn.step`, `turn.start`, `turn.complete`, `session.measure` and `$.session.usage()`. The cost is the session's own, as `/cost` has it.
- Subagents: `agent.spawn`, each subagent's `turn.step` usage and its `turn.complete`, checked against `$.agent.list()` every 2 seconds while the sidebar is open.
- A subagent's cost is an estimate from list prices (marked ≈) and is left out for a model it has no price for. Its context % uses the model's published window.
- It never blocks, rewrites or delays anything and makes no network requests. The only thing it does is stop an agent when you press stop.

Works in the terminal and in the desktop app.

## Settings

Set in Mod Settings (`/doole_settings`) in the desktop app, or in `/config` in the terminal.

| Setting | Default | What it does |
| --- | --- | --- |
| Enabled | on | Off stops Flightdeck drawing or watching anything; `/flightdeck` then says it is off. |
| Recent actions shown | 5 | How many of Claude's latest tool calls to list (0 to 12; 0 hides the list). |
| Skills, plugins and MCPs shown | 5 | 0 hides the Skills, Plugins and MCPs lines; any other value shows them. |
| Show branch and memory lines | on | The git branch line and Self Improve's memory line. |
| Git check interval (seconds) | 4 | At most how often git is asked (1 to 120). |
| Agent check interval (seconds) | 2 | How often running subagents are checked while the sidebar is open (1 to 30). |
| Reopen at session start | on | Reopen the sidebar in a new session if it was left open. |

Limits: in the terminal the branch line and the memory line are separate rows; in the desktop app they share a Repository card. The settings apply the same on both.

## Credits

The idea and layout come from [Flightdeck](https://github.com/scasella/claude-flightdeck) by Stephen Casella (MIT). This is a smaller rewrite focused on subagents. The critters come from my older Agents Panel mod, and the pixel bars from Clean View.

## Development

```
claude plugin validate .
claude plugin test .
```
