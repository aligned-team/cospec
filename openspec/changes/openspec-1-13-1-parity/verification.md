# Verification

## 1. The pin moves cleanly and the vendored bundle follows it [critical]

- [ ] 1.1 @integration (agent) `mise install && git diff --exit-code mise.lock` -> exits 0 with no diff, proving the lock was regenerated in the same commit as `mise.toml`
- [ ] 1.2 @integration (agent) `bun install --frozen-lockfile` -> exits 0, proving `bun.lock` matches `apps/cli/package.json`
- [ ] 1.3 @e2e (agent) `mise run cospec -- doctor` -> the resolved wrapped binary reports `1.13.1` and no `openspec-version` or `openspec-resolve` finding
- [ ] 1.4 @integration (agent) `mise run vendor:openspec:check` -> exits 0; the embedded bundle and `THIRD-PARTY-LICENSES.md` are both current for 1.13.1
- [ ] 1.5 @unit (agent) grep the repo for `1.11.0` -> every remaining hit is a literal that dates a behaviour or is deliberately arbitrary (`rules/specs.ts`, the `generatedBy` fixture, the `init`/`doctor`/`feedback-format` unit literals, the `harness-workflows` parity requirement), never a read of the pin

## 2. The contract suite is re-probed honestly against the real 1.13.1 binary [critical]

- [ ] 2.1 @integration (agent) `mise run test:contract` after the re-probe -> green, with every rewritten narrative naming the 1.13.1 behaviour it now records
- [ ] 2.2 @manual (human) review the contract diff -> no assertion weakened and no test deleted; every changed expectation is traceable to an observed difference in the new binary
- [ ] 2.3 @integration (agent) `test/contract/delta-bullet-markers.test.ts` -> its recorded 1.11.0 narrative flips to the 1.13.1 one, proving the `*`/`+` delta is now portable at the pin

## 3. Apply relays the wrapped advisory fields without changing a verdict

- [ ] 3.1 @integration (agent) contract: `cospec apply --json` on a no-delta-spec change -> `warnings` is present and typed, the exit code is `0`, and cospec's `skip_specs` precedence still wins — no contradicting upstream warning changes the decision
- [ ] 3.2 @integration (agent) contract: a multi-hop-missing change -> `missingPrerequisites` is a strict superset of cospec's `missingArtifacts`, and the exit code is the one cospec's own gate decided
- [ ] 3.3 @integration (agent) the same run's human transcript -> the relayed warnings are printed, not only present in `--json`
- [ ] 3.4 @unit (agent) parse a wrapped payload that carries neither advisory field -> both are absent rather than emitted as empty arrays, and the parse does not fail

## 4. No relayed guidance instructs a bare openspec command [critical]

- [ ] 4.1 @integration (agent) contract on `--json` via `applyLegacy` -> no relayed `instruction` or `warnings` string contains a backtick-delimited command span beginning with `openspec`
- [ ] 4.2 @integration (agent) contract on `--json` for a v1-grandfathered change whose upstream state is `blocked` on `verification` -> the relayed remedy names `cospec`, and the exit code is cospec's own gate's
- [ ] 4.3 @integration (agent) contract on a change whose `tasks.md` exists but is empty -> upstream's blocked remedy is relayed rewritten
- [ ] 4.4 @unit (agent) the rewrite over a warning embedding an absolute `.openspec.yaml` path -> the command span is rewritten and the path is byte-for-byte unchanged
- [ ] 4.5 @unit (agent) the rewrite over a span naming a verb cospec does not wrap -> the span is relayed unchanged
- [ ] 4.6 @integration (agent) re-probe the 1.13.1 emitted verb set -> confirms `instructions`, `status`, `validate` is still the complete set the strings emit, rather than assuming the 1.13.0 reading
- [ ] 4.7 @eval (agent) `mise run eval:e2e` against the relay guard's output -> the advisory DeepSeek harness shows no regression in how an agent reads a blocked `cospec apply`, and no sampled completion follows a bare-`openspec` instruction

