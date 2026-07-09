## 1. Schema fork/init create a usable legacy schema [critical]

- [x] 1.1 @integration (agent) run `cospec schema fork feat my-custom` in a scratch repo -> `openspec/schemas/my-custom/schema.yaml` exists; `resolveSchema` reports `kind: 'legacy'` -> `bun test test/integration/schema-inspect.test.ts` green (fork success case creates the project schema dir + `schema.yaml`); resolution classification exercised by `test/integration/new-legacy.test.ts` and `test/contract/legacy-schema-lifecycle.test.ts`
- [x] 1.2 @integration (agent) run `cospec schema init my-workflow` against the real pinned binary -> exits 0, schema dir created, no deny-listed stdout -> `bun test test/integration/schema-inspect.test.ts` init success case green (project schema dir + `schema.yaml` created; passthrough exit 0)

## 2. Reserved canon names are refused before any write [critical]

- [x] 2.1 @integration (agent) run `cospec schema init feat` -> exits 1, guidance names `feat` as canon-managed, `openspec/schemas/feat/schema.yaml` unmodified -> `test/integration/schema-inspect.test.ts` reserved-name case green: exit 1, canon `feat/schema.yaml` asserted byte-unmodified; guard at `commands/schema.ts:70-81` refuses before `runPassthrough`
- [x] 2.2 @integration (agent) run `cospec schema fork chore feat` (explicit destination `feat`) -> exits 1, no directory created or modified -> `test/integration/schema-inspect.test.ts` explicit-destination reserved case green (exit 1, no write)

## 3. `cospec new` delegates legacy schemas with reduced guarantees [critical]

- [x] 3.1 @integration (agent) run `cospec new my-custom some-slug` against the fork from 1.1 -> `.openspec.yaml` has `schema: my-custom`, no `schemaVersion`, reduced-guarantees note printed -> `bun test test/integration/new-legacy.test.ts` green: asserts schema pointer, absence of `schemaVersion`, and the reduced-guarantees note in both human and `--json` modes
- [x] 3.2 @integration (agent) run new→validate→apply→archive on the legacy schema against the real pinned binary -> validate delegates to OpenSpec's structural check of the fork's own graph; cospec's tasks/scenario-preservation/filesystem-move gates still apply; archive moves the change on disk -> `bun test test/contract/legacy-schema-lifecycle.test.ts` (4 pass): validate emits `meta/legacy-schema` and no typed `proposal/*`/`verification/*`/`design/*`/`specs/*` rule; apply delegates (openspec's own `apply.requires` blocks then clears); archive tasks gate blocks then filesystem move + spec-merge spot-check succeed
- [x] 3.3 @unit (agent) `cospec new totally-unknown some-slug` (resolves neither cospec-type nor legacy) -> unchanged unknown-type error, exit 1, no change created -> `test/integration/new-legacy.test.ts` still-unknown case green (falls through to `reportUnknownType`, exit 1)

## 4. No regression for the 11 canon types [critical]

- [x] 4.1 @regression (agent) run the full rule-engine, apply, and archive contract/integration suites unmodified -> every typed rule ID still fires; apply exit 2/3 and archive hard gates unchanged; doctor's schema-version check stays scoped to `isCospecType` changes -> `mise run check` green: unit 512 pass / 0 fail (rule-engine, matrix-parity, schema-versioning, doctor suites unmodified), contract 29 pass / 0 fail, integration 91 pass / 0 fail, release 11 pass / 0 fail
- [x] 4.2 @integration (agent) run `mise run generate:check` after `mise run generate` -> clean exit, no drift; fork/init dirs created during testing are never tracked or flagged -> `mise run generate:check` -> `cospec update --check: no drift`; `test/unit/init/generate.test.ts` case proves a fork-like schema dir is never tracked, never absorbed into the manifest, never flagged by a second generate/--check run

## 5. Corrected customization guidance is accurate and cospec-routed

- [x] 5.1 @integration (agent) inspect a regenerated canon `schema.yaml` header, the `meta/openspec-yaml` hint, and a `doctor` legacy-schema remedy -> each names `cospec schema fork <type> <name>`, none names bare `openspec schema fork` or "edit the canon" -> `grep` confirms: `openspec/schemas/feat/schema.yaml:2` header reads `` `cospec schema fork feat <name>` ``; `core/rules/meta.ts:125` hint reads `` `cospec schema fork` ``; `commands/doctor.ts:320` remedy reads `` `cospec schema fork` ``; no bare `openspec schema fork` or "edit the canon" remains

## 6. docs/schemas.md and shared.md reflect the shipped behavior

- [x] 6.1 @manual (human) read `docs/schemas.md` tier 3 after the edit -> covers fork/init, the reserved-name guard, the legacy lane's guarantees, and the config.yaml template gap; lines 24/195 no longer contradict tier 3 -> tier 3 rewritten to document `cospec schema fork [name]`/`cospec schema init`, the exit-1 reserved-name guard, the legacy lane's kept schema-agnostic hard gates + OpenSpec-delegated structural validation + `meta/legacy-schema` INFO + no verification-ledger gate, and the config.yaml additive-prose/template gap; line 24 now points to `cospec schema fork` + the tier-3 anchor
- [x] 6.2 @integration (agent) run `mise run agents:sync` then `mise run agents:check` -> clean exit, `.agents/shared.md` matches `docs/schemas.md` -> `mise run agents:sync` synced CLAUDE.md + AGENTS.md; `mise run agents:check` -> "All shared blocks are in sync." (shared.md already frames `schema` as a cospec passthrough command; no stale fork claim to correct)

## 7. apps/docs public site matches PR #19's shipped commands [critical]

- [x] 7.1 @manual (human) read `apps/docs/concepts/stores.md` and `how-it-relates-to-openspec.md` after the edit -> no remaining claim that store/context/workset "stay OpenSpec's job"; `--no-cospec-init` documented -> both pages rewritten: `stores.md` documents `cospec store setup|register|unregister|remove|list(ls)|doctor` as a first-class wrap with auto `cospec init --harness none` and the `--no-cospec-init` opt-out; `how-it-relates-to-openspec.md` "stays OpenSpec's job" sentence reversed
- [x] 7.2 @manual (human) read `apps/docs/reference/commands.md` -> rows present for store/context/workset/show/view/schemas/schema/templates; `list` documents `--specs`; read-only-commands subsection explains the passthrough guarantee -> rows added; `--specs` added to `list`; "Read-only and personal commands" subsection added covering the version-asserted spawn, exit-code allow-list, stdout deny-list, and single-JSON-document invariant
- [x] 7.3 @e2e (agent) run `mise run docs:build` -> builds clean, no broken links or bad frontmatter -> `mise run docs:build` exit 0 ("build complete in 2.30s"); only pre-existing unrelated warning `⚠ No matching file found for sidebar link: /` (present on main before this PR)

## 8. Full CI gate is green

- [x] 8.1 @integration (agent) run `mise run check` -> lint, format, typecheck, unit, contract, integration, pack smoke, generate:check, and agents:check all pass; never run with `--no-verify` -> `mise run check` exit 0: unit 512 / release 11 / contract 29 / integration 91 all pass 0 fail; typecheck exit 0; lint clean; format:check clean (after `mise run format:fix` reflowed `docs/schemas.md` to Markdown printWidth 80); generate:check no drift; agents:check in sync; schema:validate all 11 valid; cospec-validate-all 0 errors 0 warnings
