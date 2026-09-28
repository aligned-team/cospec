# Proposal

## Why

Local `mise run check` ran the contract oracle under whatever Node mise-global
put on PATH (v26 here) while `ci-bun` ran it under the runner image's Node
22.23.2, and most oracle rows ran the pinned binary under Node while the product
runs it under Bun — so a row could pass locally, fail in CI, and compare cospec
against a runtime cospec never uses. cospec itself stays node-free at runtime;
the pin is for tests and CI only.

## What Changes

- Pin `node = "22.23.2"` (ci-bun's runner-image Node) in `mise.toml` and lock
  its platform rows in `mise.lock` in the same commit.
- `apps/cli/test/contract/support/upstream-oracle.ts` spawns the pinned binary
  the way `core/openspec.ts` does: `process.execPath` (Bun) with
  `buildWrappedSpawnEnv` over the sandbox env. `{ runtime: 'node' }` stays for
  the rows that deliver a leading `--`, which Bun drops; every other
  `runtime: 'node'` call site moves to the default.
- Errno rows assert the errno code and the path (or normalise the syscall
  token), never the OS-specific sentence.
- Note the errno-message brittleness in the archived `root-resolution-parity`
  change's `design.md` and `verification.md`.
- `docs/architecture.md` and `.agents/shared.md` (+ `agents:sync`) where they
  state how the oracle runs.
- `test/fixtures/support.ts`'s `openspec()`/`openspecRaw()` run the binary the
  same way, under a private per-run HOME/XDG sandbox (`oracleEnv`, moved there).
- `mise.lock` records a `sha256` for every shellcheck and taplo platform row, so
  a fresh `mise install` leaves it byte-identical.
- `errnoShape` compares whether a path is present as well as its value, and the
  `resolverRead` comment and `stores.md` state the EISDIR text Bun prints.

## Impact

- `mise.toml`, `mise.lock`; the contract-test oracle and the rows that call it;
  `docs/architecture.md`, `.agents/shared.md`, `CLAUDE.md`, `AGENTS.md`; the
  archived `root-resolution-parity` design and verification artifacts.
- No user-facing behaviour changes. `apps/cli/src/core/root.ts` changes a
  comment only, and `apps/docs/concepts/stores.md` rewords why a failed `read`
  names no path (its example message is unchanged), so both state what holds
  under Bun, the runtime cospec runs the binary in.
