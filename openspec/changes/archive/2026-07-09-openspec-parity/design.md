## Context

PR 16 (`store-aware-commands`) threaded a `--store <id>` flag through cospec's
change-lifecycle commands but deliberately left OpenSpec's store-management
surface (`store setup`/`register`/`unregister`/`remove`/`list`/`doctor`), the
cross-repo `context`/`workset` commands, and several read-only inspection
commands (`show`, `view`, `schemas`, `schema which`/`validate`, `templates`)
native — reachable only via the bare `openspec` binary. `CLAUDE.md`'s "Route
through cospec" discipline and the "Wrapped-call discipline" section require
every wrapped call to declare expected exit codes, a stdout deny-list, and an
observable post-condition; today's native gap means those guarantees simply
don't exist for this surface, and users fall back to bare `openspec` — the one
thing cospec exists to prevent.

## Goals / Non-Goals

**Goals:**

- Give every remaining native-only OpenSpec command a disciplined cospec wrapper
  (typed exit codes, stdout deny-list, observable post-condition), so no
  everyday operation requires bare `openspec`.
- Reverse PR 16's "store management stays native" split: `store setup`/
  `register` auto-run `cospec init --harness none` on the resolving store root,
  collapsing the documented manual two-step into one command.
- Keep the wrap discipline uniform: introduce one shared `passthroughOpenspec`
  runner rather than ad hoc `spawn` calls per command.

**Non-Goals:**

- No new gate. None of these commands join `apply`'s hard-gate surface; they are
  read-only, personal, or store-lifecycle operations, not change-lifecycle
  gates.
- No custom schema authoring surface (`schema fork`/`schema init` stay unwired —
  conflicts with the canon-managed 11-schema model).
- No cospec-native shell completion or `feedback` command (out of parity scope;
  see the gap-analysis recommendation for why each is skipped).

## Decisions

- **One shared `passthroughOpenspec` runner, not per-command spawn calls.**
  Every new wrap (`store`, `context`, `workset`, `show`, `view`, `schemas`,
  `schema`, `templates`) builds on a single `apps/cli/src/core/openspec.ts`
  primitive with a fixed exit-code allow-list, stdout deny-list, and a
  guaranteed single JSON document on `--json` failure. Rejected alternative:
  hand-roll `spawn`/`spawnOpenspec` per command file — rejected because it would
  re-derive the wrapped-call contract nine times and drift silently (exactly the
  failure mode `docs/architecture.md`'s wrapped-call section warns about).

- **`store setup`/`register` auto-run `cospec init`, not a separate reminder.**
  The value cospec adds over a pure passthrough is closing the loop: a new or
  newly-registered store gets typed schemas in the same command. Rejected
  alternative: print a "next, run `cospec init`" hint and stop there (today's
  behavior, per `docs/stores.md`) — rejected because a printed reminder is
  exactly the footgun this change exists to remove; `--no-cospec-init` preserves
  the escape hatch for callers who want the bare store without cospec's schemas.

- **Bulk/spec validation and modes delegate to `openspec validate`/`list` rather
  than reimplementing spec-bulk rule logic in cospec.** cospec's own rule engine
  is change-centric (schema/apply/blocking-changes/verification); reimplementing
  spec-level and bulk validation would duplicate OpenSpec's own spec parser.
  Rejected alternative: port OpenSpec's spec-validation rules into cospec's rule
  engine — rejected as unnecessary duplication for a passthrough-shaped need.

- **`schema fork`/`schema init` print guidance and exit 1 instead of being wired
  to the binary.** Wiring them would let a user create a schema the `apply` gate
  and rule engine don't understand, silently breaking the
  11-schema/`apply_requires` invariant `commands/new.ts` and the gate depend on.
  Rejected alternative: wrap them read-write like the rest of `schema` —
  rejected because it directly conflicts with the canon-managed schema model
  this repo self-hosts.

- **`workset open` is a terminal-handover exec, not a JSON-returning
  passthrough.** OpenSpec itself rejects `--json` for this subcommand because it
  hands the terminal to an IDE/agent opener; cospec mirrors that by spawning
  with inherited stdio and propagating the child's exit code verbatim, rather
  than trying to force a JSON contract onto a command whose own author designed
  it not to have one.

## Operational surface

These commands run as ordinary CLI subprocess invocations in the same Bun
runtime cospec already runs in — no new bind address, container, or runtime
topology. `store setup`/`register`/`unregister`/`remove` and the
auto-`cospec init` step are local filesystem + OpenSpec-store-registry
operations (no network I/O beyond whatever `--remote` git operation the wrapped
`openspec store` call itself performs). No new secrets are introduced; the
wrapped binary is resolved by path and version-asserted exactly as every other
cospec-to-openspec call already is (`>=1.0.0 <2.0.0`, pinned 1.5.0 for dev/CI).
`workset open` is the one exec that hands the terminal to a user-configured
IDE/agent opener — cospec does not manage that process's lifecycle beyond
spawning it and propagating its exit code.

## Integration contract

The third-party contract here is entirely the pinned `@fission-ai/openspec` CLI
(1.5.0, accepted range `>=1.0.0 <2.0.0`), spawned by resolved path, never
`$PATH`. Each new wrap's fixture/contract shape is openspec's own `--json`
output: `store setup|register --json` → `{store: {root, id, ...}}` and the store
registry file; `store remove|unregister --json` → a
`{registry: {removed: true, ...}}`-shaped confirmation; `context --json` →
`{members: [...], ...}`; `workset list --json` → `{worksets: [...]}`;
`show --json` → `{id, deltas, ...}` for changes or `{requirements, ...}` for
specs; `doctor --json`'s delegated `status: [{severity, code, message, fix?}]`
array is folded directly into cospec's own findings shape with no id-type
reconciliation needed, since cospec's `Issue` shape already mirrors it. No new
SDK, no new external service — the mount/route ownership question reduces to
"which OpenSpec subcommand owns which JSON shape," fixed by openspec's own CLI
contract and pinned by the existing contract-test suite.

## Risks / Trade-offs

- [Risk] Auto-`cospec init` on `store setup`/`register` could surprise a user
  who wanted a bare OpenSpec store without cospec's schemas. → Mitigation:
  `--no-cospec-init` opt-out, documented in the command's own help text and in
  `docs/stores.md`'s (consolidation-owned) ownership table.
- [Risk] Nine new command surfaces widen the CLI's `COMMANDS`/ `COMMAND_MODULES`
  table and its blast radius for future openspec version bumps. → Mitigation:
  every wrap goes through the single `passthroughOpenspec` runner, so a future
  openspec CLI shape change is a one-place fix, and the existing contract-test
  discipline (real pinned binary, false-PASS-is-a-release-blocker) catches drift
  before release.
- [Risk] `workset open`'s terminal handover has no JSON contract to assert
  against, so its only test coverage is arg-forwarding and exit-code
  propagation. → Mitigation: explicitly scoped as a smoke test in
  `verification.md`/`tasks.md`, matching OpenSpec's own no-`--json` design for
  this one subcommand rather than forcing a contract it doesn't have.
