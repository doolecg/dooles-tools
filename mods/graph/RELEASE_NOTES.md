# Graph 1.1.0

## New
- Portrait layout: a tall pane now gets the graph laid out to fill its height, not a small picture in the middle.
- The graph's background is transparent, so the pane's own colour shows through.
- The session log and the changes list are no longer shown by default. New setting "Show the session log" brings the log back.
- A slimmer header: one row with the arrows, the project name and a status dot.
- New: live animation (dotted borders and flowing wires keep moving while agents work). Settings: Animate, Animation speed (desktop) and Animation speed (terminal).
- The desktop graph is now sized to fill the pane, even when the app does not report the pane's size.

## Changed
- Needs the updated viewer from Model Engine (it takes the new layout, size, log and background options).

# Graph 1.0.0

## New
- `/doole_graph` opens the Model Engine graph from your local viewer, for the folder this session is in: orchestrator, Brain, recall, builder and the council, with the log.
- In the desktop app it is the dashboard's own drawing, animated. In a terminal that can show pictures it is the same drawing as an image sized to the pane. Anywhere else it is text cards with the same names and states.
- Arrows above the graph move between the viewer's projects; one more press goes back to this session's folder.
- It refreshes about every 1.5 seconds while the pane is open, and draws again only when something changed.
- A Main Menu tab, and an optional status segment for Bottom Bar such as `Graph · building · council 1/3` (off by default).
- Settings: viewer address (this computer only), refresh time, layout and the status segment.
- Safe by design: requests to the viewer time out after 5 seconds and back off, the terminal picture is fetched with size and time limits into a private temp folder (deleted after use), and oversized pictures fall back to text cards.
- Before the viewer has a project for the folder, the pane says "Waiting for Claude activity in this project".

## Changed
- Nothing.

## Fixed
- Nothing.
