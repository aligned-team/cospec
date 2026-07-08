## 1. Switch npm publish to trusted publishing (OIDC)

- [x] 1.1 Add `id-token: write` to the publish job's permissions in
      `.github/workflows/release.yml`
- [x] 1.2 Replace the token-wired setup-node step (drop
      `registry-url`/`NODE_AUTH_TOKEN`) with a Node 24 setup + npm ≥ 11.5.1
      guard
- [x] 1.3 Add `--provenance` to `npm publish` in `publish_if_absent` and retire
      the two TODO comments (provenance, trusted-publishing)
- [x] 1.4 Update the workflow header prose and docs/release.md secrets list to
      reflect OIDC (no NPM_TOKEN)
- [x] 1.5 Verify: actionlint passes on release.yml
