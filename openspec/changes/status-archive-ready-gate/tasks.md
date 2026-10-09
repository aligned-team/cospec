# Tasks

## 1. Failing tests first

- [ ] 1.1 Add `computeStatus` tests (unit): a `fix` change with a bare `- [ ]`
      row reports `archiveReady: false` with `blockedReasons`; all rows
      `[x]`/`[~] defer` report true; a malformed row reports false; and verify
      each fails before the fix
- [ ] 1.2 Add integration tests that `cospec list --json`/text agree with
      `cospec status` on the same fixtures (unresolved, malformed, resolved, v1
      grandfathered, `chore`/`docs`), and verify the unresolved and malformed
      cases fail before the fix
- [ ] 1.3 Add a property test over those fixtures that every change reported
      `archiveReady: true` is not refused by `archive/verification-incomplete`,
      and verify it fails before the fix

## 2. Fix

- [ ] 2.1 Add `readVerificationVerdict` to `core/verification.ts` and
      `isArchiveReady` beside `computeGate` in `commands/apply.ts`, and verify
      they are the only definitions of the reading and the formula
- [ ] 2.2 Use them in `computeStatus` (verdict computed before the flag) and in
      `list.ts` (`schemaVersion`-filtered required set), and verify tasks
      1.1-1.3 now pass and the existing v1 grandfathering test stays green

## 3. Docs

- [ ] 3.1 State what `archiveReady` covers (required artifacts, tasks, blocker
      gate, verification gate; not scenario-preservation or delta-spec validity)
      in the `cospec status` row of `apps/docs/reference/commands.md` and point
      the `cospec list` row at it, and verify `mise run docs:build` passes
- [ ] 3.2 Confirm `.agents/shared.md` needs no change (no workflow, task or
      convention changed) and verify `mise run agents:check` is clean

## 4. Close out

- [ ] 4.1 Run `mise run check`, `mise run docs:build` and
      `cospec validate status-archive-ready-gate --strict`, and verify all pass
- [ ] 4.2 The archive commit follows this one
