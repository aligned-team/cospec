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
2. **`bump`** — checks out `main` over SSH using `RELEASE_DEPLOY_KEY`, runs
   `mise run release:set-version -- <v>` to stamp the version into
   `apps/cli/package.json` (and the matching workspace entry in `bun.lock`,
   which bun never refreshes on install), commits as `github-actions[bot]`
   (skipping hk's `pre-commit`/`commit-msg` hooks via `HK: '0'` and
   `HK_SKIP_HOOK: pre-commit,commit-msg` — never `--no-verify`), creates an
   annotated tag, and pushes both. Idempotent: if the manifest is already at
   that version, only the tag is pushed. Outputs the bump commit's `sha`.
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
   notes and all binaries + `SHA256SUMS` already attached, then `npm publish`s
   the staged tarball from `stage-npm` (via `NPM_TOKEN`). Only once that publish
   succeeds does it flip the draft to published — by release ID, not by tag,
   since drafts aren't addressable by tag — using a short retry loop (the
   releases list can lag a moment behind the create call).
6. **`cleanup`** — runs only `if: failure()`. Best-effort deletes the pushed tag
   from origin (via the deploy key) and the draft release, if either was
   created. It never touches `main` or the bump commit.

## Required secrets

| secret                         | purpose                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `RELEASE_DEPLOY_KEY`           | SSH deploy key with write access, used to push the bump commit + tag to `main` and to delete the tag on cleanup |
| `ANTHROPIC_API_KEY_COMMUNIQUE` | lets `communique` generate AI release notes                                                                     |
| `NPM_TOKEN`                    | temporary — an npm automation token, used until trusted publishing is set up                                    |

### Setting up `RELEASE_DEPLOY_KEY`

`main` carries a branch-protection ruleset, so a plain `GITHUB_TOKEN` push is
rejected. A deploy key sidesteps that by being registered as an **exempt bypass
actor**:

1. Generate a dedicated SSH key pair
   (`ssh-keygen -t ed25519 -C "cospec-release-bot"`, no passphrase).
2. Repo Settings → Deploy keys → add the **public** key with write access.
3. Repo Settings → Rules → Rulesets → the `main` ruleset → Bypass list → add
   this deploy key as an exempt bypass actor.
4. Repo Settings → Secrets and variables → Actions → add the **private** key as
   `RELEASE_DEPLOY_KEY`.

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
