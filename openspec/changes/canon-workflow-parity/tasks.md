# Tasks

## 1. Dependency gate and baseline

- [x] 1.1 Confirm `workflow-profiles` (R12) has merged: `git fetch origin` and
      check that `git log origin/main` holds its archive commit and that
      `openspec/changes/archive/` on `origin/main` holds a `workflow-profiles`
      entry. Do not start group 2 until it does; this is the whole gate, since
      `blocking-changes.md` cannot hold the unmerged change (see its Phase
      Gates) -> `git log origin/main --oneline | grep -i workflow-profiles`
      prints the merge and archive commits. Observed: `git log origin/main`
      holds `feat(harness): add workflow profiles, delivery and init language`
      (713941ca); `openspec/changes/archive/2026-10-09-workflow-profiles`
      exists.
- [x] 1.2 Rebase onto that `main` (`--force-with-lease`, no merge commit), run
      `bun install --frozen-lockfile`, add `workflow-profiles` to "Blocked by"
      in `blocking-changes.md` as an archived entry, re-read R12's merged
      `design.md` and the merged `render.ts`, `harness.yaml` and bodies, and
      record in this task what moved (the resolver's name and call site, the
      wrapped reference form, any difference from `design.md` D1) ->
      `cospec     validate canon-workflow-parity --strict` is clean and
      `git log     main..HEAD` shows only this change's commits. Observed:
      rebased onto 713941ca with no conflicts; `bun install --frozen-lockfile`
      clean; `workflow-profiles` added to Blocked by as archived. The resolver
      is `resolveOptionalWorkflows` (`harness/optional-workflow.ts`), called in
      `renderHarnessFiles` on the `normalizeBody` text before `{{TYPE_TABLE}}`
      injection and `transformBody`, and `renderHarnessFiles` takes `workflows`
      and `delivery` options; this matches design D1, so no difference to
      record. `validate --strict` clean, `apply` exits 0.
- [x] 1.3 Run the baseline `mise run test`, `mise run test:contract` and
      `mise run generate:check` before any source edit -> all exit 0, so every
      later red is this change's. Observed: `mise run test` 3026 pass / 0 fail;
      `mise run test:contract` 3211 pass / 0 fail; `mise run generate:check`
      exit 0.

## 2. T1 shared root-guard fragment

- [x] 2.1 Write `test/unit/canon-render.test.ts` rows first, as `test.failing`:
      the `{{ROOT_GUARD}}` token is replaced by the fragment; a body missing it,
      repeating it or carrying an unregistered `{{NAME}}` makes the render throw
      naming the workflow; the fragment names no bare `openspec` command, no
      `/cospec:<id>` and no optional-workflow marker; interpolation runs before
      R12's resolver; `canonFile('workflows/_shared/root-guard.md')` resolves ->
      `bun test test/unit/canon-render.test.ts` shows the rows failing for the
      right reasons. Observed: `test/unit/canon-render.test.ts` landed as 9
      `test.failing` rows plus one plain regression guard; they failed on the
      missing registry entry, the unreplaced token and the absent throws, not on
      the harness.
- [x] 2.2 Write `canon/workflows/_shared/root-guard.md` (the lead-in check, the
      carve-out, the auto-selected versus explicit branch, the picker; design D3
      and D4), register it in `canon/embedded.ts`, and add
      `interpolateFragments` and its `FRAGMENTS` registry to `harness/render.ts`
      as the first step of the pipeline -> the row set of 2.1 that does not need
      the bodies passes and is flipped from `test.failing`. Observed: all ten
      rows pass and are flipped; `{{ROOT_GUARD}}` sits before the first heading
      in all twelve bodies so the exactly-once throw holds for the real canon
      (the prose each body keeps is replaced in group 8); render goldens and the
      codex snapshot regenerated; `mise run test` 3036 pass / 0 fail,
      `generate:check` clean.
- [x] 2.3 Confirm the compiled binary carries the fragment: `mise run build`
      then render once from the built binary in a sandbox ->
      `mise run     test:pack` exits 0 and the built `cospec update` run writes
      bodies holding the fragment text.

      Observed: `mise run build` then `mise run test:pack` exit 0 (2 pass); the built binary's `init` in a sandbox wrote bodies holding the fragment and `update --check` reported no drift.

## 3. T2 propose and ff inspect before drafting

- [ ] 3.1 Add `canon-render.test.ts` rows first, as `test.failing`: the rendered
      `propose` and `ff` bodies tell the agent to inspect implementation, tests,
      configuration and documentation outside `openspec/` in proportion to the
      change, to ask when the target is unclear, and neither instructs opening
      `openspec/config.yaml` or `openspec/schemas/`; each controlling sentence
      is found in the pinned `propose.js` and `ff-change.js` -> the rows fail.
