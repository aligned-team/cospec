# Verification

## 1. The key oracle passes and keeps cospec's keys [critical]

- [ ] 1.1 @equivalence (agent) key oracle row `list`: `cospec list --json` and `openspec list --json` on the staged-mtime fixture (three changes, a namespace folder, one change with tasks) -> every binary key path is present with the binary's value (`lastModified` by type), rows are in the binary's order, `warnings` and `root` equal the binary's, and every pre-existing cospec row key keeps its native value
- [ ] 1.2 @equivalence (agent) key oracle row `list --specs --json` on a two-spec fixture -> `specs` and `root` equal the binary's; `version` is 1
- [ ] 1.3 @equivalence (agent) key oracle row `status --change alpha --json` on a `feat` change with only `proposal.md` -> every binary key is present with its value (`nextSteps` after respelling), each `artifacts[]` entry carries both tools' keys, `root` equals the binary's object, cospec's `change`/`type`/`state`/`gate`/`gateState`/`tasks`/`archiveReady`/`verification` keep their native values
- [ ] 1.4 @equivalence (agent) key oracle row `status --all --json` on the list fixture -> the same checks per entry, matched by `change`/`changeName`, including the namespace folder's failure entry; `root` is the binary's object
- [ ] 1.5 @equivalence (agent) key oracle rows `validate alpha --json` and `validate --all --json` -> `root`, `items[].durationMs` (by type), `summary.totals`, `summary.byType` present; `version` is 1; `items[].type` is the schema on change items and `kind` equals the binary's `type`; verdict paths match by type only; no other collision
- [ ] 1.6 @equivalence (agent) key oracle row `validate --all --report findings --json` -> the binary's `report` (with `kind`, `version: "1.0"`, `scope`, `returnedItems`, `totalItems`), `itemFindings`, `summary` and `root` are present; top-level `version` is 1
- [ ] 1.7 @equivalence (agent) key oracle row `cospec apply nope --json` beside `openspec instructions apply --change nope --json` -> `status[0].severity`/`code`/`message` keys present, `code` equal (`change_error`), exit 1 in both
- [ ] 1.8 @unit (agent) `key-oracle.ts` self-test: a cospec document whose `root` is a string where the binary's is an object, one missing an upstream key, and one dropping a snapshotted cospec key -> each fails with the offending path named; a document differing only in `version` passes

## 2. Every pending entry this change owns is gone [critical]

- [ ] 2.1 @integration (agent) `grep -c 'owner: cli-surface-parity' apps/cli/test/contract/parity-pending.yaml` before and after, and `mise run test:contract` reachability -> 7 before (`list --sort`, `status --schema`, `validate --type`, `validate --report`, `validate --concurrency`, `__complete schemas`, `__complete archived-changes`), 0 after, reachability green with no pending mark left for this owner in the command table

## 3. Every status entry names its next step [critical]

- [ ] 3.1 @e2e (agent) `cospec status --change alpha` on a `feat` change with only `proposal.md`, through the real CLI -> output ends `Next: cospec instructions blocking-changes --change alpha`; `--json` carries the same command as `next`
- [ ] 3.2 @equivalence (agent) `nextSteps` versus the binary's on five fixtures (empty change, mid-build, every required artifact done with `design.md` absent, `skip_specs: true`, a `spec-driven` change) -> cospec's `nextSteps` equals the binary's respelled through the allowlist; no element names bare `openspec`
- [ ] 3.3 @unit (agent) `resolveNext` table: first ready required, first ready optional when no required is ready, `cospec apply <id>` when every required is done, a skipped `specs` counts as done, nothing when all are blocked -> each case returns the expected command or nothing; JSON `next` and the text line call the same function
- [ ] 3.4 @equivalence (agent) for each of the 11 cospec types, a change with only `proposal.md` -> the declared artifact order equals the binary's `artifacts[]` order in `status --json`
- [ ] 3.5 @regression (agent) the empty-change entry (`.openspec.yaml` only) -> `next` is still `cospec instructions proposal --change <id>` in both modes

## 4. A namespace folder is reported as one [critical]

