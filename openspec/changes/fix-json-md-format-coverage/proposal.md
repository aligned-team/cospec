## Why

The v0.1.0 release bump (9e8af75) silently reformatted 8 package.json manifests
because `release:set-version` normalizes through oxfmt in a temp file whose
basename is never literally `package.json`, so oxfmt's package.json-aware array
formatting never activates and the script's own idempotency check compares
against that mis-formatted output. Neither `mise run format:check` nor the
`hk.pkl` pre-commit oxfmt step catch this class of drift because the hook step's
glob is TypeScript-only — JSON and Markdown are never linted at commit time,
only (partially, and only for JSON by luck of a broad `.` glob) in the CI-wide
`format:check` task.

## What Changes

- `scripts/mise-tasks/release/set-version` — normalize each JSON manifest in a
  temp directory under its real basename (e.g. `package.json`) instead of a
  mangled `.pkg.setver.$$.tmp.json` name, so oxfmt's filename-sensitive
  formatting rules apply identically to the temp copy and the committed file.
- `hk.pkl` — extend the `oxfmt` linter step's glob to cover JSON/JSONC and
  Markdown (the file types oxfmt actually formats per `.oxfmtrc.json`
  overrides), scoped away from `generatedGlobs`. `oxlint` glob stays
  TypeScript-only (oxlint has no JSON/Markdown support).
- One-time repo-wide `mise run format:fix` to bring every JSON/Markdown file to
  the same fixed point `set-version` now produces, so the next release bump is a
  formatting no-op.

## Impact

- `scripts/mise-tasks/release/set-version`, `hk.pkl`, and every JSON/Markdown
  file in the repo (formatting-only diffs from `format:fix`).
- No CI jobs, secrets, or required-check names change. Pre-commit hook runs now
  also touch `.json`/`.md` files; no application source or specs are modified.
- YAML: oxfmt can technically format YAML/TOML, but this change does not add
  YAML to any gate — TOML already has a dedicated `taplo` step, and extending
  formatting to workflow YAML is a separate blast-radius decision left to Imogen
  (noted in the PR, not bundled here).

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [x] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
