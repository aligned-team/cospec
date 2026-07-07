## 1. Build-time bundle generation

- [x] 1.1 Add `scripts/mise-tasks/vendor/openspec` that bundles the pinned
      `@fission-ai/openspec` bin to `apps/cli/src/vendor/openspec.bundle.js.tpl`
      via `bun build --target=bun --minify`, with a `--check` mode that fails on
      drift
- [x] 1.2 Add the `vendor:openspec` + `vendor:openspec:check` mise tasks and
      wire the check into `mise run check`
- [x] 1.3 Ignore the vendored bundle in `.oxlintrc.json` and `.prettierignore`;
      keep it out of `tsconfig` include
- [x] 1.4 Generate and commit `apps/cli/src/vendor/openspec.bundle.js.tpl`

## 2. Runtime embed + extraction

- [x] 2.1 Add `apps/cli/src/core/openspec-embedded.ts` — static
      `{ type: 'file' }` import of the bundle plus `extractEmbeddedOpenspec()`
      (per-version cache dir, synthesized manifest, write-once atomic rename,
      byte-length post-condition)
- [x] 2.2 Change `apps/cli/src/core/openspec.ts` `openspecBin()` to fall back to
      the embedded bundle when no project `node_modules` copy resolves,
      preserving the version assertion
- [x] 2.3 Add a unit test for the extraction layout + post-condition

## 3. Standalone regression gate

- [x] 3.1 Extend `apps/cli/test/integration/pack-standalone.test.ts` to run a
      real wrapped subcommand with NO openspec in `node_modules` (embedded path)

## 4. Docs

- [x] 4.1 Delete the mise-only caveat in `README.md`; keep the package-managers
      section accurate
- [x] 4.2 Update `docs/architecture.md` resolution-order section and
      `docs/release.md` build steps

## 5. Verify

- [x] 5.1 Run the full contract suite and `mise run check` green; record
      verification evidence
