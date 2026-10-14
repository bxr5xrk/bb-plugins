# bb-plugins

Vasyl Dobrovolskyi's [BB](https://getbb.app) plugins, in one repository. Every plugin lives under `plugins/<id>/` as an ordinary plugin package with its own `package.json`, `.bb/plugins.json` indexes them as a collection, and `marketplace.json` lists them as a custom marketplace.

| Plugin | Directory | What it does |
| --- | --- | --- |
| Graphite | [`plugins/graphite`](plugins/graphite) | A neutral graphite palette for light and dark mode with blurred sticky headers. |
| Thread View | [`plugins/thread-view`](plugins/thread-view) | A wider thread with calmer reply typography and a compact prompt box with quiet Send controls. |
| Project Workspace | [`plugins/project-workspace`](plugins/project-workspace) | Project rail with adjacent project Sessions and read-only Explorer, preserving native BB chat. |
| Fast Mode Memory | [`plugins/fast-mode-memory`](plugins/fast-mode-memory) | Remembers each thread and model's Fast mode choice across navigation and reloads. |

## Install

Add the marketplace once, then install plugins from **Plugins** in BB or by catalog entry:

```sh
bb marketplace add git:https://github.com/bxr5xrk/bb-plugins.git@main
bb plugin install thread-view@bxr5xrk
```

Or install one plugin straight from the repository:

```sh
bb plugin install git:https://github.com/bxr5xrk/bb-plugins.git@main --plugin thread-view
```

Or pin a semver range over that plugin's release tags:

```sh
bb plugin install git:https://github.com/bxr5xrk/bb-plugins.git@^0.1.0 --subdirectory plugins/thread-view --tag-prefix thread-view/
```

Graphite ships a theme, so activate it after installing:

```sh
bb theme set plugin:graphite:graphite
```

## Restore everything on a new machine

```sh
for id in graphite thread-view project-workspace fast-mode-memory; do
  bb plugin install git:https://github.com/bxr5xrk/bb-plugins.git@main --plugin "$id" --yes
done
bb theme set plugin:graphite:graphite
```

To work on a plugin locally, install its directory instead: `bb plugin install ./plugins/<id> --yes`, then `npm run build && bb plugin reload <id>` after each edit. Installing a new path over an existing plugin keeps its settings; `bb plugin remove` deletes them.

## Releases

Each plugin is versioned and tagged on its own as `<id>/vX.Y.Z` (for example `thread-view/v0.1.0`). Bump the plugin's `package.json` version, commit, then tag that commit with the matching prefix and push the tag.

## Development

Each plugin directory is self-contained: run `npm ci` inside it, then `npm run typecheck`, `npm test`, or `npm run build` as its `package.json` defines. `npm run build` needs the `bb` CLI (`npm install --global bb-app`).

## When BB updates

Graphite sets theme tokens, which BB supports through `bb.themes`, plus a header blur on one BB class. Thread View styles BB's own DOM, and Project Workspace also hides and drives parts of BB's shell. BB has no stable contract for that markup, so a release can rename an attribute or class and quietly undo a style.

[`scripts/check-selectors.mjs`](scripts/check-selectors.mjs) lists every BB attribute, test id, and class name the plugins depend on and looks each one up in the published `bb-app` bundle:

```sh
node scripts/check-selectors.mjs            # latest bb-app on npm
node scripts/check-selectors.mjs 0.47.0     # a specific version
node scripts/check-selectors.mjs /Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/app/dist/assets
```

CI runs it, together with typecheck, tests, and a build of every plugin against the latest `bb-app`, on every push and every Monday. A red `selectors` job names the plugin and the selector that disappeared; find its replacement in the new bundle, update the plugin CSS and the list, and release a patch.

## License

[MIT](LICENSE).
