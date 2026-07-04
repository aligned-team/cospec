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
3. If the schema declares specs and delta files exist, it runs the `deltas`
   family, then delegates to
   `openspec validate --strict --no-interactive --json` and merges the issues,
   then (unless `--fast`) runs the archive-precondition family.
4. `openspec validate` is **never** invoked for a change whose schema has no
   specs artifact — its hardcoded `CHANGE_NO_DELTAS` rule would false-error.

Living specs (`--specs`) always delegate to `openspec validate --specs` (sound
and schema-independent), with cospec's `specs/purpose-tbd` on top.

## Rule registry

Rule IDs are stable public API. Levels: **E** = ERROR, **W** = WARNING (blocking
under `--strict`), **I** = INFO. Every issue carries a one-line hint.

### `meta/`

| ID                        | Level        | Check                                                                                                |
| ------------------------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| `meta/openspec-yaml`      | E            | `.openspec.yaml` present, parseable, `schema:` non-empty; `created:` is `YYYY-MM-DD` when present    |
| `meta/schema-unknown`     | E            | schema is not one of the eleven and not resolvable anywhere                                          |
| `meta/legacy-schema`      | I            | schema resolvable but not a cospec type — legacy mode engaged                                        |
| `meta/name-kebab`         | E            | change dir is kebab-case with no `YYYY-MM-DD-` prefix (collides with archive naming)                 |
| `meta/forbidden-artifact` | E            | a file exists for an artifact the schema does not declare (e.g. `specs/` in `ci`)                    |
| `meta/unexpected-file`    | W            | a file matches no declared artifact glob — excludes `README.md`, `.openspec.yaml`, `.refine/`        |
| `meta/empty-change`       | I            | change has `.openspec.yaml` but zero artifacts — reported as "in progress", never as an unknown item |
| `change/artifact-missing` | I / E-strict | an `apply.requires` artifact file does not exist yet                                                 |

### `proposal/`

| ID                         | Level                                   | Check                                                                                                                                                                                   |
| -------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proposal/missing`         | W (E-strict when other artifacts exist) | `proposal.md` absent                                                                                                                                                                    |
| `proposal/sections`        | E                                       | required H2s per variant: full → `## Why`, `## What Changes`, `## Impact` (+ `## Capabilities` for feat, and fix when `specs/` exists); lite → `## Why`, `## What Changes`, `## Impact` |
| `proposal/why-substantive` | W                                       | full-variant types: `## Why` body is at least 50 characters                                                                                                                             |
| `proposal/benchmarks`      | E                                       | perf only: `## Benchmarks` present with at least one before/after row                                                                                                                   |
| `proposal/revert-citation` | E                                       | revert only: `## Reverts` with a backticked slug in `archive/` and/or a 7–40-hex sha                                                                                                    |

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

| ID                           | Level | Check                                                                                                              |
| ---------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------ |
| `archive/no-ops`             | E     | a delta file parses to zero operations                                                                             |
| `archive/target-missing`     | E     | a MODIFIED / RENAMED-FROM / REMOVED target is absent from the living spec                                          |
| `archive/new-spec-non-added` | E     | a capability with no living spec has MODIFIED/RENAMED/REMOVED ops                                                  |
| `archive/added-exists`       | E     | an ADDED target already exists, or a RENAMED-TO collides with an existing/ADDED name                               |
| `archive/target-invalid`     | E     | the target living spec is structurally invalid (missing `## Purpose`/`## Requirements`, or contains delta headers) |

cospec may be strictly more conservative than OpenSpec here. A false PASS
(cospec ok, archive aborts) is a release blocker — and the runtime archive
verifier still catches it, so the user is never lied to. Parity is enforced by
contract tests, never trusted.

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
