# Auto Plugins

Some plugins are big and only useful in one kind of project, such as Godot or Unity skills. Auto Plugins keeps them off until a project needs them, then switches them on for that project only. It has no pane, band or commands.

## Install

    /plugin install auto-plugins --marketplace doolecg/dooles-tools

Run that in a terminal; it then loads in every session, including the desktop app's Code tab. While developing, use `claude --plugin-dir <this folder>`.

## What it does

When a session starts it looks at the project's files. Each time you send a prompt it looks at your words. If a rule matches, it runs `claude plugin enable <plugin> --scope local` in the project folder for each plugin that is installed and not already on in the project's `.claude/settings.local.json`. Local scope is only in `settings.local.json`, which git ignores, so nothing is written to the repo's tracked files.

When it turns something on you see "Auto Plugins turned on ... Run /reload-plugins or restart Claude Code to load them.", and Claude is told to remind you.

| Plugins | Project files | Words in your prompt |
|---|---|---|
| `godot`, `router`, `disciplines` (awesome-gamedev-agent-skills) | `project.godot` | godot, gdscript, .tscn, .gd |
| `unity`, `router`, `disciplines` (awesome-gamedev-agent-skills) | `ProjectSettings/ProjectVersion.txt` (or under `sdk/`) | unity, scriptableobject, monobehaviour, .unity, .prefab |
| `router`, `disciplines` (awesome-gamedev-agent-skills) | none | game dev, game design, gameplay, game ui, sprite, tilemap, hud, pixel art, level design, procedural gen, game feel, shader |
| `expo` (expo-plugins) | an `"expo"` key in `package.json` or `app.json` | expo, react native, eas build/update/submit, expo router |
| `minecraft-modding`, `minecraft-multiloader`, `games` (dooles-skills) | `build.gradle(.kts)` or `settings.gradle(.kts)` naming fabric, neoforge, minecraftforge or net.minecraft | minecraft, fabric, neoforge, forge mod, mixin |
| `web-mobile` (dooles-skills) | `react-native`, `vite` or `expo` in `package.json` | react native, tsx, vite, expo, rn web |
| `game-rendering` (dooles-skills) | `pixi.js` or `@pixi/*` in `package.json` or `web/package.json` | pixijs, isometric, tilemap, sprite sheet |
| `backend` (dooles-skills) | a `.slnx`, `.sln` or `.csproj`, a compose file or `Dockerfile` | asp.net, dotnet, ef core, postgres, docker |
| `ui-design` (dooles-skills) | none | ui or ux design/review/critique, accessibility, design review |

Only prompts you type count; messages from other sessions, loop wake-ups and schedules are ignored. The rules are one table in `hooks/rules.ts`; add a row there to cover another plugin.

If you used the loose `auto-enable-plugins.mjs` hook before, remove it from your settings.json so the two do not both run.

## Model presets

Your worker tiers from `rules.md`: Haiku 5.5 for very small tasks (commit and push, lookups, reading, builds and tests, renames, screenshots), Sonnet 5.5 by default, Opus 5.5 for hard tasks and UI design. The **Model presets** setting picks what Auto Plugins does with them:

- **off**: nothing.
- **suggest** (default): a prompt that calls for Haiku or Opus shows a note and tells Claude to pass that model to subagents. Very hard work only says to check with you first.
- **auto**: a subagent started without a model gets Haiku or Opus when its task calls for it. A model Claude named, forks, resumes and teammates are left alone.

Claude Code gives mods no way to change the main session's model, so suggest mode points you at `/model`. Task size is guessed from words. The table is `hooks/models.ts`.

## Settings

**Enabled** (default on). Off, it switches nothing on. Plugins it already turned on stay on; turn them off with `claude plugin disable <plugin> --scope local`.

## Limits

- A plugin's skills load only after `/reload-plugins` or a restart. The prompt that switched it on runs without them.
- Only the plugins in the table are handled, and only when they are installed (listed in `installed_plugins.json`). It never installs anything.
- It never turns a plugin off again.
- Failures are silent: if `claude plugin enable` fails, nothing is shown and it tries again on the next matching prompt.
- It checks only `.claude/settings.local.json`. A plugin switched on at user or project scope is switched on again at local scope, which is harmless but shows the message once.
- Matching is word based, so "excel" in "excellent" does not count but "Excel" in any sentence does.

Tests: `claude plugin test <this folder>`.
