## Why

The public docs site (`apps/docs`) was authored against v0.2.1-era behavior.
main has since shipped v0.3.0, whose only user-facing addition is the
`--store <id>` global flag (store-awareness, #16) — undocumented on the site.
The repo's "docs never drift" rule requires the site to match released behavior
before the next release ships with it still missing.

## What Changes

- Add `apps/docs/concepts/stores.md` — the canonical page for what a store is,
  the root-resolution order, the cospec/OpenSpec ownership split, and the
  unregistered-store error (verbatim, with its exit code).
- Add the new page to the sidebar nav in `apps/docs/.vitepress/config.mts`.
- `apps/docs/reference/commands.md` — add `--store <id>` to the global-flags
  table.
- `apps/docs/reference/configuration.md` — add a short pointer to the `store:`
  config-yaml key under Tier 2, linking to the new Stores page.
- `apps/docs/concepts/how-it-relates-to-openspec.md` — add a short
  store-awareness note near the existing ownership-boundary content, plus a "See
  also" link.
- `apps/docs/guide/workflow.md` — add a one-sentence pointer noting every step
  also accepts `--store <id>`.

## Impact

Readers of the public docs site; no code, schema, or validation-rule changes.
`apps/docs/index.md` is intentionally left untouched (landing page stays
local-repo-focused).
