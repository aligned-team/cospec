# Release

`Release` (`.github/workflows/release.yml`) is the single entry point that cuts
a new cospec release: **eight npm packages** plus a compiled-binary GitHub
release. It is `workflow_dispatch`-only — no push or tag trigger — so a
maintainer always chooses the moment and the bump explicitly.

## Package layout

cospec is **not** bun-exclusive: it ships standalone `bun build --compile`
executables so consumers on Node, Deno, or Bun (or with no JS runtime at all,
via mise) can install and run it. The npm side is an esbuild-style set:

- **`@aligned-team/cospec`** — a runtime-agnostic launcher (`bin/cospec.js`,
  plain JS, zero deps) plus seven `optionalDependencies` pinned to the exact
  same version. It ships no runtime source (`files` is `bin`, `README.md`,
  `LICENSE`).
- **`@aligned-team/cospec-<platform>`** — one package per platform
  (`linux-x64-gnu`, `linux-x64-musl`, `linux-arm64-gnu`, `linux-arm64-musl`,
  `darwin-x64`, `darwin-arm64`, `win32-x64`), each carrying only its compiled
  binary, gated by `os`/`cpu` (+ `libc` on the Linux packages). Linux is
  **libc-split** because bun's builds are not cross-libc portable — verified
  empirically (bun 1.3.14, docker): the glibc build fails on Alpine, and the
  "musl" build is **not static** (it needs the musl loader plus libstdc++/libgcc
  and fails on Debian/Ubuntu). So we follow the oxlint/swc pattern: separate
  `-gnu` (`libc: ["glibc"]`) and `-musl` (`libc: ["musl"]`) packages;
  npm/pnpm/bun then install the one matching the host libc, and glibc distros
  are never handed a musl binary. Source templates live in
  `apps/cli/npm/<platform>/`; binaries are built in CI and never committed.

The launcher resolves the installed platform package via `createRequire` +
`require.resolve` (detecting musl at runtime via `process.report`, the
rollup/swc probe), execs the binary with argv/stdio passthrough, and propagates
exit code + signals. npm/pnpm/bun install only the one platform package matching
the host, so exactly one binary lands on disk.

For mise, the GitHub release archives are named for the github-backend's asset
autodetection: os token (`linux`/`macos`/`windows`) + arch token
(`x64`/`arm64`), a `musl` token on the musl variants, the version, `tar.gz` for
unix / `zip` for Windows, with the `cospec` binary at the archive root.
`mise use github:aligned-team/cospec` then picks the right asset (mise scores
the libc variant too) and verifies it against `SHA256SUMS`.

