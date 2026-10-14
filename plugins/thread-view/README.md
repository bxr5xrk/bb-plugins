# Thread View

A BB plugin for the thread screen: a wider chat column, reply typography tuned to the Claude desktop rhythm, and a compact prompt box with quiet Send controls.

## Behavior

Chat:

- On screens 768px and wider, widens the thread column and the prompt box from 760px to 1100px, and sent messages from 70% to 85% of the column.
- Sets reply text (`[data-markdown-preview]`) to the system font at 14/20 with antialiased smoothing, and a slightly warmer foreground in dark mode.
- Caps paragraphs, lists, quotes, and headings at 76ch so lines stay readable in the wider column.
- Adds more space between paragraphs, lists, list items, and headings; lightens bold to 600; shrinks inline code relative to the text.
- Colors links blue with a soft underline, and inline code red on a faint outlined chip, in the Claude desktop palette.

Prompt box:

- Gives `[data-promptbox]` an 82% opaque background with a backdrop blur, an 18px radius, a soft border, and a shadow, with separate light and dark tokens.
- Makes Send and its menu transparent icon buttons that tint on hover instead of a filled accent button.
- On screens 768px and wider, removes the editor's minimum height and tightens the editor and action-row padding.

Adds no settings, commands, or UI. Disabling the plugin returns to BB's native thread screen.

The styles ship as `app.css`, which BB keeps loaded while the plugin's content script is registered. The rules are unlayered, so they win over BB's Tailwind utilities.

## Build and install

```sh
npm ci
npm run typecheck
npm run build
bb plugin install . --yes
```

After edits, run `npm run build && bb plugin reload thread-view`. To disable: `bb plugin disable thread-view`.

Requires BB >=0.46 and Plugin SDK >=0.6.37. The rules target BB's markdown, timeline, layout, and `data-promptbox*` markup, which is not a public API; `scripts/check-selectors.mjs` watches it on every BB release.
