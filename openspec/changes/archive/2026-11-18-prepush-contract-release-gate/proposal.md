# Proposal

## Why

The pre-push hook ran the unit and integration tests a branch reaches but left
the contract suite to CI, so a push never exercised the contract tests its
change affects. It also measured the change against a fixed `origin/main` rather
than against what the push changes: a stacked branch retested its whole base,
and a second push to a branch retested what the first had pushed. The release
workflow changed more than intended in `scope-checks-to-changes`: it refused a
dispatch from any ref but `main`, re-ran the whole CI workflow (about an hour)
before the bump, and failed if `main` moved meanwhile, although `main`'s own
push CI already runs every suite whole on every commit. And `profiles.test.ts`
imported `cli.ts` to stand for "the copy of `src` it runs", which put its 8
minutes in every `src` change's selection, though it runs only `update` from
that copy.

## What Changes

- `hk.pkl`: pre-push runs the unit, integration and contract tests the push's
  changes reach (still a whole suite for a change outside the import graph). For
  each pushed ref, the change is its diff from the sha the remote has for it,
  or, for a new branch, from the newest commits the remote already has (on a
  stacked branch, the branch it was cut from); a deleted ref changes nothing.
  git hands the hook the remote and the refs, and hk passes them to the step
  (`hook_args`, `hook_stdin`, on its stdin). hk's own `{{files}}` (its
  `files_list`) leaves deleted files out, so the step does not use it.
  Pre-commit runs the unit tests the staged changes reach.
- `apps/cli/test/fixtures/test-scope.ts` + `run-changed.ts`: the change is a
  file list (`stagedFiles`, `pushedFiles`, `changedFiles`), and the runner
  selects the test files whose import graph reaches it (`testsReaching`, by the
  rules `bun test --changed` follows), since `bun test --changed` takes only a
  ref, never a file list. `--staged` and `--push` join `--base`.
- `.github/workflows/release.yml`: back to its form before
  `scope-checks-to-changes` (any-ref dispatch; `bump` builds on `main`'s head),
  plus one step in `bump`. It refuses unless `main`'s own CI passed for the
  commit it checked out, read from that commit's `ci-gate` check run
  (`checks: read`).
- `.github/workflows/ci.yml`: no `workflow_call` trigger, and the concurrency
  group back to `ci-${{ github.ref }}`; nothing calls it now.
- `apps/cli/test/contract/profiles.test.ts` drops its `cli.ts` import (it
  already imports `update`), and its `SOURCE_READERS` entry in
  `support-test-scope.test.ts` names `src/commands/update.ts`.
- `docs/release.md` (restored, plus the gate), `CONTRIBUTING.md`,
  `.agents/shared.md` (synced into `CLAUDE.md` / `AGENTS.md`).

## Impact

- A push now runs the unit, integration and contract tests its own changes
  reach; a change to canon or the CLI's boot path runs the whole contract suite
  (about 20 minutes locally).
- A release no longer waits an hour or races `main`. It refuses a `main` head
  whose `ci-gate` is still running or failed (dispatch again once green). The
  bump job gains `checks: read`. Required checks are unchanged.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [x] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
