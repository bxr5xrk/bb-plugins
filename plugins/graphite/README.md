# Graphite

A BB theme plugin: a neutral graphite palette for light and dark mode, with sticky headers that blur the content scrolling under them.

## Behavior

- Registers one theme through `bb.themes`: `plugin:graphite:graphite`.
- Sets BB's color tokens for both `.light` and `.dark`.
- Adds a backdrop blur to `.bg-surface-scrim` (sticky thread and page headers).
- Adds no settings, commands, or UI.

Pair it with [Thread View](../thread-view) for the full look; each works on its own.

## Build and install

```sh
npm ci
npm run typecheck
npm run build
bb plugin install . --yes
bb theme set plugin:graphite:graphite
```

To go back to BB's default theme: `bb theme set default`.

Requires BB >=0.46 and Plugin SDK >=0.6.37. The palette uses BB's public theme tokens; only the header blur depends on the `bg-surface-scrim` class, which `scripts/check-selectors.mjs` watches.
