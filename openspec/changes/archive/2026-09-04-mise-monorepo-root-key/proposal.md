## Why

Current-generation mise (2026.9.0 locally, and whatever `mise-action@v4.2.0`
resolves in CI) emits a deprecation warning for `experimental_monorepo_root` on
every invocation. That warning goes to stderr, which fails
`e2e/release/set-version.test.ts`'s `expect(stderr).toBe('')` assertion and
makes `mise run check` red on a clean checkout.

## What Changes

- Replace `experimental_monorepo_root = true` with `monorepo_root = true` in the
  root `mise.toml` (the only file that sets the key).
- Raise `min_version` from `"2026.4.1"` to `"2026.7.7"`, the release where the
  key was promoted out of experimental, so the config cannot be loaded by a mise
  that does not understand the new name.

## Impact

- `mise.toml` (root only — `e2e/`, `apps/docs/`, `apps/cli/`, and
  `packages/bench/` configs set neither key).
- Every `mise` invocation loses the deprecation line on stderr, unblocking
  `e2e/release/set-version.test.ts` and `mise run check`.
- Contributors and CI now require mise >= 2026.7.7. Keeping both keys is not an
  option: mise accepts the pair but still warns for the old one, so the
  deprecated key must be removed outright.
