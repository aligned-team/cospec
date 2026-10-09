# Tasks

## 1. Tests first

- [x] 1.1 Add doctor tests: `rules.proposals` yields one WARNING naming
      `proposals`, listing known ids, exit code unchanged; and verify they fail
      on unfixed source
- [x] 1.2 Add doctor tests: `rules` with every built-in artifact id yields no
      finding; a project schema declaring custom artifact `extra` makes
      `rules.extra` valid; absent/non-mapping `rules` yields no finding
- [x] 1.3 Add doctor tests: `--json` carries the finding with `check: config`;
      closest-id suggestion; an unparseable project schema is reported and
      suppresses key flagging

## 2. Fix

- [x] 2.1 Implement the rule-key check in `checkConfig` (known ids = built-ins +
      project schemas) and verify the new tests pass

## 3. Docs

- [x] 3.1 Document the check on `apps/docs/reference/configuration.md` and the
      doctor row of `apps/docs/reference/commands.md`; verify
      `mise run docs:build` passes

## 4. Gate

- [x] 4.1 Run the issue's repro script against the fixed CLI and record the
      output
- [x] 4.2 `mise run check` green, `validate --strict` passes, no `test.failing`
      left
- [ ] 4.3 The archive commit follows this one
