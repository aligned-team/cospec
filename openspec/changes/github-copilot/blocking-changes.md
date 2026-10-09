# Dependencies

## Blocked by

<!-- Changes that MUST be archived before this change can be applied. -->

- [x] `harness-adapter-table` — `HARNESS_TABLE`, the `CommandSurface` shape and
      `skillsRoot`/`scanRoots`/`removalRoots` that a row is declared against
      _(archived 2026-10-05)_
- [x] `harness-receipt-and-doctor-scope` — the receipt hint rendered through the
      first selected row's dialect, and `isHarnessDocument` narrowed to what
      cospec writes _(archived 2026-10-05)_
- [x] `unknown-option-contract` — the command table whose `--copilot-cloud` and
      `--no-copilot-cloud` rows this change flips from pending to handled
      _(archived 2026-09-28)_

## Soft-blocked by

<!-- Changes that improve this one but aren't strictly required. -->

None.

## Sequencing

<!-- Not parsed by the gate. -->

Roadmap order (cospec-roadmap): R9 `tool-matrix`, then this change (R10), then
R12 `workflow-profiles`, which builds on the full matrix.

`tool-matrix` (R9) is a hard blocker that the ledger cannot name yet: an entry
must be an active or archived change on this branch, and `tool-matrix` is
neither until it merges (`blockers/dangling-ref`). What it provides: the full
`HARNESS_TABLE` (every pinned tool id but `github-copilot`), the `.prompt.md`
command rows and the description-only command frontmatter, per-file write
failure isolation in `generate()`, detection from a row's command surface, and
the row field for upstream's `LEGACY_SLASH_COMMAND_PATHS`. This change is
authored against `origin/main` at `72ce24a7` (v0.9.0). The implement stage
rebases onto `tool-matrix` first and adds the ledger entry, ticked and dated, as
task 1.2.
