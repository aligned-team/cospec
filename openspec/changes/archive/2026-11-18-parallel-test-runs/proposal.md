# Proposal

## Why

The contract suite took about 43 minutes in CI, and every suite ran its files
one at a time. Bun's `--parallel` (a worker per core, each file in a fresh
global with its preload re-run and `process.env` restored) cut the local runs by
2.6× on 12 cores, and every suite passes under it as-is. On CI's 4-core runner
it did not help: the contract suite went from 43 to 34 minutes and a test timed
out, since every test spawns the pinned binary and the suite is CPU-bound. CI
needs more runners, not more workers.

## What Changes

- Local runs go parallel: the `test`, `test:contract` and `test:integration`
  tasks in `apps/cli/mise.toml` and `run-changed.ts` (the hooks' selection) pass
  `--parallel`. `mise run check` runs the suites one after another through a new
  `check:tests` task, since side by side they would oversubscribe the cores. The
  bench suite stays serial: its perf rows time code, and timed out under that
  load.
- `run-changed.ts` takes `--no-parallel`, and passes what follows `--` to every
  `bun test` run it starts.
- `.github/workflows/ci.yml` runs test files one at a time. The contract suite
  moves out of `ci-bun` into `ci-contract`: four matrix jobs, each running
  `bun test --shard=<n>/4` over the whole suite (on `main` and in the merge
  queue) or over the pull request's selection. Bun cuts the shards by the
  per-file durations that `main`'s last run recorded (`--timings`). Each shard
  of a `main` run writes its own files' durations (`--update-timings`), and
  `ci-contract-timings-save` stores them in the Actions cache.
  `ci-contract-timings` looks up a single cache entry that every shard of a run
  restores, so the slices always add up to the suite. `ci-gate` requires
  `ci-contract` to succeed.
- `test/contract/profiles.test.ts` took 12 minutes in CI, longer than a whole
  shard should. It splits into `profiles-init`, `profiles-update-doctor` and
  `profiles-matrix-1` to `-4`, over two support modules (`support/profiles.ts`,
  `support/profile-matrix.ts`). Each matrix part runs every fourth harness row.
  Its `FS_READERS` entry moves to `profiles-init.test.ts`.
- `CONTRIBUTING.md`, `.agents/shared.md` (synced into `CLAUDE.md` and
  `AGENTS.md`), and the comments in `apps/cli/mise.toml` and `hk.pkl` explain
  the local and CI rules.

## Impact

- Locally (12 cores): unit goes from 77 s to 32 s, integration from 240 s to 66
  s, and contract from 21 minutes to 8.
- In CI, bun's time cut of the last sequential run's per-file durations puts the
  four shards at 605, 691, 780 and 498 s: about 13 minutes at most, against 43
  for the single contract step before, and about as long as `ci-bun` takes once
  that step leaves it. Runs before `main` has recorded any durations cut the
  shards by file count instead.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [x] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
