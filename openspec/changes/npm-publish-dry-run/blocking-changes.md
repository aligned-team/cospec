# Dependencies

## Blocked by

None.

## Soft-blocked by

- [ ] `npm-release-pipeline` — also touches `.github/workflows/release.yml`
      (bump/build/publish/cleanup jobs); this change adds one step to
      `stage-npm` only, in a different hunk, so it can land independently but
      may need a rebase if `npm-release-pipeline` merges first.