- [ ] 4.1 @equivalence (agent) `cospec status --change mobile` and `--json` beside the binary's on `changes/mobile/refresh-token/` -> text: the binary's explanation on stderr, exit 1; `--json`: one `change_error` document whose message equals the binary's, exit 1
- [ ] 4.2 @equivalence (agent) `cospec status --all --json` on the same root -> the folder's entry carries the explanation, every other entry is full, exit 1 as the binary exits
- [ ] 4.3 @equivalence (agent) `cospec list` and `list --json` -> the row reads `not a change`, `state` is `not-a-change`, `nested` and `warnings` equal the binary's, and the text ends with the binary's `Warning:` line
- [ ] 4.4 @equivalence (agent) `cospec validate mobile --json` and `validate --all --json` -> exactly one `meta/nested-change` ERROR on the folder carrying the binary's explanation, no `meta/openspec-yaml`, exit 1
- [ ] 4.5 @unit (agent) detector table: each root marker, a delta file only under `specs/`, a dot-file only under `specs/`, a schema output only, a file of its own, a dot-file of its own, depths one to four, a dot-directory, `archive`, an unreadable subdirectory -> namespace only where the binary's rule says so, nested ids sorted, nothing thrown
- [ ] 4.6 @equivalence (agent) the detector matrix fixture through `cospec list --json` and `openspec list --json` -> every row's `nested` equal

## 5. A schema cospec doesn't type gets real status [critical]

- [ ] 5.1 @equivalence (agent) a change on a project fork of `spec-driven`, `cospec status --change` in text and `--json` -> text lists the fork's artifacts as the binary renders them with a `Next: cospec instructions …` line; `--json` carries `change`, `type`, `legacy: true` and every binary key; exit 0; no output names bare `openspec`
- [ ] 5.2 @equivalence (agent) a built-in `spec-driven` change, the same two runs, plus `status --all` text -> the sweep's block for it is its real status, not a pointer to another command
- [ ] 5.3 @regression (agent) a change whose schema resolves nowhere, `cospec status --change ghost --json` -> before: `{change, type, legacy}` exit 0; after: the binary's `Unknown schema` diagnostic in the document, exit 1, matching text mode's exit
- [ ] 5.4 @equivalence (agent) a hand-made change directory with only `proposal.md` in a root whose `config.yaml` says `schema: feat` -> cospec's entry is a `feat` matrix graded at `schemaVersion` 1, `schemaName` is `feat` as the binary reports; with `config.yaml` naming no schema it is `spec-driven` via the delegation path
- [ ] 5.5 @equivalence (agent) `status --all --schema fix --json`, `status --change alpha --schema nope --json`, `status --all --schema nope --json` on an empty root, `status --schema nope --json` on an empty root -> every entry computed as `fix`; the binary's `Schema 'nope' not found` `change_error` (with the `{changes: [], root: null}` payload under `--all`), exit 1; the last is the no-active-changes document, exit 0, as the binary answers
- [ ] 5.6 @integration (agent) grep every status output the contract rows capture -> no line names a bare `openspec` command

## 6. List sorts and survives read failures

- [ ] 6.1 @equivalence (agent) `cospec list --json`, `--sort name --json`, `--sort bogus --json` on the staged-mtime fixture -> the row order equals the binary's for each (recent, name, recent)
- [ ] 6.2 @equivalence (agent) `openspec/changes/archive/` at mode 000, `cospec list`, `list --json`, `status --change alpha --json` -> the listing is the binary's; one document; a `warnings` entry `archive_unreadable` (JSON) or stderr line (text) names the directory; exit 0
- [ ] 6.3 @equivalence (agent) one change's `tasks.md` at mode 000, `cospec list --json` and `status --change <it> --json` -> the binary's `list_error` document (`{changes: [], root: null, status}`) and `change_error` document, compared by code and path, exit 1 in both
- [ ] 6.4 @regression (agent) one change's `blocking-changes.md` at mode 000, `cospec list --json` -> that row carries `error`, the other rows are listed, one document, exit 1

## 7. Validate resolves items and scopes as the binary does [critical]

