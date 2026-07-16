## Why

A documentation accuracy audit against the published `0.5.2` release found stale
"publishing soon" language, out-of-date version pins in examples, and a missing
install method (mise) on the docs site that both READMEs already lead with.

## What Changes

- Remove the stale "Publishing soon" parentheticals from `README.md` and
  `apps/cli/README.md` — the package is published.
- Bump stale `@0.4.0` example pins to `@0.5.2` in `README.md`,
  `apps/cli/README.md`, and `docs/release.md`.
- Update the illustrative version in `docs/harness-integration.md` to a
  version-placeholder form consistent with current usage.
- Add a "Via mise" install subsection (first, before package managers) to
  `apps/docs/guide/installation.md`, including the `minimum_release_age`
  cooldown caveat and exact-pin workaround.
- Add a mise tab (first) to the quickstart code-group in `apps/docs/index.md`.

## Impact

Readers of the root and CLI READMEs, and the public docs site
(https://cospec.aligned.team) installation and quickstart pages. No code,
schema, or workflow changes.
