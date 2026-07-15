## Why

PR #24 (commit c9e87a8) taught `cospec init` to additively merge the commit
gate's `mise.toml` template into an existing `mise.toml` instead of only writing
the file when absent. That merge path is unreachable for the most common re-init
case: on a state-C repo (an existing `openspec/` tree), the `gateEnabled`
default in `run()` (`apps/cli/src/commands/init.ts:243-247`) falls through to
`false` unless `--gate`/`--no-gate` is passed, so `scaffoldGate` — and therefore
`mergeMiseToml` — is never called. A repo that already adopted the gate (its
`mise.toml` has `[tasks."cospec:apply"]` and friends) silently drifts out of
sync on every plain re-init, and the receipt prints nothing about the gate at
all because the whole gate block in `printReceipt` is keyed on
`d.gate !== undefined` (`init.ts:416`). Separately, in the branch of
`scaffoldGate` that merges into an _existing_ `mise.toml` (`init.ts:147-153`), a
`mergeMiseToml` result of `'created'` (the file existed but was empty) writes
the template to disk without ever pushing `'mise.toml'` into `written`, so a
real write goes unreported in both the text receipt and the `--json` payload.

Two smaller defects compound the same command's usability: `commandHelpText` in
`apps/cli/src/cli.ts:140-147` renders only `GLOBAL_OPTIONS` for every command,
so `cospec init --help` (and every other command's `--help`) never shows its own
flags — an agent or human has no in-CLI way to discover
`--gate`/`--harness`/etc. And because the dispatcher only intercepts
`--help`/`-h`, a bare positional `cospec init help` is parsed as `resolveTarget`
picking `help` as the target path, quietly scaffolding a directory literally
named `./help` instead of showing help.

## What Changes

- `cospec init` on a state-C re-init now defaults `gateEnabled` to whether the
  target's `mise.toml` already has a gate task (any `tasks` key starting with
  `"cospec:"`), detected via a new `gateAlreadyPresent(cwd)` helper that parses
  `mise.toml` with `Bun.TOML`. `--gate`/`--no-gate` still override explicitly;
  state A keeps defaulting to `true`. A repo that adopted the gate stays synced
  on every re-init; a repo that never adopted it stays opt-in.
- When no gate flag is passed, `state !== 'A'`, and a `mise.toml` exists but
  carries no gate task, `printReceipt` prints one hint line pointing at
  `cospec init --gate` instead of staying silent. The `--json` output keeps
  `gate: null` in that case (no new required field), documented as a deliberate,
  minimal JSON-shape decision.
- The `existsSync` branch of `scaffoldGate` now pushes `'mise.toml'` into
  `written` whenever `mergeMiseToml` reports `status: 'created'` (the file
  existed but was empty), so that write appears in both the text receipt and
  `--json` output like any other write.
- `commandHelpText` renders each command's actual usage and flags — a new
  `usage`/`options` pair on `CommandEntry`, populated for every command that
  takes positionals or flags — followed by the shared `GLOBAL_OPTIONS` block,
  instead of showing only global options for every command.
- `cospec <command> help` (a bare positional `help` immediately after the
  command name) is now treated identically to `cospec <command> --help` at the
  dispatcher level. `init`'s own `resolveTarget` additionally rejects a bare
  `help` positional before any filesystem mutation, even if some other flag
  ordering slips past the dispatcher, so `cospec init help` can never scaffold a
  directory named `./help` again (scaffolding into a directory that is actually
  named `help` still works via the explicit `./help` form).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None — no existing `openspec/specs/**` capability documents the gate-resync
default, the mise.toml write-reporting contract, per-command `--help` content,
or the `help`-token dispatch rule, so these are implementation bugs against
intended behavior, not spec defects. No delta specs are required.

## Impact

- `apps/cli/src/commands/init.ts` — `gateEnabled` default logic, new
  `gateAlreadyPresent`, `scaffoldGate`'s existing-file branch, `printReceipt`'s
  gate-hint line, `resolveTarget`'s `help` guard.
- `apps/cli/src/cli.ts` — `CommandEntry`, `commandHelpText`, the dispatcher's
  bare-`help`-token handling.
- `apps/cli/src/harness/mise-merge.ts` — read-only; no changes (its dotted-key
  TOML `'unparseable'` false positive is a separately tracked follow-up, out of
  scope here).
- `apps/cli/test/unit/init/init.test.ts`, `apps/cli/test/unit/cli.test.ts`,
  `apps/cli/test/integration/gate.test.ts` — new/updated coverage.
- `apps/docs/guide/installation.md`, `apps/docs/reference/commands.md` — kept in
  sync with the corrected behavior (docs-never-drift discipline).
- No schema, endpoint, or external-contract changes; no migration.

## Surfaces

<!-- Check every surface this change touches; each drives a verification/design expectation (soft). -->

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