- [ ] 7.1 @equivalence (agent) `gamma` both a change and a spec, `cospec validate gamma` and `--json` -> text: the binary's ambiguity message then `Pass --type change|spec.`, exit 1; `--json`: one `ambiguous_item` document equal to the binary's
- [ ] 7.2 @equivalence (agent) `cospec validate gamm`, `validate zzzz`, both with `--json`, and a root with no candidates -> the message equals the binary's, suggestion list and order included (duplicates kept), `unknown_item` code, exit 1
- [ ] 7.3 @equivalence (agent) `validate gamma --type spec`, `--type CHANGE`, `--type bogus`, `validate ../x --type change --json`, `validate nope --type spec --json` -> forced kind honoured, case-insensitive; `bogus` behaves as no flag (ambiguity refusal); `invalid_item` document equal to the binary's; a `meta/item-missing` ERROR item, exit 1 as the binary exits
- [ ] 7.4 @equivalence (agent) `validate alpha --all`, `validate alpha --changes`, `validate alpha --specs` -> the bulk scope runs and the name is ignored, the item set equal to the binary's
- [ ] 7.5 @equivalence (agent) the four `--report` refusals in text and `--json` (`--report bogus --all`, `alpha --report full`, `--archived --all --report full`, `--report findings`) run from a directory with no root -> messages and fix equal to the binary's, one `invalid_validation_report_request` document under `--json`, exit 1, no root refusal printed
- [ ] 7.6 @regression (agent) `validate --all --report findings` and `--report full` on a root with one failing and one clean change, both modes -> the same exit code (1); findings lists only the failing item
- [ ] 7.7 @unit (agent) the concurrency pool: `--concurrency 2` over eight stubbed validations; `0`, `abc`, unset with `OPENSPEC_CONCURRENCY=3`, and all unset -> in-flight never exceeds the bound (2, 6, 6, 3, 6); the report order equals the input order at every bound
- [ ] 7.8 @regression (agent) `proposal.md`, `tasks.md` and a delta file each at mode 000, `cospec validate <c> --json` and `validate --all --json` -> before: the command throws; after: one document, one `meta/unreadable-artifact` ERROR naming the file and `EACCES`, other items reported, exit 1
- [ ] 7.9 @regression (agent) a change that trips the binary's no-deltas tip through delegation, and the `--archived` fallback relay -> cospec's report carries the tip spelled `cospec show <change-id> --json --deltas-only`; no relayed line names bare `openspec`

## 8. Every --json failure is one document [critical]

- [ ] 8.1 @equivalence (agent) an unreadable store registry (mode 000) with `--store s1` for `list --json`, `list --specs --json`, `status --change a --json`, `status --all --json`, `validate --all --json` -> codes `list_error`, `list_error`, `change_error`, `change_error`, `validate_error` and the payloads the binary emits, message by code and path, exit 1
- [ ] 8.2 @unit (agent) `apply` early exits under `--json`: no `openspec/`, unknown change with and without a suggestion, a failed legacy delegation, a failed step-5 call -> each prints exactly one `{status: [{severity, code, message, fix?}]}` document on stdout, nothing on stderr, exit 1
- [ ] 8.3 @integration (agent) `cospec apply nope --json` through the real CLI -> one `change_error` document naming `nope`, exit 1
- [ ] 8.4 @equivalence (agent) `--store nope` with a store registered, for `list --json`, `list --specs --json`, `status --all --json`, `status --change a --json`, `validate --all --json` -> the binary's `unknown_store` diagnostic (code, message, target, fix) inside the binary's payload (`{changes: [], root: null}`, `{specs: [], root: null}`, `{changes: [], root: null}`, none, none), one document, exit 1

## 9. Completion serves schemas and archived changes

- [ ] 9.1 @equivalence (agent) `cospec __complete schemas`, `archived-changes`, `SCHEMAS` beside the binary's in a root with a project fork and two archived changes -> the same ids in the same order; each line tab-separated; exit 0; outside a root both are silent exit 1
- [ ] 9.2 @integration (agent) `completion.test.ts` on the generated bash, zsh and fish scripts -> `status --schema`, `templates --schema`, `instructions --schema` and `schema which|validate|fork` positionals call `cospec __complete schemas`; no script names the `openspec` binary

