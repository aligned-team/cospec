## 1. Pack smoke

- [x] 1.1 Empirically verify what `npm publish --dry-run` requires (auth?
      network?) against a tarball produced by `bun pm pack`
- [x] 1.2 Add a test to `apps/cli/test/integration/pack.test.ts` that runs
      `npm publish --dry-run` on the tarball and asserts exit 0, the
      name/version, and that `bin/cospec.js`, `package.json`, `README.md`,
      `LICENSE`, and the `src` entry appear in the contents listing
- [x] 1.3 `mise run test:pack` passes

## 2. Release workflow

- [x] 2.1 Add an `npm publish --dry-run` step to the `stage-npm` job in
      `.github/workflows/release.yml`, after the install smoke, run against the
      exact staged tarball
- [x] 2.2 `mise exec -- actionlint` passes

## 3. Verify

- [x] 3.1 `mise run check` passes green
