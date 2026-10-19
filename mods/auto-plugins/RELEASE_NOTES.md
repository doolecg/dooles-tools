# Auto Plugins 0.2.0

## New
- Model presets from your worker tiers: Haiku for very small tasks, Sonnet by default, Opus for hard tasks and UI design. A new Model presets setting has three modes: off, suggest (the default) and auto.
- Suggest: a prompt that calls for Haiku or Opus shows a short note and tells Claude which model to pass to subagents. Very hard work (big refactors, migrations, security) only says to check with you first.
- Auto: a subagent started without a model gets Haiku or Opus when its task calls for it. A model Claude named, forks, resumes and teammates are left alone.
- New project rules for the reorganised Dooles Skills plugins: `web-mobile` (Vite, TSX, React Native), `ui-design` (UI and UX reviews, accessibility), `game-rendering` (PixiJS in `package.json` or `web/package.json`, isometric and tilemap words) and `backend` (a .slnx/.sln/.csproj file, a compose file or Dockerfile, ASP.NET, EF Core, Postgres and Docker words).
- `web/package.json` is read as well as the top-level `package.json`.

---

## Changed
- Game, Godot, Unity and Minecraft projects now also switch on the `games` plugin, which replaces `minecraft-mod-dev`.
- Media and docs words no longer switch anything on; those skills were removed from Dooles Skills.

---

## Limits
- Claude Code gives mods no way to change the main session's model, so suggest mode tells you to use /model; auto mode only affects subagents.
- Task size is guessed from words, so it can be wrong. Name a model yourself and it is respected.

---

# Auto Plugins 0.1.0

## New
- Switches heavy, project-specific plugins on for the current project only when they are needed: Godot, Unity and game dev skills, Expo, Minecraft modding, and media and docs.
- Looks at the project's files when a session starts and at your words each time you send a prompt.
- Uses local scope, so nothing is written to the repo's tracked files.
- Shows a short message when it turns something on, reminding you to run /reload-plugins or restart.
- An Enabled setting turns it off.
