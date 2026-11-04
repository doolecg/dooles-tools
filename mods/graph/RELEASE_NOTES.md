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
