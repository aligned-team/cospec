## Why

PR 16 (`store-aware-commands`) taught cospec's own commands to thread a
`--store <id>` flag through `new`/`validate`/`apply`/`archive`/`status`/
`list`/`instructions`/`sync-blockers`/`migrate`, but it deliberately left
OpenSpec's store-management surface — `store setup`/`register`/`unregister`/
`remove`/`list`/`doctor` — and the cross-repo `context`/`workset` commands
native, on the theory that store lifecycle and personal working-set management
sat outside cospec's typed-schema domain. In practice this split means the
moment a user wants to create or register a store, inspect its cross-repo
context, open a personal workset, or just read a change/spec's raw markdown or
JSON (`show`), they must drop out of `cospec` and invoke bare `openspec` —
exactly the discipline `CLAUDE.md` says never to do, and exactly the two-step
(`openspec store setup` then a manual `cospec init --harness none`) that
`docs/stores.md` documents as a footgun today.

This change closes that gap so a user never needs to invoke bare `openspec` for
any everyday operation: it reverses PR 16's "store management stays native"
split by making `store setup`/`register` auto-run `cospec init` on the resolved
store root, and it wraps every other still-native surface (`show`, `view`,
`context`, `workset`, schema/template inspection, spec listing, bulk/spec
validation) as disciplined passthroughs with the same wrapped-call rigor (typed
exit codes, stdout deny-lists, observable post-conditions) cospec already
applies to `new`/`apply`/`archive`.

## What Changes

- Add generic disciplined-passthrough plumbing (`passthroughOpenspec` + a shared
  passthrough-command helper) that every new wrap builds on: a version-asserted
  spawn with an exit-code allow-list, a stdout deny-list, and — for `--json`
  callers — a guaranteed single JSON document on stdout, mirroring OpenSpec's
  own `status:[{severity,code,message,fix?}]` failure shape.
- Add a first-class `cospec store` command group (`setup`, `register`,
  `unregister`, `remove`, `list`/`ls`, `doctor`) wrapping `openspec store *`
  with typed, filesystem-verified post-conditions. **Reverses PR 16's "store
  management stays native" split**: `store setup` and `store register` now
  auto-run `cospec init <resolved-root> --harness none` on success (opt out with
  `--no-cospec-init`), so a new or newly-registered store gets cospec's 11 typed
  schemas in one command instead of the documented manual two-step.
- Add disciplined read-only/personal passthroughs for `context`, the `workset`
  group (`create`/`list`/`remove`/`open`), `show`, `view`, `schemas`,
  `schema which`/`schema validate` (explicitly not `schema fork`/
  `schema init`), and `templates`.
- Extend `cospec list` with `--specs` (delegates to `openspec list --specs`) and
  `cospec validate` with `--all`/`--specs`/`--changes` bulk/standalone- spec
  modes (delegates the spec/bulk paths; cospec's own rules stay change-centric
  for single changes).
- Extend `cospec doctor` with a delegated section surfacing OpenSpec's
  root-relationship, `references:` entry health, and store facts when the
  resolved root is store-backed.
- Regenerate managed docs/skills/commands so the new user-facing commands are
  documented and agent-discoverable (`mise run generate`).

## Capabilities

### New Capabilities

- `openspec-store-management`:
  `cospec store setup|register|unregister|remove|list|ls|doctor`, wrapped with
  typed post-conditions and auto `cospec init` on setup/register.
- `openspec-read-passthroughs`: `cospec show`, `cospec view`, `cospec context`,
  the `cospec workset` group, `cospec schemas`, `cospec schema which|validate`,
  `cospec templates` — disciplined, read-only or personal, gate-free wraps of
  the corresponding native OpenSpec commands.
- `openspec-list-validate-extensions`: `cospec list --specs` and
  `cospec validate --all`/`--specs`/`--changes`, delegating the spec/bulk paths
  to OpenSpec while keeping single-change validation on cospec's own rules.
- `openspec-relationship-health`: a delegated section in `cospec doctor`
  surfacing OpenSpec's root-relationship, `references:` entry health, and store
  facts when the resolved root is store-backed.

### Modified Capabilities

None — every capability below is new; no existing `openspec/specs/*` capability
is touched.

## Impact

- New files: `apps/cli/src/core/passthrough-command.ts`,
  `apps/cli/src/commands/store.ts`, `context.ts`, `workset.ts`, `show.ts`,
  `view.ts`, `schemas.ts`, `schema.ts`, `templates.ts`, and matching unit/
  contract/integration tests.
- Modified: `apps/cli/src/core/openspec.ts` (new `passthroughOpenspec`),
  `apps/cli/src/cli.ts` (new `COMMANDS`/`COMMAND_MODULES` entries),
  `apps/cli/src/commands/list.ts`, `apps/cli/src/commands/validate.ts`,
  `apps/cli/src/commands/doctor.ts`.
- No breaking changes: every addition is a new subcommand or an additive flag on
  an existing command; existing invocations are unaffected.
- Docs/canon consolidation (`docs/stores.md` ownership table,
  `.agents/ shared.md`, `apps/cli/src/canon/workflows`, generated
  `.claude/`/`.codex/`/ `.opencode/` skills) lands as the final work item of
  this change, after every command lands, per the sequencing in the gap
  analysis.

## Surfaces

- [x] interactive — new `cospec store`/`show`/`context`/`workset`/`schemas`/
      `schema`/`templates` subcommands and new flags on `list`/`validate` change
      the CLI's user-visible surface.
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [x] integration — every new command wraps the pinned OpenSpec 1.5.0 binary
      through a new disciplined-passthrough contract (exit-code allow-list,
      stdout deny-list, JSON post-conditions) that must hold against the real
      binary, not a stub.
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
