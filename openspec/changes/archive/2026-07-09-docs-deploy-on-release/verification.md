## 1. Docs deploy is triggered by the release pipeline, not by main pushes [critical]

- [ ] 1.1 @runtime (agent) push a docs-only commit to `main` outside a release -> no `docs.yml` run fires
- [ ] 1.2 @runtime (agent) inspect the merged `docs.yml` `on:` block on GitHub -> triggers are exactly `workflow_call` and `workflow_dispatch`, no `push`
- [ ] 1.3 @manual (human) run `docs.yml` via `workflow_dispatch` in the Actions UI -> run completes and deploys successfully

## 2. Release pipeline deploys docs only after publish succeeds

- [ ] 2.1 @runtime (agent) on the next real `release.yml` run, check the run graph -> `deploy-docs` starts only after `publish` completes, per `needs: [bump, publish]`
- [ ] 2.2 @runtime (agent) inspect the `docs.yml` build job's checkout step in that run -> checked-out SHA matches `needs.bump.outputs.sha`, the release commit

## 3. PR-time docs build blocks merge on failure

- [ ] 3.1 @integration (agent) open a scratch PR that breaks `apps/docs/.vitepress/config.mts` -> `ci-docs` fails and `ci-gate` reports failure
- [ ] 3.2 @integration (agent) revert the break and re-run -> `ci-docs` and `ci-gate` pass

## 4. Canon drift gate is clear

- [ ] 4.1 @integration (agent) run `mise run generate:check` after committing regenerated managed files -> exits 0, no diff