## 5. The archive-preflight INFO family is deduped without losing anything [critical]

- [ ] 5.1 @integration (agent) contract: a would-be-refused `MODIFIED` delta -> exactly one finding (cospec's `archive/target-missing`), the upstream INFO twin suppressed, and `valid` plus the exit code unchanged from 1.11.0
- [ ] 5.2 @integration (agent) the same run -> at most one archive-preflight INFO per delta file, confirming upstream's path-keyed suppression bound
- [ ] 5.3 @integration (agent) contract: a `MODIFIED` header mismatch in content, for which cospec has no twin -> the delegated issue survives the merge unchanged
- [ ] 5.4 @unit (agent) each new `DUPLICATE_CLASSES` `nativeKey` capture against a message carrying the `, but "…" exists` and `and differs only in case or spacing` tails -> the capture stops before the tail and matches the native key
- [ ] 5.5 @integration (agent) contract: a `tasks.md` with only plain list items -> exactly one finding, cospec's `tasks/has-tasks` ERROR, with upstream's zero-task WARNING suppressed
- [ ] 5.6 @unit (agent) the narrowed `deltas/spec-at-specs-root` regex against upstream's unread-file message for `specs/spec.md.md` -> does not match, so the unread-file defect is no longer wrongly suppressed
- [ ] 5.7 @integration (agent) `mise run cospec-validate-all` (`ci.yml`) -> strict validation of every active change and spec in this self-hosting repo against 1.13.1; issue counts unchanged except where a new rule is expected, and no doubled count anywhere

## 6. cospec's archive gates agree with the 1.13.1 binary in both directions [critical]

- [ ] 6.1 @integration (agent) contract: a case-only `ADDED` collision -> `archive/added-exists` at `cospec validate --strict`, the delegated 1.13.1 ERROR deduped, and `cospec archive` refusing at pre-flight rather than at delegation
- [ ] 6.2 @integration (agent) contract: a case-only `RENAMED`-target collision -> the same, and a case-only rename (`Foo` → `foo`) is **not** reported as a collision
- [ ] 6.3 @integration (agent) contract: an early-synced `ADDED` whose only fold-equal living name is itself -> no `archive/added-exists`, the archive proceeds
- [ ] 6.4 @integration (agent) contract: an unpaired `FROM:` -> refused by `cospec validate --strict` before the delegated `buildUpdatedSpec` throw is ever reached
- [ ] 6.5 @integration (agent) contract: a delta whose only scenario is a bare header -> refused identically by cospec and by the real binary; no false PASS, no false refusal
- [ ] 6.6 @integration (agent) contract: archive a change whose spec carries a fenced block with two or more consecutive blank lines -> the archived `spec.md` preserves them byte-for-byte through upstream's fence-aware collapse
- [ ] 6.7 @integration (agent) contract: archive a `retire_capabilities: true` change whose spec has a line-wrapped scenario bullet -> the retirement succeeds
- [ ] 6.8 @integration (agent) re-probe `archive-parity`, `archive-gotchas`, `scenario-preservation`, `added-early-sync`, `hard-reality` -> each gate refuses exactly what the binary refuses; a disagreement in either direction is recorded as a release blocker, not absorbed into the test

## 7. A delta-shaped file at an unread path is no longer invisible

- [ ] 7.1 @integration (agent) contract: a change carrying `specs/user-auth.md` with a delta section header -> `deltas/unread-file` ERROR, the delegated twin deduped, and `cospec archive` no longer treating it as a clean no-op
- [ ] 7.2 @integration (agent) contract: a change carrying `specs/user-auth/delta.md` -> `deltas/unread-file` ERROR naming that path
- [ ] 7.3 @unit (agent) a companion note with no delta section header beside a real `spec.md` -> no `deltas/unread-file` issue

## 8. The nested-change deferral is bounded, not assumed [critical]

- [ ] 8.1 @integration (agent) contract: a hand-created namespace folder under `openspec/changes/` -> `cospec validate` surfaces upstream's `is not a change: it is a folder wrapping …` ERROR verbatim through `mergeDelegated`
- [ ] 8.2 @integration (agent) contract: `cospec archive <namespace-folder>` -> refused, with upstream's `archive_change_is_namespace_folder` message reaching the user

## 9. The composed schemas survive 1.13.1's load-time validation [critical]

- [ ] 9.1 @integration (agent) `openspec schema validate` against each of the 11 composed schemas -> zero `apply.requires` load errors and zero `apply.tracks` mismatch warnings
- [ ] 9.2 @integration (agent) `mise run openspec:schema:validate` (`ci.yml`) -> the composed schemas are valid under the **raw** 1.13.1 binary, proving no cospec command breaks on schema load

## 10. Inherited upstream fixes actually reach cospec's surfaces

- [ ] 10.1 @integration (agent) contract: `cospec store setup --no-init-git` inside an existing git repo -> succeeds, where 1.11.0 falsely refused
- [ ] 10.2 @integration (agent) contract: `cospec config edit` with `EDITOR="code --wait"` -> spawns the editor, where 1.11.0 falsely failed
- [ ] 10.3 @integration (agent) re-probe `store.test.ts` against a wedged git tree -> no hang, confirming upstream's git-probe timeout and `maxBuffer` fix reaches cospec's store surface
- [ ] 10.4 @integration (agent) re-probe `config-surface.test.ts` -> no config-schema key moved; `defaultStore` still resolves only as a fallback after local-root resolution fails

## 11. Native surfaces the upstream changes brush against still hold

- [ ] 11.1 @unit (agent) `DELEGATED_DELTA_PATH_RE` against a nested capability -> still maps `<specId>/spec.md`, so the dedupe pairings fire for nested capabilities too
- [ ] 11.2 @integration (agent) generate a leftover skill set with the real 1.13.1 binary, then run `cospec doctor` -> the `author: openspec` plus bare-semver `generatedBy` detection still identifies 1.13.1-generated leftovers, after upstream changed its own legacy cleanup and skill descriptions
- [ ] 11.3 @unit (agent) the completions golden/spec test -> unchanged; cospec still ships no `--report` registry entry and mutates no rc file
- [ ] 11.4 @runtime (agent) `cospec feedback` live output -> reads `openspec: project 1.13.1` / `embedded 1.13.1`, with the deliberately-arbitrary unit-test literals left untouched
- [ ] 11.5 @unit (agent) re-read `core/rules/specs.ts`'s placeholder comment -> the behaviour it dates still holds at 1.13.1, so the `1.11.0` in it stays

## 12. Zero drift between the repo, its managed files, and its docs [critical]

- [ ] 12.1 @integration (agent) `mise run generate:check` -> clean; this change touches no canon file, so it must be green from the first commit
- [ ] 12.2 @integration (agent) `mise run agents:check` after editing `.agents/shared.md` and running `mise run agents:sync` -> clean, with the four generated line pairs in `CLAUDE.md`/`AGENTS.md` moved by the sync and not by hand
- [ ] 12.3 @integration (agent) `mise run docs:build` -> succeeds
- [ ] 12.4 @manual (human) read every page named in the proposal's docs impact -> the pin fact appears on its single owning page, `apps/docs/reference/validation-rules.md` lists `deltas/unread-file` and the INFO class, `apps/docs/concepts/apply-and-archive.md` shows `warnings` and `missingPrerequisites` as advisory, and `apps/cli/THIRD-PARTY-LICENSES.md` reflects the regenerated package list
- [ ] 12.5 @integration (agent) `mise run check` -> green end to end

## 13. Every ledger decision was actually reviewed

- [ ] 13.1 @manual (human) walk the parity plan's decision ledger -> each item was reviewed at implementation time and its recorded disposition (PORT, INHERIT, COVERED, DEFER, N/A) still matches what the code does after the bump; any item whose disposition changed is named here with the new one