- [ ] 3.2 Add the passage to `propose.md` and `ff.md` and reword each body's "do
      not read repo files to reverse-engineer an artifact's shape" sentence to
      say it is about format, not subject matter (design D5) -> the 3.1 rows
      pass and are flipped.

## 4. T3 explore draws ASCII only

- [ ] 4.1 Add `canon-render.test.ts` rows first, as `test.failing`: the rendered
      `explore` body states the plain-ASCII rule with its reason and holds no
      character in U+2190-U+21FF or U+2500-U+257F -> the rows fail.
- [ ] 4.2 Add the Visual bullet and the ASCII paragraph to `explore.md` (design
      D6) -> the 4.1 rows pass and are flipped.

## 5. T4 apply declares, prints and relays the project's inputs

- [ ] 5.1 Write the failing rows first. Unit
      (`test/unit/commands/apply*.test.ts`): `relayApplyInstructions` carries
      `context`, `operationGuidance` and `references` through, spells
      `references[].fetch` and `.status[].fix` and nothing else (a guidance
      entry beginning `openspec list` survives byte for byte), and
      `renderReferencesSection` and `renderOperationInputs` print the binary's
      sections and nothing when all three are absent. Contract
      (`test/contract/operation-guidance.test.ts`, new): a sandbox project whose
      `config.yaml` sets `context` and `operations.apply.guidance` gives the
      same sections as the pinned binary's `instructions apply`, on the
      clear-gate path and on `applyLegacy`, in text and `--json`, and the
      unconfigured case prints nothing new -> the rows fail.
- [ ] 5.2 Declare `context?`, `operationGuidance?` and `references?` on
      `ApplyInstructionsJson` (`core/openspec.ts`), export `ReferenceEntry`,
      `renderReferencedStoresSection` and `sanitizeInline` from
      `core/instructions-render.ts`, and add `core/operation-inputs.ts` (design
      D7) -> `mise run typecheck` exits 0 and the unit rows of 5.1 pass.
- [ ] 5.3 Wire the relay and both transcripts in `commands/apply.ts`: spell the
      `references` command fields in `relayApplyInstructions`, print the
      references section before the instruction and the context and guidance
      sections after it on the clear-gate path and in `applyLegacy` -> the
      contract rows of 5.1 pass and are flipped, and the existing apply unit and
      integration suites pass unchanged.
- [ ] 5.4 Add upstream's precedence paragraph to `apply.md`, reading `context`
      and `operationGuidance` from the `apply` object of the gate's `--json`,
      with its `ported:` provenance recorded in group 8 -> the rendered body
      carries each controlling sentence and the differential row against
      `apply-change.js` passes.

## 6. T5 archive consults the archive guidance

- [ ] 6.1 Add rows first, as `test.failing`: the rendered `archive` body prints
      `cospec instructions archive --change "<slug>" --json` and states it is
      optional and non-blocking; a contract row extracts that command line from
      the rendered body, runs it in a sandbox project whose `config.yaml` sets
      `operations.archive.guidance`, and asserts the guidance is in the
      document; the precedence sentences match `archive-change.js` -> the rows
      fail.
- [ ] 6.2 Add the step-1 lookup and its precedence paragraph to `archive.md`
      (design D8) -> the 6.1 rows pass and are flipped.

## 7. T6 bulk-archive resolves collisions

