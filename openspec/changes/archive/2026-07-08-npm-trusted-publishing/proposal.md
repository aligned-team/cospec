# npm-trusted-publishing

## Why

All eight `@aligned-team/cospec*` packages are live on npm and the repo is now
public, so the release pipeline can drop the long-lived `NPM_TOKEN` secret in
favor of npm trusted publishing (OIDC), which also enables provenance
attestations — resolving both standing TODOs in `release.yml`.

## What Changes

- `.github/workflows/release.yml` — publish job: add `id-token: write`, remove
  `NODE_AUTH_TOKEN`/`registry-url` token wiring, ensure npm ≥ 11.5.1
  (trusted-publishing minimum), add `--provenance` to every `npm publish`, and
  retire the two TODO comments.

## Impact

- Workflow: `release.yml` publish job only (version/bump/build/stage-npm/cleanup
  untouched).
- Secrets: `NPM_TOKEN` no longer read; deletable from repo secrets after the
  first successful OIDC release.
- External contract: npm trusted-publisher config (org `aligned-team`, repo
  `aligned-team/cospec`, workflow `release.yml`) must exist for EACH of the 8
  packages before the next release dispatch — configured manually on npmjs.com
  (step 1, done by Imogen).

## Surfaces

<!-- Check every surface this change touches; each drives a verification/design expectation (soft). -->

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [x] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [x] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
