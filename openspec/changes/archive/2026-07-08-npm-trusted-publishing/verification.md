## 1. Workflow is well-formed after the OIDC edit [critical]

- [x] 1.1 @unit (agent) actionlint on .github/workflows/release.yml -> zero findings (`mise exec -- actionlint`, exit 0, 2026-07-07)
- [x] 1.2 @unit (agent) grep release.yml for NPM_TOKEN / NODE_AUTH_TOKEN / registry-url -> no functional references remain; sole match is the comment explaining their absence (line 620)

## 2. OIDC publish works in the real runner

- [~] 2.1 @runtime (human) dispatch the Release workflow on GitHub Actions (ubuntu-latest) after trusted publishers are configured for all 8 packages -> defer: requires a real post-merge release dispatch; cannot run pre-merge (publish is irreversible). Imogen dispatches the next release after configuring trusted publishers on npm.
- [~] 2.2 @integration (agent) after that release, `npm view @aligned-team/cospec dist.attestations --json` against the real registry -> defer: depends on 2.1's release existing; run as post-release check.
