## Why

The pack smoke proves the tarball installs and runs, but it never proves the
registry would accept it — a bad `files` glob, missing `README`/`LICENSE`, or a
manifest defect can slip through and only surface on `npm publish`. Running
`npm publish --dry-run` against the packed tarball closes that gap without any
network mutation.

## What Changes

- `apps/cli/test/integration/pack.test.ts` — add a test that runs
  `npm publish --dry-run` on the tarball produced by `bun pm pack` and asserts
  exit 0, the package name/version, and that key files (`bin/cospec.js`,
  `package.json`, `README.md`, `LICENSE`, `src` entry) appear in the contents
  listing.
- `.github/workflows/release.yml` — add the same `npm publish --dry-run` step to
  the `stage-npm` job, after the install smoke, run against the exact staged
  tarball.

## Impact

- `apps/cli/test/integration/pack.test.ts` (new test, run by
  `mise run test:pack`)
- `.github/workflows/release.yml` `stage-npm` job (one added step; no changes to
  bump/cleanup/header, which are in flight on another PR)
- No secrets, no new required checks — `npm publish --dry-run` makes no network
  mutation

## Surfaces

- [ ] interactive
- [x] deploy
- [ ] integration
- [ ] agent-behavior
