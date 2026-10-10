# Verification

## 1. operations.apply.guidance reaches both cospec apply paths [critical]

- [ ] 1.1 @integration (agent) run `cospec apply` in a sandbox project whose `config.yaml` sets `context` and `operations.apply.guidance`, on a cospec-typed change and on a legacy-schema change, in text and `--json`, beside the pinned binary's `instructions apply` on the same fixture -> every output carries the context and each guidance entry, and the text sections equal the binary's own (`operation-guidance.test.ts`)
- [ ] 1.2 @e2e (agent) drive the real `bun run apps/cli/src/index.ts apply <change>` in that fixture and read the transcript -> the references section precedes the instruction, the context and guidance sections follow it, and an unconfigured project prints none of them
- [ ] 1.3 @unit (agent) `relayApplyInstructions` and `renderOperationInputs` over a document with `context`, `operationGuidance` and `references` -> user text is byte for byte (a guidance entry beginning `openspec list` is unchanged) and only the two reference command fields read `cospec ...`
- [ ] 1.4 @integration (agent) render `apply` and compare its precedence paragraph with `apply-change.js` in the pinned dist -> every controlling sentence of the upstream paragraph is present

## 2. operations.archive.guidance is reachable from archive.md alone [critical]

- [ ] 2.1 @integration (agent) extract the lookup command line from the rendered `archive` body, run it in a sandbox project whose `config.yaml` sets `operations.archive.guidance` -> the `--json` document carries the guidance in `operationGuidance`, and the same line is in the rendered `bulk-archive` body
- [ ] 2.2 @unit (agent) the rendered `archive` and `bulk-archive` bodies state the lookup is optional and non-blocking and carry the precedence paragraph -> each controlling sentence matches `archive-change.js` and `bulk-archive-change.js`

## 3. The fragment renders into all twelve bodies [critical]

- [ ] 3.1 @unit (agent) render every workflow for every shipped harness row -> each of the twelve carries the fragment's text exactly once, none carries `{{ROOT_GUARD}}`, and no body keeps its own grounding or picker prose
- [ ] 3.2 @integration (agent) run `cospec update` in a sandbox project and read a written skill and command file for each shipped harness -> each holds one copy of the fragment and `cospec doctor` reports no stale harness file
- [ ] 3.3 @unit (agent) the fragment names the `Declared in` and `Invalid store declaration in` prefixes, both branches, and the `(Recommended)` picker; a body missing, repeating or adding a token fails the render -> every assertion holds
- [ ] 3.4 @integration (agent) probe `cospec list --json` in a sandbox project with no root, with an unregistered declared store and with a malformed declaration -> `root: null`, exit 1, and a `status` message beginning `Declared in` for the last two, matching the fragment's wording

## 4. No body carries a bare openspec command

- [ ] 4.1 @regression (agent) scan every rendered body and the fragment for a bare `openspec <command>` invocation -> none, and the existing living-spec scenario for it still passes

## 5. Every ported entry names a template that exists in the pinned dist

- [ ] 5.1 @integration (agent) check each `ported:` entry's `file` against `apps/cli/node_modules/@fission-ai/openspec` and its `pin` against the pinned version -> every file exists and every pin matches, and a forced mismatch lists the entry
- [ ] 5.2 @unit (agent) render every harness file -> no generated file contains a `ported:` key or entry

## 6. bulk-archive resolves a collision through delta edits only [critical]

- [ ] 6.1 @integration (agent) archive the two-change ADDED-collision fixture without the edit -> the second archive refuses with `archive/added-exists` and moves nothing
- [ ] 6.2 @integration (agent) apply the body's documented edit (retarget the newer `ADDED` to a full-content `MODIFIED`) and archive both in chronological order with `cospec archive` -> a whole-tree hash walk differs only under the newer change's `specs/`, both archives exit 0 with `archive/verification-incomplete` and `archive/scenario-preservation` run, and the living spec holds the newer requirement
- [ ] 6.3 @integration (agent) the exclusion variant: remove one colliding requirement block from the newer change's delta and archive both -> exit 0, same tree-diff property
- [ ] 6.4 @unit (agent) the rendered `bulk-archive` body -> it states the confirmation and declined branch, forbids main-spec writes, hand `mv` and `--force*`, and runs `cospec validate --strict` on each edited change

## 7. Docs name each changed fact on the page that owns it

- [ ] 7.1 @integration (agent) `mise run docs:build` -> exits 0 and the built site names `operations.apply.guidance` and `operations.archive.guidance` on the configuration page and the lookup and resolution on the apply and archive page
- [ ] 7.2 @regression (agent) grep `docs/apply-archive.md`, `docs/harness-integration.md` and `apps/docs/concepts/types-and-artifacts.md` for the relay and transcript order, the fragment and `ported:`, and the tasks guidance -> each page states its fact once, and the observed line numbers are recorded here

## 8. propose, ff and explore carry the ported passages

- [x] 8.1 @unit (agent) render `propose`, `ff` and `explore` -> the first two carry the inspection passage and keep the format rule, the third states the ASCII rule with its reason and holds no glyph in U+2190-U+21FF or U+2500-U+257F Observed: the propose and ff inspection passage rows and the explore ASCII rows in `test/unit/canon-render.test.ts` pass (plain tests), with the format rule and the no-glyph guard.
- [x] 8.2 @integration (agent) compare each controlling sentence with `propose.js`, `ff-change.js` and `explore.js` in the pinned dist -> every one is found Observed: `test/integration/ported-passages.test.ts` finds every controlling sentence of both passages in the pinned `propose.js`, `ff-change.js` and `explore.js`.

## 9. The tasks guidance never produces an archive task

- [ ] 9.1 @unit (agent) read the generated schemas of all eleven types, the tasks `templateBody` and every type's tasks note -> each instruction states that archiving is not a task and gives the `The archive commit follows this one` wording, and no template or note offers an archive row
- [ ] 9.2 @integration (agent) run `cospec instructions tasks --change <slug>` on a new change in a sandbox project -> the output carries the rule

## 10. Agent context and the full gate

- [ ] 10.1 @regression (agent) `mise run agents:check` -> exits 0 with `.agents/shared.md` carrying the fragment, `ported:` and tasks-guidance conventions
- [ ] 10.2 @regression (agent) `mise run check` -> exits 0, with unit, integration, contract and bench suites green and `generate:check` clean
