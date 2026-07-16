# Blocking changes

`blocking-changes.md` is a cross-change dependency ledger — which other changes
must ship before this one. It is machine-parsed: the `apply` gate reads it, and
`sync-blockers` keeps it current as dependencies archive. One parser
(`core/blockers.ts`) serves validate, apply, archive, and sync.

The user-facing account — the template, hard vs. soft sections, how `apply`
gates on it, and the STALE/DANGLING/MANUAL-CHECK/FORMAT sync diagnostics — is
owned by the site:
[Blocking changes](https://cospec.aligned.team/concepts/blocking-changes). This
page keeps the exact machine grammar `core/blockers.ts` implements, since the
site describes it in prose rather than as a parseable spec.

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

## Sync internals

`cospec sync-blockers [--check] [--change <id>] [--json]` (`fix` is the
default):

1. Build the archive index (`archive/` dirs → slug → date; duplicate slug →
   latest date + warning; non-matching dirs → warning, ignored).
2. Build the active index (dirs under `changes/` except `archive/`).
3. Classify each entry per the site's diagnostic classes, then fix or report.
4. Report changes that are now fully unblocked (all Blocked-by checked, or
   `None.`).
5. Exit: `--check` → 1 if any STALE / DANGLING / FORMAT; `fix` → 1 only if
   DANGLING / FORMAT remain.

This runs standalone, as `cospec archive`'s post step across all remaining
changes, and in the pre-commit hook as a fix/check pair.
