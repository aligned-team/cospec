# Dependencies

## Blocked by

<!-- Changes that MUST be archived before this change can be applied. -->
<!-- Format: - [ ] `change-slug` — what it provides -->
<!-- cospec checks the box and appends *(archived YYYY-MM-DD)* when the dependency ships. -->

None.

## Soft-blocked by

<!-- Changes that improve this one but aren't strictly required. -->
<!-- Format: - [ ] `change-slug` — what degrades without it -->

- [ ] `npm-release-pipeline` — introduced `.github/workflows/release.yml` and
      `docs/release.md`, the files this change reworks. Its tasks are already
      complete and its code is already in the tree; only its own archive is
      still pending. No hard block since this change edits files that already
      exist on disk.
