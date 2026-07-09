## Context

cospec identifies its 11 canon types by exact name against the frozen
`COSPEC_TYPES` allowlist and drives every gate/rule/archive decision from
hardcoded facts (`TYPE_ARTIFACTS`/`TYPE_FACTS`/`enforcedApplyRequires`), never
from the `schema.yaml` body. `resolveSchema(cwd, name)` already classifies any
non-cospec-type name as `kind: 'legacy'` (project `openspec/schemas/<name>/`,
user config dir, or an npm package) or `kind: 'unknown'`, and `validate.ts`/
`apply.ts`/`archive.ts` already branch on `resolution.kind === 'legacy'` to
delegate typed-artifact checking to OpenSpec while keeping cospec's
schema-agnostic hard gates (tasks, scenario-preservation, filesystem-move,
blocker fan-out). `doctor.ts` already emits a legacy INFO whose remedy text says
"or fork the schema." The only gap is that `cospec schema fork`/`init` refuse to
be the tool that creates a legacy schema, and three surfaces
(`schema-compose.ts` header, `meta.ts` hint, `doctor.ts` remedy) still tell
users to run bare `openspec schema fork`, which violates the project's
route-through-cospec rule, or (in `schema.ts`) tell npm consumers to "edit the
canon," which is impossible outside this repo.

Three coherent options exist for schema customization:

- **(a) Full inheritance** — a fork inherits cospec's typed enforcement.
  Rejected: cospec's gates read hardcoded facts, not the schema file, so a fork
  that edits its artifact set diverges from the enforced set (drop
  `verification` and it is still gated; add `security-review` and it is
  ungated/unvalidated). A coherent typed fork would need freezing the fork to a
  parent's artifact set, a parent-linkage field, and a new conformance check
  touching `resolveSchema` and the rule-engine facts lookup — real, but a future
  enhancement, not required for feasibility.
- **(b) Legacy lane (chosen)** — forked/custom schemas ride the existing legacy
  lane. No new resolution logic; the fork gets OpenSpec-delegated structural
  validation of its own artifact graph plus every cospec schema-agnostic hard
  gate, and loses only the cospec-typed proposal/ verification/surface/blocker
  gate — a clearly bounded, already-tested degradation.
- **(c) Config overlay** — `openspec/config.yaml` `context`/`rules` is real but
  bounded: repo-wide additive prose per artifact, no template or instruction
  override. Already works today via `cospec instructions` delegation; this
  change documents it as the ceiling below forking, not an alternative to it.

## Goals / Non-Goals

**Goals:**

- Let `cospec schema fork`/`init` create project-local schemas that ride the
  legacy lane, with a guard that refuses to let one overwrite a canon name.
- Let `cospec new <legacy-schema> <slug>` create changes on a resolvable legacy
  schema, with reduced (structural-only) guarantees clearly stated.
- Correct every surface that currently tells users to call bare `openspec` or
  "edit the canon" for schema customization.
- Bring `apps/docs` current with PR #19's store/context/workset/show/view/
  schemas/schema/templates/list --specs additions.

**Non-Goals:**

- Full-inheritance typed forks (Option (a)) — explicitly deferred as a future
  enhancement; no parent-linkage field or conformance check is added here.
- Any change to the 11 canon types' enforcement, rule IDs, or gate behavior.
- Any change to the `generate`/drift engine's tracked-file set — fork
  directories remain untracked and unflagged, as they are today.

## Decisions

- **Route fork/init through `runPassthrough`, not a bespoke spawn.** Rejected
  alternative: a dedicated code path duplicating the deny-list/exit-code
  discipline `which`/`validate` already get from `runPassthrough`. Reusing the
  existing passthrough keeps one wrapped-call contract for the whole `schema`
  command instead of two.
- **Guard on destination name, computed before spawning, not after.** The guard
  parses `fork`'s destination as `[name] || <source>-custom` (matching
  OpenSpec's own default-naming rule) and `init`'s destination as `<name>`, and
  refuses with exit 1 if the name is in `COSPEC_TYPES` — before ever invoking
  the wrapped binary. Rejected alternative: let the wrapped
  `openspec schema fork/init` run and then check/rollback afterward — this would
  let a canon `schema.yaml` be overwritten on disk (even briefly, even if
  reverted), which is unacceptable since `generate:check`'s drift comparison and
  every downstream `resolveSchema('feat', …)` call trusts that file to be
  canon-composed.
- **`cospec new` gains a legacy branch, not a new command.** Extending the
  existing type-resolution `if` chain (cospec type → legacy → unknown) keeps one
  entry point and one slug/collision-check path; a separate
  `cospec new --legacy` command would duplicate all of that logic for no
  behavioral gain.
- **Legacy-schema changes skip the `schemaVersion` stamp entirely** (not stamp
  `schemaVersion: 1` explicitly). `schemaVersion` grandfathering exists to gate
  the _cospec-typed_ verification retrofit (schema-versioning spec); a
  legacy-schema change is never subject to that retrofit, so stamping a version
  on it would imply a promise (future migration eligibility) that does not
  apply.
- **apps/docs updates ship in the same change, not a follow-up.** Per the
  project's "docs never drift" rule, the page that owns the fact is updated in
  the same change as the behavior and recorded in `verification.md` — applies to
  both the fork/init behavior (`docs/schemas.md`) and the PR #19 backlog
  (`apps/docs/concepts/stores.md`, `how-it-relates-to-openspec.md`,
  `reference/commands.md`).

## Operational surface

This change touches only the `cospec` CLI's own process (no server, no bind
address, no container-vs-runner distinction, no new secrets, no connection
limits) — the only operational fact that applies is binary versioning:
`cospec schema fork`/`init` spawn the same wrapped OpenSpec binary (resolved by
path, never `$PATH`, version-asserted to `>=1.0.0 <2.0.0`, pinned to 1.5.0 for
dev/CI) that every other passthrough command already uses via `runPassthrough`;
no new binary or version range is introduced.

## Risks / Trade-offs

- [Risk] A fork/init destination name collides with a _future_ 12th canon type
  added after this ships, re-opening the overwrite hole. → Mitigation: the guard
  reads `COSPEC_TYPES` live (not a copied literal list), so adding a 12th canon
  type automatically extends the guard with no code change here.
- [Risk] Users expect a fork to inherit typed verification/blocker gates and are
  surprised when it does not. → Mitigation: `cospec new <legacy-schema>` prints
  an explicit "legacy schema — reduced cospec guarantees" note at creation time,
  and `docs/schemas.md` tier 3 documents the exact boundary (structural
  validation of the fork's own graph, cospec's schema-agnostic hard gates, no
  typed proposal/verification/surface/blocker gate).
- [Risk] Regenerating `schema-compose.ts`'s header text touches all 11 golden
  `schema.yaml` fixtures at once, a large-looking diff that could mask an
  unrelated drift. → Mitigation: the diff is mechanical (one text substitution
  applied uniformly); `mise run generate:check` is run clean before commit so
  any unrelated drift would surface as a separate, non-mechanical delta.
