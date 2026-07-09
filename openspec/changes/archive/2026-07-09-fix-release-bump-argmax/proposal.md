## Why

The v0.4.0 release run failed in the `bump` job's version-bump commit step with
`jq: Argument list too long` (exit 126). The step correctly keeps each
individual file's contents off jq's argv via `--rawfile`, but then re-aggregates
all of those file-change objects into a single `ADDITIONS` shell variable and
passes it back onto argv via `jq -n --argjson additions "${ADDITIONS}"` — as
`bun.lock`'s base64-encoded contents grow, that aggregated JSON alone can exceed
`ARG_MAX`.

## What Changes

- `.github/workflows/release.yml` — `bump` job, "Commit the version bump via the
  GitHub API" step: write the aggregated additions array straight to a temp file
  (`additions.json`) instead of a shell variable, and build the GraphQL payload
  with `jq --slurpfile additions additions.json` instead of
  `--argjson additions "${ADDITIONS}"`.
- Same step: write the payload to a temp file and invoke
  `gh api graphql --input <file>` instead of
  `echo "${PAYLOAD}" | gh api graphql --input -`, so the payload never
  round-trips through a shell variable either.
- Update the step's comment to describe the file-based aggregation instead of
  the shell-variable one it replaces.

## Impact

- Workflow: `.github/workflows/release.yml`, `bump` job only.
- No secrets, permissions, or required-check names change.
- Behavior preserved exactly: idempotent skip-if-clean, error handling on
  GraphQL errors, and the `sha` output are unchanged — only how the payload is
  assembled and delivered to `gh api graphql`.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [x] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
