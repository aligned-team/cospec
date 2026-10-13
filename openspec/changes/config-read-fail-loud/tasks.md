# Tasks

## 1. Baseline

- [ ] 1.1 Reproduce #98 with an unparseable config and a directory config in a
      sandboxed HOME against this worktree's CLI, and probe the pinned binary on
      the same fixtures -- verify cospec is silent and fails on
      `verification/layer-unknown`, and record what the binary prints

## 2. Tests first

- [ ] 2.1 Add unit rows for the config read (`projectVerificationLayers`,
      `readValidateContext`), the `verification/config-unreadable` rule, and
      doctor's read-failure message -- verify they fail against the unmodified
      source
- [ ] 2.2 Add integration rows: a broken config (EISDIR and unparseable) fails
      `validate --strict` and `archive` on `verification/config-unreadable`,
      `status`/`list` report `archiveReady: false` with the reason, the warning
      line prints once; a bare change under a broken config falls back to
      `spec-driven` with the warning -- verify they fail against the unmodified
      source

## 3. Fix

- [ ] 3.1 Add `ProjectConfigError` and the once-per-invocation warning; make
      `readProjectConfig` throw it for an errno or a YAML parse error,
      `projectConfigSchema` warn and fall back, and `projectVerificationLayers`
      return `ProjectLayers` -- verify the read rows pass
- [ ] 3.2 Thread `ProjectLayers` through `ValidateContext`, `verificationRules`,
      `readVerificationVerdict`, `status` and `list`, and add
      `verification/config-unreadable` -- verify the rule and integration rows
      pass and `mise run typecheck` is clean
- [ ] 3.3 Name a read failure in doctor's `checkConfig` -- verify the doctor
      rows pass

## 4. Docs

- [ ] 4.1 Update `concepts/verification.md` (owning page),
      `reference/validation-rules.md` and the `cospec status`/`cospec doctor`
      rows of `reference/commands.md` -- verify `mise run docs:build` succeeds
- [ ] 4.2 Check whether `.agents/shared.md` or `docs/` describe how work is done
      differently now -- verify by grep

## 5. Gate

- [ ] 5.1 The PR's CI checks green and
      `cospec validate config-read-fail-loud --strict` clean, every verification
      row `[x]` with an observed result -- verify by the exit codes and by
      reading the ledger. The archive commit follows this one.
