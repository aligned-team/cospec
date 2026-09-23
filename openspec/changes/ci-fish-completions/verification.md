# Verification

## 1. The fish completion leg actually runs on CI [critical]

- [~] 1.1 @runtime (agent) on the PR's `ci-bun` job (GitHub-hosted `ubuntu-latest` runner — the real execution environment for this workflow), read the `mise run test:integration` log -> defer: no PR run exists yet from this worktree session. Closest available proxy: `brew install fish` (4.9.3) locally then `bun test apps/cli/test/integration/completion.test.ts` -> 16 pass, 0 fail, including "generated fish script parses clean under fish's own syntax checker", with no "fish not installed — skipping" warning in output. The actual `ubuntu-latest` `ci-bun` log must still be read on the PR's first CI run.
- [~] 1.2 @runtime (agent) read the "required completion shells present" step on the same `ci-bun` run -> defer: same reason as 1.1 — no PR run yet. Closest available proxy: dry-run of the step locally with `fish` pruned from `PATH` exits 1 with stderr `missing required shell(s): fish`, confirming the gate fails loudly; the passing case (`bash`, `zsh`, `fish` all present, exit 0) will be confirmed on the actual `ubuntu-latest` run.

## 2. The workflow edit is well-formed

- [x] 2.1 @integration (agent) `mise exec -- actionlint` against the edited `.github/workflows/ci.yml` -> exit 0, no findings
- [x] 2.2 @integration (agent) run the shells-present check locally with a pruned `PATH` that hides fish -> the step exits non-zero and names the missing shell (`missing required shell(s): fish`)
