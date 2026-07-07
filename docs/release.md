# Release

`Release` (`.github/workflows/release.yml`) is the single entry point that cuts
a new `@aligned-team/cospec` npm release together with its compiled-binary
GitHub release. It is `workflow_dispatch`-only — no push or tag trigger — so a
maintainer always chooses the moment and the bump explicitly.

## Dispatch input

| input  | type   | options                           | default |
| ------ | ------ | --------------------------------- | ------- |
| `bump` | choice | `auto`, `major`, `minor`, `patch` | `auto`  |

`auto` derives the bump from conventional commits since the last tag via
`cog bump --auto --dry-run`. If cocogitto finds nothing bumpable it prints an
informational message instead of a version; the `version` job treats that as a
failure (re-dispatch with an explicit `patch`/`minor`/`major` to force a
release).

## The six jobs

1. **`version`** — computes the next semver with cocogitto
   (`cog bump --dry-run`; no manifest edit, no commit), strips a leading `v`,
   regex-validates the result is an exact `x.y.z` (guarding against cog's
   "nothing to bump" message leaking into `$GITHUB_OUTPUT`), and fails if the
   derived tag already exists on origin.
2. **`bump`** — checks out `main` normally (no deploy key, no SSH), runs
   `mise run release:set-version -- <v>` to stamp the version into
   `apps/cli/package.json` (and the matching workspace entry in `bun.lock`,
   which bun never refreshes on install), then creates the commit via GitHub's
   GraphQL `createCommitOnBranch` mutation and the annotated tag via the REST
   git-tags/git-refs API — both authenticated with `GITHUB_TOKEN`.
   `expectedHeadOid` guards the mutation against a race (main moved since
   checkout); a mismatch fails the step clean and a re-dispatch recovers.
   Idempotent: if the manifest is already at that version, the commit is skipped
   and only the tag is created. Outputs the bump commit's `sha`. See "Signed
   commits without a bypass actor" below for why this replaces the old SSH
   deploy-key push.
3. **`build`** — a matrix on `ubuntu-latest` that cross-compiles
   `bun build --compile --target=<t>` for `bun-linux-x64-musl`,
   `bun-linux-arm64-musl`, `bun-darwin-x64`, `bun-darwin-arm64`, and
   `bun-windows-x64`, packages each as a `tar.gz` (or `zip` for Windows) with
   `README.md` and `LICENSE`, and uploads it as an artifact. The
   `bun-linux-x64-musl` leg additionally runs the compiled binary and asserts
   `--version` matches the version computed in `version`.
4. **`stage-npm`** — checks out the bump commit, runs `mise run test:pack`, then
   `bun pm pack`s `apps/cli` to produce the **exact** tarball `publish` will
   ship, installs that tarball into a fresh temp project, smoke-tests
   `cospec --version` and a real subcommand against it, and uploads the tarball
   as an artifact.
5. **`publish`** — downloads every artifact, generates `SHA256SUMS`, runs
   `communique` to write `RELEASE_NOTES.md` (using
   `ANTHROPIC_API_KEY_COMMUNIQUE`), creates a **draft** GitHub release with the
   notes and all binaries + `SHA256SUMS` already attached, then flips the draft
   to published — by release ID, not by tag, since drafts aren't addressable by
   tag — using a short retry loop (the releases list can lag a moment behind the
   create call). Only after the release is published does it `npm publish` the
   staged tarball from `stage-npm` (via `NPM_TOKEN`), as the job's **last**
   step: `npm publish` is irreversible (a version can never be republished), so
   nothing fallible runs after it. Everything reversible — creating and
   publishing the GitHub release — happens first, so a failure anywhere before
   `npm publish` always leaves a clean slate for `cleanup` to roll back.
6. **`cleanup`** — runs only `if: failure()`, which given the ordering above is
   only reachable when `npm publish` has NOT succeeded. Best-effort deletes the
   tag via the REST API (`GITHUB_TOKEN`) and the release — draft or
   already-published — if either was created. It never touches `main` or the
   bump commit.

