# Verification

## 1. Hooks and CI [critical]

- [ ] 1.1 @runtime (agent) this PR's CI on GitHub's `ubuntu-latest` runner (`pull_request`) -> `ci.yml` without `workflow_call` runs every job and `ci-gate` is green
- [ ] 1.2 @integration (agent) a real push of this branch through the pre-push hook -> it runs `test:changed` for unit, integration and contract, and passes

## 2. Release gate

- [x] 2.1 @integration (agent) the gate's `gh api … check-runs?check_name=ci-gate` query against real `main` commits -> `completed success` for a commit whose push CI passed, `not started` for one still running -> `main` 14edd95 (push CI passed): `completed success`; `main` 1f8b85b while its push CI's `ci-bun` was still running: `not started` (no `ci-gate` run yet), which the step refuses
- [x] 2.2 @unit (agent) actionlint over `release.yml` and `ci.yml`, and `release.yml` diffed against its form before `scope-checks-to-changes` -> passes; the only difference is the gate step and `checks: read` -> actionlint passes over every workflow; against 14edd95 (before `scope-checks-to-changes`) `release.yml` differs only by the gate step, `checks: read` and the two-line permissions comment it rewrites (21 changed lines, 2 removed: that comment)
