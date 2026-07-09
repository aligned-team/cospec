## Why

The public docs site (`apps/docs`, shipped in the docs-site change) is invisible
to future agents: shared agent context never mentions it, states no discipline
for keeping it in sync with released behavior, and nothing says
`.agents/shared.md` itself must be maintained as the repo evolves.

## What Changes

- `.agents/shared.md` — add docs-site context (what `apps/docs` is, release-
  synced deploy, `ci-docs` PR gate, mise docs tasks, llms.txt output, canonical-
  content ownership), a hard docs-sync discipline (user-facing behavior changes
  update `apps/docs` in the same change, with verification evidence), and a
  self-maintenance discipline for `.agents/shared.md` itself.
- `CLAUDE.md`, `AGENTS.md` — regenerated shared block via
  `mise run agents:sync`.

## Impact

Every future agent session in this repo: the shared block in `CLAUDE.md` and
`AGENTS.md` gains the docs-site context and two new disciplines. No code,
schemas, or workflows change.
