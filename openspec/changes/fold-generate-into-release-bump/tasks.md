## 1. Fold `generate` into the release bump job

- [x] 1.1 In `.github/workflows/release.yml`'s `bump` job, add a
      `mise run     generate` step immediately after the existing
      `mise run     release:set-version -- "${{ needs.version.outputs.version }}"`
      step and before the "Commit the version bump via the GitHub API" step, so
      regenerated managed files are captured by the same `git diff` this step
      turns into `ADDITIONS` for `createCommitOnBranch`.
- [x] 1.2 Update `docs/release.md`'s `bump` job description (job 2 in "The six
      jobs") to mention the added `mise run generate` step and state the
      single-commit guarantee: the version stamp and any regenerated
      managed-file `generatedBy` stamps land in one bump commit, never split
      across two.
- [x] 1.3 Update the header comment in `.github/workflows/release.yml` (the
      `bump:` bullet in the flow summary at the top of the file) to match.

## 2. Verify

- [x] 2.1 Local simulation: stamp a throwaway version with
      `release:set-version`, run `mise run generate`, then
      `mise run     generate:check` and `git status` — confirm only the expected
      files changed (the stamped manifests plus any managed files whose
      `generatedBy` tag moved), then revert the simulation cleanly.
- [x] 2.2 `mise run check` passes with the workflow/docs edits in place.
- [ ] 2.3 Record the real `workflow_dispatch` release proof in `verification.md`
      (deferred until a real release runs post-merge).
