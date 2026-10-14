Provider Hooks lists your user-level Claude Code and Codex hooks on one settings page and lets you turn each hook on or off.

Claude Code hooks come from `~/.claude/settings.json`. Turning one off removes it from the file and keeps a copy in plugin storage; turning it on puts it back in its original place. Codex hooks come from `~/.codex/hooks.json`; turning one off writes `enabled = false` into that hook's `[hooks.state]` table in `~/.codex/config.toml`.

Project-level hooks are not shown. Hooks cannot be added, edited, or deleted here.
