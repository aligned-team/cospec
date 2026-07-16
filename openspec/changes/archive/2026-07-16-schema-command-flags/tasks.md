## 1. Fix the CLI's own --help text

- [x] 1.1 In `apps/cli/src/cli.ts`, update the `schema` `CommandEntry.options`
      block so `--description <text>` and `--artifacts <list>` are documented as
      `init`-only (drop the `fork/init` framing); confirm `fork` has no
      value-taking flags (`--json`/`--force` are boolean).
- [x] 1.2 Run `cospec schema --help` and confirm the printed options match
      `init`-only wording.

## 2. Fix the docs site

- [x] 2.1 In `apps/docs/reference/commands.md`, replace the
      `cospec schema which|validate|fork|init` row's key-flags cell (currently
      `—`) with `--description <text>`, `--artifacts <list>` (both `init` only).
- [x] 2.2 Run `mise run docs:build` and confirm the site builds clean with the
      updated row.

## 3. Validate

- [x] 3.1 Run `mise run lint` and `mise run format:check` on the touched files.
- [x] 3.2 Run `mise run cospec -- validate schema-command-flags --strict` and
      confirm it passes.
