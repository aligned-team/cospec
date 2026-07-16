# Schemas

cospec ships eleven schemas — one per conventional-commit type. A change's type
is its schema, recorded as `schema: <type>` in `.openspec.yaml` and written by
`cospec new`. There are no name prefixes and no parallel metadata.

The user-facing facts — the six canonical artifacts, the full artifact matrix
(R/O/O(trig)/F per type), the `## Surfaces` block and its token vocabulary, and
the per-type rationale for why each type requires what it requires — are owned
by the site:
[Types and artifacts](https://cospec.aligned.team/concepts/types-and-artifacts).
`verification`'s row grammar and per-type required-row rules are owned by
[Verification](https://cospec.aligned.team/concepts/verification). This page
covers the canon internals behind those pages: where the matrix is authored, how
it's kept from drifting, and the schema-forking escape hatch's mechanics.

`quality.md` and `rollout.md` were considered and rejected as vendor-coupled or
duplicative of `verification`/`design`. Teams that want more use
`openspec/config.yaml` (`context`/`rules`) or fork a schema with
`cospec schema fork` (see [Customization tiers](#customization-tiers)).

## Where the matrix is authored, and how drift is caught

`TYPE_ARTIFACTS` in `apps/cli/src/core/rules/type-facts.ts` mirrors the matrix
on the site by hand — it is a second, independent hand-authored surface from
`apps/cli/src/canon/types/*.yaml` (composed into `schema.yaml` by
`schema-compose.ts`). A matrix-parity test
(`apps/cli/test/unit/schemas/matrix-parity.test.ts`) asserts the two are
byte-identical — `declared` and `apply.requires` — across all 11 types × 6
artifacts, closing the "two hand-mirrored matrices, no cross-check" risk that
adding `verification` as a dimension doubled down on.

## The requires graph

Artifacts build in dependency order (`ARTIFACT_ORDER`:
`proposal, blocking-changes, specs, design, verification, tasks`):

- `blocking-changes`, `specs`, `design`, `verification` each require `proposal`.
- `tasks` requires `proposal`, plus `specs` where specs is required (feat), plus
  `design` where design is required (refactor). **`tasks` does NOT require
  `verification`** — "the plan exists before implementation" property comes from
  `verification` being in `apply.requires`, exactly as it already does for
  `blocking-changes`; an extra `requires` edge would only over-constrain
  authoring order.

Optional artifacts are never in another artifact's `requires` — that would
deadlock the next-artifact computation. Every schema sets
`apply.tracks: tasks.md`.

## Schema versioning internals

The composer stamps `version: 2` into every schema (bumped from `1` when
`verification` was introduced). `apply` and `archive` both compute
`enforcedApplyRequires(type, schemaVersion)` — the static `apply.requires` set,
filtered to artifacts whose `introducedAt(artifact, type)` is
`<= schemaVersion`. `verification` is `introducedAt = 2` for
feat/fix/perf/refactor and `1` for everything else, so a `schemaVersion: 1`
change is never gated on `verification` — no in-flight change is retroactively
blocked by a schema expansion. See the site's
[grandfathering section](https://cospec.aligned.team/concepts/types-and-artifacts#schema-versioning-and-grandfathering)
for the user-facing behavior (`cospec migrate`, the `meta/schema-outdated`
INFO).

## Customization tiers

Three strictly separated tiers — see the site's
[Configuration reference](https://cospec.aligned.team/reference/configuration)
for the full user-facing account of all three, including the managed-file
protocol and the `config.yaml` key reference. The mechanics behind tier 3
(schema forking) worth knowing as a contributor:

`cospec schema fork <type> [name]` (defaults the destination to `<type>-custom`)
and `cospec schema init <name>` are disciplined passthroughs to the wrapped
binary, guarded by one cospec-side check: a fork/init whose destination name is
one of the 11 canon types is refused with exit 1 before the binary is ever
spawned, so a fork can never overwrite a canon-managed `schema.yaml`. cospec
never regenerates or manages a forked schema — it is yours to edit.

A change run against a fork (`cospec new <name> <slug>` or per-change
`--schema`) resolves as **legacy** and routes down the legacy lane: no cospec
`schemaVersion` stamp, no typed artifact-plan, and a "reduced cospec guarantees"
note from `cospec new`. The legacy lane still keeps every **schema-agnostic**
hard gate — the archive tasks gate, scenario-preservation, filesystem-move
verification, and blocker fan-out — and delegates structural validation to
OpenSpec's own check of the fork's declared artifact graph (`cospec validate`
emits a `meta/legacy-schema` INFO and no typed `proposal/*`, `verification/*`,
`design/*`, or `specs/*` rule). The one cospec gate a fork does **not** get is
the verification-evidence ledger, which is scoped to canon types.
`cospec doctor` reports a change on a fork as an INFO, not a warning.
