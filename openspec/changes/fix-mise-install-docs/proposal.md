## Why

Users following the documented `mise use github:aligned-team/cospec` install
snippet can hit two confusing failures right after a fresh release: (1) a
just-cut release doesn't resolve as "latest" because mise's github backend
applies a default release-age cooldown (`minimum_release_age`), and (2) a
partial version like `@0.4` 404s with a misleading npm-scoped-looking URL
(`aligned-team/cospec@0.4`) because mise tries several fallback tag candidates
and surfaces the last, least helpful one in its error. Both are mise-client
behaviors, not defects in this repo's tags or release assets, but the docs give
users no way to know that or work around it.

## What Changes

- `README.md` — add a note next to the `mise use github:aligned-team/cospec`
  snippet about the release-age cooldown and recommend pinning the exact 3-part
  version (e.g. `@0.4.0`) to test a just-shipped release.
- `apps/cli/README.md` — same note next to its copy of the install snippet.
- `docs/release.md` — same note, plus a mention that mise only accepts exact
  3-part version pins (`v{major}.{minor}.{patch}`), not partial versions like
  `@0.4`.

## Impact

Readers of the top-level README, the CLI package README, and the release docs
page — no code, workflow, schema, or tag/asset changes. Purely additive
clarification next to an existing documented command.
