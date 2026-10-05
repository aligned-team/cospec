# Tasks

## 1. `list.ts`: an untyped schema's own artifacts decide its state

- [x] 1.1 Add a failing unit test (`commands.test.ts`'s `describe('list', …)`):
      a change on a custom schema (`generates: doc.md`) with `doc.md` written
      lists `state: 'building'`, not `in-progress`/"no artifacts yet" — red
      against current `list.ts` and verify with `bun test`.
- [x] 1.2 Add `hasDeclaredArtifact(dir, schema, base)` to `list.ts` and wire it
      into `computeRow`'s `empty` computation for a schema cospec doesn't type
      (design: Decisions). Verify: 1.1's test goes green. Commit
      `fix(cli): decide an untyped schema's list state from its own artifacts`
- [x] 1.3 Add a contract row to `cli-surface.test.ts` reusing the existing
      `rfcSchema` fixture: `cospec list --json`'s row for a change with `doc.md`
      written reports `state: 'building'`, `archiveReady: false` (an untyped
      schema is never archive-ready), compared against the pinned binary's own
      `status` key on the same row (`no-tasks`, since `rfc` has no `tasks.md`)
      to confirm cospec's native `state` and the binary's own `status` key
      coexist without collision. Verify:
      `bun     test apps/cli/test/contract/cli-surface.test.ts` passes.
- [x] 1.4 Update `apps/docs/reference/commands.md`'s `cospec list` row to
      document the schema-output signal for an untyped schema's `state`. Verify:
      `mise run docs:build` succeeds.

## 2. `validate.ts`: `--archived --json` below the version floor

- [x] 2.1 Add a failing unit test exercising the `--archived` version-floor
      guard directly (stub `wrappedOpenspecVersion` below `ARCHIVED_SINCE`, as
      the existing `openspecBelow` unit tests do) asserting `--json` prints one
      parseable document, not stderr text — red against current `validate.ts`.
- [x] 2.2 Branch the guard on `flags.json` exactly as the no-root guard four
      lines above it does, reusing `rootSelectionDocument`. Verify: 2.1's test
      goes green. Commit
      `fix(cli): relay validate --archived's version-floor refusal as JSON`

## 3. `upstream-spellings.test.ts` row 3.7: one shared root

- [ ] 3.1 Change row 3.7 to call `remedyNamedRoot()` once and pass the same
      directory to both the `runCospec` and `runUpstream` invocations, removing
      the two-independent-copy ordering dependency (design: Decisions). Verify:
      `bun test     apps/cli/test/contract/upstream-spellings.test.ts -t '3.7'`
      passes, and 20 repeated local runs show no flake.

## 4. `status`: pin the mode-000-artifact behavior (no product change)

- [ ] 4.1 Add a differential contract row to `cli-surface.test.ts`: a mode-000
      artifact other than `tasks.md` (e.g. `proposal.md`) on a cospec-typed
      change, `cospec status --change <id>` compared against the pinned binary
      in both text and `--json` mode — same exit code, same reported
      artifact-done state either way the runtime's `realpath` happens to answer
      it (design: Context item 4; pattern after rows 15.11/15.12, branching on
      the observed behavior, never on `process.platform`). Verify:
      `bun test     apps/cli/test/contract/cli-surface.test.ts` passes locally
      (macOS) and in CI (Linux).
- [ ] 4.2 Record in this change's verification ledger that both OS observations
      were differential, with no product change (design: Context item 4
      documents the evidence superseding the stage's verify report).

## 5. Close out

- [ ] 5.1 `mise run check` green (lint, format, typecheck, unit, contract,
      integration, pack smoke).
- [ ] 5.2 the archive commit follows this one
