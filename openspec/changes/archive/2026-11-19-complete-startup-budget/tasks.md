# Tasks

## 1. Benchmark

- [x] 1.1 Add `packages/bench/src/complete-timing.ts` with its unit test, the
      `bench:complete` task in `packages/bench/mise.toml` and the root
      `mise.toml` forwarder, and prepend the timing to `bench:smoke`; verify
      with `mise run bench:complete` reporting a median against the budget
- [x] 1.2 Run the benchmark and record the median in the proposal's
      `## Benchmarks`; verify the median is under the 1500 ms budget
- [x] 1.3 Add the advisory `ci-bench-complete` job to
      `.github/workflows/ci.yml`, outside `ci-gate`'s `needs`; verify it is
      absent from `ci-gate`'s `needs` list

## 2. Lazy startup guard

- [x] 2.1 Add `apps/cli/test/unit/commands/complete-lazy.test.ts` asserting the
      module and package set of `__complete`; verify it passes against the
      current tree

## 3. Docs

- [x] 3.1 Document the timing in `docs/bench.md` and add the task to
      `.agents/shared.md`, then run `mise run agents:sync`; verify
      `mise run agents:check` passes. The archive commit follows this one
