# change

## Why

cospec is single-tree today: every command keys on the invocation cwd and
assumes `openspec/` lives beneath it. OpenSpec 1.5.0 ships stores — standalone,
registered planning repos for cross-repo work — but cospec cannot drive them, so
a cross-repo epic authored in a store loses cospec's typed schemas, `apply`
gate, verified `archive`, and blocking-changes ledger. Teams steering many repos
toward a shared plan need cospec's guarantees against the store, not just the
repo.

## What Changes

- Add a `--store <id>` global flag that runs the whole change lifecycle against
  a registered OpenSpec store instead of the local repo.
- Resolve one operating `Root` per command (explicit flag → `store:` config
  pointer → local repo) and thread it: `base` to filesystem readers, `--store`
  args to every wrapped openspec call.
- `new`, `validate`, `apply`, `archive`, `status`, `list`, `instructions`,
  `sync-blockers`, and `migrate` all honor the store.

## Capabilities

### New Capabilities

- store-awareness

## Impact

- New capability store-awareness; additive and backward compatible — with no
  `--store` and no config pointer, every command behaves exactly as before.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
