## 1. Canon

- [x] 1.1 Append 5 workflow entries (`new`, `ff`, `verify`, `bulk-archive`,
      `onboard`) to `apps/cli/src/canon/workflows/harness.yaml`, `new` with
      `injectTypeTable: true`
- [x] 1.2 Write `apps/cli/src/canon/workflows/new.md` — scaffold-only, stop
      before authoring any artifact
- [x] 1.3 Write `apps/cli/src/canon/workflows/ff.md` — fast-forward the artifact
      loop on an already-scaffolded change
- [x] 1.4 Write `apps/cli/src/canon/workflows/verify.md` — the archive dress
      rehearsal (ledger walk + `validate --strict` + hard gate names)
- [x] 1.5 Write `apps/cli/src/canon/workflows/bulk-archive.md` — loop
      `cospec archive` per change, provider-before-consumer ordering, no hand-mv
- [x] 1.6 Write `apps/cli/src/canon/workflows/onboard.md` — guided first-run
      tutorial, steer to a light type, real CLI archive path
- [x] 1.7 Add the 5 imports + `CANON_FILES` entries to
      `apps/cli/src/canon/embedded.ts`
- [x] 1.8 Confirm `apps/cli/src/harness/adapters.ts` needs no change (codex
      allowlist stays as-is)

## 2. Generate + commit managed files

- [x] 2.1 Run `mise run generate` to re-render `.claude/`, `.codex/`,
      `.opencode/`
- [x] 2.2 Run `mise run generate:check` -> zero drift
- [x] 2.3 Hand-inspect `.claude/commands/cospec/verify.md` and
      `.claude/skills/cospec-verify-change/` for correctness

## 3. Tests

- [x] 3.1 Add the 5 ids/skill names to `unit/harness/fixtures.ts`
      (`WORKFLOW_COMMANDS`, `WORKFLOW_SKILLS`); update the "six canonical" doc
      comment
- [x] 3.2 Bump hardcoded workflow counts (6 -> 11) in
      `unit/harness/render.test.ts`
- [x] 3.3 Update the type-table test branch so both `propose` and `new` are
      treated as table-bearing; add a positive assertion for `new`'s rendered
      table row
- [x] 3.4 Regenerate `unit/harness/__snapshots__/render.test.ts.snap` and
      hand-inspect the diff (only 5 new files, zero existing-body churn)
- [x] 3.5 Add the 5 ids/skill names to `integration/support.ts` (`WORKFLOWS`,
      `SKILLS`); update the "six" doc comments
- [x] 3.6 Verify `unit/init/generate.test.ts` / `update.test.ts` need no change
      (scan for hardcoded counts)
- [x] 3.7 Run `mise run test && mise run test:integration` -> green

## 4. Docs + agent context

- [x] 4.1 Update `docs/harness-integration.md` — "Six" -> "Eleven", extend
      workflow list + file trees, add `/opsx:sync` <-> `/cospec:sync-specs`
      mapping note and `/opsx:update` out-of-scope note
- [ ] 4.2 Update `apps/docs/guide/harness-setup.md` — "six" -> "eleven", extend
      command trees + smoke checks (including `/cospec:verify`)
- [ ] 4.3 Update `docs/architecture.md` — bump the six-workflow enumeration to
      eleven
- [ ] 4.4 Update `apps/docs/guide/workflow.md` — add "Optional: verify before
      archive" and "Entry-point variants" notes, linking to harness-setup rather
      than re-listing the inventory
- [ ] 4.5 Confirm `apps/docs/reference/commands.md` needs no change (no CLI
      subcommand added)
- [ ] 4.6 Edit `.agents/shared.md` with the verify-dress-rehearsal +
      entry-variant line, then run `mise run agents:sync`
- [ ] 4.7 Run `mise run agents:check` -> green; run `mise run docs:build` ->
      passes

## 5. Verification evidence

- [x] 5.1 Run every verification.md probe and record observed results after
      `->`, flipping each row to `[x]` (or `[~] defer: <reason>`)

## 6. Final gate

- [x] 6.1 Run `mise run check` -> green
