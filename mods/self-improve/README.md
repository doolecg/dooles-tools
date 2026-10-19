# Self Improve

Self Improve learns from a Claude Code session once you mark it done, keeps `soul.md` (facts about you and how Claude should respond to you), and tunes your skills over time. In the default mode (`controlled`) low-risk lessons apply themselves and every skill draft (new, fix or rewrite) waits in `/learn` for your approval. Plugin skills are never edited.

## Install

```
/plugin install self-improve --marketplace doolecg/dooles-tools
```

Answer `y` to add the marketplace, then pick the user scope. The Code tab of the desktop app cannot run `/plugin`; install from a terminal and the mod loads in desktop sessions too. Version 2.0.0 replaces the older self-improve 1.0.0: turn the old one off (`/plugin`, or `enabledPlugins` in settings) so only one learner runs.

## When it learns

- `/done` or `/done <what was achieved>` marks the session done and learns from it in the background.
- When Claude marks the session completed in the app's sidebar (`mcp__ccd_sidebar__mark_completed`), it learns after that succeeds.
- When the app stops the session (exit, logout, the app closing it), it learns, but only if the session made an edit or has a `/done` note. `/clear` and resume learn nothing. This step only writes a job file and starts a hidden background learner (`claude -p "/self-improve-run <session>"`); the next session start picks up a job that never finished.
- `/learn-now` learns now. `/learn-off` turns it off for this session.
- It never runs mid-session on its own.

## What it does in a run

1. A gate in code, before any model call: at least 3 user turns, 500 tokens of transcript, and a git change or a correction. Skips are recorded.
2. Evidence: the transcript (prompts, replies, tool calls and failures, interrupts, the prompt after each reply), the git diff since the session's starting commit, CodeGraph on the touched symbols (when available), and what Hindsight already knows (when available).
3. One call to the learn model (Haiku, low effort, JSON out). At most 8 lessons: convention, pitfall, correction or procedure, each with files and symbols from the evidence.
4. Lessons about the project go to the project's memory folder (`<config>/projects/<folder>/memory`, one file each plus a `MEMORY.md` line) and to the Hindsight bank `coding-agent::<folder name>`. Facts about you, and corrections about how Claude should respond, go to `soul.md` and the Soul Bank.
5. Lessons whose files or symbols are gone turn stale and leave memory.
6. Skills: a procedure seen in 2 or more sessions becomes a new-skill draft; a correction that names a skill becomes a fix draft; a skill corrected in at least 30% of its last 5 sessions gets a rewrite draft (Sonnet). Drafts are validated (frontmatter, unique name, no secrets, description under 1024 characters, no dropped rules). Plugin skills are never edited: a fix becomes a local override in your skills folder.
7. After a skill changes, the next 5 sessions that load it are compared with the 5 before. If it got worse, `/learn` asks whether to roll back. It never rolls back on its own.

## soul.md

`~/.claude/soul.md` (or `$CLAUDE_CONFIG_DIR/soul.md`) holds facts about you in four short sections: How to respond, How I work, Preferences, About me. One fact per line, no secrets. Edit it by hand or in the Soul tab of `/learn`.

Every session starts with soul.md (most important section first, cut at 1500 characters) and up to 6 lessons for the folder, as SessionStart context. Your CLAUDE.md is never edited.