## 10. Schema classification reads the binary's user directory

- [ ] 10.1 @unit (agent) `userSchemasDir` with `XDG_DATA_HOME` set, empty, unset on darwin/linux, and win32 with and without `LOCALAPPDATA` -> the binary's `getGlobalDataDir` path plus `schemas` in every case; `change.ts`, `new.ts` and `change-metadata.ts` import the one helper
- [ ] 10.2 @equivalence (agent) a change on a schema present only under `$XDG_DATA_HOME/openspec/schemas`, and one present only under `~/.config/openspec/schemas` -> the first classifies `legacy`/`user` and `cospec validate` delegates it as the binary resolves it; the second is `unknown`, as the binary refuses it

## 11. The target-invalid dedupe is linear

- [ ] 11.1 @regression (agent) living spec duplicating `### Requirement: Widget "quoted" name`, `cospec validate --json` -> before: cospec's `archive/target-invalid` ERROR plus the binary's structurally-invalid INFO; after: the ERROR only
- [ ] 11.2 @unit (agent) the ReDoS guard: 200 quote-heavy defect lines plus a non-matching tail, run against the pre-fix pattern and the new matcher -> the pre-fix pattern exceeds the bound (the test fails when pointed at it), the new matcher finishes under it; the existing dedupe cases still pass

## 12. The masked-view exception is proven

- [ ] 12.1 @equivalence (agent) `validation-parity.test.ts` row: a delta whose only mis-depth scenario is inside an HTML comment, `openspec archive -y` and `cospec validate --strict` -> the binary archives it (the change moves), cospec reports no `deltas/scenario-depth`; `views.ts` and `views.test.ts` cite this row by name
- [ ] 12.2 @manual (agent) `grep -F` the standing rule sentence in `docs/validation.md`'s parser-tolerances section -> present verbatim

## 13. Docs match the shipped behavior

- [ ] 13.1 @manual (agent) `apps/docs/reference/commands.md` -> the list/status/validate/`__complete` rows name `--sort`, `--schema` (override), `--type`, `--report`, `--concurrency`/`OPENSPEC_CONCURRENCY`, the added keys, the named collision, `next`, and each BREAKING item
- [ ] 13.2 @manual (agent) `apps/docs/concepts/how-it-relates-to-openspec.md` -> the sentence calling namespace folders "a delegated refusal cospec relays verbatim" is replaced by the native detection statement
- [ ] 13.3 @manual (agent) `docs/architecture.md` -> the one-delegated-call additive merge (`core/upstream-keys.ts`), the key oracle and the detector's home are described
- [ ] 13.4 @manual (agent) `apps/docs/reference/validation-rules.md` -> `meta/nested-change`, `meta/unreadable-artifact`, `meta/item-missing` rows and the `--json`/findings document shapes
- [ ] 13.5 @manual (agent) `openspec/changes/archive/2026-09-28-validation-parity/tasks.md` -> row 7.2 is `[x]` with a note that the archive ran with the tasks gate waived for that one self-referential row and both hard gates run
- [ ] 13.6 @integration (agent) `mise run docs:build` -> exit 0
- [ ] 13.7 @integration (agent) `.agents/shared.md` gains the additive-JSON discipline paragraph (one delegated call, merge by identity through `core/upstream-keys.ts`, no cospec key or value changed, `version` 1, the key oracle and its named collision list), then `mise run agents:sync` and `mise run agents:check` -> the paragraph is present in `CLAUDE.md` and `AGENTS.md`, agents:check exit 0

## 14. Close-out

- [ ] 14.1 @integration (agent) `grep -c 'test.todo\|test.failing' apps/cli/test/contract/cli-surface.test.ts` -> 0
- [ ] 14.2 @integration (agent) `mise run cospec -- validate --all --strict` on this repo -> exit 0
- [ ] 14.3 @manual (agent) the proposal's BREAKING list against the shipped behavior -> each item is observed in a contract row above and none is missing
- [ ] 14.4 @integration (agent) `mise run check` -> exit 0
