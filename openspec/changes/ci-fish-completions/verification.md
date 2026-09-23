# Verification

## 1. The fish completion leg actually runs on CI [critical]

- [ ] 1.1 @runtime (agent) on the PR's `ci-bun` job (GitHub-hosted `ubuntu-latest` runner — the real execution environment for this workflow), read the `mise run test:integration` log -> no "fish not installed — skipping syntax check" warning appears and the fish syntax-check test reports as passed
- [ ] 1.2 @runtime (agent) read the "required completion shells present" step on the same `ci-bun` run -> it resolves `bash`, `zsh`, and `fish` and exits 0

## 2. The workflow edit is well-formed

- [ ] 2.1 @integration (agent) `mise exec -- actionlint` against the edited `.github/workflows/ci.yml` -> exit 0, no findings
- [ ] 2.2 @integration (agent) run the shells-present check locally with a pruned `PATH` that hides fish -> the step exits non-zero and names the missing shell
