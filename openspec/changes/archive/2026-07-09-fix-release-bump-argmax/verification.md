## 1. bump step assembles + delivers the GraphQL payload without touching argv [critical]

- [x] 1.1 @unit (agent) `bash -n` the step + `mise exec -- actionlint .github/workflows/release.yml` -> both passed, zero findings
- [x] 1.2 @integration (agent) run the step's shell logic against an 8 MB dummy file standing in for `bun.lock` -> 11 MB payload file built and readable, no `--argjson`/`echo` of a large variable anywhere
- [~] 1.3 @runtime (agent) real `bump` job run on a real GitHub Actions runner, createCommitOnBranch succeeding against real bun.lock -> defer: exercising the real runner requires a real release dispatch, which this change must not trigger; observed on the next real dispatch after merge