- [ ] 7.1 Build the collision fixture and write the rows first, as
      `test.failing`: two changes ADDing the same requirement to one capability;
      archiving both unresolved makes the second refuse with
      `archive/added-exists`; after the edit the body directs (the newer
      change's `ADDED` retargeted to a full-content `MODIFIED`), a hash walk of
      the whole tree differs only under the newer change's `specs/`, and both
      `cospec archive` calls exit 0 with both hard gates run; a second variant
      excludes a colliding requirement block and archives; a body row asserts
      the declined branch, the confirmation, the ban on main-spec writes, hand
      `mv` and `--force*`, and the batch-level archive lookup -> the rows fail.
- [ ] 7.2 Rewrite `bulk-archive.md` (design D8, D9): the batch lookup,
      capability-path conflict detection, the include/exclude decision with
      chronological order, the confirmed delta-file edits,
      `cospec validate     --strict` per edited change, then `cospec archive`
      per change in resolved order -> the 7.1 rows pass and are flipped.

## 8. T7 callers, provenance and the ad hoc prose

- [ ] 8.1 Add rows first, as `test.failing`: every body carries exactly one
      `{{ROOT_GUARD}}` and, once rendered, one copy of the fragment; no body
      keeps its own grounding or picker prose; every workflow has a `ported:`
      list with the root-guard and change-picker entries and each passage of
      this change on the workflow that carries it; a contract row checks each
      `file` exists in the pinned dist and each `pin` is the pinned version and
      lists the entries to re-diff on a mismatch; `ported:` never reaches a
      generated file -> the rows fail.
- [ ] 8.2 Add the token to all twelve bodies after the opening paragraph and
      replace each body's ad hoc grounding (`propose` step 1, the "Select the
      change" paragraphs of `apply`, `archive`, `sync-specs`, `verify`,
      `update`, `continue` and `ff`, `explore`'s context bullet), keeping
      sole-change auto-select and the `Using change:` announcement -> the 8.1
      body rows pass and the living `harness-workflows` scenarios for
      auto-select and for `explore` and `propose` reading
      `cospec context --json` still hold.
- [ ] 8.3 Add `ported:` to every workflow in `harness.yaml`, `PortedPassage` and
      `WorkflowDef.ported` to `harness/adapters.ts`, and a shape check in
      `readWorkflowManifest` -> the provenance rows pass and are flipped, and
      `mise run typecheck` exits 0.

## 9. T8 render goldens

- [ ] 9.1 Regenerate the render goldens on purpose with
      `COSPEC_GOLDEN_WRITE=1 bun test test/unit/harness-render.test.ts` and
      review the diff -> only the twelve bodies' text and the hashes that cover
      it moved, no path was added or removed, and the plain
      `bun test test/unit/harness-render.test.ts` passes.
- [ ] 9.2 Run `mise run generate` and `mise run generate:check` to regenerate
      this repo's own managed harness files -> `generate:check` exits 0 and the
      regenerated `.claude/skills/cospec-*` bodies hold one copy of the
      fragment.
- [ ] 9.3 Flip every remaining `test.failing` row in the two T8 files and run
      `mise run test` and `mise run test:contract` -> both exit 0 with no
      `test.failing` left for this change.

## 10. T9 the tasks guidance never produces an archive task

- [ ] 10.1 Add rows first, as `test.failing`: the tasks `instruction` of all
      eleven generated schemas states that archiving is not a task and gives the
      `The archive commit follows this one` wording; the tasks `templateBody`
      and every type's note hold no archive row; a contract row runs
      `cospec instructions tasks --change <slug>` on a new change and finds the
      rule -> the rows fail.
- [ ] 10.2 Add the paragraph to the instruction in
      `canon/artifacts/tasks/meta.yaml` (design D11), run `mise run generate`,
      and update the three schema goldens in `test/unit/schemas/golden/` -> the
      10.1 rows pass and are flipped and `mise run generate:check` exits 0.

## 11. Registry and specs

- [ ] 11.1 Confirm no `canon-workflow-parity` owner exists in
      `test/contract/parity-pending.yaml` and that the reachability test passes
      with the pending list empty ->
      `grep -c canon-workflow-parity     apps/cli/test/contract/parity-pending.yaml`
      prints 0 and `mise run test:contract` exits 0.
- [ ] 11.2 Run `cospec validate canon-workflow-parity --strict` and
      `mise run openspec:schema:validate` after the group-8 and group-10 edits
      -> both exit 0.

## 12. Docs

- [ ] 12.1 Update `apps/docs/concepts/apply-and-archive.md` with the apply
      inputs (what prints, in which path, and that nothing prints when
      unconfigured), the archive lookup and bulk-archive's resolution procedure
      -> `mise run     docs:build` exits 0 and the page names
      `operations.apply.guidance` and `operations.archive.guidance`.
- [ ] 12.2 Update `docs/apply-archive.md` with the architecture of the same: the
      relay and its respell, the transcript order, the lookup and the collision
      edits -> the page states each, checked by reading it against the code.
- [ ] 12.3 Update `apps/docs/reference/configuration.md` with the `operations:`
      keys: the two ids `apply` and `archive`, `guidance` as a list of strings,
      what each reaches and the binary's warnings for an unknown id ->
      `mise run     docs:build` exits 0 and the page documents both ids.
- [ ] 12.4 Update `docs/harness-integration.md` (the fragment, the token, the
      order against the conditional resolver, `ported:`) and
      `apps/docs/concepts/types-and-artifacts.md` (the tasks guidance) -> both
      pages state their fact once and link to the owner of the rest.
- [ ] 12.5 Record the docs update in the verification ledger's docs rows -> rows
      7.1 and 7.2 hold observed evidence.

## 13. Shared agent context

- [ ] 13.1 Update `.agents/shared.md` (canon bodies interpolate `_shared/`
      fragments through registered tokens, every ported passage is recorded in
      `ported:`, the tasks guidance rule) and run `mise run agents:sync` ->
      `mise run agents:check` exits 0.

## 14. Land

- [ ] 14.1 Rebase onto `main` again (`--force-with-lease`, no merge commit),
      rerun `bun install --frozen-lockfile` and `mise run check`, and confirm
      `git log main..HEAD` shows only this change's commits. The archive commit
      follows this one -> `mise run check` exits 0 and the observed counts are
      recorded here.
