# Session Card Layout

Three saved layouts for the installed Project Workspace session list:

- **Поточний:** original layout, 80 px row spacing and 76 px card.
- **Два рядки:** 64 px row spacing, 60 px card; title/status above, preview/time below.
- **Один рядок:** 40 px row spacing, 36 px card; status glyph, title and time. Preview hidden. Hover the existing status glyph for its full description.

Choose Settings → Session Card Layout → Вигляд картки сесії. Changes apply live in every open BB client. Current is the default. Disable restores the original appearance and spacing.

Requires Project Workspace with the session-height bridge in `WindowedSessions`. This plugin enhances that list's existing DOM; BB's built-in Thread list is unaffected. Existing navigation, pin, read, context menu, split and keyboard behavior stay owned by Project Workspace.

## Development

```sh
npm install
npm run typecheck
bb plugin build
bb plugin install . --yes
```

The content script owns one root attribute and an abortable event listener. Disable/reload removes both. The host persists and validates the three-choice setting; no thread or project records are rewritten.
