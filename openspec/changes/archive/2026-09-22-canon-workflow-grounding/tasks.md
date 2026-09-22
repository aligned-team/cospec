## 1. Track E1 — explore.md grounding and discovery discipline

- [x] 1.1 Reroute `explore.md`'s "Ground yourself first" section from the
      hand-read of `openspec/config.yaml`/`config.yml` to
      `cospec context --json`, keeping the constraint-not-material framing, and
      verify with the rendered-body grep of verification row 1.1 returning zero
      hits
- [x] 1.2 Add the adapted planning-discipline block (one focused question at a
      time with the decision it unlocks, dependency-ordered questions, check the
      repo before asking a verifiable fact, recommend with tradeoffs, decisions
      in the conversation not in files, silence is not acceptance) and verify
      with the canon-content assertions of verification row 2.1
- [x] 1.3 Add the capability-inventory step naming `cospec list --specs` and
      `cospec show "<id>" --type spec --no-scenarios`, and verify with the
      canon-content assertion of row 2.2 plus the live command run of row 2.3
- [x] 1.4 Add the narrowly scoped rule that an explicit capture request is its
      own write confirmation, and verify with the canon-content assertion of row
      2.4
- [x] 1.5 Confirm `/cospec:propose` is named at every handoff in `explore.md`
      and record the check in this task's completion note rather than editing
      the body, verified by re-reading the handoff lines

## 2. Track E2 — propose.md project grounding

- [x] 2.1 Add the adapted grounding step to `propose.md`: run
      `cospec context --json` before choosing a type and slug, treat the result
      as constraint not authority, and verify with the canon-content assertion
      of verification row 1.2
- [x] 2.2 Add the root-resolution-failure branch (report, do not proceed)
      without porting upstream's `PROJECT_ROOT_GUARD` prose, and verify with the
      canon-content assertion of verification row 1.3

## 3. Track E3 — update.md draft-then-write staging

- [x] 3.1 Restage `update.md` step 4 from "Apply the requested edit" to drafting
      the edit in the conversation and checking every other artifact against the
      drafted edit, and verify with the regression assertion of verification row
      3.1 failing against the pre-fix body
- [x] 3.2 Change the already-coherent branch from "edit nothing" to "propose no
      revisions" and add the ownership sentence to step 5 declaring it the only
      artifact-writing step, verified by the assertions of rows 3.1 and 3.2

## 4. Track E4 — natural-phrasing skill descriptions

- [x] 4.1 Append a trigger sentence to each of the twelve workflow descriptions
      in `harness.yaml`, covering both the `cospec <verb>` and `openspec <verb>`
      spellings, and verify with the twelve-of-twelve canon-content assertion of
      verification row 4.1
- [x] 4.2 Disambiguate the `cospec-update-change` description from the
      `cospec update` CLI subcommand, and verify with the assertion of
      verification row 4.2
- [x] 4.3 Confirm the descriptions render verbatim into the claude, codex,
      opencode, and `.agents/skills` outputs, verified by the cross-harness
      comparison of verification row 4.3
- [x] 4.4 Run the advisory e2e eval over naturally phrased prompts and record
      the selection outcomes, verified by verification row 4.4

## 5. Track E5 — artifact template top-level headings

- [x] 5.1 Prepend `# Proposal` to both `proposal` template variants,
      `# Spec Delta` to the specs template body, and `# Design`, `# Tasks`, and
      `# Verification` to theirs; `blocking-changes` already opens with
      `# Dependencies` and needs no edit — verified by the first-line check of
      verification row 5.1 and the variant check of row 5.4
- [x] 5.2 Add parser fixtures proving `tasks.ts` `GROUP_RE`, `verification.ts`
      `GROUP_RE`, `deltas.ts` `SECTION_RE`, and the `surfacesBlock` append path
      are inert across a leading `# ` line, verified by verification row 5.2
- [x] 5.3 Capture the before/after `cospec validate <slug> --strict` equivalence
      on an untouched scaffold, verified by verification row 5.3

## 6. Track E6 — archive and bulk-archive prose

- [x] 6.1 Add the sentence to `bulk-archive.md` recording that each
      `cospec archive` call pre-checks its archive slot before any spec sync,
      adding no manual step, verified by the canon-content assertion of
      verification row 6.1
- [x] 6.2 Audit `archive.md` and `sync-specs.md` against the
      `archive/new-spec-non-added` rule and the REMOVED-only
      `retire_capabilities` branch, adding prose only if a body is silent,
      verified by the read-through of verification row 6.2

## 7. Regeneration, docs, and the repo gate

- [x] 7.1 Run `mise run generate` in every commit of this change so the managed
      tree ships with the canon edit, verified by `mise run generate:check`
      reporting no drift per commit (verification row 7.1)
- [x] 7.2 Run the existing dangling-reference canon test and
      `mise run cospec -- schemas`, verified by verification rows 7.2 and 7.3
- [x] 7.3 Update every `apps/docs` and `docs/` page that quotes a skill
      description or a template body verbatim, verified by verification row 7.5
- [x] 7.4 Run `mise run format:fix` over the change directory and
      `mise run check` to green, verified by verification row 7.4
