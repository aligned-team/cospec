## Why

`jdx/mise-action` detects `mise.lock` and runs `mise install --locked`, but the
lockfile was generated on `macos-arm64` and carries no platform URLs for the six
aqua-backed tools (`cli/cli`, `jdx/hk`, `jdx/usage`, `koalaman/shellcheck`,
`rhysd/actionlint`, `tamasfe/taplo`). Every Linux CI job fails at tool install
with "No lockfile URL found ... on platform linux-x64 (--locked mode)" (run
28751398579).

## What Changes

- `mise.lock` — populate `linux-x64`, `linux-arm64`, and `macos-arm64` platform
  URLs + checksums for the six aqua tools via `mise lock`.
- `mise.lock` — drop the stale bare-alias blocks `[[tools.hk]]` (v1.45.0),
  `[[tools.oxfmt]]` (0.51.0), and `[[tools.oxlint]]` (1.66.0). These are
  orphaned short-name aliases; `mise.toml` references the full backend keys
  (`aqua:jdx/hk` 1.48.0, `npm:oxfmt` 0.56.0, `npm:oxlint` 1.71.0), which have
  their own correct entries. `mise lock` also pruned three unreferenced entries
  (`npm:@commitlint/*`, `pkl`).

## Impact

- Files: `mise.lock` only. No workflow, tool version, or `--locked` semantics
  change — `.github/actions/setup-mise` and `mise.toml` are untouched.
- Jobs: unblocks tool install for `ci-bun`, `ci-openspec`, `ci-shell`, and
  `ci-actions-lint` (all Linux runners).
- Secrets/required checks: none affected.
