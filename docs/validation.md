# Validation

`cospec validate` owns change validation. It runs cospec's own rule families
over every change and delegates to `openspec validate` only for spec-bearing
changes with deltas — and even then, cospec's sharper diagnostics run first so
they win the report.

```
cospec validate [name] [--all|--changes|--specs] [--strict] [--json] [--fast]
```

- No arguments defaults to `--all`.
- `--strict` promotes every WARNING to blocking (hooks and CI use it).
- `--fast` skips the archive-precondition checks (used internally by `apply`).
- Exit 1 if there are errors (or warnings under `--strict`); otherwise 0.

## Composition

For each change, cospec resolves the schema from `.openspec.yaml`, then:

1. If the schema is one of the eleven types, it runs the `meta`, `proposal`,
   `blockers`, and `tasks` families always.
2. If the schema forbids specs and a `specs/` file exists →
   `meta/forbidden-artifact`.
3. If the schema declares `verification`
   (`schema.declared.has('verification')`), it runs the `verification` family —
   wired into `runChangeRules()` the same way `deltas`/`archive` are gated on
   `specs`.
4. If the schema declares specs and delta files exist, it runs the `deltas`
   family, then delegates to
   `openspec validate --strict --no-interactive --json` and merges the issues,
   then (unless `--fast`) runs the archive-precondition family.
5. `openspec validate` is **never** invoked for a change whose schema has no
   specs artifact — its hardcoded `CHANGE_NO_DELTAS` rule would false-error.

Living specs (`--specs`) always delegate to `openspec validate --specs` (sound
and schema-independent), with cospec's `specs/purpose-tbd` on top.

## Rule registry

Rule IDs are stable public API. Levels: **E** = ERROR, **W** = WARNING (blocking
under `--strict`), **I** = INFO. Every issue carries a one-line hint.

### `meta/`

| ID                        | Level        | Check                                                                                                                                                                                                                                                                               |
| ------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta/openspec-yaml`      | E            | `.openspec.yaml` present, parseable, `schema:` non-empty; `created:` is `YYYY-MM-DD` when present                                                                                                                                                                                   |
| `meta/schema-unknown`     | E            | schema is not one of the eleven and not resolvable anywhere                                                                                                                                                                                                                         |
| `meta/legacy-schema`      | I            | schema resolvable but not a cospec type — legacy mode engaged                                                                                                                                                                                                                       |
| `meta/name-kebab`         | E            | change dir is kebab-case with no `YYYY-MM-DD-` prefix (collides with archive naming)                                                                                                                                                                                                |
| `meta/forbidden-artifact` | E            | a file exists for an artifact the schema does not declare (e.g. `specs/` in `ci`)                                                                                                                                                                                                   |
| `meta/unexpected-file`    | W            | a file matches no declared artifact glob — excludes `README.md`, `.openspec.yaml`, `.refine/`                                                                                                                                                                                       |
| `meta/empty-change`       | I            | change has `.openspec.yaml` but zero artifacts — reported as "in progress", never as an unknown item                                                                                                                                                                                |
| `meta/surface-unmet`      | W (E-strict) | a checked `## Surfaces` flag's consequence is absent, for a type whose target is not Forbidden (an O(trig) type — revert/build/ci — whose `verification.md` does not exist at all; a missing row on an _existing_ file is owned by `verification/*` instead, never double-reported) |
| `meta/schema-outdated`    | I            | change is on `schemaVersion 1` (absent ⇒ 1) — some artifacts (e.g. `verification`) are grandfathered out until `cospec migrate`; never blocks                                                                                                                                       |
| `change/artifact-missing` | I / E-strict | an `apply.requires` artifact file does not exist yet (`verification` is excluded here — `verification/missing` owns it)                                                                                                                                                             |

### `proposal/`

| ID                         | Level                                   | Check                                                                                                                                                                                   |
| -------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proposal/missing`         | W (E-strict when other artifacts exist) | `proposal.md` absent                                                                                                                                                                    |
| `proposal/sections`        | E                                       | required H2s per variant: full → `## Why`, `## What Changes`, `## Impact` (+ `## Capabilities` for feat, and fix when `specs/` exists); lite → `## Why`, `## What Changes`, `## Impact` |
| `proposal/why-substantive` | W                                       | full-variant types: `## Why` body is at least 50 characters                                                                                                                             |
| `proposal/benchmarks`      | E                                       | perf only: `## Benchmarks` present with at least one before/after row                                                                                                                   |
| `proposal/revert-citation` | E                                       | revert only: `## Reverts` with a backticked slug in `archive/` and/or a 7–40-hex sha                                                                                                    |
| `proposal/surfaces-vocab`  | E                                       | every `## Surfaces` checkbox item's token is one of `interactive`, `deploy`, `integration`, `agent-behavior` (fail-closed on any other token)                                           |

