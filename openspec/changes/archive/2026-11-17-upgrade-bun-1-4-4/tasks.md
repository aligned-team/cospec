# Tasks

## 1. Toolchain pins and lockfiles

- [x] 1.1 Bump `bun` to 1.4.4 in `mise.toml`, drop the `tsgo` and `oxfmt` pins,
      and regenerate `mise.lock` (`mise lock bun`, then prune the two stale
      entries); verify `mise lock --dry-run` has nothing left to prune.
- [x] 1.2 Bump `bun-types` to 1.4.4 in the three manifests and the root
      `engines.bun` to `>=1.4.4`; regenerate `bun.lock` with Bun 1.4.4 and
      verify `bun install --frozen-lockfile` passes.

## 2. Type checking, formatting and linting

- [x] 2.1 `typecheck` runs `bun check` (the workspace `typecheck` scripts and
      `-p e2e/tsconfig.json`); verify it passes on all three projects and fails
      on a planted type error.
- [x] 2.2 `format:check` / `format:fix` and the hk formatter step run `bun fmt`;
      reformat the files where `bun fmt` and oxfmt 0.56 disagree (whitespace
      only) and verify a second `bun fmt --check .` passes.
- [x] 2.3 Move the formatter config into `bunfig.toml`'s `[fmt]`
      (`.oxfmtrc.json` options, `.prettierignore` as `ignorePatterns`,
      `flavor = "oxfmt"`) and delete both files; in a copy with no parent
      config, verify `bun fmt --doctor` reads only `bunfig.toml`, the file set
      is unchanged, and the only output change is the named-import re-sort.
- [x] 2.4 `agents/sync` and `release/set-version` normalise with
      `bun fmt --cwd=<repo root>`; verify `agents:check` passes and
      `set-version` at the current version reports every manifest unchanged.
- [x] 2.5 Port `verification-format.test.ts` to `bun fmt`, with a control case
      proving the formatter ran with the repo config.
- [x] 2.6 Confirm Bun 1.4.4 has no built-in linter and keep oxlint, saying why
      next to its pin in `mise.toml`.

## 3. Generated assets and runtime-sensitive fixtures

- [x] 3.1 Regenerate the vendored openspec bundle with
      `mise run vendor:openspec` and verify `vendor:openspec:check` and
      `generate:check` pass.
- [x] 3.2 Raise the `dedupe` input sizes of the bench `perf` and `perf-hard`
      scenarios (visible `bench/measure.ts` and hidden suites) so the seeded
      implementation misses every threshold again on Bun 1.4.4; verify
      `mise run test:bench` (fail-before / pass-after) passes.
- [x] 3.3 Keep `TZ` out of the test sandbox env now that Bun 1.4's `process.env`
      carries an assigned `TZ` through a spread: drop it in
      `envWithoutColorForcing()` and verify `support-env.test.ts` passes with a
      `TZ` assigned first.

## 4. Docs and verification

- [x] 4.1 Update `.agents/shared.md` (then `mise run agents:sync`),
      `CONTRIBUTING.md`, the CI path filter and the comments that name
      `tsgo`/oxfmt or their config files as this repo's tooling; no `apps/docs`
      page changes, since no user-facing behavior changes.
- [x] 4.2 Verify `mise run check` passes on Bun 1.4.4, plus `mise run test:pack`
      and `mise run test:pack:standalone` (the compiled binary on a bun-less
      PATH). The archive commit follows this one.
