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
| `proposal/surfaces-vocab`  | E                                       | every `## Surfaces` checkbox token is one of the closed set defined in [Types & artifacts](/concepts/types-and-artifacts) — anything else fails closed                                                                                                                                                                          |

See [Types & artifacts](/concepts/types-and-artifacts) for the full artifact
matrix and the `## Surfaces` token vocabulary.

## `blockers/`

Checks against `blocking-changes.md`'s two gated sections.

| ID                           | Level        | Check                                                                                     |
| ---------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| `blockers/sections`          | E            | both gated headings are present with exact text; a near-miss prints the corrected heading |
| `blockers/entry-grammar`     | E            | every line in a gated section is legal grammar; the corrected line is printed             |
| `blockers/dangling-ref`      | E            | an entry's slug is neither an active change nor an archived one                           |
| `blockers/stale-unchecked`   | W (E-strict) | an unchecked entry whose target has been archived — auto-fixable by `sync-blockers`       |
| `blockers/premature-checked` | W            | a checked entry whose target isn't archived yet (allowed, but surfaced)                   |
| `blockers/none-conflict`     | E            | `None.` appears alongside actual entries in the same section                              |

## `tasks/`

Checks on `tasks.md`.

| ID                       | Level | Check                                                                                                     |
| ------------------------ | ----- | --------------------------------------------------------------------------------------------------------- |
| `tasks/has-tasks`        | E     | at least one parseable `- [ ]` / `- [x]` item, when `tasks.md` exists                                     |
| `tasks/checkbox-grammar` | E     | a checkbox-like line OpenSpec's tracker won't parse (`-[ ]`, `* [ ]`, `- [X ]`) — the fixed line is shown |
| `tasks/group-numbering`  | W     | `## N.` groups are non-sequential, or `N.M` prefixes are inconsistent                                     |

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
| `verification/row-grammar`          | E            | a checkbox-like line doesn't parse as `- [<state>] N.M @<layer> [(<owner>)] <probe> -> <result>`                                                  |
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

| ID                           | Level | Check                                                                                                                                             |
| ---------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deltas/scenario-depth`      | E     | a `### Scenario:` heading uses three hashtags — it must be `#### Scenario:`                                                                       |
| `deltas/header-present`      | E     | each `specs/*/spec.md` has at least one `## ADDED\|MODIFIED\|REMOVED\|RENAMED Requirements` header                                                |
| `deltas/requirement-shape`   | E     | ADDED/MODIFIED requirements have a SHALL/MUST statement plus at least one `#### Scenario:`                                                        |
| `deltas/capability-kebab`    | E     | every segment of a capability path is kebab-case — the delta lives at `specs/<cap>/spec.md` or, for a nested layout, `specs/<area>/<cap>/spec.md` |
| `deltas/spec-at-specs-root`  | E     | a delta at `specs/spec.md` (no capability directory) — ignored by apply/archive, matching OpenSpec 1.7.0's own block on this layout               |
| `deltas/skip-specs-conflict` | E     | `.openspec.yaml` declares `skip_specs: true` while files exist under `specs/`                                                                     |

## `archive/`

The archive-precondition family: set-membership checks against living-spec
requirement names, mirroring OpenSpec's own preconditions. Runs at validate time
(skipped by `--fast`) so an archive failure surfaces before you get to
`cospec archive`. See [apply and archive](/concepts/apply-and-archive) for how
these preconditions relate to the archive command's runtime verifier.

| ID                              | Level        | Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archive/no-ops`                | E            | a delta file parses to zero operations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `archive/target-missing`        | E            | a MODIFIED / RENAMED-FROM / REMOVED target is absent from the living spec. Two early-sync shapes are exempt, matching openspec: a REMOVED target that is already gone, and a RENAMED whose FROM is gone while its TO is present (which also suppresses this delta's `archive/added-exists` TO-collision). Either exemption is withheld — and the hint then names the exact living header — when a living name folds equal to the target (case-insensitive, whitespace-collapsed) without being it, because that is a mistyped header the binary aborts on                              |
| `archive/new-spec-non-added`    | E            | a capability with no living spec has MODIFIED/RENAMED/REMOVED operations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `archive/added-exists`          | E            | an ADDED target already exists with a body (normalized raw text) that differs from the living requirement — an identical block is treated as an already-synced no-op, matching openspec's own early-sync behavior; a RENAMED-TO unconditionally collides with an existing/ADDED name regardless of body                                                                                                                                                                                                                                                                                |
| `archive/target-invalid`        | E            | the target living spec is structurally invalid (missing `## Purpose`/`## Requirements`, or still contains delta headers)                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `archive/scenario-preservation` | W (E-strict) | advisory mirror of the hard archive-time gate of the same name: a MODIFIED requirement no longer covers a living `#### Scenario:` — by name (counted with multiplicity, compared case-sensitively, so a renamed scenario reads as a drop even at an unchanged count) or by a plain count shrink. Message: `MODIFIED "&lt;name&gt;" drops scenario(s) "&lt;a&gt;", "&lt;b&gt;" (living &lt;n&gt; -&gt; delta &lt;m&gt;)`. The hint gains an extra leading clause — a note that a `Scenario removed:` line no longer excuses the drop — only when the author wrote that now-retired note |

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
  ERROR   specs/widgets/spec.md:14  deltas/scenario-depth   scenario heading uses 3 hashtags; must be `#### Scenario:`
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
          "message": "scenario heading uses 3 hashtags; must be `#### Scenario:`",
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
