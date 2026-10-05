# Verification

## 1. `list` reports `building` for an untyped schema's own artifact [critical]

- [x] 1.1 @unit (agent) a change on a custom `rfc`-style schema (`generates: doc.md`) with `doc.md` written -> `computeRow`/`list.ts` reports `state: 'building'`, not `in-progress` — observed: `commands.test.ts` "an untyped schema's own declared artifact decides its state, not cospec's fixed filenames" passes
- [x] 1.2 @regression (agent) the same fixture against `list.ts` before the fix FAILS (`state: 'in-progress'`), after the fix PASSES (`state: 'building'`) -> red-then-green captured in the commit that lands 1.2 — observed: red with `Received: "in-progress"` against unmodified `list.ts`, green after `hasDeclaredArtifact` landed
- [x] 1.3 @integration (agent) `cospec list --json` vs the pinned binary's `openspec list --json` on the same `rfc`-schema fixture: no key collision between cospec's native `state` and the binary's own `status`, `archiveReady: false` -> `cli-surface.test.ts` passes — observed: `18.1 list reports building for an untyped schema's own declared artifact` passes, `row.status === upRow.status === 'no-tasks'`
- [x] 1.4 @e2e (agent) `mise run docs:build` after the `commands.md` edit -> build succeeds — observed: `build complete in 1.94s`

## 2. `validate --archived --json` below the version floor prints a document

- [x] 2.1 @unit (agent) `wrappedOpenspecVersion` stubbed below `ARCHIVED_SINCE`, `validate --archived --json` -> one parseable JSON document on stdout, not stderr text — observed: factored `archivedUnsupportedRefusal(version)` (pure, no spawn) unit-tested directly; `validate.test.ts` "archivedUnsupportedRefusal" passes, `rootSelectionDocument(refusal)` parses to one `status[]` document
- [x] 2.2 @regression (agent) the same unit test before the fix FAILS (stderr text, unparseable stdout), after the fix PASSES -> captured in the commit that lands 2.2 — observed: `archivedUnsupportedRefusal` did not exist before this commit (the guard wrote stderr text unconditionally inline); the test file would not compile against unmodified `validate.ts`, green once the export landed

## 3. `upstream-spellings.test.ts` row 3.7 is deterministic

- [x] 3.1 @integration (agent) row 3.7 against a shared `remedyNamedRoot()` root, run 20x locally -> no divergence in any run — observed: `12 pass, 0 fail` identically across 20/20 local runs
- [x] 3.2 @e2e (agent) row 3.7 green in this PR's CI -> green — observed: PR #62's `ci-bun` run 37283579143 passed (32m4s, `ubuntu-latest` — this repo's CI has no macOS runner; `mise run check` includes `test:contract`, which covers row 3.7)

## 4. `status` already matches the binary on a mode-000 artifact [critical]

- [x] 4.1 @equivalence (agent) macOS: `cospec status --change <id>` (text and `--json`, single and `--all`) vs the pinned binary (spawned under Bun) with a mode-000 `proposal.md` -> both refuse `EACCES: permission denied, realpath '…/proposal.md'`, exit 1, in every mode — observed directly (ad hoc probe) and via the `18.2` contract row (`realpathRefuses` true on this host): both exit 1, `errnoShape` matches `{code: 'EACCES', path: …/proposal.md}`
- [x] 4.2 @equivalence (agent) Linux (`oven/bun:1.3.14`, non-root UID 1000): same fixture -> both read past it, report `proposal` done, exit 0, in every mode — observed via a local Docker probe (`docker run -u 1000:1000 oven/bun:1.3.14`, bind-mounted tree): both exit 0, both report `proposal` artifact `done`/`status: 'done'`; the `18.2` contract row asserts the same equality on whichever OS runs it (`refused` branches on the live `realpathRefuses` result, never `process.platform`)
- [x] 4.3 @e2e (agent) the new contract row (tasks.md 4.1) green in this PR's CI -> green — observed: PR #62's `ci-bun` run 37283579143 passed (32m4s, `ubuntu-latest` — this repo's CI has no macOS runner); row 18.2 (the differential: measures each invocation's own answer rather than predicting one, after a first CI run found `--change` vs `--all` disagreeing on refusal on this runner) passed, confirming the behavior holds under the real CI container too, not just the local Docker probe

## 5. Full gate

- [x] 5.1 @e2e (agent) `mise run check` -> green — observed: lint, format:check, typecheck, generate:check, vendor:openspec:check, cospec-validate-all, agents:check, openspec:schema:validate all pass; `apps/cli:test` 1954 pass/0 fail, `apps/cli:test:integration` 193 pass/0 fail, `apps/cli:test:contract` 2523 pass/0 fail, `packages/bench:test` 343 pass/0 fail, `e2e:release-test` 14 pass/0 fail; `Finished in 1403.68s`, exit 0
