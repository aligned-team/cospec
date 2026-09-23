# Tasks

## 1. Run the fish completion leg on CI

- [x] 1.1 Install fish in the `ci-bun` job of `.github/workflows/ci.yml` and
      verify `mise exec -- actionlint` passes -> apt-installed fish in `ci-bun`;
      `mise exec -- actionlint .github/workflows/ci.yml` exit 0, no findings
- [x] 1.2 Add a "required completion shells present" step asserting `bash`,
      `zsh`, and `fish` all resolve, and verify it fails loudly when one is
      absent (dry-run the check locally with a pruned `PATH`) -> step added;
      dry-run with fish pruned from PATH exits 1, stderr names `fish` as the
      missing shell
- [x] 1.3 Verify on the PR run that `ci-bun` logs no "fish not installed —
      skipping syntax check" warning and the integration suite is green ->
      confirmed locally (`brew install fish` then
      `bun test apps/cli/test/integration/completion.test.ts`: 16 pass, 0 fail,
      no skip warning); the `ubuntu-latest` `ci-bun` run itself is the
      authoritative confirmation, recorded in verification.md 1.1/1.2
