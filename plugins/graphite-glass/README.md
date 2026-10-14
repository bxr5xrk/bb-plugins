# Graphite Glass

A BB theme plugin: a neutral graphite palette for light and dark mode.

## Behavior

- Registers one theme through `bb.themes`: `plugin:graphite-glass:graphite-glass`.
- Sets BB's color tokens for both `.light` and `.dark`.
- Adds no settings, commands, or UI.

Pair it with [Thread View](../thread-view) for the full look; each works on its own.

## Build and install

```sh
npm ci
npm run typecheck
npm run build
bb plugin install . --yes
bb theme set plugin:graphite-glass:graphite-glass
```

To go back to BB's default theme: `bb theme set default`.

Requires BB >=0.46 and Plugin SDK >=0.6.37. The theme sets only BB's public theme tokens.
