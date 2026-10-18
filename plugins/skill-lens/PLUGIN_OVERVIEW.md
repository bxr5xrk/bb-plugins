Skill Lens adds a Skill lens tab next to Browse skills and My skills.

Each skill gets one card, even when several agents have it: the card shows every agent's logo (bb for plugin skills), where the skill comes from, and how often it was used. The most used skills come first, on the full list and in search results. Claude Code usage is counted exactly from `~/.claude/projects`; Codex (`~/.codex/sessions`) and Cursor CLI (`~/.cursor/chats`) usage is estimated from skill file reads and is marked with `~`.

A card opens the skill's page: every file in its folder as a tree, Markdown rendered with a Source toggle, other text files as highlighted code. Skills whose folder is a symlink open too. When agents have the same skill in different folders, the page switches between them.

Dependency folders (`node_modules`, `.venv`, `__pycache__`, `.git`) are skipped, and files over 1 MB or binary files show no preview. Files are read-only here.
