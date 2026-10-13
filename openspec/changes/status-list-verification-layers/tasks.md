# Tasks

## 1. Baseline

- [x] 1.1 Reproduce #83 with the issue's script in a sandboxed HOME against this
      worktree's CLI and record the output -- verify `status --json` and
      `list --json` report `archiveReady: false` while `validate --strict` and
      `archive` exit 0

## 2. Tests first

- [x] 2.1 Add unit rows to `unit/commands/archive-ready.test.ts`: a `@uat` row
      read with `extraLayers: ['uat']` has no `verification/layer-unknown`
      reason, and with `[]` still has one; `computeStatus` on that row is
      archive-ready with `uat` declared in the config and not without -- verify
      the declared `computeStatus` row fails against the unmodified source
- [x] 2.2 Add integration rows to `integration/verification-layers.test.ts`:
      with `uat` declared, `validate --strict`, `status --json`, text `status`,
      `list --json` and `archive` agree that a change with `[x]` and
      `[~] -> defer:` `@uat` rows is archive-ready; without the declaration,
      `status` and `list` report `archiveReady: false` naming
      `verification/layer-unknown` -- verify the declared row fails against the
      unmodified source

## 3. Fix

- [x] 3.1 Make the project's layers required throughout the chain
      (`readVerificationVerdict`'s and `verificationRules`' `extraLayers`,
      `isKnownLayer`, `ValidateContext.verificationLayers`) and pass
      `projectVerificationLayers(base)`, read once per invocation, from `status`
      (`computeStatus`, the `--all` sweep) and `list` (`computeRow`) -- verify
      the 2.1 and 2.2 rows pass and `mise run typecheck` is clean

## 4. Docs

- [x] 4.1 Name `status`'s and `list`'s archive-readiness among the places a
      declared layer is accepted on `apps/docs/concepts/verification.md` (the
      owning page), and check the `cospec status`/`cospec list` rows of
      `reference/commands.md` still read correctly -- verify
      `mise run docs:build` succeeds
- [x] 4.2 Check whether `.agents/shared.md` or `docs/` describe how work is done
      differently now -- verify by grep

## 5. Gate

- [ ] 5.1 The PR's CI checks green and
      `cospec validate status-list-verification-layers --strict` clean, every
      verification row `[x]` with an observed result -- verify by the exit codes
      and by reading the ledger. The archive commit follows this one.
