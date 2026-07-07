## 1. Fix npm publish path classification

- [x] 1.1 Prefix both `npm publish` invocations in the `publish` job's
      `publish_if_absent()`/main-package call with `./` so npm's arg classifier
      never treats `npm-dist/<name>.tgz` as GitHub shorthand.
- [x] 1.2 Confirm the `stage-npm` dry-run step already uses an absolute path and
      needs no change; note the empirical `npm publish --dry-run` comparison
      (relative vs `./`-prefixed) that reproduced the bug.

## 2. Make cleanup publish-phase-aware

- [x] 2.1 Rewrite the `cleanup` job so it only deletes the tag/release when the
      release never went live AND no package for the version is on npm;
      otherwise it leaves the tag, release, and any live npm packages intact for
      an idempotent re-dispatch.
- [x] 2.2 Comment the state machine inline in `release.yml`.

## 3. Allow a resume dispatch at the same version

- [x] 3.1 In the `version` job, allow the tag-exists guard to pass when the
      existing tag resolves to the same commit the bump would produce AND the
      main npm package@version is not live; keep failing for a genuinely
      conflicting tag.

## 4. Verify

- [x] 4.1 `mise exec -- actionlint` passes on `.github/workflows/release.yml`.
- [x] 4.2 `mise run check` passes.
