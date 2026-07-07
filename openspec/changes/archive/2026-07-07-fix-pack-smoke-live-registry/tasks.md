## 1. Make pack-smoke robust to live registry packages

- [x] 1.1 Install the launcher tarball with `--omit=optional` in the
      missing-platform-package test
- [x] 1.2 Pack the dry-run tarball from a smoke-version-stamped copy and publish
      it with `--tag smoke`
- [x] 1.3 Run the pack suite green
      (`bun test     apps/cli/test/integration/pack.test.ts` — 2 pass, 0 fail)
