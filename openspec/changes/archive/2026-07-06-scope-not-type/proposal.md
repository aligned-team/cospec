## Why

`commitlint.config.mjs`'s scope-enum includes `chore` alongside legitimate area
names (`docs`, `ci`, `deps`, `canon`, ...), even though `chore` as a scope is a
pure tautology when the type is also `chore`. Early commits used
`chore(chore): ...` and every commit since copied that precedent, so the repo's
own history is full of scopes that just repeat the type and add no information.

## What Changes

- Remove `chore` from the commitlint `scope-enum`.
- Add an inline local commitlint plugin rule, `scope-not-type`, that fails any
  commit whose scope exactly equals its type (e.g. `chore(chore):`,
  `docs(docs):`), with a message telling the author to omit the scope instead.
- Document the convention in CONTRIBUTING.md: a scope names an AREA, is omitted
  when there is no meaningful area, and must never repeat the type; archive
  commits are `chore: archive <slug>`.

## Impact

- `commitlint.config.mjs` — scope-enum and new rule.
- `CONTRIBUTING.md` — "Commit format" section.
- Future commits: `chore(chore): ...` and any `type(same-type): ...` pattern
  will now fail `commit-msg` linting. `apps/cli/src/commands/check-commit.ts` is
  advisory-only and does not validate scopes, so it needs no change.
