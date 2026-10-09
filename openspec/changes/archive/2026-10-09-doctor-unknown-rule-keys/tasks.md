# Tasks

## 1. Tests first

- [x] 1.1 Add doctor tests: `rules.proposals` yields one WARNING naming
      `proposals`, listing known ids, exit code unchanged; and verify they fail
      on unfixed source
- [x] 1.2 Add doctor tests: `rules` with every built-in artifact id yields no
      finding; a project schema declaring custom artifact `extra` makes
      `rules.extra` valid; absent/non-mapping `rules` yields no finding
- [x] 1.3 Add doctor tests: `--json` carries the finding with `check: config`;
      closest-id suggestion; ids of schemas the binary rejects as invalid are
      not known and raise no finding of their own

- [x] 1.4 Add doctor tests: a user-global schema's artifact id (private
      `XDG_DATA_HOME`) is a valid key; a project schema shadows a same-named
      user-global schema; verify the user-global and invalid-schema rows fail on
      the project-dir-only implementation

## 2. Fix

- [x] 2.1 Implement the rule-key check in `checkConfig` (known ids = the
      artifact ids in the wrapped binary's own `schemas --json` listing:
      project, user-global and package) and verify the new tests pass

## 3. Docs

- [x] 3.1 Document the check on `apps/docs/reference/configuration.md` and the
      doctor row of `apps/docs/reference/commands.md`; verify
      `mise run docs:build` passes

## 4. Gate

- [x] 4.1 Run the issue's repro script against the fixed CLI and record the
      output
- [x] 4.2 `mise run check` green, `validate --strict` passes, no `test.failing`
      left
- [x] 4.3 The archive commit follows this one