### `blockers/`

Grammar is specified in [blocking-changes.md](blocking-changes.md).

| ID                           | Level        | Check                                                                                         |
| ---------------------------- | ------------ | --------------------------------------------------------------------------------------------- |
| `blockers/sections`          | E            | both gated headings present with exact text; near-miss detection prints the corrected heading |
| `blockers/entry-grammar`     | E            | every line in a gated section is legal; the corrected line is printed                         |
| `blockers/dangling-ref`      | E            | an entry slug is neither an active change nor an archive suffix                               |
| `blockers/stale-unchecked`   | W (E-strict) | an unchecked entry whose target is archived — auto-fixable by `sync-blockers`                 |
| `blockers/premature-checked` | W            | a checked entry whose target is not archived (allowed, but surfaced)                          |
| `blockers/none-conflict`     | E            | `None.` coexisting with entries in the same section                                           |

### `tasks/`

| ID                       | Level | Check                                                                                                    |
| ------------------------ | ----- | -------------------------------------------------------------------------------------------------------- |
| `tasks/has-tasks`        | E     | at least one parseable `- [ ]` / `- [x]` item (when `tasks.md` exists)                                   |
| `tasks/checkbox-grammar` | E     | checkbox-like lines OpenSpec's tracker won't parse (`-[ ]`, `* [ ]`, `- [X ]`) — the fixed line is shown |
| `tasks/group-numbering`  | W     | `## N.` groups non-sequential or `N.M` prefixes inconsistent                                             |

### `verification/`

Runs only when the schema declares `verification`
(`schema.declared.has('verification')`). Grammar in [schemas.md](schemas.md).
The `missing`/`structure`/`row-grammar`/
`layer-unknown`/`owner-unknown`/`evidence-required`/`deferred-reason` rules are
fail-closed ERRORs regardless of type. The per-type required-row rules are ERROR
when `verification` is in `schema.applyRequires` for this change's type
(feat/fix/perf/refactor); the surface-driven and build/ci `deploy-real-layer`
rules are soft (WARNING, ERROR under `--strict`) because a `## Surfaces` flag
only ever soft-promotes.

| ID                                  | Level        | Check                                                                                                                                                                                                |
| ----------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verification/missing`              | I / E-strict | `verification.md` is required by `apply.requires` (post-grandfathering) and absent                                                                                                                   |
| `verification/structure`            | E            | at least one `## N. behavior` group; every group has at least one row                                                                                                                                |
| `verification/row-grammar`          | E            | a checkbox-like line does not parse as `- [<state>] N.M @<layer> [(<owner>)] <probe> -> <result>`                                                                                                    |
| `verification/layer-unknown`        | E            | `@<layer>` is outside the closed vocabulary (`@unit @integration @e2e @manual @runtime @regression @equivalence @benchmark @eval`) and not extended via `openspec/config.yaml` `verification.layers` |
| `verification/owner-unknown`        | E            | `(<owner>)` is present and is neither `(agent)` nor `(human)`                                                                                                                                        |
| `verification/evidence-required`    | E            | a `[x]` row's ` -> <result>` is empty                                                                                                                                                                |
| `verification/deferred-reason`      | E            | a `[~]` row has no non-empty `defer: <reason>`                                                                                                                                                       |
| `verification/critical-real-layer`  | E            | feat only: a `[critical]` group has no row whose layer is not `@unit`                                                                                                                                |
| `verification/reproduces-bug`       | E            | fix only: no `@regression` row anywhere in the ledger                                                                                                                                                |
| `verification/equivalence`          | E            | perf only: missing a `@benchmark` row, an `@equivalence` row, or both                                                                                                                                |
| `verification/invariant`            | E            | refactor only: no `@equivalence` row                                                                                                                                                                 |
| `verification/deploy-real-layer`    | W (E-strict) | build/ci only, `deploy` surface checked: no `@runtime` row                                                                                                                                           |
| `verification/interactive-required` | W (E-strict) | `interactive` surface checked: no `@manual` or `@e2e` row                                                                                                                                            |
| `verification/eval-check`           | W (E-strict) | `agent-behavior` surface checked: no `@eval` row                                                                                                                                                     |
| `verification/integration-check`    | W (E-strict) | `integration` surface checked: no `@integration` row                                                                                                                                                 |

### `design/`

Fires only when the matching `## Surfaces` flag is checked in `proposal.md`,
except `seam-ownership`, which fires unconditionally for `refactor`. All soft
(WARNING, ERROR under `--strict`) — design's own matrix placement (O for
feat/fix/perf, R for refactor, F for revert + light types) is unchanged.

