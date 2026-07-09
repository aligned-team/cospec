## 1. Relocated workflow is syntactically and structurally valid [critical]

- [x] 1.1 @integration (agent) actionlint .github/workflows/release.yml .github/workflows/ci.yml -> exit 0, no findings
- [x] 1.2 @unit (agent) diff inlined build-docs/deploy-docs steps against deleted docs.yml build/deploy steps -> identical action refs (same pinned SHAs: checkout 9c091bb, setup-node 2028fbc, configure-pages 45bfe01, upload-pages-artifact fc324d3, deploy-pages cd2ce8f), same run commands, same artifact path apps/docs/.vitepress/dist

## 2. Docs still build the same way

- [x] 2.1 @integration (agent) mise run docs:build on this branch -> exit 0, same VitePress build the old docs.yml build job ran

## 3. Deploy pipeline topology is unchanged end to end

- [~] 3.1 @runtime (agent) trigger a real Release workflow run (GitHub Actions, ubuntu-latest) and observe build-docs + deploy-docs execute with needs: [bump, publish] gating, the pages concurrency group, and the github-pages environment producing a live page_url -> defer: requires an actual release dispatch; this change only relocates jobs and the next real release run exercises them
