# Proposal

## Why

The repo's own description of what cospec is uses "thin wrapper" / "never
replaces OpenSpec" framing that agents have read as license to scope OpenSpec
capabilities out as "not cospec's domain" — across three separate catch-up
releases this caused real items to be silently deferred instead of ported or
raised. cospec is functionally an opinionated superset and drop-in replacement
for OpenSpec; the docs should say so.

## What Changes

- `.agents/shared.md` (synced to `CLAUDE.md`/`AGENTS.md`): reword the "thin,
  opinionated wrapper" project-context sentence, the "cospec never replaces
  OpenSpec" wrapping-facts sentence, and the "every everyday OpenSpec surface"
  sentence in Engineering discipline.
- `README.md`: reword the matching "cospec never replaces OpenSpec" sentence.
- `apps/docs/concepts/how-it-relates-to-openspec.md`: reword the "cospec never
  replaces OpenSpec" heading and the "every everyday OpenSpec surface" sentence.
- `apps/docs/index.md`: reword the "Wraps real OpenSpec, never replaces it"
  feature title and details.

## Impact

Readers of the README, the docs site, and agents consuming
`CLAUDE.md`/`AGENTS.md`/`.agents/shared.md` — no behavior, commands, or schemas
change, only the stated relationship between cospec and OpenSpec.
