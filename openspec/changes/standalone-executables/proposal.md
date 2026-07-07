## Why

cospec is an npm package that MUST NOT be bun-exclusive: consumers on Node,
Deno, or Bun — or with no JS runtime at all, via mise — must be able to install
and run it. Today the published bin is `#!/usr/bin/env bun` importing
TypeScript, which fails on any machine without bun; both the npm package and the
GitHub release assets need to ship standalone `bun build --compile` executables
instead.

## What Changes

- `apps/cli/bin/cospec.js` becomes a runtime-agnostic launcher (plain JS, no
  deps) that resolves the installed platform binary and execs it.
- New per-platform package templates under `apps/cli/npm/<platform>/` for
  linux-x64-gnu, linux-x64-musl, linux-arm64-gnu, linux-arm64-musl, darwin-x64,
  darwin-arm64, win32-x64. Linux is libc-split (`libc` fields, oxlint/swc
  pattern) because bun's builds are empirically not cross-libc portable: the
  glibc build fails on Alpine and the "musl" build is not static (fails on
  Debian/Ubuntu; needs the musl loader + libstdc++).
- `apps/cli/package.json` gains `optionalDependencies` pinning the seven
  platform packages; drops `src` from `files`; `engines` de-bun-locked.
- `.github/workflows/release.yml` assembles + publishes the platform packages,
  renames release archives for mise github-backend autodetection, and smoke
  tests a Node-only (bun-less) install.
- `scripts/mise-tasks/release/set-version` stamps every platform manifest and
  the main package's optional-dependency pins.
- `apps/cli/src/cli.ts` command dispatch switched to a static import map so
  `bun build --compile` bundles every subcommand into the binary (the computed
  import path silently dropped them, leaving a binary that ran only
  `--version`/`--help`).
- README quickstarts (root + `apps/cli`) and `docs/release.md` updated.
- New bun-less pack smoke gating the "not bun-exclusive" contract.

## Impact

- Build: `apps/cli/mise.toml`, `.github/workflows/release.yml`.
- Install/run: `apps/cli/package.json`, `apps/cli/bin/cospec.js`,
  `apps/cli/npm/**`, `apps/cli/src/cli.ts`.
- Release: `scripts/mise-tasks/release/set-version`, `docs/release.md`.
- Tests: `apps/cli/test/integration/*pack*`, `e2e/release/set-version.test.ts`.

## Surfaces

- [x] interactive — the `cospec` launcher + compiled binary are the user-visible
      CLI entrypoint; a bun-less install must actually dispatch a real
      subcommand.
- [x] deploy — release/publish topology changes: eight npm packages, renamed
      GitHub release assets for mise autodetection, Node-only publish smoke.
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
