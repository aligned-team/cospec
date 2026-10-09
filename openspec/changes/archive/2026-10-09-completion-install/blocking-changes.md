# Dependencies

## Blocked by

- [x] `upstream-spellings` — the `completion generate` row, the
      `[completion, generate] powershell` pending entry this change removes, and
      the remedies allowlist that spells relayed text `cospec` _(archived
      2026-09-28)_
- [x] `cli-surface-parity` — the table shapes this change edits (`pendingSub`,
      `pendingValues`), the `jsonRefusal` precedent `completion` follows, and
      the reachability walker that proves the pending entries gone _(archived
      2026-10-05)_
- [x] `archive-and-sync-parity` — `archive-integrity`'s requirement that every
      wrapped spawn forces `OPENSPEC_NO_COMPLETIONS=1`, which leaves cospec's
      own tip the only completions tip a user sees _(archived 2026-10-05)_

## Soft-blocked by

None.

## Notes

Every active change in `openspec/changes/` other than this one was scanned:
there is none. `main` at `72ce24a7` carries all three providers. The wrapped
binary and its `completion` command are untouched, so this change needs no later
change. The roadmap's R9 (`tool-matrix`) edits the harness files and
`apps/docs/guide/harness-setup.md`, where this change rewrites one sentence; the
two do not share a source file, and whichever merges first changes that
sentence.
