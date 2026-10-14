# Glass Composer

A BB plugin that restyles the prompt box: translucent glass with rounded corners, a shorter editor, and a Send button that matches the other quiet icon controls.

## Behavior

- Gives `[data-promptbox]` a translucent background, 18px radius, soft shadow, and backdrop blur, with separate light and dark tokens.
- Makes Send and its menu transparent icon buttons that tint on hover instead of a filled accent button.
- On screens 768px and wider, removes the editor's minimum height and tightens the editor and action-row padding.
- Adds no settings, commands, or UI. Disabling the plugin returns to BB's native composer.

The styles ship as `app.css`, which BB keeps loaded while the plugin's content script is registered. The rules are unlayered, so they win over BB's Tailwind utilities without `!important`.

## Build and install

```sh
npm ci
npm run typecheck
npm run build
bb plugin install . --yes
```

After edits, run `npm run build && bb plugin reload composer`. To disable: `bb plugin disable composer`.

Requires BB >=0.46 and Plugin SDK >=0.6.37. The rules target BB's `data-promptbox*` attributes, which are not a public API; `scripts/check-selectors.mjs` watches them on every BB release.
