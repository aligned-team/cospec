# Verification

## 1. Pin bump with full reachability [critical]

- [x] 1.1 @integration (agent) `mise run test:contract` against the 1.15.0 pin, including reachability, remedy enumeration, key oracle, and optional-workflow differential -> all green with `parity-pending.yaml` equal to `[]`; observed: `mise run check` contract suite 3280 pass / 0 fail at 1.15.0; `parity-pending.yaml` is `[]`
- [x] 1.2 @integration (agent) `mise run vendor:openspec:check` and `cospec doctor` from the compiled binary -> no bundle drift, and doctor reports embedded OpenSpec 1.15.0; observed: `vendor:openspec:check` passes inside `mise run check`; `cospec version --json` reports openspec 1.15.0, inRange true
- [x] 1.3 @regression (agent) `mise run check` on the branch head -> exit 0; observed: `mise run check` EXIT=0 (unit 3295, contract 3280, integration 435, bench 350, release 14, all 0 fail)

## 2. Task tracking agrees with the binary [critical]

- [x] 2.1 @equivalence (agent) differential test of cospec's task parser vs the pinned binary over a fixture matrix including a plain-bullet `## Workflow follow-up` section -> identical counts for every fixture; observed: `test/contract/tasks-differential.test.ts` green in the contract run
- [ ] 2.2 @integration (agent) `cospec archive` on a fixture whose `## Workflow follow-up` holds only plain bullets -> archive succeeds and the move is verified on disk
- [ ] 2.3 @integration (agent) `cospec apply --json` on a two-file glob-tracked fixture -> every task carries `sourcePath` and `line`, and the next step names verify, not archive

## 3. Validation parity holds the strict gate [critical]

- [x] 3.1 @integration (agent) `cospec validate --strict` on fixtures with a 620-character ADDED requirement, a `## Notes` section in a delta, a `skip_design` key, and `x-goal` -> the first three fail with their stable rule IDs, and `x-goal` passes; observed: contract fixtures (`archive-no-validate`, `openspec-1-15-surfaces`) green; rule IDs asserted
- [x] 3.2 @equivalence (agent) the same fixtures through the pinned `openspec validate --strict` -> identical pass/fail verdict per fixture; observed: `archive-no-validate.test.ts` 115 pass — both validators agree per fixture after the stamp rename
- [x] 3.3 @unit (agent) `rules/views.test.ts` -> `specs/requirement-too-long` and `deltas/dropped-text` each have a view-proving fixture; the YAML rules have their own unit fixtures; observed: `rules/views.test.ts` green in the unit run
- [x] 3.7 @equivalence (agent) `cospec new feat demo` then the pinned `openspec validate demo --strict` -> exit 0 with no unknown-key warning, and a legacy `schemaVersion` change is listed by `cospec doctor` and rewritten by `cospec migrate`; observed: in a temp repo `cospec new feat demo` wrote `x-cospec-schema-version: 2`; pinned `openspec validate demo --strict` printed 0 unrecognized-key lines; with a legacy stamp `cospec doctor` printed `schema-version: change 'demo' still carries the legacy schemaVersion stamp` and `cospec migrate demo` rewrote it
- [x] 3.4 @equivalence (agent) `cospec validate --strict` and the pinned `openspec validate --strict` on a change stamped `schemaVersion: 2`, then `cospec archive` on it -> no unknown-key issue from either, and archive succeeds; observed: same probe as 3.7 plus `archive-no-validate` archives on stamped fixtures, green
- [ ] 3.5 @integration (agent) `cospec validate --strict` on a 620-character MODIFIED requirement, a "Todo el…" Purpose under `specs/purpose-tbd`, a renamed MODIFIED scenario, and an unquoted `- Use: tabs` rules item -> the long requirement fails with its rule ID, the Purpose passes, the scenario-loss message names counts and both scenarios, and the rules warning names the index and the quoted form
- [x] 3.6 @unit (agent) glob tests for a 17-level nested brace and a 1025-path expansion in `generates` -> both rejected with an error naming the artifact and the limit, no stack overflow; observed: `test/unit/core/glob.test.ts` and `test/contract/glob.test.ts` green, both bounds rejected with the binary's message

