<div align="center">

# dooles-tools

**Eleven mods that reshape Claude Code's own interface.**
A bottom bar, one menu for everything, live agent bars, and a settings panel.

![Mods](https://img.shields.io/badge/mods-11-D97757)
![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin%20marketplace-6C5CE7)
![Terminal](https://img.shields.io/badge/works%20in-Terminal-2D3436)
![Desktop app](https://img.shields.io/badge/works%20in-Desktop%20app%20Code%20tab-2D3436)
![Licence](https://img.shields.io/badge/licence-MIT-2D3436)

`✈  ✺  ✶  ◇  ✎  ▭  ⊘  ⊕  ◎  ⚙  ◆`

</div>

---

## What it feels like

You get a rounded bar under the prompt with the model, effort, context and usage. Its **Tools** button opens the **Main Menu**: one panel with a tab for every mod you have installed. Mods you have switched off are dimmed. **Settings** is always the last tab.

While Claude works, its to-do list gets pixel progress bars, and every subagent shows up as a bar you can stop. Park an idea without breaking Claude's flow. Press **Enhance Prompt** to turn a rough line into a clear request.

```
 Bottom Bar            Main Menu (tabs)                    Each mod
 ┌──────────┐  Tools   ┌───────────────────────────┐
 │ model    │ ───────▶ │ ✈ Flightdeck   ✺ Improve  │ ───▶  its own panel
 │ context  │          │ ✶ Steps        ◇ Ideas    │       and commands
 │ usage    │          │ ✎ Enhance      ▭ Bar      │
 │  ✻ Tools │          │ ⊘ Rules        ⚙ Settings │ ───▶  every mod's settings
 └──────────┘          └───────────────────────────┘       (last tab)
```

Everything works in the terminal and in the Code tab of the Claude desktop app.

---

## Quick start

**One click (Windows):** clone or download this repo and double-click `install.cmd`. It adds the marketplace and installs every mod. To pick some, run `.\install.ps1 sidebar,bottom-bar`.

**Inside Claude Code:**

```
/plugin marketplace add doolecg/dooles-tools
/plugin install sidebar@dooles-tools
```

**From a shell:**

```
claude plugin marketplace add doolecg/dooles-tools
claude plugin install <name>@dooles-tools
```

Restart Claude Code afterwards. Run `claude plugin marketplace update dooles-tools` to pull new versions.

---

## The mods

Every mod opens with `/doole_<mod>`. The plugin id is what you pass to `claude plugin install`.

| | Mod | Plugin id | Open with | What it does | Version |
|---|---|---|---|---|---|
| ◆ | **Main Menu** | `sidebar` | `/doole_main-menu` | One menu with a tab for each installed mod. Switched-off mods are dimmed. | 1.8.0 |
| ▭ | **Bottom Bar** | `bottom-bar` | `/doole_bottom-bar` | A rounded bar with model, effort, context, 5-hour and 7-day usage and agents. Its Tools button opens the Main Menu. | 1.11.0 |
| ⚙ | **Mod Settings** | `mod-settings` | `/doole_settings` | Every installed mod's settings in one side panel in the desktop app. | 0.3.0 |
| ✈ | **Flightdeck** | `flightdeck` | `/doole_flightdeck` | The main session and every subagent working now, each as a pixel progress bar with a stop button. | 1.7.1 |
| ✶ | **Task View** | `clean-view` | `/doole_task-view` | Claude's to-do list redrawn with a header and pixel progress bars. | 1.9.1 |
| ✺ | **Self Improve** | `self-improve` | `/doole_self-improve` | Learns from finished sessions, keeps `soul.md` in step, and drafts skill fixes for your approval. | 2.5.1 |
| ✎ | **Prompt Enhancer** | `prompt-enhancer` | `/doole_prompt-enhancer` | Rewrites the prompt box with the files, memories and skills the task needs. Nothing is sent until you press Enter. | 0.6.0 |
| ◇ | **Idea Shelf** | `idea-shelf` | `/doole_idea-shelf` | Park ideas with `/idea` while Claude works, one shelf per project. Send them later from `/ideas`. | 0.5.1 |
| ◎ | **Context** | `context` | `/doole_context` | The footer on every tab (Hindsight, CodeGraph, git) and a count of test and fix passes. | 1.2.0 |
| ⊘ | **Rule Guard** | `rule-guard` | none | Stops tool calls that break your standing rules and tells Claude why. Its rules are switches in its settings. | 1.1.0 |
| ⊕ | **Auto Plugins** | `auto-plugins` | none | Switches heavy, project-specific plugins (Godot, Unity, game dev, Expo, Minecraft modding, media and docs) on for this project only when the project or your prompt needs them. Run `/reload-plugins` after. | 0.1.0 |

Main Menu was called Sidebar and Task View was called Clean View. The plugin ids did not change, so existing installs and settings carry over.

Flightdeck is inspired by [scasella/claude-flightdeck](https://github.com/scasella/claude-flightdeck) (MIT).

---

## Settings

- **Desktop app:** open **Mod Settings** (`/doole_settings`, or the last tab of the Main Menu). Each mod is a card. Change a setting in place.
- **Terminal:** use `/config`, or `/plugin`, then Installed, then the mod, then Configure.
- Every mod has an **Enabled** switch as its first setting.
- Changes are saved to Claude Code's own settings. If a mod does not pick one up, run `/reload-plugins`.

---

## Good to know

- These mods only add to the interface. They do not edit Claude's tool calls or replies. Rule Guard is the one stated exception: it can stop a tool call.
- Hindsight and CodeGraph are optional. A mod that uses them carries on without them.
- Each mod has its own README, with a Limits section, and a `RELEASE_NOTES.md`.
- Skills live in a separate repo: [doolecg/Dooles_Skills](https://github.com/doolecg/Dooles_Skills).

---

## For developers

A mod is TypeScript and TSX run by Claude Code's mod engine. There is no build, bundle or lint step.

```
mods/<name>/
  .claude-plugin/plugin.json   name, version, description, settings
  hooks/hooks.json             { "modules": ["./register.tsx"] }
  hooks/register.tsx           exports register, subscribes with on('event', ...)
  tests/                       *.test.ts
  README.md  RELEASE_NOTES.md
```

- **Test one mod:** `claude plugin test mods/<name>`.
- **Try one while developing:** `claude --plugin-dir mods/<name>`.
- **Copied files, no shared package.** `sidebar-kit.tsx` is the shared look for tab mods. Edit `mods/sidebar/hooks/sidebar-kit.tsx`, then run `python mods/sidebar/copy-kit.py`. `checks.ts` exists in both `context` and `rule-guard`; keep the two copies identical.
- **Both surfaces.** Branch on `e.surface` (desktop, mobile or terminal) and draw with `$.ui.resolve(e)`.
- **Releasing a mod.** Bump `version` in `plugin.json`. Add a section at the top of its `RELEASE_NOTES.md` (`# <Mod> <version>`, then New, Changed, Fixed). Use plain tags such as `1.2.1`. Work on `dev-<version>`, then fast-forward `main`.

The original build brief is in [`mods/PROMPT.md`](mods/PROMPT.md).

## Licence

MIT. See [LICENSE](LICENSE).
