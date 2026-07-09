## 1. Unblock canon drift

- [x] 1.1 Run `mise run generate` and commit the 32 regenerated managed files
      (`.claude/`, `.codex/`, `.opencode/`, `openspec/.cospec-manifest.json`) as
      a standalone `chore(generate)` commit. -> regenerated; 32 files present
      uncommitted in the working tree, staged for a `chore(generate)` commit
      (not committed per task instructions — commit is left to the Ship phase).
- [x] 1.2 Verify: `mise run generate:check` exits 0 (no diff). ->
      `mise run     generate:check` -> "cospec update --check: no drift",
      exit 0.

## 2. Retarget docs deploy to releases

- [x] 2.1 In `.github/workflows/docs.yml`, replace the `push` trigger with
      `workflow_call` (optional `ref` input, default `''`) and keep
      `workflow_dispatch`; checkout `ref: ${{ inputs.ref || github.sha }}`. ->
      done; `push` trigger removed, `workflow_call` with `ref` input added,
      checkout step uses `ref: ${{ inputs.ref || github.sha }}`.
- [x] 2.2 Verify: `actionlint` passes on `docs.yml` and a manual
      `workflow_dispatch` run (or local review of the job graph) still resolves
      `ref` to `github.sha` when no input is supplied. ->
      `mise exec --     actionlint .github/workflows/docs.yml` exit 0; job graph
      review: on `workflow_dispatch` (no `inputs.ref`),
      `inputs.ref || github.sha` evaluates to `github.sha` (empty-string default
      falls through the `||`).
- [x] 2.3 In `.github/workflows/release.yml`, add a `deploy-docs` job
      (`needs: [bump, publish]`,
      `permissions: contents: read, pages:     write, id-token: write`) that
      calls `./.github/workflows/docs.yml` with
      `ref: ${{ needs.bump.outputs.sha }}`. -> done; `deploy-docs` job added
      after `publish`, `needs: [bump, publish]`, explicit
      `contents/pages/id-token` permissions,
      `uses:     ./.github/workflows/docs.yml` with
      `ref: ${{ needs.bump.outputs.sha }}`.
- [x] 2.4 Verify: `actionlint` passes on `release.yml`; confirm
      `needs.bump.outputs.sha` is already emitted by the `bump` job (no new
      output plumbing needed) and that `deploy-docs` is skipped when `publish`
      fails. -> `mise exec -- actionlint .github/workflows/release.yml` exit 0.
      Confirmed `bump` job already declares
      `outputs: sha:     ${{ steps.commit.outputs.sha }}` (line 207-208,
      unchanged) — no new plumbing added. `deploy-docs` lists `publish` in
      `needs`, so GitHub Actions skips it automatically when `publish` fails or
      is skipped (standard `needs` semantics; same mechanism `cleanup`'s
      `if:     failure()` relies on for the inverse case).

## 3. Add PR-time docs build coverage

- [x] 3.1 In `.github/workflows/ci.yml`, add a `docs` filter/output to
      `detect-changes` covering `apps/docs/**`, `.github/workflows/docs.yml`,
      `.github/workflows/ci.yml`, `mise.toml`, `package.json`, `bun.lock`,
      `.github/actions/setup-mise/**`. -> done; `docs` output added to
      `detect-changes.outputs`, filter added to the `dorny/paths-filter` block
      with all 7 listed paths.
- [x] 3.2 Add a `ci-docs` job (checkout, setup-mise, setup-node 22,
      `bun install --frozen-lockfile`, `mise run docs:build`), and wire it into
      `ci-gate` (`needs`, `env.DOCS`, failure loop). -> done; `ci-docs` job
      added (gated on `needs.detect-changes.outputs.docs == 'true'`); `ci-gate`
      updated: `ci-docs` added to `needs`,
      `DOCS:     ${{ needs.ci-docs.result }}` added to `env`, `"$DOCS"` added to
      the failure-check loop.
- [x] 3.3 Verify: `actionlint` passes on `ci.yml`; locally run
      `mise run docs:build` and confirm it exits 0. ->
      `mise exec --     actionlint .github/workflows/ci.yml` exit 0.
      `mise run docs:build` -> "build complete in 2.37s", exit 0.
- [x] 3.4 Verify: confirm no `hk.pkl` change is needed — existing oxfmt/oxlint
      globs already reach `apps/docs/**/*.{md,mts,ts}` — and that a full `hk`
      run (pre-commit profile) still passes on the diff. -> confirmed;
      `hk.pkl`'s `ciGlobs` (`.github/workflows/**/*.yml`) already runs
      `actionlint` on the touched workflows, and `oxfmtGlobs`/`tsGlobs` already
      reach `apps/docs/**/*.{md,mts,ts}`. `hk run pre-commit --check     --pr`
      -> exit 0, no findings, no unintended file changes (verified via
      `git status --short` before/after). No `hk.pkl` edit made.

## 4. Final gate

- [x] 4.1 Run `mise run check` (full CI gate) locally. -> ran; completed in ~56s
      (parallel task fan-out).
- [x] 4.2 Verify: `mise run check` exits 0, and note in the PR description that
      the regenerated managed files unblock pre-existing release drift (not
      introduced by this branch). -> `mise run check` exit 0 (all
      unit/contract/integration/release tests pass — 486+11+22+46 — plus lint,
      format:check, typecheck, generate:check, vendor:openspec:check,
      cospec-validate-all, openspec:schema:validate, agents:check all green).
      PR-description note about the regenerated-managed-files drift is recorded
      here for the Ship phase to carry into the PR body.