mise only matches exact 3-part tags (`v{major}.{minor}.{patch}`) — a partial
version like `@0.4` does not resolve and 404s. mise's github backend also
applies a default release-age cooldown (`minimum_release_age`) that hides very
recent releases from "latest"/fuzzy resolution, so a release cut in the last day
or so may not resolve as latest yet; pin the exact version (e.g.
`mise use github:aligned-team/cospec@0.4.0`) to fetch it immediately —
exact-version pins bypass the cooldown.

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
   `mise run release:set-version -- <v>` to stamp the version into **every**
   manifest — `apps/cli/package.json` (including its `optionalDependencies`
   pins), all seven `apps/cli/npm/<platform>/package.json`, the matching
   workspace entry + optional-dependency pins in `bun.lock` (which bun never
   refreshes on install), and the `"npm:@aligned-team/cospec"` pin in the
   commit-gate template `apps/cli/src/canon/gate/mise.toml.tpl` (which
   `cospec init` writes into a user's `mise.toml`) — then runs
   `mise run generate` so every managed file's `generatedBy: cospec@<version>`
   provenance stamp (`.claude/`, `.codex/`, `.opencode/`, `openspec/schemas/`)
   matches the version just stamped. This ordering is load-bearing: `generate`
   reads `COSPEC_VERSION` from `apps/cli/package.json` at process start, so it
   must run **after** `release:set-version`. Only then does the job mint a
   short-lived installation token from the `cospec-release` GitHub App
   (`actions/create-github-app-token`, variable `RELEASE_APP_ID` + secret
   `RELEASE_APP_PRIVATE_KEY`) and create the commit via GitHub's GraphQL
   `createCommitOnBranch` mutation and the annotated tag via the REST
   git-tags/git-refs API — both authenticated with that app token. Because
   `generate` runs before the `git diff` that becomes the mutation's
   `fileChanges`, the version stamp and any regenerated managed files land in
   the **same** bump commit — never split across two. `expectedHeadOid` guards
   the mutation against a race (main moved since checkout); a mismatch fails the
   step clean and a re-dispatch recovers. Idempotent: if the manifests are
   already at that version (and `generate` finds no drift), the commit is
   skipped and only the tag is created. Outputs the bump commit's `sha`. See
   "Signed commits without a bypass actor" below for why this replaces the old
   SSH deploy-key push.
3. **`build`** — a matrix on `ubuntu-latest` that cross-compiles
   `bun build --compile --target=<t>` for `bun-linux-x64`, `bun-linux-x64-musl`,
   `bun-linux-arm64`, `bun-linux-arm64-musl`, `bun-darwin-x64`,
   `bun-darwin-arm64`, and `bun-windows-x64`. Each leg emits **two** artifacts
   from the one binary: a GitHub release archive
   `cospec-<version>-<os>-<arch>[-musl].tar.gz` (or `.zip` for Windows) with the
   binary at the archive root plus `README.md`/`LICENSE`, and an
   `@aligned-team/cospec-<platform>` npm tarball (`npm pack` of the template
   package with the binary dropped into `bin/`). The `bun-linux-x64` (gnu) leg
   additionally runs the compiled binary and asserts `--version` matches the
   version computed in `version`. The embedded OpenSpec bundle
   (`apps/cli/src/vendor/openspec.bundle.js.tpl`) is **not** produced per leg:
   it is platform-independent JS, generated once by `mise run vendor:openspec`,
   committed, drift-gated in CI by `vendor:openspec:check`, and embedded into
   every target by the ordinary `--compile` static import — the build matrix is
   unchanged.
4. **`stage-npm`** — checks out the bump commit, runs `mise run test:pack`, then
   the bun-less standalone gate `mise run test:pack:standalone`: builds the host
   (linux-x64-gnu) platform package, `npm install`s the launcher + platform
   tarballs with **bun stripped from PATH**, and runs `cospec --version` + a
   real subcommand on Node only. Then `bun pm pack`s `apps/cli` to produce the
   **exact** main tarball `publish` ships, and uploads it as an artifact.
5. **`publish`** — downloads the release archives (`archive-*`) and the eight
   npm tarballs (`npm-*`), generates `SHA256SUMS` over the archives (the
   mise-verifiable release assets), runs `communique` to write
   `RELEASE_NOTES.md` (using `ANTHROPIC_API_KEY_COMMUNIQUE`), creates a
   **draft** GitHub release with the notes + archives + `SHA256SUMS` attached
   (npm tarballs are not attached — they ship to npm), then flips the draft to
   published — by release ID, not by tag, since drafts aren't addressable by tag
   — using a short retry loop (the releases list can lag a moment behind the
   create call). Only after the release is published does it `npm publish` all
   eight packages — authenticated via **trusted publishing (OIDC)** with
   `--provenance`, no npm token — **the seven platform packages first, the main
   package last** — as the job's **last** step: `npm publish` is irreversible (a
   version can never be republished), so nothing fallible runs after it, and
   publishing platforms before the main package means its `optionalDependencies`
   resolve the instant it goes live. Everything reversible — creating and
   publishing the GitHub release — happens first, so a failure anywhere before
   `npm publish` always leaves a clean slate for `cleanup` to roll back. The
   publish step itself is **not atomic** (eight per-package publishes), so it is
   made **idempotent** instead: each publish is guarded by
   `npm view <name>@<version>`, skipping any package already live. A mid-loop
   failure that leaves the first N platform packages published is therefore
   recoverable — a re-dispatch at the same version skips the live packages and
   resumes with the remaining packages + the main launcher.
6. **`cleanup`** — runs only `if: failure()`. It may run after some platform
   packages have already published (the loop is not atomic); deleting the tag +
   release is still safe because the publish loop is idempotent, so a
   re-dispatch at the same version recreates them and resumes only the gaps.
   Best-effort deletes the tag via the REST API (app token) and the release
   (`GITHUB_TOKEN`) — draft or already-published — if either was created. It
   never touches `main` or the bump commit.

## Signed commits without a bypass actor

`main` carries two rulesets:

- **"Protect default branch"** — applies to everyone, no exempt bypass actors,
  and requires signed commits. A plain `GITHUB_TOKEN` `git push` produces an
  unsigned commit and is rejected outright; an SSH deploy-key push is also
  unsigned and would need to be listed as an exempt bypass actor to get through
  — which this ruleset does not allow. GitHub's GraphQL `createCommitOnBranch`
  mutation sidesteps both problems: the resulting commit is authored and signed
  by GitHub itself (shown as "Verified" in the UI, attributed to
  `cospec-release[bot]`), so it satisfies the signed-commit requirement on its
  own, with no bypass actor needed.