## Signed commits without a bypass actor

`main` carries two rulesets:

- **"Protect default branch"** — applies to everyone, no exempt bypass actors,
  and requires signed commits. A plain `GITHUB_TOKEN` `git push` produces an
  unsigned commit and is rejected outright; an SSH deploy-key push is also
  unsigned and would need to be listed as an exempt bypass actor to get through
  — which this ruleset does not allow. GitHub's GraphQL `createCommitOnBranch`
  mutation sidesteps both problems: the resulting commit is authored and signed
  by GitHub itself (shown as "Verified" in the UI), so it satisfies the
  signed-commit requirement on its own, with no bypass actor needed.
- **"Require PRs"** — requires an open, approved PR before a push lands, except
  for the **GitHub Actions integration**, which is configured as an exempt
  bypass actor. The `bump` job's `GITHUB_TOKEN` runs as that integration, so its
  API-created commit lands directly on `main` without opening a PR.

Together these mean the release bump commit needs no deploy key, no bypass list
entry of its own, and no PR — only the one-time "Require PRs" bypass-actor entry
for GitHub Actions, which is a repo-settings change outside this workflow.

### The CI-run tradeoff

Commits created via `createCommitOnBranch` with `GITHUB_TOKEN` do not trigger
other workflows — GitHub applies the same actor-suppression to API-authored
writes that it applies to any `GITHUB_TOKEN`-authored push, to avoid accidental
workflow recursion. `ci.yml` triggers on push to `main`, so the bump commit no
longer gets a CI run of its own. This is an accepted tradeoff: the bump commit
only touches `apps/cli/package.json` and `bun.lock`'s version field, and the
`build` and `stage-npm` jobs in this same pipeline already check out and
exercise that exact tree (compiling binaries, packing the npm tarball, and
smoke-testing both) before anything is published.

## Required secrets

| secret                         | purpose                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY_COMMUNIQUE` | lets `communique` generate AI release notes                                  |
| `NPM_TOKEN`                    | temporary — an npm automation token, used until trusted publishing is set up |

`RELEASE_DEPLOY_KEY` has been retired: the bump commit and tag are created via
GitHub's API with `GITHUB_TOKEN`, so no deploy key, and no bypass-actor entry
for one, are needed. See "Signed commits without a bypass actor" above.

### Setting up `ANTHROPIC_API_KEY_COMMUNIQUE`

Mint a dedicated Anthropic API key for this repo only (never share one across
repos) and add it as the `ANTHROPIC_API_KEY_COMMUNIQUE` repo secret.

### Setting up `NPM_TOKEN`

Generate an npm **automation** token (bypasses 2FA prompts, scoped to publish)
for the `@aligned-team` org and add it as the `NPM_TOKEN` repo secret. This
token is temporary — see the trusted-publishing migration below, after which it
is deleted from both npm and the repo.

## Trusted-publishing migration (OIDC)

`NPM_TOKEN` is a stopgap. Once `@aligned-team/cospec` exists on npm, move to
OIDC trusted publishing so no long-lived npm token is stored in the repo at all:

1. Publish v1 the current way, with `NPM_TOKEN`, so the package exists on npm.
2. In npm's package settings for `@aligned-team/cospec`, enable trusted
   publishing and point it at this repo + the `release.yml` workflow.
3. Swap the `publish` job's auth: add `permissions: id-token: write` to the job,
   drop the `NODE_AUTH_TOKEN`/`NPM_TOKEN` env entirely, and let `npm publish`
   authenticate via OIDC.
4. Delete the `NPM_TOKEN` secret from the repo and revoke the token in npm.

The workflow carries a `TODO(trusted-publishing)` comment at the exact spot to
change.

## The `--provenance` flip

`npm publish` does not pass `--provenance` today because provenance attestation
requires a **public** source repo, and this repo is currently private. The
workflow carries a `TODO(provenance)` comment at the exact spot. Once the repo
goes public, add `--provenance` to the `npm publish` step (no other change
needed — provenance rides the same OIDC/GitHub Actions identity used for trusted
publishing).
