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
- [ ] 3.2 @e2e (agent) row 3.7 green on both `ubuntu-latest` and `macos` runners in this PR's CI -> both green

## 4. `status` already matches the binary on a mode-000 artifact [critical]

- [x] 4.1 @equivalence (agent) macOS: `cospec status --change <id>` (text and `--json`, single and `--all`) vs the pinned binary (spawned under Bun) with a mode-000 `proposal.md` -> both refuse `EACCES: permission denied, realpath '…/proposal.md'`, exit 1, in every mode — observed directly (ad hoc probe) and via the `18.2` contract row (`realpathRefuses` true on this host): both exit 1, `errnoShape` matches `{code: 'EACCES', path: …/proposal.md}`
- [x] 4.2 @equivalence (agent) Linux (`oven/bun:1.3.14`, non-root UID 1000): same fixture -> both read past it, report `proposal` done, exit 0, in every mode — observed via a local Docker probe (`docker run -u 1000:1000 oven/bun:1.3.14`, bind-mounted tree): both exit 0, both report `proposal` artifact `done`/`status: 'done'`; the `18.2` contract row asserts the same equality on whichever OS runs it (`refused` branches on the live `realpathRefuses` result, never `process.platform`)
- [ ] 4.3 @e2e (agent) the new contract row (tasks.md 4.1) green on both `ubuntu-latest` and `macos` runners in this PR's CI -> both green, confirming the differential holds under the real CI containers too, not just the local Docker probe

## 5. Full gate

- [ ] 5.1 @e2e (agent) `mise run check` -> green
