## Context

cospec sizes the spec-driven workflow to the conventional-commit type, but its
current gate stops at artifact presence and task completion. Across the mined
corpus, every headline post-archive fix storm is the same defect: CI was green
and the change archived, yet the observable behavior was never exercised at the
layer that mattered (wrong route mounts, un-hydrated islands, mocked handlers
that enshrine the bug, orphaned wiring, deploy topology found only at deploy
time). Two counter-examples bound any fix: Parsec ran a custom seven-artifact
schema once then deleted it as scaffolding, and atlas retro-gated ~20 in-flight
changes by bumping a live `apply.requires`, forcing hand-authoring and factual
errors. The repo-mining dossier also names the standing systemic risk: two
hand-mirrored matrices — the composer (`schema-compose.ts`) and the rule facts
(`rules/type-facts.ts`) — with no test cross-checking them; every new artifact
doubles that surface.

This design is the binding synthesis of three candidate designs and three lensed
panel verdicts. It is complete: there are no open design questions.

## Goals / Non-Goals

**Goals:**

- Close the green-CI-broke-behavior class with exactly one new machine-parsed
  artifact, `verification`, carrying a closed `@layer` vocabulary, `(agent)`/
  `(human)` owners, mandatory evidence, and explicit defer-with-reason.
- Differentiate the eleven schemas by a distinct required-row fact per type, so
  the artifact reads differently for `feat`/`fix`/`perf`/`refactor`.
- Add two hard archive gates (`verification-incomplete`,
  `scenario-preservation`) as explicit command steps returning exit 1.
- Keep light types (`chore`/`docs`/`style`/`test`) at their two-minute covenant
  by forbidding verification and omitting the `## Surfaces` block.
- Pay for the matrix-parity test that ends the twin-matrix risk class.
- Migrate opt-in and versioned, never retro-gating in-flight changes.

**Non-Goals:**

- No `rollout` or `readiness` artifact (both rejected; see Decisions).
- No dynamic `apply.requires`; the matrix stays static and fully parity-tested.
- No `--force` for verification; deferral on the record is the only escape.
- No governance/autonomy/exposure state anywhere in core.
- No lite variant of verification — types that cannot bear it are Forbidden.
- No change to archived changes; they are immutable.

## Decisions

- **One artifact, not two or more.** Ship only `verification`; fold every
  deploy/integration/rollout "decision" into sharpened `design` sections. _Why:_
  the 22-surface cost model plus Parsec's abandonment — one artifact is
  affordable and pays for the matrix-parity test; two doubles the twin-matrix
  surface and re-creates Parsec's death.
- **Adoption-first shape, verification-first depth.** Single artifact, static
  per-type matrix, version-gated grandfathering, soft triggers — loaded with the
  closed `@layer` vocabulary, per-type required-row facts, and hard archive
  gates. _Why:_ the two winning designs converge once every judge's top graft is
  applied; the residual one-vs-two split is decided by cost toward one.
- **Checkbox lexer, not YAML frontmatter.** Reuse the `core/tasks.ts` grammar
  (`## N. Group` + `- [ ] N.M …`). _Why:_ cheaper (no new parser paradigm) and
  matches cospec's house grammar; strict fail-closed parse, required deferral
  reason, and check-owner discipline are grafted on top.
- **perf and refactor promoted to Required.** `perf` gets `@benchmark` +
  `@equivalence`; `refactor` gets `@equivalence`. _Why:_ the single
  most-repeated panel graft (all three judges); closes the perf-silent-drift and
  refactor-behavior-drift modes.
- **build/ci = O(trig), not F.** The `deploy` flag soft-promotes a
  machine-checked `@runtime` verification row; `design` stays Forbidden for
  these light types. _Why:_ deploy/CI topology is the largest fix class, but
  taxing every pin violates the covenant — a flag-free pin stays two-minute, a
  flagged one proves its runtime.
- **Static matrix + soft triggers, not dynamic `apply.requires`.**
  `apply.requires` is a static per-type lookup; all trigger behavior is layered
  as soft-blockers reusing the existing `gate.soft` / `--allow-soft` / exit-3
  mechanism. _Why:_ the dynamic `effective = static ∪ triggered` design
  re-architects the invariant and makes matrix-parity only partial.
