## Why

The release `bump` job stamps the new version into `apps/cli/package.json` (and
`bun.lock`) via `mise run release:set-version`, but never runs
`mise run generate` (`cospec update`). Every managed file's `generatedBy`
provenance stamp is derived from that same `apps/cli/package.json` version
(`managed-files.ts`'s `COSPEC_VERSION`/`CURRENT_GENERATED_BY`), so the instant a
release lands, every managed file under `.claude/`, `.codex/`, `.opencode/`, and
`openspec/schemas/` carries a stale `generatedBy: cospec@<old-version>` tag.
`ci.yml`'s `ci-openspec` job (which runs `generate:check`) is gated on
`canon`/`openspec_*` path filters that the bump commit never touches, so nothing
catches the drift on the bump commit itself — it silently surfaces as an
unrelated `generate:check` failure on the next PR that happens to touch
`openspec/changes/**` or `mise.toml`, which is nearly every PR in this
self-hosting repo.

## What Changes

- `.github/workflows/release.yml` (`bump` job) — run `mise run generate`
  immediately after `mise run release:set-version` and before the
  `git diff`/`createCommitOnBranch` step, so the version stamp and the
  regenerated managed files land in the one API-created bump commit.
- `docs/release.md` — update the `bump` job description to document the added
  generate step and the single-commit guarantee.

## Impact

- Workflow: `.github/workflows/release.yml`, job `bump` (no new jobs, no new
  permissions, no new secrets — `mise run generate` needs no additional
  credentials beyond what the job already checks out).
- No required-checks changes: `ci.yml`'s job set and path filters are untouched
  by this change.
- Runtime effect: the bump commit's diff grows to include any managed-file
  `generatedBy` stamp updates (and any other canon drift already pending); the
  commit message/tag scheme is unchanged.

## Surfaces

<!-- Check every surface this change touches; each drives a verification/design expectation (soft). -->

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [x] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
