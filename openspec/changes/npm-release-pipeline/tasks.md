## 1. Compute-only config

- [x] 1.1 Add `cog.toml` (compute-only, 11 cospec commit types,
      `tag_prefix = "v"`)
- [x] 1.2 Add `communique.toml` (accurate cospec context + tone hint,
      `model = "claude-sonnet-5"`)

## 2. set-version script + task

- [x] 2.1 Add `scripts/mise-tasks/release/set-version` (stamps
      `apps/cli/package.json`; `--root` flag; idempotent)
- [x] 2.2 Verify empirically whether a stale `bun.lock` breaks
      `bun install --frozen-lockfile` after a version bump; make the script
      refresh the lockfile if so
- [x] 2.3 Register `release:set-version` mise task in `mise.toml`

## 3. Tests

- [x] 3.1 Add a bun test for `set-version` (stamp + idempotency + rejects bad
      semver)
- [x] 3.2 Register `test:release` mise task and add it to `check`'s `depends`

## 4. Version embedding verification

- [x] 4.1 Empirically verify `bun build --compile` correctly embeds
      `apps/cli/package.json`'s version (test locally); fix in `apps/cli/src/`
      only if broken

## 5. Release workflow

- [x] 5.1 Add `.github/workflows/release.yml` (`version`, `bump`, `build` matrix
      ×5, `stage-npm`, `publish`, `cleanup` jobs), SHA-pinned actions, minimal
      per-job permissions
- [x] 5.2 Run `actionlint` against the new workflow and fix findings

## 6. Docs

- [x] 6.1 Add `docs/release.md` (flow, required secrets, trusted-publishing +
      `--provenance` migration steps) and link it from any docs index

## 7. Verify

- [x] 7.1 `mise run check` passes green

## 8. Review fixes

- [x] 8.1 Reorder `publish`: flip the GitHub draft to published BEFORE
      `npm publish`, making `npm publish` the job's last, irreversible step so
      no fallible step after it can trip `cleanup` into deleting the tag/
      release out from under an already-live npm version; widen `cleanup`'s
      release lookup to match by tag regardless of draft state
- [x] 8.2 Pin `cocogitto` and `communique` as exact-version tools in `mise.toml`
      (`aqua:cocogitto/cocogitto`, `github:jdx/communique`) instead of unpinned
      `mise use -g` in the workflow; regenerate `mise.lock`