- **`tasks` does not require `verification`.** The "plan exists before
  implementation" property comes from `verification ∈ apply.requires`, exactly
  as `blocking-changes` already works. _Why:_ the extra edge buys nothing and
  over-constrains authoring order; the atlas "tasks never authored the listed
  test" gap is closed by the tasks _instruction_ instead.
- **Two archive gates as explicit command steps.** Not buried in the
  specs-conditional rule family, because `archive.ts`'s success computation is
  specs-specific — a new gate needs its own step or a real breach reports as a
  clean archive. _Why:_ keeps one refusal convention (exit 1) and fires
  `verification-incomplete` even for specs-less fixes.
- **Read-only `status --json` verdict, not a `readiness` artifact.** A partner
  routine consumes one command; it is not a gate and carries no governance
  state. _Why:_ captures the legitimate routine-consumption value while avoiding
  `readiness`'s fatal R-semantics divergence and vendor coupling.
- **Rejected outright:** `rollout` (atlas-shaped, twice-abandoned,
  vendor-coupled via `picker.py`); `readiness` + `--autonomous` (breaks R
  semantics, vendor workflow, `touches_deploy` always-on); `quality.md` as a
  required file (folded into `verification`); ADR, constitution, standalone
  eval-plan/deploy-topology/
  threat-model/capacity/runbook/changelog/retrospective/beads/drift artifacts
  (each folds into an existing artifact, a `@layer`, a `design` section, or
  `config.yaml`).

## Risks / Trade-offs

- [Two hand-mirrored matrices (the #1 systemic risk, which this change doubles
  by touching both surfaces)] → a `matrix-parity` test composing `declared` +
  `apply.requires` per type from `schema-compose.ts` and asserting byte-equality
  against `type-facts.ts` `TYPE_ARTIFACTS` across all 11×6 cells; it asserts the
  static v2 matrix, with grandfathering tested separately.
- [openspec 1.3.1's hardcoded `CHANGE_NO_DELTAS` string match on the literal
  `specs`] → `verification.md` generates at the change root, never under a
  `specs/`-named directory, plus a repo-gate test asserting no artifact's
  `generates` path resolves under `specs/` (protects this and every future
  artifact).
- [A false archive PASS on scenario thinning is a release blocker] → the
  `scenario-preservation` gate ships with a contract test against the real
  pinned openspec 1.3.1 binary, asserting cospec refuses before delegation even
  though openspec returns exit 0.
- [Golden-schema drift from hand-typing the serializer's exact quoting] →
  regenerate goldens via `mise run generate` into a scratch copy and diff-copy;
  never hand-type `needsQuote`/`blockScalar` output; extend the
  `schema-compose.test.ts` `MATRIX` fixture with the verification column.
- [Retro-gating in-flight changes (the atlas failure)] → gate on change-creation
  `schemaVersion` via a monotonic `introducedAt` filter; v1 changes are
  grandfathered, never hard-blocked.

## Migration

atlas retro-gated by bumping a live `apply.requires`; cospec keys on
change-creation version instead. The composer bumps schema `version: 1 → 2` and
stamps every regenerated `schema.yaml`. `cospec new` stamps `schemaVersion: 2`
into `.openspec.yaml` (absent ⇒ treated as 1).
`enforcedApplyRequires(type, schemaVersion)` drops any artifact whose
`introducedAt(artifact, type)` exceeds the change's stamped version — a uniform,
monotonic, per-artifact-per-type filter applied identically at apply and
archive, so future artifacts grandfather independently and matrix-parity still
tests the unfiltered v2 matrix. In-flight v1 changes are grandfathered
(verification not enforced; `cospec validate` emits a non-blocking
`meta/schema-outdated` INFO). `cospec migrate <slug>` scaffolds a fully-deferred
`verification.md` and bumps the stamp; `cospec doctor` lists active v1 changes.
Partner rollout is via `cospec update` regenerating to v2 with no flag-day;
archived changes are untouched.

## Open Questions

None. Every panel disagreement (design base, perf/refactor R-vs-O,
scenario-shrink hard-vs-advisory, the `tasks→verification` edge, hard-vs-soft
promotion, build/ci F-vs-O(trig), migration granularity, the `specs/` landmine,
checkbox-vs-YAML grammar) is resolved in the binding design and reflected in the
Decisions above.
