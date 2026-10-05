# Verification

## 1. `archive --no-validate` skips only revalidation [critical]

- [ ] 1.1 @integration (agent) `grep -c 'owner: archive-and-sync-parity' apps/cli/test/contract/parity-pending.yaml` before and after, and the reachability test inside `mise run test:contract` -> 1 before (`archive --no-validate`), 0 after; reachability green with no pending mark left for this owner in the command table
- [ ] 1.2 @equivalence (agent) archive-no-validate.test.ts: `cospec archive c1 --no-validate` on a feat v2 change with a bare `[ ]` verification row -> refused by `archive/verification-incomplete`, exit 1, change unmoved, stderr carries the revalidation-skipped banner
- [ ] 1.3 @equivalence (agent) archive-no-validate.test.ts: `cospec archive c1 --no-validate` on a change whose MODIFIED block drops a living scenario -> refused by `archive/scenario-preservation`, exit 1, nothing moved or written, banner on stderr; `openspec archive c1 -y --no-validate` on a copy is run beside it and its outcome recorded in the row
- [ ] 1.4 @equivalence (agent) archive-no-validate.test.ts: `cospec archive c1 --no-validate` on a change with an incomplete task -> refused by the tasks gate, exit 1, banner on stderr
- [ ] 1.5 @equivalence (agent) archive-no-validate.test.ts: a change only revalidation refuses (a delta the binary archives under `--no-validate`), `cospec archive c1 --no-validate` beside `openspec archive c1 -y --no-validate` on a copy -> both exit 0, the two `openspec/specs/` trees are byte-identical, cospec's banner is on stderr
- [ ] 1.6 @e2e (agent) `cospec archive c1 --no-validate --json` through the real CLI -> stdout is exactly one JSON document, the banner is on stderr only

## 2. Archive's JSON documents carry the binary's keys [critical]

- [ ] 2.1 @equivalence (agent) key oracle row: `cospec archive c1 --json` on a MODIFIED fixture beside `openspec archive c1 -y --json` on a copy -> `archive.{change, archivedAs, specsUpdated, totals}` and `root.source` equal the binary's, `archive.path`/`root.path` equal by the oracle's path class, every snapshotted cospec key (`change`, `type`, `archived`, `target`, `specs`, `retired`, `warnings`, `blockers`) keeps its native value
- [ ] 2.2 @equivalence (agent) key oracle row: `--skip-specs` and a change already synced -> `totals` absent / all zero and `specsUpdated` false exactly as the binary reports; a fixture whose merge warns -> `archive.warnings` equals the binary's
- [ ] 2.3 @equivalence (agent) key oracle failure rows, cospec `archive <x> --json` beside `openspec archive <x> --json`: unknown change, invalid change name, namespace folder, revalidation failure, incomplete tasks (binary without `-y`), taken archive slot, scenario-dropping MODIFIED (binary with `-y`) -> one document each, `archive: null`, `root` equal, `status[0].code` and `message` equal, `fix` equal or respelled through the allowlist, exit 1 on both; the tasks-gate `fix` is the oracle's one named collision
- [ ] 2.4 @integration (agent) `cospec archive c1 --json` on a bare `[ ]` verification row -> one document, `status[0].code` `archive_verification_incomplete`, `reason` `archive/verification-incomplete`, exit 1
- [ ] 2.5 @regression (agent) every refusal path in `commands/archive.ts` under `--json` (enumerated in a unit table that fails when a new early return lacks a document) -> exactly one JSON document on stdout, nothing else there, exit 1; the revalidation document still carries every key its report carried before
- [ ] 2.6 @integration (agent) `cospec archive c1 --json --store nope` -> the resolver document with payload `{archive: null}` and the selection diagnostic, exit 1, as the binary answers

## 3. The scenario-preservation gate reads the verbatim view [critical]

