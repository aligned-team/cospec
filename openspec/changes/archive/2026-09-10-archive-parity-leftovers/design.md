## Context

cospec's archive gates are a static re-derivation of what the wrapped OpenSpec
binary will do to a delta. Where the two disagree, one of two things happens: a
false FLAG (cospec refuses an archive the binary performs) or a false PASS
(cospec accepts one the binary refuses, or one that silently deletes spec
content). This change closes one instance of each, both verified against the
real pinned 1.11.0 binary on 2026-09-09.

The root cause of the false-FLAG half is that `archive/added-exists` and
`archive/target-missing` are pure name-membership checks over
`LivingSpec.requirementNames`. `DeltaOp` carries no block text, so there is no
way to ask "is this ADDED block the same text that already lives there?" — which
is the only question that separates a genuine collision from OpenSpec's
early-sync no-op. The same absence of state makes REMOVED-already-absent and
RENAMED-already-applied indistinguishable from real errors.

The root cause of the false-PASS half is that `LivingSpec` stores
`requirementScenarioCounts` and nothing else, so `findScenarioDrops` can only
compare cardinalities. A MODIFIED block that renames a scenario keeps the count
and slips through. Upstream's own `findMissingCurrentScenarios` compares names
with multiplicity; from 1.8.0 the binary catches the swap during delegated
validation, but cospec's gate exists precisely to be the defence on 1.0.0
through 1.7.x, where nothing else looks.

Both root causes are the same missing state, which is why the parser work (U1)
is one unit rather than two.

## Goals / Non-Goals

**Goals:**

- Agreement with the wrapped binary on all three early-sync shapes, without ever
  becoming looser than it.
- Scenario-name identity in `archive/scenario-preservation`, retaining the count
  arm.
- A corrected `SCENARIO_DROP_HINT`, since the remedy it advises is one OpenSpec
  1.11.0 refuses outright.
- No change to any rule id, command, flag, schema, or exit code.

**Non-Goals:**

- Chained renames inside one delta (A→B then B→C). Upstream applies operations
  against a mutating map; cospec's static check reports `archive/target-missing`
  on B. A pre-existing false FLAG, never a false PASS — follow-up.
- Same-delta REMOVE-then-ADD of one requirement. OpenSpec refuses it, so
  cospec's false flag there is harmless; only the hint that recommends it is
  fixed.
- Body comparison on the RENAMED-TO collision arm — strictly looser than the
  binary.
- MODIFIED early-sync counting: upstream's identical-raw check there only gates
  a counter, so there is no gate to mirror.
- Porting upstream's per-block fence re-mask; cospec keeps one file-scope
  `buildCodeFenceMask` across both parsers and both gates.
- The case-insensitive `### Requirement:` header divergence — pre-existing,
  orthogonal, and a conservatism rather than a PASS risk.

## Decisions

- **Port `normalizeBlockRaw` verbatim, not "sensibly".** CRLF fold plus one
  outer trim, nothing else. Rejected: folding interior whitespace or sorting
  scenarios, which reads more forgiving but would call a genuine collision
  identical — the exact shape of a false archive PASS.
- **Relax REMOVED and RENAMED in this change, not a follow-up.** Rejected:
  shipping the ADDED arm alone. Probes show all three shapes are the same defect
  under the same missing state; splitting leaves an inconsistent surface and a
  guaranteed follow-up for two presence checks that need no raw capture.
- **Guard every relaxation with a fold-equal near-miss check first.** Upstream
  distinguishes "already synced" from "you mistyped the header" and aborts on
  the latter. Without the guard, a typo would archive silently.
- **Keep the count arm alongside name identity.** Redundant in theory — a count
  drop always yields at least one missing name — but it is the existing frozen
  contract, it survives any future divergence in name extraction, and removing
  it could only make cospec looser.
- **No escape hatch for a name-identity drop.** Rejected: honouring a
  `Scenario removed:` note. The note is already retired, a contract test pins
  that both sides refuse it, and upstream has no notion of it.
- **Append rather than reshape the archive gate's stderr line.** The existing
  contract assertion `widgets: "Widget rendering" 2 -> 1 scenario(s)` stays
  unedited; the names are appended after it. No assertion is weakened to
  accommodate this change.
- **Widen the delegated-duplicate `nativeKey` in the same commit as the message
  reshape.** The suppressor keys on `/^MODIFIED "(.*)" drops scenario count/`;
  changing the message without it would silently double-report every scenario
  loss.
- **Correct the stale `## Purpose` sentence in `archive-integrity` directly.** A
  delta cannot change a living spec's Purpose (OpenSpec ignores delta Purpose
  and warns), so there is no in-workflow path. Leaving a living spec asserting a
  retired escape hatch is the drift the repo's docs discipline forbids, so it is
  corrected in the same commit as the spec delta, as a documented exception.