A project can have its own `<config>/projects/<folder>/soul.md` (the folder that holds the project's `memory` folder). It is read-only: its first 1500 characters follow the global soul in the session start, it is never sent to the Soul Bank and `/learn` never edits it. Keep secrets out of it.

The first session seeds soul.md from your user and feedback memory files (and from the Soul Bank when Hindsight is set up). An existing soul.md is merged into, never overwritten. The first session also imports the old self-improve 1.0.0's saved preferences and facts; its data is left in place.

## Hindsight and CodeGraph (both optional)

- Hindsight is used only when `~/.hindsight/coding-agent.json` names an `apiUrl` that answers within 5 seconds. Project lessons go to `coding-agent::<folder name>`; soul facts go to the Soul Bank (setting `soulBank`, default `soul`). On every run soul.md and the Soul Bank are synced both ways, deduplicated. If Hindsight is down or not set up, everything still goes to the markdown files and is sent on a later run.
- CodeGraph is used only when the `codegraph` command is on PATH and the repo has a `.codegraph/` folder. Otherwise the run says "CodeGraph: not indexed".

## Review modes (setting `mode`)

- `off`: nothing runs.
- `suggest`: every lesson, draft and Soul Bank fact waits in `/learn` for you to approve, edit or reject.
- `controlled` (default): low-risk lessons apply themselves; every skill draft (new, fix or rewrite) waits in `/learn`. A lesson that names a command, a link, "always" or "never" still waits.
- `advanced`: skill drafts that pass validation apply themselves too.

Every automatic change is recorded with its before and after text and can be rolled back from `/learn`.

## /learn

`/learn` opens a pane with tabs: Lessons (filter by kind, store or text; approve, reject, edit, merge, move between the project and soul.md, delete), Drafts (the diff; approve, reload after editing the draft file, reject), Skills (the scorecard and trends), Changes (history with Roll back), Runs (each run's counts, skips and errors) and Soul (edit, remove, add, Soul Bank facts waiting, sync now). A Test button sends one tiny call to the learn model and stores nothing. Deletes and rollbacks ask to confirm and show what they affect.

`/learn status`, `/learn approve <id>` and `/learn reject <id>` work as typed commands too.

`/learn status` says "Learned N lessons: M saved, K to review", "Memory: nothing learned yet", or "Memory: <error>". Nothing is drawn above the prompt.

The `mcp__self-improve__recall` tool lets Claude search Hindsight, soul.md and the local lessons (`why: true` asks Hindsight to reflect). It was kept from self-improve 1.0.0.

## Settings

Set these in Mod Settings (`/doole_settings`) or `/plugin` (Self Improve, then configure options). The sidebar has no settings page.

| Setting | Default | Meaning |
| --- | --- | --- |
| `enabled` | on | Master switch; off stops all learning, the session brief and the pane, and the commands say Self Improve is off |
| `mode` | controlled | off, suggest, controlled, advanced |
| `soulBank` | soul | Hindsight bank for soul.md |
| `hindsightUrl` | empty | Hindsight server; empty uses `apiUrl` from `~/.hindsight/coding-agent.json` |
| `learnModel` | haiku | (haiku, sonnet or opus) Model that reads a finished session |
| `rewriteModel` | sonnet | (haiku, sonnet or opus) Model that drafts skill rewrites |
| `maxCalls` | 4 | Model calls per run (0 = no limit) |
| `maxTokens` | 60000 | Tokens per run (0 = no limit) |
| `maxChanges` | 5 | Changes applied on their own per run (0 = no limit) |
| `dailyUsd` | 0.5 | Estimated daily spend cap (0 = no cap) |
| `soulCap` | 1500 | soul.md characters each session starts with |
| `extraSkillDirs` | empty | More skill folders, separated by semicolons |
| `minUserTurns` | 3 | Sessions with fewer of your messages are skipped (1 to 50) |
| `minTokens` | 500 | Sessions with a shorter transcript are skipped (0 = no minimum) |

Hitting a budget stops the run and says which.

## Files

- `<config>/soul.md`
- `<config>/self-improve/state.json`: lessons, drafts, changes, runs, the scorecard and the soul sync record
- `<config>/self-improve/runs.md` and `<config>/self-improve/drafts/*.md`: readable copies
- `<config>/self-improve/jobs/`: jobs waiting for the background learner
- `<config>/projects/<folder>/memory/self_improve_lesson_<id>.md` and its `MEMORY.md` line

`<config>` is `~/.claude`, or `CLAUDE_CONFIG_DIR` when set.

## Limits

- The app has no event for "Mark as completed" or archive in the sidebar, so the mod catches done through `/done`, the sidebar's mark-completed tool when Claude calls it, and the end of the session.
- The background learner is a headless `claude -p` run: it needs `claude` on PATH, and it starts all your other plugins too.
- Hindsight has no delete or edit call: editing or removing a lesson or soul line changes the files, and the bank keeps the old memory. The session brief only uses active lessons.
- CodeGraph has no notes, so lessons are not tagged on symbols there; CodeGraph only adds context to the learn call.
- The spend cap is an estimate from token counts (Haiku about $1/$5, Sonnet $3/$15 per million tokens in/out); the engine does not report a plugin call's cost.
- The session and the background learner share `state.json`; two runs at the same moment can overwrite each other's record (job files keep one learner per session).
- A draft is edited in its file under `<config>/self-improve/drafts/`, then reloaded in the pane; the pane has no multi-line editor.
- Text fields and pickers are not shown on mobile surfaces.

## In the Sidebar

With the Sidebar mod on, Self Improve is a tab in it: the same review pane in the Sidebar's look, with the number of lessons and drafts waiting for review as the tab's badge. `/learn open` and `/learn close` open and close the pane; `/learn` alone still opens it. `/doole_self-improve` does the same as `/learn open`.
