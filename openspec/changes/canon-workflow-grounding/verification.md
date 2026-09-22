## 1. Workflow bodies ground every project fact through cospec [critical]

- [ ] 1.1 @regression (agent) grep the rendered workflow bodies across `.claude/`, `.codex/`, `.opencode/`, `.agents/skills/` for `openspec/config.yaml` and `openspec/config.yml` -> zero hits; the same grep before the fix matches `explore`'s body in every harness
- [ ] 1.2 @unit (agent) canon-content test asserting `explore.md` and `propose.md` each name `cospec context --json` and state that context/rules constrain reasoning rather than authorise action -> both assertions pass
- [ ] 1.3 @unit (agent) canon-content test asserting `propose.md` instructs reporting a root-resolution failure instead of proceeding -> assertion passes

## 2. Explore conducts grounded, dependency-ordered discovery [critical]

- [ ] 2.1 @unit (agent) canon-content test asserting `explore.md` carries one-question-at-a-time, the decision each question unlocks, dependency ordering, check-the-repo-before-asking, recommend-with-tradeoffs, decisions-in-conversation, and "silence is not acceptance" -> every assertion passes
- [ ] 2.2 @unit (agent) canon-content test asserting `explore.md` names `cospec list --specs` and `cospec show "<id>" --type spec --no-scenarios` -> assertion passes
- [ ] 2.3 @integration (agent) run `mise run cospec -- list --specs` and `mise run cospec -- show harness-workflows --type spec --no-scenarios` against this repo -> both exit 0 and print the capability inventory and the requirement list, confirming the commands the body now names really exist at the current pin
- [ ] 2.4 @unit (agent) canon-content test asserting the explicit-capture-request confirmation clause is present and scoped to what the user named -> assertion passes

## 3. Update stages a draft before any write [critical]

- [ ] 3.1 @regression (agent) canon-content test asserting `update.md` step 4 does not instruct applying an edit and that the confirmation step declares itself the only artifact-writing step -> passes after the fix; the same test fails against the pre-fix body, whose step 4 reads "Apply the requested edit"
- [ ] 3.2 @unit (agent) canon-content test asserting the already-coherent branch says "propose no revisions" rather than "edit nothing" -> assertion passes

## 4. Skill descriptions are discoverable by natural phrasing

- [ ] 4.1 @unit (agent) canon-content test asserting each of the twelve `harness.yaml` descriptions carries a trigger sentence naming both the `cospec` and `openspec` spellings -> twelve of twelve pass
- [ ] 4.2 @unit (agent) canon-content test asserting the `cospec-update-change` description disambiguates the workflow from the `cospec update` CLI subcommand -> assertion passes
- [ ] 4.3 @integration (agent) compare every rendered skill's description against the manifest across the claude, codex, opencode, and `.agents/skills` outputs -> each matches verbatim, trigger sentence included
- [ ] 4.4 @eval (agent) run the e2e eval harness over prompts phrased as a user would type them — "openspec propose a fix for X", "cospec update my change's artifacts", "update cospec" — -> the propose and update-change workflows are selected for the first two and the CLI-subcommand reading is not selected for `cospec-update-change` on the third

## 5. Artifact templates open with a top-level heading [critical]

- [ ] 5.1 @integration (agent) scaffold a throwaway `cospec new feat <slug>` in a temp store, run every artifact's `cospec instructions … --json` template through to disk, and read the first line of each -> `# Proposal`, `# Blocking Changes`, `# Specs`, `# Design`, `# Tasks`, `# Verification` respectively
- [ ] 5.2 @unit (agent) parser fixtures for `tasks.ts` `GROUP_RE`, `verification.ts` `GROUP_RE`, `deltas.ts` `SECTION_RE`, and the `surfacesBlock` append path, each run against a body with and without a leading `# ` line -> identical groups, sections, and append position in both cases
- [ ] 5.3 @equivalence (agent) `cospec validate <slug> --strict` on an untouched freshly scaffolded change, before and after the template heading edit -> identical verdict and identical issue set
- [ ] 5.4 @unit (agent) assert both `proposal` template variants open with `# Proposal` -> both pass

## 6. Archive prose records existing behaviour only

- [ ] 6.1 @unit (agent) canon-content test asserting `bulk-archive.md` states the per-call archive-slot collision pre-check runs before any spec sync and adds no manual step -> assertion passes
- [ ] 6.2 @manual (human) read `archive.md` and `sync-specs.md` against `rules/archive.ts` `archive/new-spec-non-added` and the REMOVED-only `retire_capabilities` branch -> the retirement nuance is confirmed already covered, or prose is added and this row records which

## 7. The regenerated tree and the repo gate stay green [critical]

- [ ] 7.1 @unit (agent) `mise run generate` then `mise run generate:check` -> reports no drift on every commit in this change
- [ ] 7.2 @unit (agent) the existing dangling-reference canon test -> every workflow body references only skills the same generator run emits
- [ ] 7.3 @integration (agent) `mise run cospec -- schemas` after regeneration -> still reports eleven schemas
- [ ] 7.4 @e2e (agent) `mise run check` -> green
- [ ] 7.5 @manual (human) `apps/docs` and `docs/` pages that quote a skill description or a template body verbatim are updated in this change -> each quoted string matches the regenerated output, or the page is confirmed to quote none
