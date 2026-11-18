# Proposal

## Why

The process asked for `mise run check` (about 35 minutes, 29 of them the
contract suite) before every commit because the hooks tested nothing: pre-commit
ran linters on staged files, pre-push ran the same linters, and typecheck and
the tests sat behind an opt-in `slow` profile no default install wires. Pull
request CI ran every suite whole whatever changed, yet skipped tests entirely on
a PR that touched only canon YAML, fixtures, docs or the bench and e2e packages;
the bench unit tests and the release-script test ran in no CI at all, and a
release ran none of the suites.

## What Changes

- `apps/cli/test/fixtures/test-scope.ts` + `run-changed.ts`, task `test:changed`
  (`apps/cli/mise.toml`, root alias in `mise.toml`): per suite, Bun's
  `bun test --changed=<merge-base>` selection, or the whole suite when a change
  sits outside the import graph — the CLI's boot path (`src/index.ts` without
  the command registry), the test preload, or a non-module file not in that
  suite's `UNREAD` list.
- `apps/cli/test/fixtures/isolate-machine-state.ts`: the preload's spawn wrapper
  refuses a CLI spawn from an apps/cli test file whose imports never reach the
  dispatched command's module (`assertSpawnSelectable`).
- `apps/cli/test/fixtures/isolate-machine-state.ts` + `machine-isolation.ts`:
  the preload also removes git's repository variables
  (`git rev-parse --local-env-vars`). A hook exports them for this repository,
  and now that the hooks run tests, a test's `git init` in its temporary
  repository re-initialized this one as bare until they were removed.
- `apps/cli/test/contract/*.test.ts`, `apps/cli/test/integration/*.test.ts`:
  each file that spawns the CLI imports the module of every command it runs.
- Unit and contract tests that read source through fs (`no-tool-branches`,
  `no-legacy-parser`, `scenario-gate`, `views`, `change`, `profiles`) import
  what they read, and `support-test-scope.test.ts`'s `SOURCE_READERS` lists
  every test that builds a path into `src`, failing on an unlisted one or one
  whose imports miss what it reads. `RUN_NOT_IMPORTED` runs the integration
  suite whole for a launcher (`apps/cli/bin`) change, which the pack tests run
  from the tarball rather than import.
- `apps/cli/test/unit/support-test-scope.test.ts`,
  `support-test-scope-dispatch.test.ts`: the selection rules, the guard, and the
  guard's argv reading held to the real dispatcher.
- `hk.pkl`: pre-commit adds typecheck and the unit tests the staged changes
  reach; pre-push runs the linters, typecheck, and the unit and integration
  tests since the branch left `origin/main`. The `slow` profile and
  `scripts/hooks/pre-push-gate` are removed.
- `.github/workflows/ci.yml`: `ci-bun` runs on every event; on a pull request
  the contract and integration suites run the `test:changed` selection against
  the PR's base (the unit suite stays whole for its coverage gate); pushes to
  `main`, the merge queue and `workflow_call` run every job and every suite
  whole. Adds the bench unit tests and the release-script test; the concurrency
  group includes the workflow name. `workflow_call` takes no ref input: a called
  run checking out a ref its caller chose would run that code with the default
  branch's cache (CodeQL's cache-poisoning rule).
- `.github/workflows/release.yml`: `version` refuses a dispatch from anything
  but `main`; a `check` job calls `ci.yml` on the dispatched commit; `bump`
  needs it and builds on exactly that commit.
- `.agents/shared.md` (synced into `CLAUDE.md` / `AGENTS.md`),
  `CONTRIBUTING.md`, `docs/release.md`: the new process.

## Impact

- `ci-bun` no longer skips: every PR runs lint, format, typecheck, the unit
  suite, the selected contract and integration tests, the bench and release
  tests, the vendor drift gate and the pack smoke. Required checks (`ci-gate`,
  PR title) are unchanged.
- Pushes to `main` and the merge queue run every job regardless of paths.
- A release waits for a full CI run (about 40 minutes) before the bump commit,
  and fails clean if `main` moves in the meantime; `check` needs
  `pull-requests: read`, granted on that job only.
- No secrets change.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [x] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
