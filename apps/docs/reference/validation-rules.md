---
title: Validation rule registry
description:
  Every stable rule ID that cospec validate can emit, grouped by family, with
  its level and what it checks.
---

# Validation rule registry

`cospec validate` runs cospec's own rule families over every change, then — only
for spec-bearing changes with delta files — delegates to `openspec validate` and
merges its issues in. Rule IDs are stable public API: script against them, grep
for them in CI logs, ignore them by ID if you ever need to.

For the verification-ledger row grammar
(`- [<state>] N.M @<layer> [(<owner>)] <probe> -> <result>`) that the
`verification/*` rules below enforce, see
[Verification](/concepts/verification). For the delta-file format
(`## ADDED/MODIFIED/REMOVED/RENAMED Requirements`, `#### Scenario:` blocks) that
the `deltas/*` rules enforce, see OpenSpec's
[writing-specs.md](https://github.com/Fission-AI/OpenSpec/blob/main/docs/writing-specs.md).

## Command

```
cospec validate [name] [--all|--changes|--specs] [--strict] [--json] [--fast]
```

| Flag        | Effect                                                             |
| ----------- | ------------------------------------------------------------------ |
| _(no args)_ | defaults to `--all`                                                |
| `--strict`  | promotes every WARNING to blocking — this is what hooks and CI use |
| `--fast`    | skips the archive-precondition checks (used internally by `apply`) |
| `--json`    | machine-readable output (shape below)                              |

Exit code is `1` if there are errors (or warnings under `--strict`), otherwise
`0`.

::: tip Which families run for a change Every change always runs `meta`,
`proposal`, `blockers`, and `tasks`. Whether `verification`, `design`, `deltas`,
and `archive` run depends on what the change's type declares — see
[Types & artifacts](/concepts/types-and-artifacts) for the full per-type matrix.
`openspec validate` is never invoked for a change whose type has no specs
artifact, since its hardcoded no-deltas rule would false-error on a change that
was never supposed to have any. :::

## Levels

- **E** — ERROR, always blocking.
- **W** — WARNING, blocking only under `--strict` (shown below as "W
  (E-strict)").
- **I** — INFO, never blocking.

Every issue also carries a one-line hint.

## `meta/`

Structural checks on the change directory itself — `.openspec.yaml`, naming, and
which artifact files are allowed to exist.

| ID                              | Level        | Check                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta/openspec-yaml`            | E            | `.openspec.yaml` is present, parseable, and has a non-empty `schema:`; `created:` must be `YYYY-MM-DD` when present                                                                                                                                                                                         |
| `meta/schema-unknown`           | E            | the declared schema isn't one of the eleven cospec types and isn't resolvable any other way                                                                                                                                                                                                                 |
| `meta/legacy-schema`            | I            | schema resolves but isn't a cospec type — the change runs in legacy mode                                                                                                                                                                                                                                    |
| `meta/name-kebab`               | E            | the change directory isn't kebab-case with no `YYYY-MM-DD-` prefix (that prefix collides with archive naming)                                                                                                                                                                                               |
| `meta/forbidden-artifact`       | E            | a file exists for an artifact the type doesn't declare — e.g. a `specs/` dir under `ci`                                                                                                                                                                                                                     |
| `meta/unexpected-file`          | W            | a file matches no declared artifact glob (excludes `README.md`, `.openspec.yaml`, `.refine/`)                                                                                                                                                                                                               |
| `meta/empty-change`             | I            | `.openspec.yaml` exists but the change has zero artifacts yet — reported as "in progress," not as an error                                                                                                                                                                                                  |
| `meta/surface-unmet`            | W (E-strict) | a checked `## Surfaces` box's consequence is missing, for a type whose target isn't Forbidden — specifically, a type like `revert`/`build`/`ci` whose `verification.md` doesn't exist at all. A missing _row_ on a file that does exist is owned by `verification/*` instead, so this never double-reports. |
| `meta/schema-outdated`          | I            | the change is on `schemaVersion` 1 (absent counts as 1) — some artifacts are grandfathered out until `cospec migrate`; never blocks                                                                                                                                                                         |
| `meta/skip-specs-type`          | E            | `.openspec.yaml`'s `skip_specs` key is present but isn't a boolean                                                                                                                                                                                                                                          |
| `meta/retire-capabilities-type` | E            | `.openspec.yaml`'s `retire_capabilities` key is present but isn't a boolean                                                                                                                                                                                                                                 |
| `change/artifact-missing`       | I / E-strict | an artifact required by the type's apply gate doesn't exist yet (verification is excluded — `verification/missing` owns that case)                                                                                                                                                                          |

## `proposal/`

Section and content checks on `proposal.md`.

| ID                         | Level                                   | Check                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proposal/missing`         | W (E-strict when other artifacts exist) | `proposal.md` is absent                                                                                                                                                                                                                                                                                                         |
| `proposal/sections`        | E                                       | required headings per variant are present: full types need `## Why`, `## What Changes`, `## Impact` (plus `## Capabilities` for `feat`, and `fix` when `specs/` exists); lite types need `## Why`, `## What Changes`, `## Impact`; every surfaced type additionally needs `## Surfaces`, checked even when the section is empty |
| `proposal/why-substantive` | W                                       | full-variant types only: `## Why` body must be at least 50 characters                                                                                                                                                                                                                                                           |
| `proposal/benchmarks`      | E                                       | `perf` only: `## Benchmarks` present with at least one before/after row                                                                                                                                                                                                                                                         |
| `proposal/revert-citation` | E                                       | `revert` only: `## Reverts` cites a backticked `archive/` slug and/or a 7–40-char hex sha                                                                                                                                                                                                                                       |
| `proposal/surfaces-vocab`  | E                                       | every `## Surfaces` checkbox item — under any CommonMark list marker — carries a token from the closed set defined in [Types & artifacts](/concepts/types-and-artifacts); anything else fails closed                                                                                                                            |

See [Types & artifacts](/concepts/types-and-artifacts) for the full artifact
matrix and the `## Surfaces` token vocabulary.

## `blockers/`

Checks against `blocking-changes.md`'s two gated sections.

| ID                           | Level        | Check                                                                                                        |
| ---------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------ |
| `blockers/sections`          | E            | both gated headings are present with exact text; a near-miss prints the corrected heading                    |
| `blockers/entry-grammar`     | E            | every checkbox-like or slug-carrying line in a gated section is legal grammar; the corrected line is printed |
| `blockers/dangling-ref`      | E            | an entry's slug is neither an active change nor an archived one                                              |
| `blockers/stale-unchecked`   | W (E-strict) | an unchecked entry whose target has been archived — auto-fixable by `sync-blockers`                          |
| `blockers/premature-checked` | W            | a checked entry whose target isn't archived yet (allowed, but surfaced)                                      |
| `blockers/none-conflict`     | E            | `None.` appears alongside actual entries in the same section                                                 |

A gated-section line is checkbox-like under the same marker set as the `tasks/`
family below, so a dependency written `+ [ ] \`dep\``or`1. [ ]
\`dep\``is an`blockers/entry-grammar`ERROR rather than a line no parser sees. That is a gate fact, not a lint one:`cospec
apply`'s hard-blocker gate reads parsed entries only, so an unrecognized
dependency line would leave a genuinely blocked change reading as clear.

## `tasks/`

Checks on `tasks.md`.

A line counts as checkbox-like under any CommonMark list marker OpenSpec's own
task counter reads — `-`, `*`, `+`, `1.`, `1)` — with any box content, but not
when the closing `]` starts a markdown link (`- [Some doc](./doc.md)`). Only
`- [ ] ` / `- [x] ` is canonical; every other recognized form is a
`tasks/checkbox-grammar` ERROR rather than a silently untracked line.

A task id is the number at the start of a task's text, read the way OpenSpec
1.13.1's own numbering check reads it: `1.2`, `1.2.3`, `1.3a` and `01.1` are all
ids, and `1.2.3` and `1.2.4` are two different ones. Ids are read only inside
`## N.` groups — a task above the first group, under an unnumbered heading such
as `## Notes`, or in a file with no numbered group is not checked — and group
numbers compare without leading zeros, so `01.1` belongs under `## 1.`. Fenced
lines are never read. OpenSpec itself runs this check only for its built-in
`spec-driven` schema; cospec runs it for every cospec type, as WARNINGs, so
`--strict` fails on them.

| ID                       | Level | Check                                                                                                                                                    |
| ------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks/has-tasks`        | E     | at least one parseable `- [ ]` / `- [x]` item, when `tasks.md` exists                                                                                    |
| `tasks/checkbox-grammar` | E     | a checkbox-like line that isn't the canonical `- [ ] ` / `- [x] ` form (`-[ ]`, `* [ ]`, `+ [ ]`, `1. [ ]`, `- [~]`, `- [X ]`) — the fixed line is shown |
| `tasks/group-numbering`  | W     | `## N.` group headings are not numbered 1, 2, 3, … in order                                                                                              |
| `tasks/id-mismatch`      | W     | a task's id points to a different group than the `## N.` group it sits under (`2.1` under `## 1.`) — move it or renumber it                              |
| `tasks/id-duplicate`     | W     | two tasks carry the same id; reported on the later one, naming the line of the first                                                                     |

## `verification/`

Runs only for types whose schema declares a verification artifact. See
[Verification](/concepts/verification) for the row grammar, layer vocabulary,
and owner tags these rules check against.

The structural rules (`missing`, `structure`, `row-grammar`, `layer-unknown`,
`owner-unknown`, `evidence-required`, `deferred-reason`) are fail-closed ERRORs
for every type that has this family at all. The per-type required-row rules are
ERROR when verification is required at apply time for that type
(`feat`/`fix`/`perf`/`refactor`); the surface-driven rules and `build`/`ci`'s
`deploy-real-layer` are soft, because a checked `## Surfaces` box only ever
soft-promotes a requirement.

| ID                                  | Level        | Check                                                                                                                                             |
| ----------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verification/missing`              | I / E-strict | `verification.md` is required at apply time and absent                                                                                            |
| `verification/structure`            | E            | at least one `## N. behavior` group exists; every group has at least one row                                                                      |
| `verification/row-grammar`          | E            | a checkbox-like line (same marker set as the `tasks/` family above) doesn't parse as `- [<state>] N.M @<layer> [(<owner>)] <probe> -> <result>`   |
| `verification/layer-unknown`        | E            | `@<layer>` is outside the closed [layer vocabulary](/concepts/verification) and isn't extended via `openspec/config.yaml`'s `verification.layers` |
| `verification/owner-unknown`        | E            | `(<owner>)` is present and is neither `(agent)` nor `(human)`                                                                                     |
| `verification/evidence-required`    | E            | a `[x]` row's `-> <result>` is empty                                                                                                              |
| `verification/deferred-reason`      | E            | a `[~]` row has no non-empty `defer: <reason>`                                                                                                    |
| `verification/critical-real-layer`  | E            | `feat` only: a `[critical]` group has no row on a layer other than `@unit`                                                                        |
| `verification/reproduces-bug`       | E            | `fix` only: no `@regression` row anywhere in the ledger                                                                                           |
| `verification/equivalence`          | E            | `perf` only: missing a `@benchmark` row, an `@equivalence` row, or both                                                                           |
| `verification/invariant`            | E            | `refactor` only: no `@equivalence` row                                                                                                            |
| `verification/deploy-real-layer`    | W (E-strict) | `build`/`ci` only, `deploy` surface checked: no `@runtime` row                                                                                    |
| `verification/interactive-required` | W (E-strict) | `interactive` surface checked: no `@manual` or `@e2e` row                                                                                         |
| `verification/eval-check`           | W (E-strict) | `agent-behavior` surface checked: no `@eval` row                                                                                                  |
| `verification/integration-check`    | W (E-strict) | `integration` surface checked: no `@integration` row                                                                                              |

## `design/`

Fires only when the matching `## Surfaces` box is checked in `proposal.md`,
except `seam-ownership`, which always fires for `refactor`. All soft (WARNING,
ERROR under `--strict`).

| ID                            | Level        | Check                                                                                           |
| ----------------------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| `design/operational-surface`  | W (E-strict) | `feat`/`fix`/`refactor`, `interactive` or `deploy` checked: no `## Operational surface` section |
| `design/integration-contract` | W (E-strict) | `feat`/`fix`/`refactor`, `integration` checked: no `## Integration contract` section            |
| `design/seam-ownership`       | W (E-strict) | `refactor`, always: no `## Seam ownership` section                                              |

## `deltas/`

Spec-bearing changes only. These run before delegating to `openspec validate`,
so cospec's own diagnostics win the report. See OpenSpec's
[writing-specs.md](https://github.com/Fission-AI/OpenSpec/blob/main/docs/writing-specs.md)
for the delta format these rules enforce.

A requirement header's `Requirement:` keyword is matched case-insensitively, so
`### requirement: Foo` and `### REQUIREMENT: Foo` are the same header as
`### Requirement: Foo` — the name itself keeps its case, and every comparison
against it (living-spec lookups, collisions, renames) stays case-sensitive. The
tolerance stops at that header: the bulleted `## REMOVED Requirements` form and
the `FROM:`/`TO:` rename keywords are case-sensitive, because OpenSpec's reader
parses no delta from a lower-case one. Write the canonical `Requirement:`
anyway; the tolerance exists so cospec's gates see exactly the operations
OpenSpec applies.

| ID                            | Level | Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deltas/scenario-depth`       | E     | a `### Scenario:` heading uses three hashtags — it must be `#### Scenario:`. The message quotes the header as written (`scenario heading "### Scenario: <name>" uses 3 hashtags; …`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `deltas/header-present`       | E     | each `specs/*/spec.md` has at least one `## ADDED\|MODIFIED\|REMOVED\|RENAMED Requirements` header                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `deltas/requirement-shape`    | E     | ADDED/MODIFIED requirements have a SHALL/MUST statement plus at least one `#### Scenario:` that carries a body — a bare header counts as no scenario. The keyword counts in the body only: when it appears only in the `### Requirement:` header, the hint says to move the SHALL/MUST statement to the line immediately after the header. The message names the requirement by its header as written, so a header carrying a trailing HTML comment is named with it, as OpenSpec names it                                                                                                                                                                                                                                                                                                        |
| `deltas/skipped-header`       | I     | a `###` header inside an ADDED/MODIFIED section that isn't a named `### Requirement:` header — a divider like `### Documentation Requirements`, or a `### Requirement:` with no name — and that the archive keeps: one above the first requirement, or one inside a block that leaves every piece of it a scenario (see `archive/split-requirement`). Both readers skip it, so nothing under it is validated as a requirement of its own; it stays part of the block it sits in. A header inside a block that the archive refuses is `archive/split-requirement`'s ERROR instead — but only when that family runs: under `--fast` the header keeps this INFO. A `### Scenario:` line is left to `deltas/scenario-depth`, and a fenced, REMOVED-section or HTML-commented header is never reported |
| `deltas/unpaired-rename`      | E     | a `FROM:` or `TO:` line in `## RENAMED Requirements` that forms no pair — write each rename as a `FROM:` line followed immediately by its `TO:` line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `deltas/orphaned-requirement` | W     | a `### Requirement:` block outside all four delta sections — the reader ignores it, so move it under a delta section                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `deltas/unread-file`          | E     | a markdown file under `specs/` that carries delta section headers but isn't named `spec.md` (`specs/user-auth.md`, `specs/user-auth/delta.md`) — nothing reads it, so its requirements are silently dropped at apply/archive; move them into the capability's real `spec.md`. A companion note with no delta section is not reported                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `deltas/capability-kebab`     | E     | every segment of a capability path is kebab-case — the delta lives at `specs/<cap>/spec.md` or, for a nested layout, `specs/<area>/<cap>/spec.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `deltas/spec-at-specs-root`   | E     | a delta at `specs/spec.md` (no capability directory) — ignored by apply/archive, matching OpenSpec 1.7.0's own block on this layout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `deltas/skip-specs-conflict`  | E     | `.openspec.yaml` declares `skip_specs: true` while files exist under `specs/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## `archive/`

The archive-precondition family: set-membership checks against living-spec
requirement names, mirroring OpenSpec's own preconditions. Runs at validate time
(skipped by `--fast`) so an archive failure surfaces before you get to
`cospec archive`. See [apply and archive](/concepts/apply-and-archive) for how
these preconditions relate to the archive command's runtime verifier.

cospec reads each delta and living spec once, as two views of one scan. Code
fences are found first, on the raw lines, and an HTML comment can neither open
nor close on a fenced line — a `<!--` shown inside a fenced example is code, and
hides nothing after it.

- The **verbatim** view masks fenced code and nothing else. It is exactly what
  OpenSpec's readers and its archive see, so every rule in this family reads it,
  `archive/scenario-preservation` included: an operation written inside
  `<!-- … -->` is still applied, a scenario inside one still counts, and a
  header's trailing comment is part of its name (`ADDED "Foo <!-- note -->"` is
  a different requirement from `REMOVED "Foo"`). A UTF-8 BOM is dropped, as
  OpenSpec's readers drop it — except for `archive/target-invalid`'s structure
  check, which keeps it the way OpenSpec's `findMainSpecStructureIssues` does.
- The **masked** view also blanks HTML comments. Only the advisory `deltas/*`
  rules read it, so a commented-out draft draws no authoring finding. The hard
  scenario-preservation gate in `cospec archive` reads this view too, so it can
  refuse a MODIFIED block that keeps a living scenario only inside a comment,
  which this family and OpenSpec's archive both accept.

| ID                              | Level        | Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `archive/no-ops`                | E            | a delta file parses to zero operations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `archive/target-missing`        | E            | a MODIFIED / RENAMED-FROM / REMOVED target is absent from the spec as the merge has it when that operation runs — the living spec with this delta's earlier operations applied, in OpenSpec's order (RENAMED, REMOVED, MODIFIED, ADDED) — so a header an earlier RENAMED in the same delta created resolves, and one it carried away does not (the message then says an earlier operation renamed or removed it). Two early-sync shapes are exempt, matching openspec: a REMOVED target that is already gone, and a RENAMED whose FROM is gone while its TO is present (which also suppresses the living-spec half of this delta's `archive/added-exists` TO-collision). Either exemption is withheld — and the hint then names the exact header — when a name that survives to that operation folds equal to the target (case-insensitive, whitespace-collapsed) without being it, because that is a mistyped header the binary aborts on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `archive/new-spec-non-added`    | E            | a capability with no living spec has MODIFIED/RENAMED/REMOVED operations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `archive/added-exists`          | E            | an ADDED target already exists — in the spec as the merge has it by the ADDED phase, so a header this delta's own RENAMED vacated is free to re-use — with a body (normalized raw text) that differs from the living requirement — an identical block is treated as an already-synced no-op, matching openspec's own early-sync behavior; a RENAMED-TO collides with an existing or ADDED name regardless of body, except that the living-name half is suppressed for an already-applied rename (see `archive/target-missing`) — the ADDED half is delta-internal and always checked. Also fires (OpenSpec 1.13.1) when an ADDED name or a RENAMED-TO target _folds_ onto an existing requirement name — case-insensitive, interior-whitespace runs collapsed — even without an exact match, because applying it would leave two contradicting copies of one requirement in the spec. Every arm reads the spec as the merge has it when that operation runs (the living spec with the delta's earlier operations applied, in OpenSpec's order: RENAMED, REMOVED, MODIFIED, ADDED), so a delta collides with itself too — two ADDED names that fold onto each other, an ADDED folding onto the delta's own RENAMED target, a second RENAMED target folding onto the first — reported on the later operation, for a new capability as much as a living one; the message names whether the twin is a living requirement or one an earlier operation in the delta wrote. Two exclusions from the fold check: the rename's own source name, and the early-sync exemptions above. A name the same delta removes or renames away needs none — it is already gone from the spec the fold check reads. Also fires, once per ADDED and ahead of every other arm, when the same delta file REMOVEs or MODIFIES the ADDED's exact name (`ADDED "<name>" is also REMOVED in this delta` / `… is also MODIFIED …`), for a new capability or a living one, even when the ADDED block is identical to the living requirement: OpenSpec refuses a requirement one delta both adds and removes, or both adds and modifies, before any merge runs, so re-using a header the same delta REMOVEs is refused. Names compare exactly here, so a fold variant (`REMOVED Widget rendering` + `ADDED WIDGET RENDERING`) is not this conflict |
| `archive/target-invalid`        | E            | the target living spec is structurally invalid: missing `## Purpose`/`## Requirements`, or one of the three defects OpenSpec's archive refuses to update past (`target spec is structurally invalid`) — a delta header (`## ADDED Requirements` and its siblings, any case, any spacing between the words), a `### Requirement:` outside the `## Requirements` section, or a second requirement under a name already declared there (names compared after the closing-`#` strip). Those three are read as OpenSpec reads them: fenced lines are excluded, HTML comments are not — a commented-out requirement under `## Purpose`, or a delta header on its own line inside a comment, is refused too — and a UTF-8 BOM is kept, so a BOM before a first-line `## Requirements` hides that header and every requirement reads as outside it. The message names each defect's line                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `archive/split-requirement`     | E            | a skipped `###` header (see `deltas/skipped-header`) inside an ADDED or MODIFIED block that leaves a piece of the block with no scenario. OpenSpec's archive appends the block verbatim, then re-validates the rebuilt spec, whose reader takes every `###` header as a requirement of its own — so the header cuts the block, and a piece with no `#### Scenario:` aborts the archive (`Requirement must have at least one scenario`). Fires on the header when it sits between the requirement's text and its first scenario, or when no scenario follows it before the next header; one followed by a scenario of its own archives and stays a `deltas/skipped-header` INFO. Reads HTML comments as the archive does, so a header inside `<!-- … -->` splits the block too; a fenced header is content, and a visible `### Scenario:` line is `deltas/scenario-depth`'s alone. Also fires on the living spec: the rebuilt spec keeps every living requirement in its first `## Requirements` section that the delta neither MODIFIES, REMOVES nor ADDs, as written — a RENAMED carries it to its new name — so a skipped header already inside one splits it there, and the message names the living line. A header on one line with its comment (`<!-- ### Notes -->`) is no header at all                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `archive/scenario-preservation` | W (E-strict) | advisory mirror of the hard archive-time gate of the same name: a MODIFIED requirement no longer covers a living `#### Scenario:` — by name (counted with multiplicity, compared case-sensitively, so a renamed scenario reads as a drop even at an unchanged count) or by a plain count shrink. A MODIFIED naming a header this delta renamed into existence is measured against the RENAMED source's living block, because that is the block OpenSpec compares it to. Both sides are read on the verbatim view, as OpenSpec's scenario-loss check reads them: a scenario inside an HTML comment counts, and a comment-bearing header is named as written. Message: `MODIFIED "&lt;name&gt;" drops scenario(s) "&lt;a&gt;", "&lt;b&gt;" (living &lt;n&gt; -&gt; delta &lt;m&gt;)`. The hint gains an extra leading clause — a note that a `Scenario removed:` line no longer excuses the drop — only when the author wrote that now-retired note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

::: warning cospec can be stricter than OpenSpec here A false PASS at validate
time — cospec says OK but `cospec archive` still aborts — is treated as a
release-blocking bug in cospec itself, and the archive command's own runtime
verifier still catches it, so an archive is never silently corrupted. Parity
between this family and the real archive behavior is checked by contract tests
against the pinned OpenSpec binary. :::

### The two hard archive gates

`cospec archive` runs two additional checks as explicit command steps, before
delegating to OpenSpec's own archive — not folded into the table above, because
a real breach here must never report as a clean archive. Both exit with the same
failure code the tasks gate uses, and neither has a `--force` override:

- **`archive/verification-incomplete`** — runs after the tasks gate, independent
  of specs (so it fires for a specs-less `fix` too). Whenever verification is
  required for this change's type, every row must be `[x]` with non-empty
  evidence or `[~]` with a reason; any bare `[ ]` row refuses the archive.
- **`archive/scenario-preservation`** — runs immediately before OpenSpec's
  archive executes, for spec-bearing changes only. Same check as the advisory
  rule above, but as a hard block — this catches the class of scenario thinning
  that `openspec archive` would otherwise merge silently.

See [Apply and archive](/concepts/apply-and-archive) for the full archive exit
code table.

### The `openspec/validate` INFO class and dedupe

For a spec-bearing change, cospec delegates to `openspec validate` after its own
rule families finish, and every delegated finding cospec doesn't have a tighter
native rule for is re-rendered under the shared id `openspec/validate` — level,
path, line, and message carried through unchanged. From OpenSpec 1.12.0, that
delegated run dry-runs the archive merge as part of validation and reports each
thing that would refuse the merge as an **INFO**-level `openspec/validate` issue
— one per precondition, one per delta file. INFO never blocks: `normalizeLevel`
accepts it, but only ERROR and WARNING (WARNING only under `--strict`) count
toward `valid` or the exit code, so this arrives as extra context, never a new
way to fail.

Most of what that dry-run reports is the same defect cospec's own `archive/*`
family already caught as an ERROR — a MODIFIED/REMOVED/RENAMED target that's
missing, a RENAMED-TO or ADDED name that collides. Printing both would double
every one of those findings in the count and in `--strict`'s exit code, so
`mergeDelegated` suppresses a delegated finding whenever a cospec rule already
fired on the _same requirement, in the same file_ — never on message text alone.
One dedupe entry exists per distinct upstream precondition shape (the exact
thrown-string family, not a shared prefix), so `archive/target-missing` pairs
against three separate MODIFIED/REMOVED/RENAMED-source shapes and
`archive/added-exists` against four (plain RENAMED-TO/ADDED collisions, plus
OpenSpec 1.13.1's two case-fold variants). One shape has deliberately **no**
native twin and always reaches the reader:
`… MODIFIED failed for header "…" - header mismatch in content`. The
scenario-preservation precondition never reaches this INFO class at all —
OpenSpec's own dry-run skips a path that already carries an ERROR, and its
scenario-loss check reports one on that path first — so at most one
archive-preflight INFO can appear per delta file per run.

`tasks/has-tasks` gets the same treatment against a different upstream signal:
OpenSpec 1.13.1 warns `This change counts as 0 tasks: …` for the same state
cospec already reports as an ERROR, so the delegated WARNING is suppressed as a
pure duplicate — cospec is strictly ahead here, not merely parallel.

`deltas/unpaired-rename` is the case where the pin caught _up_. cospec grew that
rule while OpenSpec still dropped a stray `FROM:`/`TO:` line silently; 1.13.1
added its own ERROR whose first sentence is byte-identical, plus a remedy
sentence. It is deduped on the whole
`<side>: "<name>" has no matching <side>: line` span, so the other side of the
same pair, a different requirement name, or the same defect in a different delta
file each stay a separate finding.

OpenSpec 1.13.1's change validator reports several more defects that cospec's
own rules already caught, and each is suppressed on the same terms — the cospec
rule fired on the same file, and where a name or header is part of the finding,
on the same one:

| cospec rule                 | Delegated finding it suppresses                                                                                                                                              | Keyed on                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `archive/no-ops`            | `Delta sections … were found, but no requirement entries parsed.` (ERROR)                                                                                                    | the file                   |
| `archive/no-ops`            | `Change must have at least one delta. No deltas found. …` (ERROR, change-level)                                                                                              | —                          |
| `deltas/skipped-header`     | `Header "### <text>" in <section> is not a "### Requirement:" header …` and `… is missing a requirement name …` (INFO)                                                       | the file and header text   |
| `archive/split-requirement` | the same two INFOs, `### Scenario: …` included, for a header inside a block the archive refuses                                                                              | the file and header text   |
| `deltas/scenario-depth`     | the same not-a-requirement INFO for a `### Scenario: …` header                                                                                                               | the file and header text   |
| `deltas/requirement-shape`  | `<OP> "<name>" should contain SHALL or MUST …` (WARNING), `<OP> "<name>" must contain SHALL or MUST …` (ERROR) and `<OP> "<name>" is missing requirement text` (ERROR)       | the file and requirement   |
| `deltas/requirement-shape`  | `<OP> "<name>" must include at least one scenario` (ERROR), with or without OpenSpec's empty-scenario hint                                                                   | the file and requirement   |
| `archive/added-exists`      | `Requirement present in both ADDED and REMOVED: "<name>"` and `Requirement present in both MODIFIED and ADDED: "<name>"` (ERROR)                                             | the file, name and section |
| `archive/added-exists`      | `Duplicate requirement in ADDED: "<name>"`, `Duplicate TO in RENAMED: "<name>"` and `RENAMED TO collides with ADDED for "<name>"` (ERROR)                                    | the file and name          |
| `archive/target-missing`    | `Requirement present in both MODIFIED and REMOVED: "<name>"` and `Duplicate FROM in RENAMED: "<name>"` (ERROR), against the "no longer exists" finding                       | the file and name          |
| `archive/target-invalid`    | `Archive would refuse this delta: <cap>: target spec is structurally invalid …` (INFO), when every defect it lists is a delta header, a misplaced or a duplicate requirement | the file and capability    |

cospec keeps its own severity for each: the SHALL/MUST shapes OpenSpec grades as
WARNINGs stay one cospec ERROR. A delegated finding with no cospec twin still
reaches the reader — a SHALL/MUST that sits only in a scenario step satisfies
cospec's rule but not OpenSpec's requirement-text reader, and a header inside an
HTML comment above the first requirement is masked from cospec's advisory reader
but not from OpenSpec's (the archive drops it, so no `archive/*` rule fires
either). A `### Scenario:` pairs by its header text, so a commented one keeps
its INFO beside a real one with different text in the same file; when a
commented and a real `### Scenario:` read the same, the real one's
`deltas/scenario-depth` finding pairs with both INFOs, and the commented one's
is suppressed too. Under `--fast` the `archive/*` family doesn't run, so its
delegated twins are kept, and a splitting skipped header is a
`deltas/skipped-header` INFO again, which its delegated INFO pairs with. These
pairings apply to cospec-typed changes; a legacy change relays every delegated
finding at OpenSpec's own level.

## `specs/`

Runs when validating living specs directly (`cospec validate --specs`), which
always delegates to `openspec validate --specs` and layers cospec's own check on
top.

| ID                  | Level | Check                                                                                                                                                                                                |
| ------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `specs/purpose-tbd` | W     | `## Purpose`'s first non-blank text is the archive-generated `TBD - created by archiving` placeholder, or opens with a bare `TBD`/`TODO` marker (a marker mid-sentence is deliberately not reported) |
| _(delegated)_       | —     | every issue from `openspec validate --specs --strict`, re-rendered in cospec's format                                                                                                                |

## Output shape

Human-readable output groups by change, keeps rule IDs greppable, and always
prints a hint:

```
cospec validate — 2 changes, 5 specs

✗ add-widget  (feat)
  ERROR   specs/widgets/spec.md:14  deltas/scenario-depth   scenario heading "### Scenario: Render" uses 3 hashtags; must be `#### Scenario:`
  ERROR   blocking-changes.md:7     blockers/dangling-ref   `add-auth` is not an active or archived change
          hint: `cospec list` shows active changes; fix the slug or remove the entry
  WARNING proposal.md               proposal/why-substantive  ## Why is shorter than 50 characters
✓ fix-null-crash  (fix)
✓ specs: 5/5 valid

2 errors, 1 warning — validation failed
```

`--json` emits:

```json
{
  "version": "...",
  "items": [
    {
      "id": "add-widget",
      "kind": "change",
      "type": "feat",
      "valid": false,
      "issues": [
        {
          "level": "ERROR",
          "rule": "deltas/scenario-depth",
          "path": "specs/widgets/spec.md",
          "line": 14,
          "message": "scenario heading \"### Scenario: Render\" uses 3 hashtags; must be `#### Scenario:`",
          "hint": null,
          "fixable": false
        }
      ]
    }
  ],
  "summary": { "errors": 2, "warnings": 1, "byRule": { "...": 1 } }
}
```

Each issue carries `level`, `rule`, `path`, an optional `line`, `message`, an
optional `hint`, and `fixable`.
