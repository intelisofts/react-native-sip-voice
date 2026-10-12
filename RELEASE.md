# Releasing

Published to npm as [`react-native-sip-voice`](https://www.npmjs.com/package/react-native-sip-voice).

Release from `main`, with a clean working tree.

1. **Changelog.** Add a section for the new version at the top of `CHANGELOG.md`. Write what changed for someone using the package, not the commits.
2. **Check.** `npm run typecheck && npm test`
3. **Bump.** `npm version patch` (or `minor` / `major`) — writes `package.json`, commits, and tags `vX.Y.Z`. The version in `CHANGELOG.md` must match.
4. **Push.** `git push --follow-tags`
5. **Publish.** `npm publish` — `prepack` runs `npm run build`, so `build/` and `plugin/build/` are compiled from the tagged source. `publishConfig` in `package.json` already sets public access and the npmjs registry.
6. **Release notes.** `gh release create vX.Y.Z --notes-file -` with the changelog section, if you want one on GitHub.

## Versioning

- **patch** — fixes, landmark data, docs.
- **minor** — new API, new option, or a default that changes behaviour.
- **major** — a removed or renamed export, or a required option.

Native changes ship inside the same package (`ios/`, `android/src`), so they follow the same numbering — but an app has to rebuild to get them, not just reinstall. Say so in the changelog when a release needs a native rebuild.

## What ships

`files` in `package.json` is the allowlist: `build`, `src`, `ios`, `android/src`, `android/build.gradle`, `plugin/build`, `app.plugin.js`, `expo-module.config.json` — tests and mocks excluded. `src` is included on purpose: the `react-native` entry points at `src/index.ts` so Metro transpiles from source.

To see the exact tarball without publishing:

```
npm pack --dry-run
```

If a file is missing from that list, it is missing from the package — add it to `files`.

## Landmark data

Regenerated, not hand-edited. See the README for the scripts in `scripts/`, and regenerate `ATTRIBUTION.md` in the same commit when images change.
