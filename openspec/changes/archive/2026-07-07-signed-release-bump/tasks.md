## 1. Rework the bump job to use the GitHub API

- [x] 1.1 Drop the `ssh-key` checkout in `bump`; check out `main` normally with
      `fetch-depth: 0`.
- [x] 1.2 Run `mise run release:set-version` locally, detect changed files via
      `git status --porcelain`, and build the `createCommitOnBranch` GraphQL
      mutation (base64 file contents, `expectedHeadOid`, fail clean on mismatch)
      via `gh api graphql`.
- [x] 1.3 Create the annotated tag via REST (`git/tags` + `git/refs`) with
      `GITHUB_TOKEN` instead of `git tag` + SSH push.
- [x] 1.4 Remove `RELEASE_DEPLOY_KEY`, `HK`, and `HK_SKIP_HOOK` from the
      workflow; update the header comment to describe the new flow.

## 2. Rework cleanup and confirm permissions

- [x] 2.1 Replace the `cleanup` job's SSH tag-delete push with a REST
      `DELETE /git/refs/tags/...` call using `GITHUB_TOKEN`; drop the SSH
      checkout.
- [x] 2.2 Confirm each job's `permissions:` block is minimal and correct after
      the change (`bump` and `cleanup` need `contents: write`).

## 3. Docs and validation

- [x] 3.1 Rewrite `docs/release.md`'s secrets/setup section: no deploy key,
      document the two-ruleset model and the CI-run tradeoff.
- [x] 3.2 `mise run check` and `mise exec -- actionlint` both green.
- [x] 3.3 Dry-run the GraphQL/REST payload construction locally (echo the JSON
      body) to check heredoc/quoting/base64 syntax — cannot exercise the real
      mutation against `main` from this change.
