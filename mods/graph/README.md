# Graph

Shows the Model Engine graph in a pane: the same drawing as the Model Engine dashboard, served by its local viewer. It follows the folder this session works in.

Install (in a terminal; it then loads in every session, including the desktop app's Code tab):

    /plugin install graph --marketplace doolecg/dooles-tools

You also need the viewer from the Model Engine repo. It listens on `http://127.0.0.1:4779` and starts itself when a Claude hook event reaches it, once you have run `scripts/install-hooks.js` in the Model Engine folder.

Commands:
- `/doole_graph` opens the pane. `/doole_graph close` closes it.

What you see:
- **Desktop app:** the viewer's SVG in a pane, sized to fill it. While agents work the wires and borders keep moving.
- **Terminal:** the viewer's PNG as an image sized to the pane's columns and rows. The picture is asked for at the pane's size with a transparent background, so a tall pane gets the portrait layout. If the picture cannot be fetched, or the terminal refuses to show it, the pane switches to text cards.
- **Text cards (fallback, any surface):** Orchestrator, Brain, Recall (codegraph and hindsight counts), Builder and the Council (ui, code, run: idle, running…, pass, note, fail), and the last 6 log rows when Show the session log is on.
- **Projects:** when the viewer knows more than one project, arrows above the graph cycle through them. The first stop is this session's own folder.
- **Viewer not running:** one message, "Graph viewer is not running. It starts with your next Claude activity once the hooks are installed (scripts/install-hooks.js in the Model Engine folder)." The pane keeps asking quietly and draws the graph as soon as the viewer answers.
- **Main Menu:** with the Main Menu installed, Graph is a tab and uses the menu's look.

Settings (Mod Settings, `/doole_settings`, or `/config`):

| Setting | Default | What it does |
| --- | --- | --- |
| Enabled | On | Off stops the command, the pane and the status segment. |
| Viewer address | `http://127.0.0.1:4779` | Where the viewer listens. Only 127.0.0.1 (any 127.x.x.x), localhost and [::1] are accepted; anything else is refused and nothing is fetched. |
| Refresh (milliseconds) | 1500 | How often the open pane asks the viewer for news. 500 at the least. |
| Layout | auto | auto lets the viewer pick portrait for a tall pane, tall for a narrow one and wide for a broad one; wide or tall force one. |
| Show the session log | Off | Draws the session log under the graph (and after the text cards). Off gives the graph the whole pane. |
| Show in the bar | Off | Publishes a `segments` state for Bottom Bar, e.g. `Graph · building · council 1/3` or `Graph · idle`. While on, the viewer is also checked when the pane is closed. |
| Animate | On | Keeps the dotted borders and flowing wires moving while agents work. Off leaves the graph still. |
| Animation speed, desktop | 6 | Frames a second, 1 to 12; 0 turns the motion off. The desktop app moves the graph itself, with no extra requests to the viewer. |
| Animation speed, terminal | 3 | Picture frames a second, 1 to 6. It slows itself (down to 1) when frames arrive slowly. |

Limits:
- Terminal animation is a few frames a second and needs an image-capable terminal. Text cards animate with a small spinner (- \ | /) twice a second.
- Motion runs only while the viewer says agents are working and the pane is open; it stops, and draws the still graph once more, when they finish.
- It needs the viewer. Without it there is no graph, only the message above.
- The graph is drawn again only when the viewer's state, the log, the project or the pane's size changes. The viewer's `at` stamp is its clock at each reply, so it is not used as the signal.
- A terminal must support images (kitty, Ghostty and similar) to show the picture. The engine does not report image support, so Graph finds out by trying: if two picture swaps are refused it switches to text cards until the pane is reopened.
- The engine reports no cell size, so a cell is taken to be 8 by 16 pixels when sizing the picture.
- The terminal picture needs `curl` on the path: the host's fetch returns text only, so curl (limited to 4 MiB and 8 seconds, no proxy) saves the PNG to a file with a random name in a private per-process folder inside the temp folder. The file is deleted as soon as it is read and the folder when the pane closes. Without curl you get text cards.
- A PNG over 2 MiB, wider or taller than 4096 pixels, or over 8 megapixels is refused and the pane shows text cards with a short note.
- Each request to the viewer is given up after 5 seconds. The pane then reads as "viewer not running" and asks less often (up to every 10 seconds) until the viewer answers.
- A viewer with no project for the folder yet shows "Waiting for Claude activity in this project" and keeps asking quietly.
- The desktop app takes at most 131072 characters of SVG; a larger graph is shown as text cards.
- No network beyond this computer: only loopback addresses are ever contacted.
- It only reads from the viewer. It never starts or stops the viewer or any session.
