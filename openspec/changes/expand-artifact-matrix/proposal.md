## Why

Every headline post-archive fix storm in the mined corpus is the same defect: CI
was green and the change was archived, but the observable behavior was never
exercised at the layer that mattered — routes mounted wrong, islands that never
hydrated, mocked handlers that enshrined the bug, send paths orphaned from the
live keymap, deploy topology discovered only at deploy time. Green CI does not
mean done, and cospec today has no artifact that forces acceptance evidence at
the right layer before a change archives. This change closes that class by
shipping exactly one new machine-parsed artifact — `verification` — plus a lean
trigger mechanism and two hard archive gates, sized to keep light change types
at their two-minute covenant.

## What Changes

- Add a machine-parsed `verification` artifact (checkbox grammar, closed
  `@layer` vocabulary, `(agent)`/`(human)` owners, evidence-required, and
  explicit defer-with-reason) generated as `verification.md` at the change root.
  It is Required (and in `apply.requires`) for `feat`/`fix`/`perf`/ `refactor`,
  soft-promotable for `revert`/`build`/`ci`, and Forbidden for
  `chore`/`docs`/`style`/`test`.
- Add a closed `## Surfaces` flag block to the `proposal` artifact (all types
  except the four no-surface light types) as the single opt-in trigger for soft
  nudges.
- Extend the `design` artifact with flag-keyed required sections
  (`## Operational surface`, `## Integration contract`, `## Seam ownership`)
  that fire only when the matching surface flag is set; `## Seam ownership` is
  always expected for `refactor`.
- Add two hard archive gates as explicit command steps —
  `archive/verification-incomplete` and `archive/scenario-preservation` — each
  returning exit 1, independent of the specs-conditional rule family.
- Add versioned, opt-in migration: bump the composed schema to `version: 2`,
  stamp `schemaVersion` into new changes, grandfather in-flight v1 changes, and
  add `cospec migrate` plus a `cospec doctor` listing. This is not a breaking
  change for archived changes; they are immutable and untouched.
- Extend `cospec status --json` with a read-only `verification` completion block
  for autonomous routines to consume in place of re-parsing files.

## Capabilities

### New Capabilities

- `verification-artifact`: the machine-parsed acceptance-evidence ledger — its
  grammar, closed layer vocabulary, owners, evidence/deferral discipline,
  per-type required-row facts, matrix placement, and the read-only
  `status --json` verdict block.
- `surface-triggers`: the proposal `## Surfaces` flag block, the design
  flag-keyed sections, the soft-trigger mechanic (`meta/surface-unmet`), and the
  static `apply.requires` invariant that trigger behavior must never mutate.
- `schema-versioning`: schema `version: 2`, per-change `schemaVersion` stamping,
  the `introducedAt`/`enforcedApplyRequires` monotonic filter, grandfathering of
  v1 changes, and the `cospec migrate` / `cospec doctor` commands.
- `archive-integrity`: the two hard archive gates —
  `archive/verification-incomplete` and `archive/scenario-preservation` — as
  explicit pre-delegation command steps with a pinned-binary contract test.

### Modified Capabilities

<!-- None: this repo has no living specs yet (openspec/specs/ is empty), so
every capability introduced here is ADDED. -->

## Impact

- **Canon** (`apps/cli/src/canon/`): new `artifacts/verification/meta.yaml`; new
  per-type `surfaces` and `verification` keys plus `verificationInstruction`/
  `designInstruction` overrides across the eleven `types/*.yaml`; `## Surfaces`
  added to proposal templates.
- **Composer** (`apps/cli/src/core/schema-compose.ts`): `ARTIFACT_ORDER` gains
  `verification` before `tasks`; `version` bumps `1 → 2`.
- **Twin matrix** (`apps/cli/src/core/rules/type-facts.ts`): `verification`
  wired into `TYPE_ARTIFACTS`, plus the `introducedAt` table and
  `enforcedApplyRequires`, now cross-checked by a new matrix-parity test.
- **Parsers/rules** (`apps/cli/src/core/`): new `verification.ts` parser and
  `rules/verification.ts` family; `proposal.ts` `## Surfaces` parse; `meta.ts`
  `surface-unmet` and `schema-outdated` rules.
- **Commands** (`apps/cli/src/commands/`): `apply.ts` (enforced-requires filter
  - soft-blocker step), `archive.ts` (two gate steps), `status.ts` (`--json`
    block), `new.ts` (`schemaVersion` stamp), `doctor.ts` (v1 listing), new
    `migrate.ts`, `instructions.ts` (verification in `ARTIFACTS`).
- **Generated output**: `openspec/schemas/**` regenerated via
  `mise run generate`; harness prose and goldens updated.
- **Docs**: `docs/schemas.md`, `docs/validation.md`, `docs/architecture.md`.
- **Eval**: `e2e/eval/scenarios/*.ts` derive `DECLARED` from `type-facts`.
- **Migration**: opt-in and versioned. No archived change is touched; no
  in-flight change is hard-blocked by the retrofit. Not BREAKING.

## Surfaces

<!-- Check every surface this change touches; each drives a verification/design expectation (soft). -->

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
