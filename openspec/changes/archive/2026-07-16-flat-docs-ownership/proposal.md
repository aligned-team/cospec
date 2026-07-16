## Why

The flat topic docs in `docs/` (validation.md, apply-archive.md, schemas.md,
stores.md, blocking-changes.md, harness-integration.md, architecture.md) heavily
restate facts now owned by pages on the public docs site (`apps/docs`, published
at https://cospec.aligned.team) — rule tables, exit-code tables, artifact
matrices, and command semantics. Per the repo's one-owner convention, each fact
should live on exactly one page; everywhere else links to it. This duplication
is a drift risk: the site and the flat docs will diverge the next time either is
updated in isolation.

## What Changes

- `docs/apply-archive.md` — replace the duplicated exit-code table, step-by-step
  gate walkthrough, and JSON shape with a short summary and a link to
  `/concepts/apply-and-archive` on the site; keep the "gate enforced twice"
  rationale and the `sync-blockers` pointer to `core/blockers.ts`.
- `docs/validation.md` — replace the full rule registry tables with a link to
  `/reference/validation-rules`; keep the composition/delegation logic
  (`runChangeRules()` wiring) as repo-internal detail.
- `docs/schemas.md` — replace the artifact matrix, `## Surfaces` block, and
  per-type rationale with a link to `/concepts/types-and-artifacts` and
  `/concepts/verification`; keep canon pointers
  (`apps/cli/src/canon/types/*.yaml`, `type-facts.ts`, the matrix-parity test)
  and the customization-tier escape-hatch mechanics not covered at that depth on
  the site.
- `docs/stores.md` — replace the near-verbatim duplicate of `/concepts/stores`
  with a short summary and a link.
- `docs/blocking-changes.md` — replace the template/example walkthrough with a
  link to `/concepts/blocking-changes`; keep the entry-grammar regex and the
  `core/blockers.ts` single-parser pointer, which aren't on the site.
- `docs/harness-integration.md` — replace the "what gets written" file tree and
  the smoke-test checklist with a link to `/guide/harness-setup`; keep the
  per-workflow behavior descriptions (canon `workflows/*.md` semantics) and the
  managed-file `writeManaged` pseudocode, which are contributor-facing detail
  the site doesn't carry.
- `docs/architecture.md` — trim the introductory failure-mode explanations that
  duplicate `/concepts/how-it-relates-to-openspec`, replacing them with a link;
  keep the wrapped-call discipline mechanics, the static-matrix invariant, and
  the module map, none of which are on the site.
- `docs/eval.md`, `docs/self-hosting.md`, `docs/release.md` — audited, no
  site-owned facts found; left unchanged.
- Check `.agents/shared.md` / `CLAUDE.md` for references to the flat docs whose
  meaning would change; none of the current cross-references break.

## Impact

Contributors reading `docs/*.md` for entry-point orientation; no code changes.
`apps/docs` content is untouched. Cross-links from `docs/*.md` into `apps/docs`
pages are new; existing inbound references from CLAUDE.md and
`.agents/shared.md` to these files remain valid.
