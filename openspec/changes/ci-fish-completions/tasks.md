# Tasks

## 1. Run the fish completion leg on CI

- [ ] 1.1 Install fish in the `ci-bun` job of `.github/workflows/ci.yml` and
      verify `mise exec -- actionlint` passes
- [ ] 1.2 Add a "required completion shells present" step asserting `bash`,
      `zsh`, and `fish` all resolve, and verify it fails loudly when one is
      absent (dry-run the check locally with a pruned `PATH`)
- [ ] 1.3 Verify on the PR run that `ci-bun` logs no "fish not installed —
      skipping syntax check" warning and the integration suite is green
