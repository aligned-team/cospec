# Dependencies

## Blocked by

None.

## Soft-blocked by

None.

## Notes

`openspec/changes/` holds no other active change in this checkout. The parity
work this builds on is archived (`2026-09-22-openspec-1-13-1-parity`,
`2026-09-23-parity-definition`), and `root-resolution-parity` runs alongside
this change in its own worktree with no file overlap (`root.ts`, `templates.ts`,
`schema.ts`, `passthrough-command.ts` versus `cli.ts`, the command parsers and
the new command table).

Later parity changes depend on this one, not the other way round: each removes
its own entries from `apps/cli/test/contract/parity-pending.yaml` and adds its
aliases to `aliases.yaml` (`upstream-spellings`, `passthrough-json-and-doctor`,
`validation-parity`, `cli-surface-parity`, `archive-and-sync-parity`,
`tool-matrix`, `github-copilot`, `completion-install`, `workflow-profiles`).
