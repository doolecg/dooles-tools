# Chat Bubbles

Makes the Claude Code transcript calmer: your messages (blue), Claude's replies (green) and summaries (purple) sit in rounded bubbles, every tool call is a named line (File Read, Code Edited, Hindsight Recall, Tool Used) that opens when pressed, and a mark with the turn's time closes every reply. Your messages sit under your name with a corner line, like the prompt in the Operant shell.

Open with `/doole_chat-bubbles`. Change the options in Mod Settings (`/doole_settings`) or `/config`.

| Option | What it does |
| --- | --- |
| Enabled | Off gives back the normal transcript. |
| Chat bubbles | Rounded bubbles: blue for you, green for replies, purple for summaries. Shell lines and slash commands show the folder above the bubble. |
| Your name | Shown above your messages (default Doole). Shell lines and slash commands show the folder instead. |
| Named tool calls | One named line per tool call or run of calls; press it to see what was done. |
| Line under each reply | A corner line, a mark and the turn time (`╰─ ✻ 6s`) under each finished reply. |

## Limits

- Every tool call folds except checklists, plans and questions. Errors and interrupted calls always show in full. The ctrl+o transcript folds them too.
- Opening a line needs a click or Enter on it; if your terminal does not pass presses to the transcript, ctrl+o still opens a run of calls.
- The text colour of Claude's reply comes from your terminal theme; only the bubble edges are tinted.
- Pasting images into the prompt box is a Claude Code feature, not a mod's: press ctrl+v (alt+v in Windows Terminal) with an image on the clipboard. A mod cannot change the prompt box itself.
- Windows file paths in replies (also inside backticks) become `file:` links; a click opens the file with its default program (Windows, terminal only). Programs and scripts are never opened. Paths cut at the first space unless they are in backticks.
- Each reply block (text between tool calls) gets its own bubble.
