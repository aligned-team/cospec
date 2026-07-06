## Why

The archived change `2026-07-05-fix-pre-push-gate-empty-remote` has two markdown
files whose prose wrapping predates the current oxfmt (0.56.0) and no longer
passes `oxfmt --check`. This surfaced once the lockfile/schema fixes let CI
reach (and this PR's `mise.toml` edit triggers) the `ci-bun` `format:check`
step.

## What Changes

- Apply `oxfmt` (proseWrap always, printWidth 80) to
  `openspec/changes/archive/2026-07-05-fix-pre-push-gate-empty-remote/proposal.md`
  and `tasks.md`. Line rewrapping only.

## Impact

- No behavior change: archived documentation prose is rewrapped; no code, task,
  or spec content is altered. Unblocks `format:check`.