| ID                            | Level        | Check                                                                                     |
| ----------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| `design/operational-surface`  | W (E-strict) | feat/fix/refactor, `interactive` or `deploy` checked: no `## Operational surface` section |
| `design/integration-contract` | W (E-strict) | feat/fix/refactor, `integration` checked: no `## Integration contract` section            |
| `design/seam-ownership`       | W (E-strict) | refactor, always: no `## Seam ownership` section                                          |

### `deltas/`

Spec-bearing changes only; these run before delegation so cospec's diagnostics
win.

| ID                         | Level | Check                                                                                              |
| -------------------------- | ----- | -------------------------------------------------------------------------------------------------- |
| `deltas/scenario-depth`    | E     | a `### Scenario:` heading uses three hashtags; it must be `#### Scenario:`                         |
| `deltas/header-present`    | E     | each `specs/*/spec.md` has at least one `## ADDED\|MODIFIED\|REMOVED\|RENAMED Requirements` header |
| `deltas/requirement-shape` | E     | ADDED/MODIFIED requirements have SHALL/MUST plus at least one `#### Scenario:`                     |
| `deltas/capability-kebab`  | E     | capability dirs are kebab-case; the delta file is `specs/<cap>/spec.md`                            |

### `archive/`

The archive-precondition family — set-membership checks against living-spec
requirement names, mirroring OpenSpec's own preconditions. Run at validate time
(skipped by `--fast`) to move the archive failure left. See
[apply-archive.md](apply-archive.md) for the runtime verifier that backs them.

| ID                              | Level        | Check                                                                                                                                                                           |
| ------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archive/no-ops`                | E            | a delta file parses to zero operations                                                                                                                                          |
| `archive/target-missing`        | E            | a MODIFIED / RENAMED-FROM / REMOVED target is absent from the living spec                                                                                                       |
| `archive/new-spec-non-added`    | E            | a capability with no living spec has MODIFIED/RENAMED/REMOVED ops                                                                                                               |
| `archive/added-exists`          | E            | an ADDED target already exists, or a RENAMED-TO collides with an existing/ADDED name                                                                                            |
| `archive/target-invalid`        | E            | the target living spec is structurally invalid (missing `## Purpose`/`## Requirements`, or contains delta headers)                                                              |
| `archive/scenario-preservation` | W (E-strict) | advisory mirror of the hard `cospec archive` command step: a MODIFIED requirement drops `#### Scenario:` count with no `Scenario removed: <reason>` note or matching REMOVED op |

cospec may be strictly more conservative than OpenSpec here. A false PASS
(cospec ok, archive aborts) is a release blocker — and the runtime archive
verifier still catches it, so the user is never lied to. Parity is enforced by
contract tests, never trusted.

`cospec archive` additionally runs two hard gates as explicit command steps,
before delegating to `openspec archive` — not folded into the
archive-precondition family above, because a real breach there must not report
as a clean archive. Both return `EXIT.failure` (1), the refusal code the tasks
gate already uses, and there is no `--force` for either:

- **`archive/verification-incomplete`** (after the tasks gate, independent of
  specs — fires for a specs-less `fix` too): whenever `verification` is enforced
  for this change's type and stamped `schemaVersion` (`enforcedApplyRequires`),
  every row must be `[x]` with non-empty evidence or `[~]` with a reason. Any
  bare `[ ]` row refuses the archive.
- **`archive/scenario-preservation`** (before `openspec archive` executes,
  specs-bearing changes only): for each `## MODIFIED Requirements` delta,
  compares `#### Scenario:` counts against the living spec. A delta that drops
  scenarios without a matching removal note refuses the archive — this catches
  the class of thinning that `openspec archive` merges at exit 0. A mirror
  advisory rule runs in the archive-precondition family above so
  `cospec validate --strict` surfaces the same risk before archive time; the
  hard block is the command step, verified against the real pinned openspec
  1.3.1 binary by a contract test.

### `specs/`

| ID                  | Level | Check                                                                                |
| ------------------- | ----- | ------------------------------------------------------------------------------------ |
| `specs/purpose-tbd` | W     | `## Purpose` contains the archive-generated `TBD - created by archiving` placeholder |
| (delegated)         | \*    | every `openspec validate --specs --strict` issue, re-rendered                        |

## Output

Human output groups by change, keeps the rule ID greppable, and always prints a
hint:

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

`--json` emits
`{ version, items: [{ id, kind, type, valid, issues: [...] }], summary: { errors, warnings, byRule } }`,
where each issue has `level`, `rule`, `path`, optional `line`, `message`,
optional `hint`, and `fixable`.
