## Why

`apps/docs/reference/commands.md`'s `schema` row lists key flags as `—`, but
`cospec schema init` accepts `--description <text>` and `--artifacts <list>`
(and `--default`/`--no-default`); `cospec schema fork` accepts only
`--json`/`--force`, not `--description`/`--artifacts`. The CLI's own `--help`
text for `schema` (the `CommandEntry` options block in `apps/cli/src/cli.ts`)
also mislabels both flags as `fork/init only`, when only `init` supports them —
so the docs and the CLI's own help currently agree with each other but both
disagree with the wrapped binary's real behavior.

## What Changes

- Fix `apps/cli/src/cli.ts`'s `schema` `CommandEntry.options` block so
  `--description`/`--artifacts` are attributed to `init` only (not `fork/init`).
- Fix `apps/docs/reference/commands.md`'s `schema` row to document
  `--description <text>` and `--artifacts <list>` as `init`-only key flags,
  replacing the current `—`.

## Impact

- `apps/cli/src/cli.ts` — the `schema` entry in the `CommandEntry[]` array
  (drives `cospec schema --help` / `cospec --help`).
- `apps/docs/reference/commands.md` — the
  `cospec schema which|validate|fork|init` row in the command reference table.
- Readers of `cospec schema --help` and the public docs site, who currently see
  an inaccurate claim that `fork` accepts `--description`/`--artifacts`.
