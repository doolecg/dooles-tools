# Chat Bubbles

Makes the Claude Code transcript calmer: your messages and Claude's replies sit in soft rounded bubbles, tool calls fold into one dim line each, and the folder with a corner line (and the turn's time) closes every reply and sits above each of your messages, like the prompt in the Operant shell.

Open with `/doole_chat-bubbles`. Change the options in Mod Settings (`/doole_settings`) or `/config`.

| Option | What it does |
| --- | --- |
| Enabled | Off gives back the normal transcript. |
| Chat bubbles | Rounded bubbles for replies; your messages get the folder line and a corner instead. |
| Quiet tool calls | One dim line per tool call, run of calls, or code change. |
| Line under each reply | The folder and a corner line with the turn time under each finished reply. |

## Limits

- Only reads, searches and commands fold to one line. Edits and writes fold to one line too ("Edited path"), with no diff. Errors and interrupted calls always show in full. The ctrl+o transcript folds them too.
- The text colour of Claude's reply comes from your terminal theme; only the bubble edge and your own messages are tinted.
- Pasting images into the prompt box is a Claude Code feature, not a mod's: press ctrl+v (alt+v in Windows Terminal) with an image on the clipboard. A mod cannot change the prompt box itself.
- Each reply block (text between tool calls) gets its own bubble.
