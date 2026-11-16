# Proposal

## Why

`cospec __complete` runs on every Tab press, so its startup is the one cospec
latency a user feels directly. Nothing currently records what that startup costs
or guards the two properties that keep it cheap: loading only the modules
completion needs, and recording no telemetry. A new import in the completion
path, or an eager import in the dispatcher, would slow every keystroke with no
test or report to say so.

## What Changes

This change adds the guard; it does not optimize anything. `__complete` already
loads lazily and its behaviour is untouched.

- A `bench:complete` mise task (`packages/bench/src/complete-timing.ts`) times
  `cospec __complete changes` against this repo's own `openspec/` tree: one
  untimed warm-up, then 20 runs, reporting median, p95, min and max against a
  recorded median budget (`COMPLETE_BUDGET_MS`, 1500 ms for the source entry).
  `bench:smoke` runs it first.
- The timing is advisory: an overrun is printed, written to the GitHub step
  summary and raised as a `::warning::`, but the script always exits 0.
- An advisory `ci-bench-complete` job runs it when a change touches
  `apps/cli/src`, `packages/bench` or the toolchain pins (the `complete_bench`
  changes output), with `continue-on-error` and deliberately outside `ci-gate`'s
  `needs`.
- A unit test in `apps/cli` walks the static import graph from the entry point
  and from `commands/complete.ts` and asserts no other command, renderer, rule
  module or telemetry module is loaded, no package outside the parsers is
  loaded. That the dispatcher reaches `__complete` through a lazy import and
  that no command module reaches `cli.ts` are already guarded by the
  support-test-scope tests.
- A new `cospec-shell-completion` requirement records the startup budget.
- `docs/bench.md` documents the timing and its environment variables, and
  `.agents/shared.md` lists the new task.

## Benchmarks

This change introduces the measurement rather than an optimization, so there is
no before/after speedup: there was no prior number and the code path is
unchanged.

| metric                                                     | how measured                                                               | result                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------- |
| median wall-clock of `cospec __complete changes` (20 runs) | `mise run bench:complete`, source entry under Bun 1.4.4, local macOS arm64 | 584 ms (p95 651 ms), budget 1500 ms |

The 1500 ms budget is a recorded ceiling with headroom for shared CI runners,
not a target the code was tuned to.

## Capabilities

### New Capabilities

### Modified Capabilities

- `cospec-shell-completion`: adds the requirement that `__complete` stays inside
  a recorded, advisory startup budget.

## Impact

- `packages/bench/src/complete-timing.ts`, `packages/bench/mise.toml`, root
  `mise.toml` (the `bench:complete` forwarder)
- `apps/cli/test/unit/commands/complete-lazy.test.ts`
- `.github/workflows/ci.yml` (`ci-bench-complete`, outside `ci-gate`)
- `docs/bench.md`, `.agents/shared.md`, and the `CLAUDE.md`/`AGENTS.md` copies
- No CLI behaviour, flags, exit codes or schemas change.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [x] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