- **"Require PRs"** — requires an open, approved PR before a push lands, except
  for the **`cospec-release` GitHub App**, which is configured as an exempt
  bypass actor. The `bump` job mints a short-lived installation token from that
  app and authenticates the mutation with it, so the API-created commit lands
  directly on `main` without opening a PR. (The GitHub Actions integration
  itself cannot be a bypass actor on this org — the ruleset API rejects it with
  a 422 — which is why a dedicated app is used instead of `GITHUB_TOKEN`.)

The `cospec-release` app is an org-owned GitHub App with **Contents:
read-write** permission only, installed on this repo only. Together these mean
the release bump commit needs no deploy key and no PR — only the one-time
repo-settings work: create the app, install it, add variable `RELEASE_APP_ID`
and secret `RELEASE_APP_PRIVATE_KEY`, and list the app as the "Require PRs"
bypass actor.

### CI runs on the bump commit

Because the bump commit is created with the app's installation token — not
`GITHUB_TOKEN` — GitHub's workflow-trigger suppression does not apply (per
GitHub's docs, using "a GitHub App installation access token or a personal
access token instead of `GITHUB_TOKEN`" is exactly how you trigger workflows
from a workflow). `ci.yml` triggers on push to `main`, so the bump commit gets a
normal CI run of its own — an improvement over both the old deploy-key setup and
a hypothetical `GITHUB_TOKEN` path, where the bump commit's CI run would have
been suppressed.

## Required secrets and variables

| name                           | kind     | purpose                                                                       |
| ------------------------------ | -------- | ----------------------------------------------------------------------------- |
| `RELEASE_APP_ID`               | variable | app id of the `cospec-release` GitHub App                                     |
| `RELEASE_APP_PRIVATE_KEY`      | secret   | the app's private key; mints short-lived installation tokens for bump/cleanup |
| `ANTHROPIC_API_KEY_COMMUNIQUE` | secret   | lets `communique` generate AI release notes                                   |

npm publishing needs **no secret**: the `publish` job authenticates via trusted
publishing (OIDC) — see below. (`NPM_TOKEN` has been retired; delete the repo
secret and revoke the token on npm if either still exists.)

`RELEASE_DEPLOY_KEY` has been retired: the bump commit and tag are created via
GitHub's API with the `cospec-release` app token, so no deploy key, and no
bypass-actor entry for one, are needed. See "Signed commits without a bypass
actor" above.

### Setting up the `cospec-release` app

1. Org Settings → Developer settings → GitHub Apps → New GitHub App:
   `cospec-release`, permissions **Contents: read and write** only, no webhooks.
2. Install the app on this repo only.
3. Repo Settings → Secrets and variables → Actions: add the app id as variable
   `RELEASE_APP_ID` and a generated private key as secret
   `RELEASE_APP_PRIVATE_KEY`.
4. Repo Settings → Rules → Rulesets → "Require PRs" → Bypass list → add the
   `cospec-release` app as an exempt bypass actor.

### Setting up `ANTHROPIC_API_KEY_COMMUNIQUE`

Mint a dedicated Anthropic API key for this repo only (never share one across
repos) and add it as the `ANTHROPIC_API_KEY_COMMUNIQUE` repo secret.

## Trusted publishing (OIDC) and provenance

The `publish` job authenticates to npm with **trusted publishing**: the job
carries `permissions: id-token: write`, and `npm publish` (npm ≥ 11.5.1 — the
job asserts this) mints and exchanges a short-lived OIDC token per package on
its own. No `.npmrc`, no `NODE_AUTH_TOKEN`, no long-lived npm token anywhere in
the repo. Every publish also passes `--provenance`, so each package version
ships a signed attestation linking it to this repo, the `release.yml` workflow,
and the exact commit. The flag is technically redundant — trusted publishing
generates provenance automatically — but automatic generation is best-effort and
silently skipped where unsupported (per npm's docs, a private repo still
publishes, just unattested). The explicit flag makes it a hard gate: the publish
fails rather than shipping unattested.

This requires one-time registry-side configuration for **each** of the eight
packages (`@aligned-team/cospec` + the seven `@aligned-team/cospec-<platform>`):
in the package's npm settings, add a **GitHub Actions trusted publisher** with
organization `aligned-team`, repository `cospec`, and workflow filename
`release.yml` (no environment). A package without a trusted publisher fails its
`npm publish` with an auth error; the publish loop is idempotent, so configuring
the missing package and re-dispatching at the same version resumes cleanly.

Note the workflow-filename coupling: renaming `release.yml` breaks publishing
until all eight trusted-publisher entries are updated to the new filename.
