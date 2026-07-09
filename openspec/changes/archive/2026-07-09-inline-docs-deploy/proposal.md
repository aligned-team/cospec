## Why

Docs publishing currently lives in a separate `workflow_call` target
(`docs.yml`) that `release.yml`'s `deploy-docs` job invokes with `uses:`. That
extra file is one more moving part for a deploy path that only ever runs from
inside the release pipeline: it has its own `workflow_dispatch` escape hatch,
its own permissions block, and its own concurrency group to read alongside
release.yml's. Inlining the build+deploy jobs directly into `release.yml`
removes the indirection — the docs deploy becomes visibly part of the release
run in the Actions UI, there is one fewer workflow file to keep in sync with
`ci.yml`'s parallel docs-build job, and a manual redeploy is just "re-run these
jobs on a past release run" instead of a separate `workflow_dispatch` surface.

## What Changes

- Delete `.github/workflows/docs.yml` (git rm) — no callable docs workflow
  remains.
- Inline its `build` and `deploy` jobs directly into `release.yml` as
  `build-docs` and `deploy-docs`, sequenced `needs: [bump, publish]` exactly as
  the current `deploy-docs` job is, with job-level `permissions` only
  (`pages: write`, `id-token: write`, `contents: read` on the jobs that need
  them — workflow-level `permissions` stays `contents: read`).
- Preserve the `pages` concurrency group (`cancel-in-progress: false`) and the
  `github-pages` environment with `url` on the deploy job.
- Move the valuable comments from `docs.yml` (release-synced deploy rationale,
  the one-time Pages/CNAME repo-setting note, the Node 22 requirement for
  VitePress) into `release.yml`, and note that a manual redeploy now means
  re-running `build-docs`/`deploy-docs` on a release run in the Actions UI.
- Update stale `docs.yml` references: `ci.yml`'s `docs` paths filter and its
  `ci-docs` comment, and `release.yml`'s own header comment describing step 7 of
  the pipeline.

## Impact

- `.github/workflows/release.yml` — gains `build-docs` + `deploy-docs` jobs
  (relocated verbatim from `docs.yml`, same pinned action SHAs, same steps).
- `.github/workflows/docs.yml` — deleted.
- `.github/workflows/ci.yml` — `docs` paths filter and comment updated to
  reference `release.yml` instead of `docs.yml`.
- No application source, specs, or npm-publish behavior changes; the deployed
  docs site's build inputs and trigger conditions (release-synced,
  `needs: [bump, publish]`) are unchanged.

## Surfaces

- [x] deploy — moves the GitHub Pages deploy pipeline (permissions, concurrency
      group, environment) from a called workflow into release.yml directly.
- [ ] interactive
- [ ] integration
- [ ] agent-behavior
