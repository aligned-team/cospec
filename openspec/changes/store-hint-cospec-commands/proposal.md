## Why

PR #19 added first-class `cospec store register` and `cospec store ls` commands,
but `resolveStore`'s "unknown store" error hint (in `apps/cli/src/core/root.ts`)
still tells users to run the bare `openspec store register <path>` /
`openspec store ls`. CLAUDE.md's routing discipline says all agent-facing
OpenSpec access goes through `cospec`, so an error message that sends users
straight to the wrapped binary undermines that discipline and confuses users who
only have `cospec` on their `$PATH`.

## What Changes

The "unknown store" error hint in `resolveStore` now names the `cospec`
equivalents (`cospec store register <path>` / `cospec store ls`) instead of the
bare `openspec` commands. The matching example in `apps/docs/concepts/stores.md`
is updated to match so the docs never drift from the released error text.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- `apps/cli/src/core/root.ts` — `resolveStore` error message text only; no
  behavior change.
- `apps/docs/concepts/stores.md` — example output block updated to match.
- No other user-facing message in `apps/cli/src` recommends a bare `openspec`
  command where a `cospec` equivalent now exists (swept via
  `grep -rn "openspec " apps/cli/src`); the remaining `openspec status`/
  `openspec doctor` mentions are deliberate references to the wrapped binary's
  own richer output, not leftover pre-parity text.

## Surfaces

- [x] interactive — CLI error message shown to users on a mistyped `--store` id
- [ ] deploy
- [ ] integration
- [ ] agent-behavior
