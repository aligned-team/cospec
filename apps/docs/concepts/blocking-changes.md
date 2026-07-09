---
title: Blocking changes
description:
  How the dependency ledger between changes works — hard and soft blockers, the
  entry grammar, and how it self-heals as changes archive.
---

# Blocking changes

Changes often depend on each other: one change can't be applied until another
has shipped, or it's better once a related change has landed but not strictly
required. cospec tracks these dependencies in `blocking-changes.md`, a
machine-parsed ledger inside every change folder. `cospec apply` reads it to
decide whether a change is allowed to proceed, and `cospec sync-blockers` keeps
every ledger honest as dependencies get archived.

## The template

Every change ships the same two sections, regardless of type:

```markdown
# Dependencies

## Blocked by

<!-- Changes that MUST be archived before this change can be applied. -->

None.

## Soft-blocked by

<!-- Changes that improve this one but aren't strictly required. -->

None.
```

- **Blocked by** — hard dependencies. Unchecked entries here stop `apply` cold.
- **Soft-blocked by** — dependencies that improve the change but don't block it
  outright. Unchecked entries here require confirmation, not a hard stop.

## Entry grammar

Entries are checkbox bullets naming a change slug in backticks, with an optional
description after an em-dash:

```markdown
## Blocked by

- [ ] `add-auth` — the session token this endpoint reads
- [x] `add-db-pool` — the connection pool _(archived 2026-06-30)_

## Soft-blocked by

None.
```

The parser is strict about the two headings (`## Blocked by` and
`## Soft-blocked by`, exact case) and lenient about everything else — HTML
comments, the literal `None.` when a section is empty, and free prose after the
entries are all ignored. When a dependency archives, cospec doesn't just delete
the line: it flips the checkbox and appends a timestamp, so the ledger reads as
a dated history —

```markdown
- [x] `add-db-pool` — the connection pool _(archived 2026-06-30)_
```

## How apply gates on it

Before evaluating the gate, `cospec apply` self-heals the ledger: any unchecked
entry whose target has already archived gets checked off in place, so a
dependency that shipped moments ago never blocks the next change on a stale box.
What's left after that self-heal is what actually gates:

- An unchecked entry under **Blocked by** is a hard block.
- An unchecked entry under **Soft-blocked by** is a soft block.

See [apply and archive](/concepts/apply-and-archive) for the full exit-code
table and how `--allow-soft` fits in.

## Keeping the ledger in sync

Ledgers can drift — a dependency archives while you're not looking, or an entry
gets hand-edited into a shape the parser doesn't expect. Run
`cospec sync-blockers` to check or fix every active change's ledger against the
current archive:

::: tip Diagnostics

- **STALE** — an entry is unchecked but its target is already archived.
  Auto-fixed: the box is checked and the archive date appended.
- **DANGLING** — an entry is unchecked and its target is neither archived nor an
  active change (probably a typo or a slug that never existed). Reported, never
  auto-fixed — you have to resolve it by hand.
- **MANUAL-CHECK** — an entry is checked but its target isn't archived yet. Not
  an error, just surfaced, since checking a box by hand ahead of an archive is
  allowed.
- **FORMAT** — a dependency line that doesn't match the expected checkbox
  grammar. Reported as an error. :::

`cospec sync-blockers --check` reports without writing and exits non-zero if
anything needs attention; the default (no `--check`) fixes what it safely can —
normalizing STALE entries — and still exits non-zero if DANGLING or FORMAT
issues remain, since those need a human decision.

`cospec archive` runs this sync automatically once a change ships, so whichever
changes were waiting on it get their boxes checked without anyone having to
remember to run it by hand.
