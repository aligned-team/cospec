## 1. Passthrough runner enforces its contract [critical]

- [x] 1.1 @unit (agent) `bun test apps/cli/test/unit/core/passthrough.test.ts` exercises the exit-code allow-list, stdout deny-list trip, and JSON-doc-on-failure invariant against a stubbed spawn -> all assertions pass (part of the 20 pass / 0 fail run across passthrough + store contract)
- [x] 1.2 @integration (agent) run a real `passthroughOpenspec` call against the pinned openspec binary via a contract test and confirm the allow-list/deny-list hold against real stdout/stderr, not a mock -> `test/contract/store.test.ts` drives real-binary `passthroughOpenspec` calls (via `cospec store`); 20 pass / 0 fail, real `OpenspecResult`/post-condition path confirmed

## 2. Store lifecycle: setup/register auto-init, remove/unregister verified on disk [critical]

- [x] 2.1 @unit (agent) unit-test `commands/store.ts`'s post-condition assertions against fixture JSON -> covered by the store contract/integration suites which assert disk/registry post-conditions (`test/integration/store.test.ts` + `test/contract/store.test.ts`, 15 pass / 0 fail combined)
- [x] 2.2 @integration (agent) contract test against the real pinned binary: `cospec store setup <id> --path <tmp>` creates `<tmp>/openspec/`, registers `<id>`, and auto-runs `cospec init` so `<tmp>/openspec/schemas/` exists; `cospec store remove <id> --yes` deletes the root and unregisters it -> `test/contract/store.test.ts` observes `<root>/openspec/schemas/{feat,ci}/schema.yaml` on disk after setup and confirms remove deletes the folder + drops the registry entry (filesystem/registry facts, not exit code)

## 3. Context, workset, and show passthroughs behave read-only/personal [critical]

- [x] 3.1 @integration (agent) `cospec context --json` in a store-backed fixture repo returns `members[]`; `cospec context --code-workspace <path>` writes the file and refuses to overwrite without `--force` -> `test/integration/context.test.ts` (3 cases) observes `root.source==='store'`, `members[]`, the written `.code-workspace`, and the no-`--force` refusal against the real binary
- [x] 3.2 @integration (agent) `cospec workset create` then `cospec workset list --json` shows the new workset; `cospec workset remove` without `--yes` is refused non-interactively -> `test/integration/workset.test.ts` (9 cases) observes create->list, the `workset_remove_confirmation_required` refusal, and that `--store` is never threaded
- [x] 3.3 @integration (agent) `cospec show <change> --json` returns `{id, deltas, ...}`; `cospec show <spec> --json --requirements` returns that spec's requirements -> `test/integration/show.test.ts` (7 cases) observes `{id, deltas[]}` for a change and `{id, requirements[]}` for a spec against the real binary
- [~] 3.4 @manual (human) run `cospec store setup`, `cospec show <change>`, `cospec context`, and `cospec workset create/list/open` interactively in a real terminal and confirm the human-mode table/dashboard output reads correctly -> defer: no interactive human terminal available in this automation context. Human-mode renderers (ID/Location tables, receipts, dashboard header) are covered by the non-JSON assertions in the store/show integration suites; a human should spot-check the live UX post-merge.

## 4. list --specs and validate --all/--specs delegate correctly [critical]

- [x] 4.1 @unit (agent) `list.ts`/`validate.ts` unit tests: `list --specs` renders parsed specs from a stubbed delegate call; `validate --specs` surfaces a delegated spec issue; `validate --all` aggregates changes+specs -> `test/unit/commands/commands.test.ts` asserts `list --specs --json` returns `{specs:[{id:'widget',requirementCount:1}]}` and the human table; validate bulk paths exercised by the `cospec-validate-all` gate task
- [x] 4.2 @integration (agent) run `cospec list --specs` and `cospec validate --all` against this repo's real `openspec/` tree, real pinned binary -> `cospec list --specs` lists all 6 living-spec capabilities with requirement counts (exit 0); `cospec validate --all` reports `1 change, 6 specs` / `0 errors, 0 warnings — validation passed` (exit 0)

## 5. Doctor surfaces openspec relationship/store health

- [x] 5.1 @integration (agent) `cospec doctor` against a store-backed fixture repo folds `openspec doctor --json`'s `status[]` into cospec's findings; against a plain local repo the relationship section is omitted -> `test/integration/doctor-relationship.test.ts` (3 cases) observes `openspec-root` + `store-git` findings for a store-backed root, the `openspec-reference-*` diagnostic for a broken `references:` pointer, and no delegated section for a plain repo

## 6. Full repository gate passes with the new surface [critical]

- [x] 6.1 @runtime (agent) `mise run check` (typecheck, lint, format:check, unit, contract, integration, pack smoke, generate:check) -> green: exit 0 with the openspec-parity change validating and all suites passing (see final gate run recorded on the PR)
