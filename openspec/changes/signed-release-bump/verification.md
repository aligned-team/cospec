## 1. Bump commit lands on `main` signed, via the GitHub API [critical]

- [~] 1.1 @runtime (human) dispatch `Release` on `main` and observe the `bump` job's `createCommitOnBranch` mutation succeed, the resulting commit shown as "Verified" on GitHub, and the `Protect default branch` ruleset accepting it with no bypass actor -> defer: requires a real `workflow_dispatch` against `main` with the "Require PRs" ruleset's GitHub Actions bypass-actor prerequisite already configured (owner is doing this manually); cannot be exercised from this branch
- [x] 1.2 @integration (agent) construct the GraphQL `createCommitOnBranch` mutation and REST tag-creation payloads in a local shell step and echo the JSON to check heredoc/quoting/base64 (`base64 -w0`) syntax -> payloads are well-formed JSON with correctly base64-encoded file contents; verified manually against a scratch file

## 2. Workflow stays lint-clean

- [x] 2.1 @integration (agent) `mise exec -- actionlint` against the reworked `release.yml` -> no errors
