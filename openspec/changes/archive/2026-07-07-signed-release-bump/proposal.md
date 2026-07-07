## Why

`main`'s "Protect default branch" ruleset requires signed commits with NO exempt
bypass actors, so the release pipeline's SSH deploy-key push for the
version-bump commit will start failing once that ruleset is enforced; commits
created via GitHub's GraphQL `createCommitOnBranch` mutation are signed by
GitHub itself (Verified) and pass the rule without any bypass actor, letting
`RELEASE_DEPLOY_KEY` be retired entirely. The mutation authenticates with a
dedicated `cospec-release` GitHub App token (not `GITHUB_TOKEN`): the GitHub
Actions integration cannot be a bypass actor on this org's "Require PRs" ruleset
(the ruleset API rejects it with a 422), but an org-owned app can.

## What Changes

- `.github/workflows/release.yml` — `bump` job: checkout `main` normally (no
  `ssh-key`), run `mise run release:set-version` locally, mint a short-lived
  installation token via `actions/create-github-app-token` (variable
  `RELEASE_APP_ID` + secret `RELEASE_APP_PRIVATE_KEY`), and create the
  version-bump commit via `gh api graphql` (`createCommitOnBranch`) instead of
  `git commit` + `git push`. Tag creation moves to the REST git-tags/git-refs
  API using the same app token.
- `.github/workflows/release.yml` — `cleanup` job: delete the tag via REST
  (`DELETE /git/refs/tags/...`) with the app token instead of an SSH push; drop
  the SSH checkout. Release deletion stays on `GITHUB_TOKEN`.
- `.github/workflows/release.yml` — remove all `RELEASE_DEPLOY_KEY` references
  and the `HK`/`HK_SKIP_HOOK` env vars that existed only for the local bot
  commit (the API path runs no local git hooks).
- `docs/release.md` — rewrite the secrets/setup section: no more deploy key;
  document the two-ruleset model (Protect: satisfied by GitHub-signed API
  commits attributed to `cospec-release[bot]`; Require PRs: the `cospec-release`
  app exempt) and the CI-run behavior (app-token commits DO trigger `ci.yml` —
  trigger suppression only applies to `GITHUB_TOKEN`).

## Impact

- `bump` job drops to `contents: read` (`GITHUB_TOKEN` only checks out); all
  writes ride the app token. No SSH deploy key.
- `cleanup` job keeps `contents: write` (release deletion via `GITHUB_TOKEN`),
  drops the SSH checkout; tag deletion rides the app token.
- Secret `RELEASE_DEPLOY_KEY` is retired/deleted from the repo; new variable
  `RELEASE_APP_ID` and secret `RELEASE_APP_PRIVATE_KEY` are required.
- Behavioral change: commits created with the app's installation token DO
  trigger push workflows (suppression applies only to `GITHUB_TOKEN`), so the
  bump commit gets a normal `ci.yml` run on `main`, matching the old deploy-key
  behavior; the `build`/`stage-npm` jobs additionally exercise the exact bumped
  tree.
- Prerequisite (manual, outside this change): the `cospec-release` org app
  exists (Contents RW, installed on this repo only) and must be listed as the
  exempt bypass actor on the "Require PRs" ruleset.

## Surfaces

<!-- Check every surface this change touches; each drives a verification/design expectation (soft). -->

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [x] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
