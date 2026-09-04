## 1. Track A — harness engine and canon

- [x] 1.1 Add `bodyDialect` to every harness in `canon/workflows/harness.yaml`,
      move `codex.skillDir` to `.agents/skills/{skill}` with `legacySkillDirs`,
      and add the `agents` surface; verified by `mise run cospec -- schemas`
      still loading and `bun test apps/cli/test/unit/harness/render.test.ts`
      parsing the manifest
- [x] 1.2 Add `agents` to `HarnessName`/`HARNESS_NAMES` (appended, per design
      D7) and replace `transformBodyForHarness` with
      `transformBody(body, dialect, skillById)`; verified by
      `bun test apps/cli/test/unit/harness/adapters.test.ts` covering all three
      dialects and an unknown id left verbatim
- [x] 1.3 Dedupe `renderHarnessFiles` output by path and throw on differing
      content for one path; verified by the render tests asserting 13 unique
      files for `['codex','agents']` and a throw when a tmp canon gives the two
      harnesses different dialects
- [x] 1.4 Verification for this track: rows 1.1-1.4 and 2.1-2.2 of
      verification.md are re-run and marked with observed results

## 2. Track B — commands and legacy migration

- [x] 2.1 Add `apps/cli/src/harness/legacy-skills.ts` implementing the
      hash-gated, post-generation `.codex/skills` -> `.agents/skills` move;
      verified by `bun test apps/cli/test/unit/harness/legacy-skills.test.ts`
      covering removed / preserved-modified / foreign / no-replacement / force /
      dryRun
- [x] 2.2 Point `update.ts`'s `SKILL_BASE` at the shared root, add
      `LEGACY_SKILL_BASE` + `HARNESS_MARKER`, widen `MANAGED_REMOVAL_ROOTS`, and
      give `detectHarnesses` its two codex clauses; verified by unit tests for
      the legacy-only, migrated and `agents`-only trees plus the
      poisoned-manifest containment test
- [x] 2.3 Thread `migration: WriteResult[]` through `GenerateResult`, the
      `--json` payloads and `migrationLines`, and make a remaining legacy layout
      count as drift; verified by `cospec update --check` exiting 1 on a legacy
      fixture and 0 after the migration
- [x] 2.4 Replace `init.ts`'s `existsSync('.<harness>')` detection with
      `DETECT_PATHS`, add the `agents` restart line, update the codex restart
      line and `VALID_HARNESS_MSG`, and add `agents` to the `cli.ts` usage line;
      verified by an integration test that a bare `.agents/` is not
      auto-selected and `--harness bogus` names `agents`
- [x] 2.5 Dedupe `findOpsxFiles`, `harnessMarkdownFiles` and
      `checkStaleSidecars` by relpath now that `.agents` contains
      `.agents/skills`; verified by a test asserting one finding per leftover in
      both `doctor --json` and `init --json`
- [x] 2.6 Add doctor's `legacy-layout` check and teach `checkDanglingRefs` the
      skill-name spelling; verified by `doctor --json` on a legacy fixture and
      zero `dangling-ref` findings across the shared bodies
- [x] 2.7 Verification for this track: rows 2.3, 3.1-3.7, 4.1-4.4 and 5.1-5.3 of
      verification.md are re-run and marked

## 3. Track C — tests, snapshots and generated output

- [x] 3.1 Update `adapters.test.ts`, `render.test.ts` and
      `dangling-refs.test.ts` for the four-harness set, the dialects and the
      shared root; verified by `mise run test` green with the claude and
      opencode snapshot blocks provably unchanged
- [x] 3.2 Review the `__snapshots__/render.test.ts.snap` diff line by line
      rather than blanket-updating, and drop the obsolete "all three harnesses"
      key; verified by the diff containing only path, `contentHash` and
      `/cospec` dialect changes
- [x] 3.3 Run `mise run generate` to move this repo's own twelve skills and add
      `.agents/skills/cospec-*/` to `.prettierignore`; verified by
      `mise run generate:check` and `mise run format:check` both clean
- [x] 3.4 Verification for this track: rows 1.5 and 6.1-6.4 of verification.md
      are re-run and marked

## 4. Track D — documentation

- [x] 4.1 Rewrite the Codex block, add the shared-root section, the invocation
      spellings and the migration callout in `apps/docs/guide/harness-setup.md`;
      verified by `mise run docs:build` and a read-through against the rendered
      output
- [x] 4.2 Update `apps/docs/reference/commands.md` (`--harness` values,
      `update --check` drift, doctor's `legacy-layout`),
      `guide/installation.md`, `reference/configuration.md` and `index.md`;
      verified by `mise run docs:build` and the docs CI job
- [x] 4.3 Fix `docs/harness-integration.md`'s claim that cospec never writes to
      `.agents/`, and update `docs/self-hosting.md`, `README.md` and
      `CONTRIBUTING.md`; verified by grepping the repo for the retired claim
      returning nothing
- [x] 4.4 Update `.agents/shared.md`'s managed-dirs list and run
      `mise run agents:sync`; verified by `mise run agents:check` reporting the
      shared blocks in sync
- [x] 4.5 Verification for this track: rows 7.1-7.3 of verification.md are
      re-run and marked

## 5. Close-out

- [x] 5.1 Run `mise run check` on the final branch state and prove any failure
      reproduces on `main`; verified by row 6.2 of verification.md
- [x] 5.2 Archive as the final commit on the PR branch via
      `mise run cospec -- archive harness-agents-target`; verified by the two
      hard gates passing and the change moving to `openspec/changes/archive/`