- [ ] 3.1 @equivalence (agent) RUN the comment-kept fixture (a MODIFIED block keeping one living scenario only inside an HTML comment) through `cospec validate --strict`, `cospec archive c1` and `openspec archive c1 -y` on copies -> all three accept; both archives exit 0 and write byte-identical main specs
- [ ] 3.2 @equivalence (agent) RUN the commented-living-scenario fixture (living requirement has a third scenario inside a comment, MODIFIED repeats the two visible ones) through `cospec archive c1` and `openspec archive c1 -y` -> both refuse, exit 1, change unmoved, living spec unchanged; cospec names `archive/scenario-preservation` and the commented scenario's name
- [ ] 3.3 @equivalence (agent) RUN the commented-requirement-header fixture (living spec ends with a requirement header and scenario inside a comment, MODIFIED keeps every scenario of a visible requirement) through `cospec archive c1` and `openspec archive c1 -y` -> both exit 0 with byte-identical main specs
- [ ] 3.4 @unit (agent) `core/scenario-gate.ts`: the helper's inputs are the verbatim-branded types (a type-level test refuses an `AdvisoryDelta`/`LivingSpec.advisory` argument), and `archive.ts` and `sync-specs.ts` both import it -> type test compiles only for the verbatim view; `grep -n findScenarioDrops apps/cli/src/commands` finds no direct call

## 4. An unreadable archive directory is one answer [critical]

- [ ] 4.1 @equivalence (agent) `openspec/changes/archive/` at mode 000, `cospec archive c1 --json` and text beside `openspec archive c1 -y --json` on a copy, under Bun on macOS -> one document, `status[0].code` equal to the binary's (`archive_path_outside_root`), compared by code and path; text mode one stderr line, no crash; exit 1; nothing moved, no lock
- [x] 4.2 @runtime (agent) the same row in the Linux container (`oven/bun:1.3.14`, uid 1000, worktree mounted read-only at `/w`, fixture copied inside the container) and on CI's `ubuntu-latest` job -> container (oven/bun:1.3.14, uid 1000, worktree read-only at /w, fixtures under the container's /tmp), 2026-10-05: cospec `archive c1 --json` and the binary's `archive c1 -y --json` both exit 1 with `status[0].code` `archive_error`, message `EACCES: permission denied, statx '<root>/openspec/changes/archive/2026-10-05-c1'` (same errno, syscall and slot path); text mode prints the degraded-read warning naming the archive directory, then that one refusal line; nothing moved and no `.openspec-archive.lock` on either side; row 4.1 itself also passes there. CI's ubuntu-latest contract job runs the same row 4.1 on every push

## 5. Archive refuses a namespace folder as the binary does

- [ ] 5.1 @equivalence (agent) `cospec archive mobile` and `--json` beside `openspec archive mobile -y --json` on a folder wrapping `mobile/refresh/` -> text: `Cannot archive 'mobile': …` and the fix on stderr; JSON: `archive_change_is_namespace_folder` with `message` and `fix` equal to the binary's; exit 1; nothing moved; no `meta/nested-change` report printed
- [ ] 5.2 @integration (agent) `cospec sync-specs mobile` and `--json` -> refused with `Cannot sync 'mobile': …`, exit 1, nothing spawned or written

## 6. A new capability refuses only MODIFIED and RENAMED [critical]

- [ ] 6.1 @equivalence (agent) ADDED + REMOVED on a capability with no living spec: `cospec validate --strict`, `cospec archive`, `openspec validate --strict` and `openspec archive -y` -> no `archive/new-spec-non-added`; both archives exit 0 and write byte-identical main specs; cospec relays the binary's "nothing to remove" warning
- [ ] 6.2 @equivalence (agent) REMOVED-only under `retire_capabilities: true` on a capability with no living spec -> `cospec validate --strict` passes, `cospec archive` exits 0 with the binary's in-sync report, the binary archives a copy at exit 0
- [ ] 6.3 @regression (agent) REMOVED-only WITHOUT the marker on a capability with no living spec -> `cospec validate --strict` reports `archive/rebuilt-spec-invalid` (no `new-spec-non-added`), `cospec archive` refuses before delegating with exit 1, and `openspec archive -y` on a copy refuses too (no false PASS)
- [ ] 6.4 @regression (agent) MODIFIED and RENAMED on a capability with no living spec -> `archive/new-spec-non-added` still an ERROR on each, as before
- [ ] 6.5 @unit (agent) `core/rules/archive.ts` table for the `living === undefined` arm: ADDED, REMOVED, MODIFIED, RENAMED -> only MODIFIED and RENAMED produce the rule

