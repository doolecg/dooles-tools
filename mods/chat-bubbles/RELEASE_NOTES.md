# Chat Bubbles 0.4.1

## Fixed
- The line under each finished reply keeps its corner line: `╰─ ✻ 6s`.

---

# Chat Bubbles 0.4.0

## New
- Every tool call is a named line with a mark: File Read, Searched, Command Run, Code Edited, Code Added, Hindsight Recall, Hindsight Saved, CodeGraph, Tool Used.
- Press a line to open it and see what was done: the change for an edit, the command and its output for a shell, the input and result for the rest. Press again to close. A run of calls opens into one line per call.

## Changed
- The line under each finished reply is a mark and the time (`✻ 6s`), no longer the folder path.
- Tool calls other than reads, searches and edits now fold too; errors still show in full.

---

# Chat Bubbles 0.3.0

## New
- Your messages show your name above the corner line ("Doole" by default). Set your own in Mod Settings (Your name).

## Changed
- Shell lines and slash commands still show the folder above them.

---

# Chat Bubbles 0.2.0

## New
- Edits and writes fold to one line (`Edited path`), with no diff. Quiet tool calls controls it.

## Changed
- Your messages show the folder above them and a corner line leading to your text, like the Operant shell prompt, instead of a rounded box.
- The line under each finished reply is now the folder and a corner line with the turn time.
- Bolder folder line, corner line and message text.

---

# Chat Bubbles 0.1.0

## New
- Your messages and Claude's replies in soft rounded bubbles.
- Tool calls and runs of them shown as one dim line; errors still show in full.
- A thin line with the turn's time under each finished reply.
- `/doole_chat-bubbles`, and an option for each of the three.
