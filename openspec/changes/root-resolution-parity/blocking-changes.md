# Blocking Changes

## Blocked by

None.

## Soft-blocked by

None.

## Notes

`openspec/changes/` on this branch holds no other active change, and no archived
change provides anything this one consumes: the resolver it corrects and the
store plumbing it relies on are already on `main`.

`unknown-option-contract` is developed in parallel on its own branch and is not
visible here, so it cannot be listed above without tripping
`blockers/dangling-ref`. The two changes touch disjoint files (that change owns
`cli.ts`, the command parsers, the command table and the completion spec; this
one owns `core/root.ts`, `core/passthrough-command.ts`, `core/openspec.ts`'s
stderr relay, `commands/templates.ts`, `commands/schema.ts` and its own tests).
`unknown-option-contract` merges first; this branch then rebases onto it and
reuses its `upstream-oracle.ts` helper for the differential test (see tasks 4.1
and 6.2).