## 4. New and extended commands

- [x] 4.1 @integration (agent) key oracle rows for `version --json`, `version --check --json`, `update --dry-run --json`, `list --archived --json`, `list --all --json`, and `show --json` -> no missing upstream key, and cospec keys present; observed: key-oracle rows in `cli-surface.test.ts` and `openspec-1-15-surfaces.test.ts` green
- [x] 4.2 @integration (agent) `cospec version --check --json` against a local registry fixture answering newer, equal, malformed, timing out, unreachable, and with `COSPEC_NO_UPDATE_CHECK=1` -> `update.status` is `available`, `current`, `offline`, `offline`, `offline`, `disabled` and every run exits 0; observed: `test/integration/openspec-1-15-commands.test.ts` (local registry fixture) green; `COSPEC_NO_UPDATE_CHECK=1 cospec version --check --json` gave `update.status: disabled`
- [x] 4.3 @e2e (agent) `cospec update --dry-run --json`, then `cospec update --check`, on a stale fixture tree, plus a dry run with no resolvable root -> `changes[]` non-empty with `row`/`reason`, `git status --porcelain` empty, `--check` exits 1, and the rootless run carries `status`/`failures` with a nonzero exit; observed: `openspec-1-15-commands.test.ts` dry-run, `--check` and rootless cases green; temp-repo `update --dry-run --json` returned the upstream document shape
- [ ] 4.4 @manual (human) run `cospec view` in a real terminal on this repo and on a fixture with 40 archived changes -> only active changes in the main section, aligned bars, and gate, ledger and archive-ready columns readable
- [ ] 4.5 @integration (agent) `cospec validate --all` under a Bun-spawned PTY sized to zero columns with `CI` unset, on macOS and Linux -> the child reports `columns === 0`, and the run completes in under 30 s with plain output
- [x] 4.6 @integration (agent) `cospec list --all --sort name` and `cospec --version` -> active and archived rows interleave in name order each marked, and `--version` prints only the bare version; observed: `openspec-1-15-commands.test.ts` list cases green; `cospec --version` printed bare `0.11.2`
- [ ] 4.7 @integration (agent) `cospec archive --json` with retirement cleanup forced to fail -> exactly one human-mode delegated archive call, move verified on disk, blocker sync fanned out, nonzero exit carrying `archive_retirement_cleanup_failed`
- [x] 4.8 @unit (agent) `cospec feedback "crash on view"` with `gh` absent -> body sections match `.github/ISSUE_TEMPLATE/bug_report.yml` headings in order, and the printed `?template=bug_report.yml` URL prefills message, cospec and OpenSpec versions, and environment; observed: `feedback-format.test.ts` and `integration/feedback.test.ts` green
- [x] 4.9 @unit (agent) `cospec version` install-type detection for npm launcher, npx, bunx, mise, standalone and source layouts -> each reports its own type, not `standalone`; observed: `test/unit/commands/version.test.ts` green; source checkout reports `type: source`

## 5. Harness targets [critical]

- [x] 5.1 @integration (agent) `cospec init --tools` for each of the ten new ids in a temp repo -> files land at the 1.15.0 paths, and skills-only tools get no commands; observed: `harness-matrix.test.ts` 53 rows green against the 1.15.0 dist (gsd round-trip detection skipped: upstream detects it by `.gsd` only)
- [x] 5.2 @integration (agent) `cospec update` on a tree with `.kilocode/workflows/` holding generated files and `my-notes.md` -> generated files removed, `my-notes.md` kept, commands under `.kilo/command/`; observed: `legacy-command-sweep.test.ts` and `harness-rows.test.ts` kilocode cases green
- [x] 5.3 @integration (agent) render AtomCode commands -> input-reading workflows declare `args: optional` with `$ARGUMENTS`, the rest `args: none`; observed: AtomCode goldens in `harness-matrix.test.ts` green
- [x] 5.4 @regression (agent) `mise run generate:check` -> no drift after regeneration; observed: `mise run generate:check` -> no drift

