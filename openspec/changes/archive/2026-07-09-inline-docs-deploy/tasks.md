## 1. Inline the docs deploy into release.yml

- [x] 1.1 Add `build-docs` job to release.yml, relocated verbatim from
      docs.yml's `build` job (same pinned action SHAs, same checkout/setup-mise/
      setup-node/bun-install/docs-build/configure-pages/upload-pages-artifact
      steps), `needs: [bump, publish]`, job-level permissions only. -> added at
      release.yml (build-docs job), permissions: {contents: read} only,
      workflow-level permissions still contents: read
- [x] 1.2 Add `deploy-docs` job to release.yml, relocated verbatim from
      docs.yml's `deploy` job (`github-pages` environment with `url`,
      `deploy-pages` step), `needs: build-docs`, `pages` concurrency group with
      `cancel-in-progress: false`, job-level permissions only. -> added
      deploy-docs job with needs: build-docs, concurrency {group: pages,
      cancel-in-progress: false}, permissions {pages: write, id-token: write},
      environment github-pages with url
- [x] 1.3 Move docs.yml's header comments (release-synced rationale, one-time
      Pages/CNAME setup note, setup-node-22 explanation) into release.yml near
      the new jobs; add a note that manual redeploys mean re-running these jobs
      on a release run in the Actions UI. -> moved into a block comment above
      build-docs; redeploy note included
- [x] 1.4 Update release.yml's own top-of-file pipeline-step comment (step 7) to
      describe the inlined jobs instead of a
      `uses: ./.github/workflows/ docs.yml` call. -> step 7 comment rewritten
      for build-docs/deploy-docs
- [x] 1.5 Delete `.github/workflows/docs.yml` (git rm). ->
      `git rm .github/workflows/docs.yml`
- [x] 1.6 Update ci.yml's `docs` paths filter and `ci-docs` comment to reference
      release.yml instead of docs.yml. -> filter entry changed to
      '.github/workflows/release.yml'; ci-docs comment now points at
      release.yml's build-docs job
- [x] 1.7 Grep the repo for remaining `docs.yml` references (`.github`, `docs/`)
      and fix any that are semantically about the relocated workflow. ->
      `grep -rn "docs.yml" .github docs` returns no hits; only the archived
      ledgers and this change's own artifacts (which describe history/the
      relocation) mention docs.yml, left untouched per scope

## 2. Verify

- [x] 2.1 `actionlint .github/workflows/release.yml .github/workflows/ci.yml`
      exits 0. -> exit 0, no findings
- [x] 2.2 `mise run docs:build` exits 0. -> exit 0, "build complete in 2.38s"
- [x] 2.3 `mise run generate:check` exits 0. -> exit 0, "cospec update --check:
      no drift"
- [x] 2.4 `mise run cospec -- validate inline-docs-deploy --strict` passes. ->
      "0 errors, 0 warnings — validation passed"
