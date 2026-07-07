## Why

`main`'s "Protect default branch" ruleset requires signed commits with NO exempt
bypass actors, so the release pipeline's SSH deploy-key push for the
version-bump commit will start failing once that ruleset is enforced; commits
created via GitHub's GraphQL `createCommitOnBranch` mutation are signed by
GitHub itself (Verified) and pass the rule without any bypass actor, letting
`RELEASE_DEPLOY_KEY` be retired entirely.

## What Changes

- `.github/workflows/release.yml` — `bump` job: checkout `main` normally (no
  `ssh-key`), run `mise run release:set-version` locally, and create the
  version-bump commit via `gh api graphql` (`createCommitOnBranch`) instead of
  `git commit` + `git push`. Tag creation moves to the REST git-tags/git-refs
  API using `GITHUB_TOKEN`.
- `.github/workflows/release.yml` — `cleanup` job: delete the tag via REST
  (`DELETE /git/refs/tags/...`) with `GITHUB_TOKEN` instead of an SSH push; drop
  the SSH checkout.
- `.github/workflows/release.yml` — remove all `RELEASE_DEPLOY_KEY` references
  and the `HK`/`HK_SKIP_HOOK` env vars that existed only for the local bot
  commit (the API path runs no local git hooks).
- `docs/release.md` — rewrite the secrets/setup section: no more deploy key;
  document the two-ruleset model (Protect: satisfied by GitHub-signed API
  commits; Require PRs: GitHub Actions integration exempt) and the CI-run
  tradeoff (the bump commit no longer triggers `ci.yml`'s push trigger).

## Impact

- `bump` job needs `contents: write` (unchanged) but no longer needs an SSH
  deploy key.
- `cleanup` job needs `contents: write` (unchanged), drops the SSH checkout.
- Secret `RELEASE_DEPLOY_KEY` is retired/deleted from the repo.
- Behavioral change: commits created via `createCommitOnBranch` with
  `GITHUB_TOKEN` do not trigger other workflows (same actor-suppression GitHub
  applies to `GITHUB_TOKEN`-authored pushes), so the bump commit no longer gets
  a `ci.yml` run. This is acceptable: the bump commit only touches version
  fields, and the `build`/`stage-npm` jobs already exercise the resulting tree.
- Prerequisite (manual, outside this change): the "Require PRs" ruleset must
  list the GitHub Actions integration as an exempt bypass actor so the
  API-created commit is accepted without an open PR.

## Surfaces

<!-- Check every surface this change touches; each drives a verification/design expectation (soft). -->

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [x] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
