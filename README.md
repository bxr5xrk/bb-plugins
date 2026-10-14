# bb-plugins

Vasyl Dobrovolskyi's [BB](https://getbb.app) plugins, in one repository. Every plugin lives under `plugins/<id>/` as an ordinary plugin package with its own `package.json`, `.bb/plugins.json` indexes them as a collection, and `marketplace.json` lists them as a custom marketplace.

| Plugin | Directory | What it does |
| --- | --- | --- |
| Graphite Glass | [`plugins/graphite-glass`](plugins/graphite-glass) | A neutral graphite palette for light and dark mode with blurred sticky headers. |
| Glass Composer | [`plugins/composer`](plugins/composer) | A compact glass prompt box with quiet Send controls. |
| Chat Reading | [`plugins/chat-reading`](plugins/chat-reading) | A wider chat column and calmer reply typography that reads like Claude desktop. |
| Project Workspace | [`plugins/project-workspace`](plugins/project-workspace) | Project rail with adjacent project Sessions and read-only Explorer, preserving native BB chat. |
| Session Card Layout | [`plugins/session-card-layout`](plugins/session-card-layout) | Current, two-line or one-line session cards in Project Workspace. Requires Project Workspace. |
| Fast Mode Memory | [`plugins/fast-mode-memory`](plugins/fast-mode-memory) | Remembers each thread and model's Fast mode choice across navigation and reloads. |

## Install

Add the marketplace once, then install plugins from **Plugins** in BB or by catalog entry:

```sh
bb marketplace add git:https://github.com/bxr5xrk/bb-plugins.git@main
bb plugin install composer@bxr5xrk
```

Or install one plugin straight from the repository:

```sh
bb plugin install git:https://github.com/bxr5xrk/bb-plugins.git@main --plugin composer
```

Or pin a semver range over that plugin's release tags:

```sh
bb plugin install git:https://github.com/bxr5xrk/bb-plugins.git@^0.1.0 --subdirectory plugins/composer --tag-prefix composer/
```

Graphite Glass ships a theme, so activate it after installing:

```sh
bb theme set plugin:graphite-glass:graphite-glass
```

## Restore everything on a new machine

```sh
for id in graphite-glass composer chat-reading project-workspace session-card-layout fast-mode-memory; do
  bb plugin install git:https://github.com/bxr5xrk/bb-plugins.git@main --plugin "$id" --yes
done
bb theme set plugin:graphite-glass:graphite-glass
```

To work on a plugin locally, install its directory instead: `bb plugin install ./plugins/<id> --yes`, then `npm run build && bb plugin reload <id>` after each edit. Installing a new path over an existing plugin keeps its settings; `bb plugin remove` deletes them.

## Releases

Each plugin is versioned and tagged on its own as `<id>/vX.Y.Z` (for example `composer/v0.1.0`). Bump the plugin's `package.json` version, commit, then tag that commit with the matching prefix and push the tag.

## Development

Each plugin directory is self-contained: run `npm ci` inside it, then `npm run typecheck`, `npm test`, or `npm run build` as its `package.json` defines. `npm run build` needs the `bb` CLI (`npm install --global bb-app`).

## When BB updates

Graphite Glass only sets theme tokens, which BB supports through `bb.themes`. The other appearance plugins style BB's own DOM, and Project Workspace also hides and drives parts of BB's shell. BB has no stable contract for that markup, so a release can rename an attribute or class and quietly undo a style.

[`scripts/check-selectors.mjs`](scripts/check-selectors.mjs) lists every BB attribute, test id, and class name the plugins depend on and looks each one up in the published `bb-app` bundle:

```sh
node scripts/check-selectors.mjs            # latest bb-app on npm
node scripts/check-selectors.mjs 0.47.0     # a specific version
node scripts/check-selectors.mjs /Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/app/dist/assets
```

CI runs it, together with typecheck, tests, and a build of every plugin against the latest `bb-app`, on every push and every Monday. A red `selectors` job names the plugin and the selector that disappeared; find its replacement in the new bundle, update the plugin CSS and the list, and release a patch.

## License

[MIT](LICENSE).
