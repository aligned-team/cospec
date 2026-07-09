## 1. Fix the bump step's payload assembly

- [x] 1.1 Rewrite the "Commit the version bump via the GitHub API" step in
      `.github/workflows/release.yml` so the aggregated additions array and the
      GraphQL payload are built and consumed entirely via temp files
      (`--slurpfile`, `gh api graphql --input <file>`), never via
      `--argjson`/`echo` on a shell variable.
- [x] 1.2 `bash -n` the step and run
      `mise exec -- actionlint .github/workflows/release.yml` -> both passed,
      zero findings.
- [x] 1.3 Simulate the file-based jq/gh construction locally with a
      multi-megabyte dummy file standing in for `bun.lock`, proving the payload
      assembly no longer depends on argv size (stop short of any real `gh api`
      call) -> built an 11 MB payload file (vs 1 MB ARG_MAX on the test system)
      entirely via files, validated with jq, no gh api call made.
