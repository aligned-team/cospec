# Verification

## 1. Pin bump with full reachability [critical]

- [ ] 1.1 @integration (agent) `mise run test:contract` against the 1.15.0 pin, including reachability, remedy enumeration, key oracle, and optional-workflow differential -> all green with `parity-pending.yaml` equal to `[]`
- [ ] 1.2 @integration (agent) `mise run vendor:openspec:check` and `cospec doctor` from the compiled binary -> no bundle drift, and doctor reports embedded OpenSpec 1.15.0
- [ ] 1.3 @regression (agent) `mise run check` on the branch head -> exit 0

## 2. Task tracking agrees with the binary [critical]

- [ ] 2.1 @equivalence (agent) differential test of cospec's task parser vs the pinned binary over the `## Workflow follow-up` fixture matrix -> identical counts for every fixture
- [ ] 2.2 @integration (agent) `cospec archive` on a fixture whose only unchecked boxes sit under `## Workflow follow-up` -> archive succeeds and the move is verified on disk
- [ ] 2.3 @integration (agent) `cospec apply --json` on a two-file glob-tracked fixture -> every task carries `sourcePath` and `line`, and the next step names verify, not archive

## 3. Validation parity holds the strict gate [critical]

- [ ] 3.1 @integration (agent) `cospec validate --strict` on fixtures with a 620-character ADDED requirement, a `## Notes` section in a delta, a `skip_design` key, and `x-goal` -> the first three fail with their stable rule IDs, and `x-goal` passes
- [ ] 3.2 @equivalence (agent) the same fixtures through the pinned `openspec validate --strict` -> identical pass/fail verdict per fixture
- [ ] 3.3 @unit (agent) `rules/views.test.ts` -> every new rule has a view-proving fixture

## 4. New and extended commands

- [ ] 4.1 @integration (agent) key oracle rows for `version --json`, `list --archived --json`, `list --all --json`, and `show --json` -> no missing upstream key, and cospec keys present
- [ ] 4.2 @e2e (agent) `cospec version --check --json` online and with the registry unreachable -> `updateAvailable` reported online; offline gives `check: unavailable` and exit 0
- [ ] 4.3 @e2e (agent) `cospec update --dry-run --json` on a stale fixture tree -> the pending list is non-empty and `git status --porcelain` is empty afterwards
- [ ] 4.4 @manual (human) run `cospec view` in a real terminal on this repo and on a fixture with 40 archived changes -> only active changes in the main section, aligned bars, and gate, ledger and archive-ready columns readable
- [ ] 4.5 @integration (agent) `cospec validate --all` under a zero-columns pty (`script -qec`) with `CI` unset -> completes in under 30 s with plain output

## 5. Harness targets [critical]

- [ ] 5.1 @integration (agent) `cospec init --tools` for each of the ten new ids in a temp repo -> files land at the 1.15.0 paths, and skills-only tools get no commands
- [ ] 5.2 @integration (agent) `cospec update` on a tree with `.kilocode/workflows/` holding generated files and `my-notes.md` -> generated files removed, `my-notes.md` kept, commands under `.kilo/command/`
- [ ] 5.3 @regression (agent) `mise run generate:check` -> no drift after regeneration

## 6. Canon ports reach the agents

- [ ] 6.1 @unit (agent) port-ledger test -> every new passage names its upstream template and pin 1.15.0, and no body names bare `openspec`
- [ ] 6.2 @eval (agent) `mise run eval:e2e` on the verify and propose scenarios -> no regression vs the last recorded run (advisory)

## 7. Standalone install [critical]

- [ ] 7.1 @e2e (agent) run `install.sh` in `alpine` and `ubuntu` containers against a release-candidate asset set -> `cospec version` reports `standalone` with the right libc
- [ ] 7.2 @e2e (agent) run `install.sh` with a corrupted archive -> nonzero exit and no binary written
- [ ] 7.3 @manual (human) run `install.ps1` on Windows x64 -> `cospec version` runs from a new shell
- [ ] 7.4 @integration (agent) `nix run .# -- --version` -> prints the pinned release version

## 8. Robustness and completion

- [ ] 8.1 @integration (agent) `cospec archive` on a CRLF living spec and on a symlinked `openspec/specs` inside the project -> CRLF preserved, link accepted, and an out-of-project link refused
- [ ] 8.2 @unit (agent) zsh install/uninstall round trip on a `.zshrc` with leading blank lines -> byte-identical
- [ ] 8.3 @benchmark (agent) `mise run bench:smoke` timing `cospec __complete changes` -> median recorded under the budget (advisory)
- [ ] 8.4 @integration (agent) store-backed `cospec status --json` inside a declaring repo -> `allowedEditRoots` lists the repo and the store
