# Proposal

## Why

`apps/cli/test/integration/completion.test.ts` syntax-checks each generated
completion script with the real shell, but skips any shell that is not installed
— and fish ships on neither the developer machines nor the `ubuntu-latest`
runner, so the fish leg has never actually run anywhere.

## What Changes

- `.github/workflows/ci.yml` — install fish (alongside bash and zsh) in the
  `ci-bun` job before the test steps, so the fish syntax-check leg executes.
- `.github/workflows/ci.yml` — add a "required completion shells present" step
  that fails the job if `bash`, `zsh`, or `fish` is missing, so the suite can
  never go back to silently skipping a leg on CI.

## Impact

- Workflow: `.github/workflows/ci.yml`, `ci-bun` job only.
- Jobs/required checks: `ci-bun` gains two steps and a small install cost; no
  job names, secrets, or required checks change.
- No application source, specs, or test files are modified.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [x] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
