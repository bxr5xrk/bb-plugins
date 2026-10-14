---
name: session-card-layout
description: Inspect or change the three saved Project Workspace session-card layouts.
---

Read with `bb plugin config session-card-layout`.

Set with `bb plugin config session-card-layout set layout "Поточний"`, `"Два рядки"` or `"Один рядок"`. Values are validated by the host and update immediately. The setting also appears in Settings → Session Card Layout.

Disable with `bb plugin disable session-card-layout` to restore the original appearance and row spacing. This plugin depends on the Project Workspace virtualizer's session-height bridge and its `.pw-session-*` DOM; it does not replace the built-in Thread list.
