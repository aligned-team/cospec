## Why

`cospec templates --help` does not show the command's `--schema <name>` flag
(default `spec-driven`). The flag is real — `apps/cli/src/commands/templates.ts`
forwards it verbatim to the wrapped `openspec templates` call — and
`apps/docs/reference/commands.md` already documents it correctly. But the
`templates` entry in the `COMMANDS` table in `apps/cli/src/cli.ts` has no
`options` field, so per-command help silently omits the flag (PR #25, "complete
per-command help", missed this one entry). A user running
`cospec templates --help` today sees no mention of `--schema` and has no way to
discover it short of reading the docs site or the source.

## What Changes

Add an `options` field to the `templates` entry in the `COMMANDS` table
documenting `--schema <name>` (default `spec-driven`), matching the style of the
other passthrough entries (e.g. `schema`, `show`). No behavior of the
`templates` command itself changes — this only corrects what its `--help` output
displays.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- `apps/cli/src/cli.ts` — `COMMANDS` table, `templates` entry gains `options`.
- `apps/cli/test/` — add a test asserting `cospec templates --help` includes
  `--schema`.
- No change to `apps/cli/src/commands/templates.ts` or to
  `apps/docs/reference/commands.md` (the docs site already documents the flag
  correctly).

## Surfaces

- [x] interactive — CLI `--help` output is user-facing UX
- [ ] deploy
- [ ] integration
- [ ] agent-behavior
