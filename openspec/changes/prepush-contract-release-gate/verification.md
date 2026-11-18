# Verification

## 1. Hooks and CI [critical]

- [ ] 1.1 @runtime (agent) this PR's CI on GitHub's `ubuntu-latest` runner (`pull_request`) -> `ci.yml` without `workflow_call` runs every job and `ci-gate` is green
- [ ] 1.2 @integration (agent) a real push of this branch through the pre-push hook -> the step reads the remote and the pushed ref from hk, selects from the push's own diff, and runs unit, integration and contract
- [x] 1.3 @unit (agent) `pushedFiles` and `stagedFiles` over scratch clones of a scratch bare remote -> a fast-forward counts its deletion (`a.txt`, `b.txt`); a branch stacked on a pushed one changes only its own file (`stacked.txt`, not `feature.txt`); a new name for a pushed commit and a deleted ref change nothing; a force push diffs from the sha the remote had; a remote with none of the history makes the change unknown (whole suites); a commit changes its staged paths, deletions included, not its unstaged ones; `testsReaching` selects importers and a changed test file; `--push` reads the remote and refs from stdin (support-test-scope 52 pass)
- [x] 1.4 @integration (agent) hk 1.48.0 in a scratch repo -> a step's `{{ hook_stdin }}` is every ref line git handed the hook and `{{ hook_args }}` is `<remote> <url>`; its `files_list` (the docs' text says `file_list`, which fails to render) holds dotfiles and, with `allow_binary`, binaries, but not a deleted file

## 2. Release gate

- [x] 2.1 @integration (agent) the gate's `gh api … check-runs?check_name=ci-gate` query against real `main` commits -> `completed success` for a commit whose push CI passed, `not started` for one still running -> `main` 14edd95 (push CI passed): `completed success`; `main` 1f8b85b while its push CI's `ci-bun` was still running: `not started` (no `ci-gate` run yet), which the step refuses
- [x] 2.2 @unit (agent) actionlint over `release.yml` and `ci.yml`, and `release.yml` diffed against its form before `scope-checks-to-changes` -> passes; the only difference is the gate step and `checks: read` -> actionlint passes over every workflow; against 14edd95 (before `scope-checks-to-changes`) `release.yml` differs only by the gate step, `checks: read` and the two-line permissions comment it rewrites (21 changed lines, 2 removed: that comment)
