# Verification

## 1. The fish completion leg actually runs on CI [critical]

- [x] 1.1 @runtime (agent) on the PR's `ci-bun` job (GitHub-hosted `ubuntu-latest` runner — the real execution environment for this workflow), read the `mise run test:integration` log -> PR #44, run 35823627182, job `ci-bun`: `mise run test:integration` reported `163 pass, 0 fail` across 23 files, with no "fish not installed — skipping syntax check" warning anywhere in the log
- [x] 1.2 @runtime (agent) read the "required completion shells present" step on the same `ci-bun` run -> same run: the step resolved `bash`, `zsh`, and `fish` and exited 0. Note: the gate's first execution (run 35823382035, before the zsh-install fix) correctly caught `zsh` also missing from `ubuntu-latest` and failed loudly (`missing required shell(s): zsh`) — proof the gate works, and the reason a follow-up commit (`ci: install zsh alongside fish for the completion shells gate`) was needed before this row could pass

## 2. The workflow edit is well-formed

- [x] 2.1 @integration (agent) `mise exec -- actionlint` against the edited `.github/workflows/ci.yml` -> exit 0, no findings (confirmed again after the zsh-install addition)
- [x] 2.2 @integration (agent) run the shells-present check locally with a pruned `PATH` that hides fish -> the step exits non-zero and names the missing shell (`missing required shell(s): fish`); the real CI run additionally proved the same gate catches a missing `zsh` (see 1.2)
