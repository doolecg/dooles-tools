# Main Menu

The Main Menu was called the Sidebar before. It is still the `sidebar` plugin, so your installs and settings carry over.

A Claude Code mod that gathers your mods into one top-level menu beside the transcript. Each installed mod gets a tab, in the Bottom Bar's colours (light or dark to match your theme).

```
╭──────────────────────────────────────────────────────────╮
│ ◆ MAIN MENU                                          ⋯  ✕ │
│  ✈ Flightdeck       ✺ Improve       ✶ Steps     ◇ Ideas   │
│  ✎ Enhance    ▭ Bar    ⊘ Rules             │ ⚙ Settings │
╰──────────────────────────────────────────────────────────╯
```

## Install

```
/plugin install sidebar --marketplace doolecg/dooles-tools
```

Press `y` to add the marketplace, then pick the user scope so it loads everywhere. Install the mods you want tabs for as well; the Main Menu shows a tab for each one it finds.

## Commands

- `/doole_main-menu` opens it, and again closes it. `/doole_main-menu open` and `/doole_main-menu close` do just that.
- `/sidebar` and `/doole_sidebar` still work and do the same.
- `/doole_main-menu <mod>` opens that mod's tab, for example `/doole_main-menu flightdeck`. `/doole_main-menu tab <id>` does the same.
- If you leave it open, it opens again in your next session.

## Which tabs

- **Order:** the installed mods in your order, then the mods that are switched off (dimmed, with no count), then Mod Settings, always last, whatever order you saved. A thin separator sets Mod Settings apart.
- **Switched-off mods:** a mod is off when its Enabled setting is off. Its tab is dimmed. Opening it shows "<Mod> is off" and a Turn on button, which switches the mod back on. Turning a mod on or off in Mod Settings updates the tabs at once.

- **Drawn by the mod itself:** Flightdeck, Self Improve, Idea Shelf, Graph and Mod Settings. Each mod opens its own pane when the sidebar's strip names its tab and closes it when you leave the tab. Switching tabs never runs a command, so it works while Claude is busy.
- **Drawn by the Main Menu:** Task View (the job running now), Prompt Enhancer, Bottom Bar and Rule Guard (the calls it stopped this session). Each shows what the mod does and points to `/plugin` › Installed › the mod › Configure, where all mod options live.

## The footer

With the Context mod installed, every tab has a footer at the bottom: whether Hindsight answers and the repo has a CodeGraph index, the git branch with its changed files, and the test passes against your limit.

## The ⋯ page

The Main Menu's own page: show or hide each tab, move them up and down (Mod Settings stays last), and see which mods are not installed.

## Settings

Set in Mod Settings (`/doole_settings`) in the desktop app, or in `/config` in the terminal.

| Setting | Default | What it does |
| --- | --- | --- |
| Enabled | on | Off stops the Main Menu opening or drawing; `/doole_main-menu` then says it is off. |
| Tab it opens on | last used | The tab shown when the Sidebar opens: last used, the Main Menu's own page, or a particular mod (falls back to the first tab if that mod's tab is not showing). |
| Reopen at session start | on | Reopen the Main Menu in a new session if it was left open. |
| Show the footer | on | Context's footer at the bottom of every tab. |
| Show tab badges | on | The number badges other mods put on their tabs. |

## For mod authors

To add a tab for your mod, add it to `CATALOG` in `hooks/logic.ts` and follow this protocol:

- Read the sidebar's `strip` state in your Pane render (`{ plugin: 'sidebar', key: 'strip' }`). Draw as a tab when `isSidebarTab(strip, yourPaneId)` is true.
- Copy `hooks/sidebar-kit.tsx` into your hooks folder (`python copy-kit.py` does it for the listed mods). Draw with `sbFrame` (the strip on top), `sbTitle` (your title row) and `sbActions` (the strip's buttons).
- Register a command for your mod and list it as `pane` in the catalog (it shows the sidebar your mod is loaded). Follow the strip: on `state.set` of `{ plugin: 'sidebar', key: 'strip' }`, call `sbPaneMove(id, e.value, e.previous)` and open your pane on `open`, close it on `close`.
- Ask the sidebar for things by writing your own `sidebarAsk` state (`{ args, n }`, `n` counting up), never with `$.command.run`. `sbAsker` wires the strip's presses to it and closes your pane first when a press leaves your tab.
- When the person closes your pane, write `sidebarAsk` with `closed <id>` so the sidebar switches off with it.
- Give your mod an `enabled` setting. When it is off, the Main Menu dims your tab and draws the "is off" page with a Turn on button itself, so your pane should draw nothing while off.
- Publish `sidebarBadge` (a number) in your state to show a count on your tab icon.
- Pass `sbRows(e.props)` as `sbKit`'s last argument so the footer sits at the bottom of a docked pane. A tab that fills the pane's height itself takes `sbFooterRows(strip)` off what it fills.

## Development

```
claude plugin validate .
claude plugin test .
python copy-kit.py
```
