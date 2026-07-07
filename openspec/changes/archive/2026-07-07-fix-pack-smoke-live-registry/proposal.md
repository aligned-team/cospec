## Why

The v0.1.1 npm publish broke both pack-smoke tests environmentally: the platform
optionalDependencies now resolve from the live registry, so the launcher's
missing-platform-package branch is never hit, and `npm publish --dry-run`
refuses to "publish over the previously published versions" once the manifest
version is (or lags) a live release. CI is red on `main` for the same reason;
the tests must be robust to packages being live.

## What Changes

- The launcher test installs the tarball with `--omit=optional` so the platform
  packages are never resolved from the registry.
- The dry-run test packs a copy stamped with a never-publishable smoke version
  (`0.0.0-smoke.0`, published with `--tag smoke`, absolute tarball path) so the
  registry conflict cannot recur at any release version.

## Impact

- `apps/cli/test/integration/pack.test.ts` only; no runtime code changes.