## 7. The Specs line and early-synced archives

- [ ] 7.1 @e2e (agent) `cospec archive` on a feat change with no delta files, with `--skip-specs`, and on a `chore` change, text and `--json` -> `Specs:` names no deltas / the flag / the schema; `specsSkipReason` `no-deltas` / `flag` / `schema`; `specs` still `"skipped"`
- [ ] 7.2 @equivalence (agent) each early-sync shape (identical ADDED, absent REMOVED, applied RENAMED, identical MODIFIED, a capability already retired) hand-prepared on the living specs, `cospec archive` beside `openspec archive -y` on a copy -> both exit 0, the binary reports in sync, cospec's `Specs:` line reads `already in sync`, the spot-check reports no breach
- [ ] 7.3 @unit (agent) the `core/archive-output.ts` line reader on the pinned binary's captured stdout for an applied merge, an in-sync merge and `--skip-specs` -> totals and `specsUpdated` as the binary printed them; a stdout with no `Totals:` line -> no `totals`, `specsUpdated` from the disk observation

## 8. Relayed archive output is spelled cospec

- [ ] 8.1 @equivalence (agent) a new capability whose carried Purpose is under the minimum, through `cospec archive` -> the relayed `Warning:` reads `… cospec validate --strict reports it as too brief.`; the same through `cospec sync-specs`
- [ ] 8.2 @integration (agent) grep every archive and sync-specs output the contract rows capture (text, stderr and JSON `message`/`fix`) -> no line names a bare allowlisted `openspec` command; a change name or path containing `openspec` passes through byte-for-byte

## 9. `cospec sync-specs` writes archive's main specs and leaves the change active [critical]

- [ ] 9.1 @equivalence (agent) sync-specs.test.ts, for each of the ADDED (new capability), MODIFIED, REMOVED, RENAMED and retired-capability (`retire_capabilities: true`, last requirement REMOVED) fixtures: `cospec sync-specs c1` beside `openspec archive c1 -y` on a copy -> the two `openspec/specs/` trees are byte-identical (file list and sha256 of every file; the retired spec and its emptied directory gone in both); `openspec/changes/c1/` byte-identical to before; nothing under `openspec/changes/archive/`; exit 0
- [ ] 9.2 @e2e (agent) on each fixture after 9.1, with every task done and every verification row resolved: `cospec archive c1` -> exit 0, the change archived, `Specs:` reads `already in sync`, `openspec/specs/` unchanged by the archive
- [ ] 9.3 @e2e (agent) each 9.1 fixture synced, then given a bare `[ ]` verification row -> `cospec archive c1` refuses with `archive/verification-incomplete`, exit 1 (the hard gates still run after a sync); the MODIFIED fixture synced, then its living spec hand-edited to add a scenario -> `cospec archive c1` refuses with `archive/scenario-preservation`
- [ ] 9.4 @e2e (agent) `cospec sync-specs c1` twice on the MODIFIED fixture -> the second run reports already in sync, writes nothing, exit 0

## 10. `cospec sync-specs` refuses what archive refuses [critical]

- [ ] 10.1 @equivalence (agent) a scenario-dropping MODIFIED -> `cospec sync-specs` prints the `archive/scenario-preservation` refusal, exit 1, every file under the real `openspec/` byte-identical, no scratch directory left; `openspec archive -y` on a copy refuses too
- [ ] 10.2 @integration (agent) a change revalidation refuses (an ADDED colliding with a differing living block) -> the archive-precondition report, exit 1, nothing spawned (no scratch directory created), nothing written

