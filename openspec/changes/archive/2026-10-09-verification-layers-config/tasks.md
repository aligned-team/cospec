# Tasks

## 1. Baseline

- [x] 1.1 Reproduce #68 with the issue's script in a sandboxed HOME against this
      worktree's CLI and record the output -- verify the run exits 1 with
      `verification/layer-unknown` for `@uat`

## 2. Tests first

- [x] 2.1 Add failing unit rows for `readValidateContext` returning
      `verificationLayers: ['uat']` for block-list, flow-list and `@uat`
      spellings, `config.yml`, and no layers for a missing config, unparseable
      YAML, `verification:` not a mapping, `layers:` not a list, and non-string
      or whitespace entries, plus pure `parseVerificationLayers` rows -- verify
      they fail against the unmodified source
- [x] 2.2 Add a failing integration row: `cospec validate --strict` exits 0 for
      an `@uat` row with `uat` declared and still emits
      `verification/layer-unknown` for `@staging`; and rows proving `apply` and
      `archive` clear the validation gate for a declared layer -- verify they
      fail against the unmodified source
- [x] 2.3 Add failing rows for doctor's `config` WARNING on a malformed
      `verification.layers` (and none for a well-formed or absent one), and for
      the `layer-unknown` hint naming declared layers -- verify they fail
      against the unmodified source

## 3. Fix

- [x] 3.1 Add `parseVerificationLayers` and `projectVerificationLayers` beside
      `projectConfigSchema` in `core/change.ts`, and pass `verificationLayers`
      in both contexts of `readValidateContext` -- verify the 2.1 and 2.2 rows
      now pass
- [x] 3.2 Warn from `checkConfig` in `doctor.ts` on a malformed declaration and
      list declared layers in the `layer-unknown` hint -- verify the 2.3 rows
      pass

## 4. Docs

- [x] 4.1 State the key's shape, spellings and the doctor warning on
      `apps/docs/concepts/verification.md` (the owning page), and align
      `reference/configuration.md`, `reference/validation-rules.md` and the
      `cospec doctor` row of `reference/commands.md` -- verify
      `mise run docs:build` succeeds
- [x] 4.2 Check whether `.agents/shared.md` or `docs/` describe how work is done
      differently now (they do not name this key) -- verify by grep

## 5. Gate

- [x] 5.1 `mise run check` green -- verify by the task's own exit code
- [x] 5.2 `cospec validate verification-layers-config --strict` clean and every
      verification row `[x]` with an observed result -- verify by reading the
      ledger
- [x] 5.3 `cospec archive verification-layers-config` -- the archive commit
      follows this one
