## 1. Bump commit lands on `main` signed, via the GitHub API [critical]

- [~] 1.1 @runtime (human) dispatch `Release` on `main` and observe the `bump` job's `createCommitOnBranch` mutation succeed with the `cospec-release` app token, the resulting commit shown as "Verified" (attributed to `cospec-release[bot]`), and both rulesets accepting it -> defer: requires a real `workflow_dispatch` against `main` with `RELEASE_APP_ID`/`RELEASE_APP_PRIVATE_KEY` configured and the app listed as the "Require PRs" bypass actor (owner is doing this manually); cannot be exercised from this branch
- [x] 1.2 @integration (agent) construct the GraphQL `createCommitOnBranch` mutation and REST tag-creation payloads in a local shell step and echo the JSON to check heredoc/quoting/base64 (`base64 -w0`) syntax -> payloads are well-formed JSON with correctly base64-encoded file contents; verified manually against a scratch file
- [x] 1.3 @integration (agent) verify the pinned `actions/create-github-app-token` SHA matches its release tag -> `gh api repos/actions/create-github-app-token/git/ref/tags/v3.2.0` resolves to commit `bcd2ba49218906704ab6c1aa796996da409d3eb1`, the SHA pinned in the workflow
- [x] 1.4 @integration (agent) confirm app-token commits trigger downstream workflows -> GitHub docs ("Triggering a workflow"): workflow-trigger suppression applies to `GITHUB_TOKEN` only; "you can use a GitHub App installation access token or a personal access token instead of GITHUB_TOKEN to trigger events" — so the bump commit gets a `ci.yml` run

## 2. Workflow stays lint-clean

- [x] 2.1 @integration (agent) `mise exec -- actionlint` against the reworked `release.yml` -> no errors
