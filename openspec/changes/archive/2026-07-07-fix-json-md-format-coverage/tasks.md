## 1. Fix the release script's formatting fixed point

- [x] 1.1 Fix `set_json_version` in `scripts/mise-tasks/release/set-version` to
      normalize the jq output in a temp directory under the manifest's real
      basename (e.g. `package.json`), not a mangled temp name, so oxfmt's
      filename-sensitive rules match the committed file.
- [x] 1.2 Verify: run `set-version 0.1.0 --root <temp copy of repo>` then
      `oxfmt --check` the copy — zero non-version diffs.

## 2. Extend gate coverage to JSON/Markdown

- [x] 2.1 Extend the `oxfmt` step's glob in `hk.pkl` to include JSON/JSONC and
      Markdown files, excluding `generatedGlobs`.
- [x] 2.2 Confirm `oxlint` has no JSON/Markdown support (docs/`--help`) and
      leave its glob TypeScript-only.
- [x] 2.3 Confirm `mise run format:check`/`format:fix` already cover
      JSON/Markdown (no glob restriction) — fix the task invocation if not.

## 3. Normalize the repo and verify the fixed point

- [x] 3.1 Run `mise run format:fix` repo-wide and review the diff.
- [x] 3.2 Run `mise run check` green.
- [x] 3.3 Re-verify `set-version` is a formatting no-op against the
      now-normalized repo.
