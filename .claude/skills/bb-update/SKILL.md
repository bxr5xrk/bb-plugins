---
name: bb-update
description: Check and repair the plugins in this repo after a BB app update. Use when the user says BB updated / "BB оновився" / "перевір плагіни після оновлення", or reports a sidebar, footer, prompt box or theme glitch that appeared after an update.
---

# BB update check

The plugins style and drive BB's own DOM, which has no stable contract. A BB release can move or rename markup and silently break them. Find every breakage yourself; the user only says that BB updated.

## 1. Detect

Run all of these and collect every failure before fixing anything:

```sh
bb --version
bb plugin list            # every plugin from this repo must be `running`
node scripts/check-selectors.mjs /Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/app/dist/assets
node scripts/smoke-bb.mjs # live headless check against the running local BB
node scripts/check-narration-patch.mjs # Thread View patched the installed Claude Code provider
```

- `check-selectors.mjs` only proves a string still exists in the bundle. It passes when BB moves an element elsewhere, so a green result is not enough.
- `smoke-bb.mjs` opens the local BB (`serverUrl` from `~/.bb/bb-app-runtime.json`) in headless Chrome at 1400px and 900px and checks Project Workspace behaviour. Read every screenshot in the printed directory too: it catches visual breakage the checks miss (wrong background, double icons, clipped footer).
- For each plugin from this repo that is not `running`, run `bb plugin logs <id>`.
- Thread View styles and Graphite have no live checks. Rely on `check-selectors.mjs` for them.
- `check-narration-patch.mjs` checks that Thread View patched `provider-claude-code/dist/host.js` (narration shown as agent messages) and that the file still matches `artifactDigest` in `host.meta.json`. With a version argument (`latest`, `0.46.2-nightly...`) it checks a bb-app release from npm before you install it. If it fails, read `bb plugin logs thread-view`: `narration patch: unsupported` means the provider's `extractAssistantText` changed shape, so find it in the new `host.js` and update `EXTRACT_TEXT_PATTERN` and `EXTRACT_TEXT_PATCHED` in `plugins/thread-view/server.ts`.

## 2. Locate the new markup

The host bundle is `/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/app/dist/assets/index-*.js` (minified). Search it around the old selector or a neighbouring string:

```sh
grep -oE '.{400}sidebar-footer-row.{400}' <bundle>
```

When structure matters (positions, stacking, `clip-path`, which element is hidden), inspect the live DOM in headless Chrome against `serverUrl`. Reuse the CDP helpers in `scripts/smoke-bb.mjs`, write the throwaway script outside the repo, and dump `getBoundingClientRect`, `getComputedStyle` and `elementFromPoint` for the elements involved. Do not guess from the bundle alone.

## 3. Fix

- Host-coupled code: `plugins/project-workspace/lib/shell-style.ts` (CSS and the outside-click handler), `plugins/project-workspace/components/workspace-navigation.tsx` (clicks native controls), `plugins/thread-view/app.css`, `plugins/thread-view/server.ts` (the provider patch), `plugins/graphite/themes/`.
- Keep each fix minimal and scoped to the workspace-active `:has(...)` prefix already in use.
- In the plugin directory, run `npm run typecheck`, `npm test`, `bb plugin build .` and `bb plugin reload <id>`.
- Re-run step 1 until everything passes. Look at the screenshots again.
- If a selector changed, update its entry in `scripts/check-selectors.mjs`. If behaviour moved, add or adjust a check in `scripts/smoke-bb.mjs`.

## 4. Report

List what broke, the cause in the new BB markup, what changed, and the final smoke and selector results. Do not commit or bump versions unless the user asks.
