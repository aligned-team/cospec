## 1. Release workflow is syntactically and structurally sound [critical]

- [x] 1.1 @integration (agent) `actionlint` against `.github/workflows/release.yml` -> no findings (`mise exec -- actionlint .github/workflows/release.yml` exits 0, no output); fixed one real SC2193 finding by moving `matrix.target` into an `env:` var before the shell `[[ ... ]]` comparison
- [~] 1.2 @runtime (agent) dispatch `release.yml` on GitHub Actions (`workflow_dispatch`) end to end against the real repo/runners and observe version → bump → build → stage-npm → publish → cleanup all succeed and a published GitHub release + npm package appear -> defer: requires live dispatch against configured secrets (`RELEASE_DEPLOY_KEY`, `ANTHROPIC_API_KEY_COMMUNIQUE`, `NPM_TOKEN`), which are not yet provisioned; deferred to the first real dispatch post-merge

## 2. set-version stamps the version correctly and idempotently

- [x] 2.1 @integration (agent) run the new bun test for `set-version` against a temp `--root` -> `mise run test:release` — 7 pass, 0 fail (stamps `apps/cli/package.json` and the `bun.lock` workspace entry to the target version, leaves root `package.json` at `private`/`0.0.0`, rejects bad semver, second run reports `unchanged` for both files)
- [x] 2.2 @integration (agent) after stamping, run `bun install --frozen-lockfile` against the bumped tree -> passes; empirically verified against a scratch copy: bumping `apps/cli/package.json` to `9.9.9` without touching `bun.lock` still passed `bun install --frozen-lockfile` (bun 1.3.14 does not treat workspace-version/lockfile mismatch as drift), and the script stamps `bun.lock`'s matching entry regardless so the two never drift

## 3. Compiled binary reports the correct version

- [x] 3.1 @integration (agent) `bun build --compile` a binary from a version-bumped `apps/cli` tree and run `<bin> --version` -> stdout equals the bumped version: built a native binary from a scratch copy with `apps/cli/package.json` version set to `9.9.9`, ran `<bin> --version`, got `9.9.9`. `import pkg from '../package.json'` in `apps/cli/src/cli.ts` is a bundled JSON import, not a runtime `fs` read — bun's bundler inlines it at compile time, so no source fix was needed; this was verified empirically, not assumed

## 4. Full CI gate stays green with the new pieces wired in

- [x] 4.1 @integration (agent) `mise run check` (includes new `test:release` task) -> passes: lint (0 errors; 2 pre-existing unrelated warnings), format:check, typecheck, test (479 pass), test:contract (22 pass), test:integration (43 pass), test:release (7 pass), generate:check (no drift), agents:check (in sync), cospec-validate-all (1 change + 4 specs valid), openspec:schema:validate (11/11 schemas valid)
