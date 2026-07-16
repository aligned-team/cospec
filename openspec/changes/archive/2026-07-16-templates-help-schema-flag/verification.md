## 1. `cospec templates --help` documents `--schema` [critical]

- [x] 1.1 @regression (agent) integration test asserting `cospec templates --help` stdout includes `--schema` -> added `apps/cli/test/unit/cli.test.ts` "templates --help lists its --schema flag"; failed before the COMMANDS fix (no `Command options:` block, no `--schema`), passes after (`bun test apps/cli/test/unit/cli.test.ts` -> 11 pass, 0 fail)
- [x] 1.2 @manual (agent) run `cospec templates --help` directly and read the rendered output -> `mise run cospec -- templates --help` printed `Command options:\n  --schema <name>   Schema whose templates to list (default: spec-driven)`

## 2. No regressions elsewhere

- [x] 2.1 @unit (agent) `mise run test` -> 544 pass, 0 fail (6 snapshots, 2719 expect() calls)
- [x] 2.2 @manual (agent) audit every other `COMMANDS` entry's `options` against its command module's actual parsed flags -> grepped every `apps/cli/src/commands/*.ts` for parsed `--flag` literals and compared against each `COMMANDS` entry; only `templates` had a real flag missing from `options` (fixed here). All other entries (`schemas`, `view`, `doctor`, `migrate`, `check-commit`, `workset`, etc.) either declare no flags and parse none, or already document every flag they parse.

## 3. Docs stay accurate

- [x] 3.1 @manual (agent) check `apps/docs/reference/commands.md` `templates` row against the corrected help text -> row already reads `--schema <name>` (default `spec-driven`); no docs change required
