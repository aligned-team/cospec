## 1. npm publish no longer misclassifies the tarball path as a git URL [critical]

- [x] 1.1 @integration (agent) reproduce the bug locally with `npm pack` + `npm publish --dry-run` on a relative path (`npm-dist/<name>.tgz`) vs a `./`-prefixed path -> relative path fails with `npm error ... git ls-remote ssh://git@github.com/npm-dist/<name>.tgz.git`; `./`-prefixed path is classified as a local tarball and proceeds through the normal dry-run publish flow
- [~] 1.2 @runtime (agent) dispatch the real release workflow end to end -> defer: requires a real workflow_dispatch on GitHub Actions; this PR is the fix that unblocks the next dispatch, run by the operator post-merge

## 2. Cleanup never deletes an already-public release or a live npm package [critical]

- [x] 2.1 @e2e (agent) trace the new cleanup state machine against the actual incident (run 28853072821: release already published, npm publish failed before any package went live) -> the rewritten logic checks release.published and npm-view liveness before deleting; it now leaves tag+release intact whenever either is true, matching the safe posture the incident needed
- [~] 2.2 @runtime (agent) force a failure after ≥1 npm package is live and dispatch the real workflow -> defer: requires deliberately forcing a partial-publish failure on the real runner; validated instead by the static trace in row 2.1

## 3. A same-version resume dispatch proceeds instead of failing on tag-exists [critical]

- [~] 3.1 @integration (agent) re-dispatch at the same version with the tag on the current bump commit and main package not live -> defer: requires a real re-dispatch after this fix merges; validated by shell-condition trace against the incident's tag/commit/npm state instead
- [~] 3.2 @integration (agent) dispatch with a tag resolving to a conflicting commit -> defer: same reason as 3.1, validated by shell-condition trace, not a live dispatch
