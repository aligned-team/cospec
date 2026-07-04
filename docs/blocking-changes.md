# Blocking changes

`blocking-changes.md` is a cross-change dependency ledger — which other changes
must ship before this one. It is machine-parsed: the `apply` gate reads it, and
`sync-blockers` keeps it current as dependencies archive. One parser
(`core/blockers.ts`) serves validate, apply, archive, and sync.

## The template

Every type ships the same template (the instructions differ by weight, the
format does not):

```markdown
# Dependencies

## Blocked by

<!-- Changes that MUST be archived before this change can be applied. -->
<!-- Format: - [ ] `change-slug` — what it provides -->
<!-- cospec checks the box and appends *(archived YYYY-MM-DD)* when the dependency ships. -->

None.

## Soft-blocked by

<!-- Changes that improve this one but aren't strictly required. -->
<!-- Format: - [ ] `change-slug` — what degrades without it -->

None.
```

## The grammar

Two sections are machine-gated. Extra sections (`## Phase Gates`,
`## External Decisions`, …) are allowed and ignored by the gate.

- **Gated headings** start at exactly `## Blocked by` or `## Soft-blocked by`
  and end at the next `## ` or EOF. Near-misses like `## Blocked By` or
  `## Blocked-by` raise `blockers/sections` with the corrected heading in the
  hint.
- **Entry lines** match (the separator accepts hyphen, en-dash, or em-dash):

  ```
  ^- \[( |x|X)\] `([a-z][a-z0-9-]*)`(?:\s+[—–-]\s+(.+?))?(?:\s*\*\(archived (\d{4}-\d{2}-\d{2})(?:[^)]*)?\)\*)?\s*$
  ```

  Writes always emit the canonical em-dash form. A legal-but-non-canonical
  separator (hyphen or en-dash) is not a validation finding — `cospec validate`
  stays silent about it; `sync-blockers` normalizes it to the em-dash form in
  fix mode.

- **Other legal lines** inside a gated section: the literal `None.` (only when
  the section has no entries — coexistence is `blockers/none-conflict`), HTML
  comments, continuation lines (indent ≥ 2 belonging to the previous entry), and
  free prose after `None.` or all entries (narrative appendices are allowed and
  ignored).
- **Outside** the two gated sections everything is ignored by the gate, but
  backticked-slug bullets missing a checkbox are linted (WARNING).

Examples:

```markdown
## Blocked by

- [ ] `add-auth` — the session token this endpoint reads
- [x] `add-db-pool` — the connection pool _(archived 2026-06-30)_

## Soft-blocked by

None.
```

## Sync semantics

`cospec sync-blockers [--check] [--change <id>] [--json]` — `fix` is the
default.

1. Build the archive index (`archive/` dirs → slug → date; duplicate slug →
   latest date + warning; non-matching dirs → warning, ignored).
2. Build the active index (dirs under `changes/` except `archive/`).
3. For each active change with a `blocking-changes.md`, classify each entry:
   - **STALE** — unchecked, target archived. `fix`: rewrite to the canonical
     checked form with `*(archived <date>)*`, atomic write. `--check`: report.
   - **DANGLING** — unchecked, target neither archived nor active. Error; never
     auto-fixed.
   - **MANUAL-CHECK** — checked but target not archived. Warning (manual
     check-off is allowed, just surfaced).
   - **FORMAT** — a backticked-slug bullet without a checkbox in a gated
     section. Error. Non-canonical separators are normalized in fix mode.
4. Report changes that are now fully unblocked (all Blocked-by checked, or
   `None.`).
5. Exit: `--check` → 1 if any STALE / DANGLING / FORMAT; `fix` → 1 only if
   DANGLING / FORMAT remain.

This runs standalone, as `cospec archive`'s post step across all remaining
changes, and in the pre-commit hook as a fix/check pair.

## How apply uses it

`cospec apply` self-heals the ledger before gating: any unchecked entry whose
slug is already archived is checked off in place (and reported in
`gate.synced`), so a just-shipped dependency never blocks the next change on a
stale box. What remains unchecked under **Blocked by** is a hard block (exit 2);
what remains under **Soft-blocked by** is a soft block (exit 3 without
`--allow-soft`). See [apply-archive.md](apply-archive.md).