## Operational surface

The change is confined to the `cospec` CLI process. No bind address, container,
runner, secret, or connection limit is involved, and nothing about how cospec is
installed or invoked changes.

What does change on the operational surface is CLI output, and only output:

- `cospec validate --strict` and `cospec archive` stop emitting
  `archive/added-exists` and `archive/target-missing` for the three early-sync
  shapes; a change that could not be archived yesterday archives today, with no
  new flag or confirmation.
- `cospec archive` starts refusing a same-count scenario name swap on
  `archive/scenario-preservation`, exit 1, with no `--force` escape.
- The scenario-drop message gains the dropped names; the archive gate's stderr
  line keeps its existing prefix and appends them.
- `SCENARIO_DROP_HINT` changes text.

Binary versions and arches: the behaviour is defined against
`@fission-ai/openspec` 1.11.0, the dev/CI pin, resolved by path rather than
`$PATH`, on whatever arch the contract suite runs. No new binary, runtime, or
platform requirement.

## Integration contract

The external contract here is the wrapped `@fission-ai/openspec` binary across
the accepted `>=1.0.0 <2.0.0` range. cospec is not free to define these gates;
it is porting semantics that already exist upstream, so the contract is stated
as the primitives being ported and the range each claim holds over.

| Upstream primitive            | Source (1.11.0)                          | cospec port                      |
| ----------------------------- | ---------------------------------------- | -------------------------------- |
| `normalizeBlockRaw`           | `src/core/specs-apply.ts`                | `normalizeBlockRaw` (verbatim)   |
| `scenarioNameAt`              | `src/core/parsers/requirement-blocks.ts` | `scenarioNameFromHeader`         |
| `foldRequirementName`         | same file                                | `foldRequirementName` (verbatim) |
| `findMissingCurrentScenarios` | same file                                | `findScenarioDrops`' name arm    |
| requirement-block extent      | same file                                | the parsers' raw window          |

Range reconciliation, which is the whole point of the gate:

- The three early-sync no-ops are upstream behaviour across the accepted range;
  mirroring them can only ever remove a false FLAG, never create a false PASS,
  because the binary is the one performing the archive either way.
- The scenario-name check exists upstream only from 1.8.0. cospec's port must
  therefore stand on its own below that version, which is why it is a hard gate
  with its own rule id and its own message rather than a relay of the delegated
  diagnostic. Above 1.8.0 the two overlap, and the delegated-duplicate
  suppressor keeps the user seeing one refusal.
- Direction of divergence is the acceptance criterion: cospec may be stricter
  than the binary (a false FLAG is a nuisance), never looser (a false PASS is a
  release blocker). Every relaxation in this change carries a named negative
  contract fixture whose verdict the parity harness derives from the real binary
  rather than from the fixture's own prediction.

No SDK, mount, route, id type, or wire schema is involved; the delta and living
spec Markdown files are the only shared data shape, and their parse contract is
what the `spec-parsing-and-discovery` delta states.

## Risks / Trade-offs

- **`normalizeBlockRaw` ported too loosely** → unit cases assert that
  interior-whitespace, scenario-reorder and one-scenario-body differences all
  compare unequal; the `added-already-exists` contract fixture stays
  `expectAbort: true`.
- **Raw window captured with the wrong boundary**, so two different blocks look
  identical → unit cases assert the raw ends before the next `### Requirement:`
  and before the next `## ` section; the contract pair
  `added-identical-early-sync` (both archive) and `added-already-exists` (both
  abort) brackets it.
- **A relaxation swallows a mistyped header** → `removed-near-miss-typo` and
  `renamed-from-near-miss` fixtures, both `expectAbort: true`, both derived from
  the real binary's own abort.
- **A relaxation spills into a genuine collision** → the untouched
  `renamed-collision` and `modified-missing-target` fixtures must keep failing.
- **Scenario names folded too aggressively** (case, Unicode spaces) → `Foo` ≠
  `foo` in unit; ATX-close stripping uses `[ \t]`, not `\s`, matching upstream.
- **Duplicate scenario names mask a loss** → unit case: living ×2, delta ×1
  yields exactly one missing name.
- **The living-spec `## ` boundary reset under-counts real scenarios** → unit
  case: a requirement followed by `## Notes` keeps its own scenarios and loses
  only the later section's.
- **Message reshaping breaks delegated-duplicate suppression** →
  `delegated-dedupe.test.ts` re-runs against the new shape, with `nativeKey`
  widened in the same commit.
- **Trade-off accepted:** cospec keeps its own file-scope fence mask rather than
  upstream's per-block re-mask. One fence primitive across both parsers and both
  gates is worth more than byte-identical masking, and the existing scenario
  `Fenced and commented headers do not fake preservation` already pins the
  behaviour that matters. Recorded in a code comment at the deviation.