## 6. Canon ports reach the agents

- [x] 6.1 @unit (agent) port-ledger test -> every new passage names its upstream template and pin 1.15.0, and no body names bare `openspec`; observed: `canon-render.test.ts` provenance block green at pin 1.15.0
- [ ] 6.2 @eval (agent) `mise run eval:e2e` on the verify and propose scenarios -> no regression vs the last recorded run (advisory)

## 7. Standalone install [critical]

- [x] 7.1 @e2e (agent) run `install.sh` in `alpine` and `ubuntu` containers against a release-candidate asset set -> it selects `linux-x64-musl` and `linux-x64` respectively, the checksum matches `SHA256SUMS`, and the installed `cospec version` reports `standalone`; observed (distribution agent, Docker): install.sh selected linux-arm64-musl on Alpine and glibc on Ubuntu, checksum matched, real v0.11.2 install printed 0.11.2
- [x] 7.2 @e2e (agent) run `install.sh` with a corrupted archive -> nonzero exit and no binary written; observed: `test:install` in `mise run check`: tampered archive exits nonzero, nothing written, existing binary untouched
- [x] 7.3 @integration (agent) Pester tests for `install.ps1` with x64 and arm64 architectures and a corrupted archive -> the right asset is selected for each, and a checksum mismatch exits nonzero leaving any existing binary untouched; observed (distribution agent): Pester 12/12 under pwsh 7.5
- [ ] 7.4 @manual (human) run `install.ps1` on Windows x64 -> `cospec version` runs from a new shell
- [x] 7.5 @integration (agent) `nix run .# -- --version`, then `nix build` of a consumer flake that applies `overlays.default` and runs `pkgs.cospec --version` -> both print the pinned release version; observed (distribution agent, nixos/nix aarch64-linux): `nix run . -- --version` printed 0.11.2 and the consumer overlay flake built

## 8. Robustness and completion

- [ ] 8.1 @integration (agent) `cospec archive` on a CRLF living spec and on a symlinked `openspec/specs` (in and out of the project) and a symlinked `spec.md` leaving the project -> CRLF preserved, both directory links accepted, and the escaping `spec.md` refused
- [x] 8.2 @unit (agent) `cospec init` legacy-block removal on a CRLF `CLAUDE.md` and a CRLF `.bashrc` -> every line ending in the result is CRLF; observed: `profiles.test.ts` line-endings case green (CRLF preserved as the binary leaves it) and `legacy-config-blocks` unit tests green
- [x] 8.3 @benchmark (agent) `mise run bench:smoke` timing `cospec __complete changes` -> median recorded under the budget (advisory); observed (distribution agent): `bench:complete` median ~940 ms vs 1500 ms budget, advisory
- [x] 8.4 @integration (agent) store-backed `cospec status --json` inside a declaring repo -> `allowedEditRoots` lists the repo and the store; observed: `integration/store-aware.test.ts` green
- [ ] 8.5 @equivalence (agent) `cospec init --tools claude` and the pinned `openspec init` at a store-only repo root -> both install integrations, the config is byte-identical, and no planning dirs are created
- [x] 8.6 @integration (agent) `cospec archive` on a glob-tracked fixture whose only unchecked task sits in the second matched file -> archive refuses naming that file; observed: `unit/commands/archive.test.ts` multi-file tracked-task cases green
- [x] 8.7 @equivalence (agent) `test/contract/glob.test.ts` at the 1.15.0 pin -> cospec and the binary match identical paths for every pattern; observed: `test/contract/glob.test.ts` green against the 1.15.0 modules
