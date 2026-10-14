# Chat Reading

A BB plugin that makes agent replies easier to read: a wider chat column and reply typography tuned to the Claude desktop rhythm.

## Behavior

- On screens 768px and wider, widens the thread column and the composer from 760px to 1100px, and sent messages from 70% to 85% of the column.
- Sets reply text (`[data-markdown-preview]`) to the system font at 14/20 with antialiased smoothing, and a slightly warmer foreground in dark mode.
- Caps paragraphs, lists, quotes, and headings at 76ch so lines stay readable in the wider column.
- Adds more space between paragraphs, lists, list items, and headings; lightens bold to 600; shrinks inline code relative to the text.
- Adds no settings, commands, or UI. Disabling the plugin returns to BB's native layout.

The styles ship as `app.css`, which BB keeps loaded while the plugin's content script is registered. The rules are unlayered, so they win over BB's Tailwind utilities without `!important`.

## Build and install

```sh
npm ci
npm run typecheck
npm run build
bb plugin install . --yes
```

After edits, run `npm run build && bb plugin reload chat-reading`. To disable: `bb plugin disable chat-reading`.

Requires BB >=0.46 and Plugin SDK >=0.6.37. The rules target BB's markdown, timeline, and layout classes, which are not a public API; `scripts/check-selectors.mjs` watches them on every BB release.
