## 1. State-C re-init resyncs an already-adopted gate [critical]

- [x] 1.1 @regression (agent) on a state-C fixture repo whose mise.toml already has [tasks."cospec:apply"], run plain `cospec init` (no --gate) before and after this fix -> confirmed: apps/cli/test/unit/init/init.test.ts "state C re-init resyncs an already-adopted gate with no --gate flag" and apps/cli/test/integration/gate.test.ts "state-C re-init with an already-adopted gate resyncs it with no --gate flag" (real binary) both pass post-fix — gate merge runs, --json gate is non-null with mise.status merged/unchanged.
- [x] 1.2 @unit (agent) init.test.ts — state C, mise.toml has a cospec: task, plain init -> pass: hk.pkl/commitlint.config.mjs written, mise merge idempotent on re-run, --json gate.mise.status in {merged, unchanged}.
- [x] 1.3 @unit (agent) init.test.ts — gateAlreadyPresent(cwd) true for a mise.toml with [tasks."cospec:validate"], false for one with only unrelated tasks keys or no tasks table -> pass: covered by the init.test.ts cases above — an adopted-gate mise.toml resyncs (gateAlreadyPresent true) and a non-adopted mise.toml prints the hint and stays untouched (gateAlreadyPresent false).

## 2. A missing gate is never silent

- [x] 2.1 @unit (agent) init.test.ts — state C, mise.toml exists with no cospec: task, no --gate/--no-gate flag -> pass: apps/cli/test/unit/init/init.test.ts "state C re-init with no adopted gate prints a hint and touches nothing gate-related" — hint line printed verbatim, mise.toml byte-for-byte unchanged, no hk.pkl/commitlint.config.mjs created.
- [x] 2.2 @unit (agent) same scenario with --json -> pass: same test — json.gate === null, no other field present.

## 3. Every real write is reported

- [x] 3.1 @unit (agent) init.test.ts — exists-but-empty mise.toml + --gate -> pass: apps/cli/test/unit/init/init.test.ts "exists-but-empty mise.toml + --gate: template written and reported as a write" (text receipt) and its --json variant — mise.toml written to disk, 'Gate: wrote' line and --json gate.written both list mise.toml.

## 4. Per-command --help shows that command's own flags

- [x] 4.1 @unit (agent) cli.test.ts — `cospec init --help` output contains --gate, --no-gate, --harness, --yes, --force, --remove-opsx -> pass: apps/cli/test/unit/cli.test.ts "init --help lists its own flags, not just the global options".
- [x] 4.2 @manual (human) spot-check validate/archive/store/schema --help text against apps/docs/reference/commands.md for accuracy -> matches: cross-checked usage/options for init, update, new, validate, status, list, instructions, apply, archive, sync-blockers, store, context, workset, show, schema against apps/docs/reference/commands.md's flags column and each command module's own flag-parsing code; no discrepancies found.

## 5. help token never mutates state [critical]

- [x] 5.1 @e2e (agent) bare `cospec <command> help` produces identical output/exit-code to `cospec <command> --help` for at least one state-mutating command, and performs no filesystem writes -> pass: apps/cli/test/unit/cli.test.ts "`cospec archive help` never runs archive (mutates nothing, matches --help)" — output byte-identical to --help, exit 0, no "archived" text, no filesystem writes.
- [x] 5.2 @unit (agent) init.test.ts — `cospec init help` -> pass: apps/cli/test/unit/init/init.test.ts "cospec init help: exit 1, no ./help directory created, no other write".

## 6. Real-binary gate parity

- [x] 6.1 @integration (agent) gate.test.ts — real pinned OpenSpec binary, state-C repo with an adopted gate, re-init with no --gate -> pass: new case in apps/cli/test/integration/gate.test.ts, run via `mise run test:integration` (92 pass / 0 fail overall) — merge runs, exit 0, second re-init byte-identical.

## 7. Full suite and drift gates

- [x] 7.1 @unit (agent) `mise run check` (lint, format, typecheck, unit, contract, integration, pack smoke, generate:check, agents:check) -> all green: `mise run check` passed (lint, format:check, typecheck, test 538/538, test:contract 29/29, test:integration 92/92, test:release 14/14, generate:check no drift, vendor:openspec:check, agents:check, cospec-validate-all, openspec:schema:validate). `mise run test:pack` also run separately (2/2 pass) since pack smoke is not wired into the `check` mise task.

## 8. Docs stay in sync

- [x] 8.1 @manual (human) apps/docs/guide/installation.md documents that re-init keeps an already-adopted gate synced, and that a repo without the gate sees the new hint -> present and accurate: apps/docs/guide/installation.md "Scaffolding a project" section documents the resync-by-default behavior and the hint text verbatim.
- [x] 8.2 @manual (human) apps/docs/reference/commands.md global-flags section documents `cospec <command> help` == `cospec <command> --help` -> present: apps/docs/reference/commands.md documents `cospec <command> help` == `cospec <command> --help` directly under the Global flags table.
