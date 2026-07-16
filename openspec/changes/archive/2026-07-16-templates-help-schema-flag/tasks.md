## 1. Fix per-command help

- [x] 1.1 Add `options` to the `templates` entry in the `COMMANDS` table in
      `apps/cli/src/cli.ts`, documenting `--schema <name>` (default
      `spec-driven`)
- [x] 1.2 Add a regression test asserting `cospec templates --help` output
      includes `--schema` (fails before the fix, passes after)
- [x] 1.3 Confirm no other `COMMANDS` entry is missing real flags (audit each
      command module's parsed flags against its table entry)
- [x] 1.4 Confirm `apps/docs/reference/commands.md` needs no update (already
      documents `--schema <name>` correctly)
- [x] 1.5 Run `mise run check` and record verification evidence