## 11. A failed scratch run leaves nothing in the real tree [critical]

- [ ] 11.1 @equivalence (agent) the symlinked-alias fixture (`openspec/specs/alias -> widgets`, deltas for both), which `cospec validate --strict` passes and the binary refuses after taking its claim -> `cospec sync-specs c1` exits 1 relaying the binary's `resolve to the same target` reason; `find <root> -name .openspec-archive.lock` is empty; every file under the real root byte-identical (list + sha256 before/after); the scratch directory is gone
- [ ] 11.2 @unit (agent) `core/scratch-root.ts` with an injected runner that writes `.openspec-archive.lock` and a partial spec into the scratch tree and exits 1 -> the real tree is byte-identical, the scratch directory is removed, the error names the runner's reason
- [ ] 11.3 @integration (agent) a root with two sibling changes and today's archive slot already taken by a same-named archived change -> `cospec sync-specs c1` exits 0 and only `openspec/specs/` files change in the real tree; siblings and archive untouched
- [ ] 11.4 @integration (agent) a symlink under `openspec/specs/` leading outside the copied subtree -> refused before any spawn, naming the link, exit 1, nothing written
- [ ] 11.5 @unit (agent) copy-back with the real `specs/` changed between the pre- and post-run fingerprints (injected) -> refused, nothing written, the message says the main specs changed while sync ran

## 12. `cospec sync-specs` output

- [ ] 12.1 @e2e (agent) `cospec sync-specs c1` text on the MODIFIED and new-capability fixtures -> one `Synced:` line per written or deleted file and the binary's totals; `--json` -> one document `{change, type, synced: true, totals, files: {written, deleted}, warnings, root}`
- [ ] 12.2 @e2e (agent) `cospec sync-specs` on a `chore` change, a feat change with no delta files, and a change with `skip_specs: true` -> each says there is nothing to sync and why, spawns nothing, exit 0; `--json` one document
- [ ] 12.3 @integration (agent) `cospec sync-specs c1 --store <id>` on a registered store fixture -> the store's `openspec/specs/` is synced and the cwd repo is untouched
- [ ] 12.4 @integration (agent) `cospec sync-specs nope --json` and a refused scratch run under `--json` -> one failure document each (`archive_change_not_found`; `archive_error` with the relayed reason), exit 1

## 13. Canon, docs and agent guidance

- [ ] 13.1 @integration (agent) `mise run generate` then `mise run generate:check` -> zero drift; every rendered `sync-specs` body instructs `cospec sync-specs <slug>` after a preview, carries no `mid-flight`/no-sync text and no bare `openspec`; every rendered `archive` body names the early-sync no-op (canon render test)
- [ ] 13.2 @integration (agent) `grep -rn 'no-validate\|sync-specs\|mid-flight\|new-spec-non-added' apps/docs docs` -> every hit states the behavior this change ships, on the D14 page that owns it; `mise run docs:build` green
- [ ] 13.3 @integration (agent) `mise run agents:sync` after the `.agents/shared.md` edit, then `mise run agents:check` -> `shared.md`, `CLAUDE.md` and `AGENTS.md` name `cospec sync-specs` in the workflow section; `agents:check` green
- [ ] 13.4 @eval (human) `mise run eval:e2e` with the human-held `DEEPSEEK_API_KEY` in the process environment, against the regenerated `archive` and `sync-specs` bodies -> the feat scenario's `archive-ok` passes and no scenario scores below the pre-change baseline run on `main`; the report carries counts, scores and rule ids only

## 14. Close-out

- [ ] 14.1 @integration (agent) `grep -n 'test.failing\|test.todo' apps/cli/test/contract/archive-no-validate.test.ts apps/cli/test/contract/sync-specs.test.ts` -> no match; every row written failing-first has flipped
- [ ] 14.2 @integration (agent) `mise run check` on the final implementation commit -> green (lint, format, typecheck, unit, contract, integration, bench, pack, generate:check, agents:check)
