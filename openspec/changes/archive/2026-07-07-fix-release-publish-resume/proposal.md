## Why

The first release dispatch (run 28853072821, tag v0.1.0) failed in the `publish`
job with two distinct bugs: `npm publish` treated a tarball's relative path as
GitHub shorthand and tried an SSH `git ls-remote`, and the failure-cleanup job
then deleted the already-published GitHub release while leaving the
(rule-protected) tag behind — the exact inverse of a safe rollback. Both bugs
block every future release dispatch.

## What Changes

- `.github/workflows/release.yml` `publish` job: `publish_if_absent()` and the
  main-package publish now pass `./${tgz}` instead of `${tgz}` to `npm publish`,
  and the `stage-npm` dry-run step is confirmed to already use an absolute path
  (`${GITHUB_WORKSPACE}/${TARBALL}`), so it is unaffected.
- `.github/workflows/release.yml` `cleanup` job: rewritten to be
  publish-phase-aware. It now inspects whether the release was ever flipped to
  published and whether any npm package for the version is live, and only tears
  down the tag/release when neither happened. When the release is already public
  or npm has begun, cleanup leaves everything in place so a re-dispatch resumes
  via the existing idempotent `npm view` guards.
- `.github/workflows/release.yml` `version` job: the tag-exists guard now allows
  a resume — if the tag already exists AND points at the commit the current bump
  would produce AND the main npm package@version is not yet live, the job
  proceeds instead of failing; a genuinely conflicting tag (different commit)
  still fails fast.

## Impact

- Jobs affected: `version`, `publish`, `cleanup` in
  `.github/workflows/release.yml`.
- No secrets added or renamed; `cleanup` gains a read call to `npm view` and a
  read call to the releases API (both already available via existing tokens:
  `GH_TOKEN` from the cospec-release app token and the default `GITHUB_TOKEN`).
- Required checks unaffected — this only changes runtime behavior of the release
  workflow, not CI's PR-gating workflows.

## Surfaces

- [ ] interactive
- [x] deploy — this is a change to the release/publish CI topology and its
      rollback semantics.
- [ ] integration
- [ ] agent-behavior
