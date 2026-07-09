## 1. Schema fork/init command wiring

- [x] 1.1 In `apps/cli/src/commands/schema.ts`, remove `fork`/`init` from
      `CANON_MANAGED_SUBCOMMANDS` and add them to the wrapped-subcommand set so
      both route through `runPassthrough`.
- [x] 1.2 Add a guard that computes the destination schema name (fork:
      `[name] || <source>-custom`; init: `<name>`) and refuses with exit 1 and
      guidance, before calling `runPassthrough`, when that name is in
      `COSPEC_TYPES`.
- [x] 1.3 Remove the old "edit the canon and run `mise run generate`" block
      message (no longer reachable for `fork`/`init`).
- [x] 1.4 Unit/integration test: fork/init success cases create a project schema
      dir + `schema.yaml` on disk; a reserved-name fork/init case (e.g.
      `cospec schema init feat`) exits 1 with no write to the canon `feat/`
      directory.

## 2. `cospec new` legacy-schema delegation

- [x] 2.1 In `apps/cli/src/commands/new.ts`, after the `!isCospecType(type)`
      check, call `resolveSchema(base, type)`; when `kind === 'legacy'`,
      delegate to `openspec new change <slug> --schema <type>`, verify the
      written `.openspec.yaml` schema pointer, skip the `stampSchemaVersion`
      call and the typed artifact-plan output, and print the reduced-guarantees
      note.
- [x] 2.2 Confirm a name that is neither a cospec type nor a resolvable legacy
      schema still returns `reportUnknownType`.
- [x] 2.3 New integration test: `cospec new <legacy-schema> <slug>` against a
      forked schema created in task 1 — asserts the schema pointer, absence of
      `schemaVersion`, and the printed note.

## 3. Correct stale customization guidance

- [x] 3.1 `apps/cli/src/core/schema-compose.ts:417` — change the composed header
      to `cospec schema fork <type> <name>`.
- [x] 3.2 `apps/cli/src/core/rules/meta.ts:125` — change the unknown-type hint
      to name `cospec schema fork` instead of bare `openspec schema fork`.
- [x] 3.3 `apps/cli/src/commands/doctor.ts:320` — change the legacy-schema
      remedy to name `cospec schema fork` instead of bare
      `openspec schema fork`.
- [x] 3.4 `mise run generate` — regenerate all 11 canon `schema.yaml` files
      (header text changes); refresh
      `apps/cli/test/unit/schemas/golden/*.schema.yaml` to match;
      `mise run generate:check` must be clean.

## 4. Legacy-lane lifecycle contract test

- [x] 4.1 New contract test (real pinned binary): a forked schema flows `new` →
      `validate` → `apply` → `archive` on the legacy lane — asserts
      OpenSpec-delegated validation of the fork's own artifact graph, cospec's
      schema-agnostic hard gates (tasks, scenario-preservation, filesystem-move)
      still apply, and no cospec-typed rule (proposal/_, verification/_, etc.)
      fires for it.
- [x] 4.2 `doctor` test: a fork resolves as legacy INFO (not WARNING/ERROR) and
      `mise run generate:check` does not flag the fork's directory as drift.

## 5. No-regression proof for the 11 canon types

- [x] 5.1 Confirm every typed rule ID (proposal/_, verification/_, design/\*,
      meta/forbidden-artifact, change/artifact-missing, meta/surface-unmet)
      still fires on a canon-type change — run the existing rule-engine unit
      suite unmodified and green.
- [x] 5.2 Confirm `apply` exit 2/3 blocker/missing-artifact gates are unchanged
      for canon types — run the existing apply contract/integration suites
      unmodified and green.
- [x] 5.3 Confirm archive's verification-incomplete, scenario-preservation,
      tasks, and filesystem-move gates are unchanged for canon types — run the
      existing archive contract suite unmodified and green.
- [x] 5.4 Confirm the `generate`/drift engine still tracks only the 11 canon
      paths (fork dirs are never tracked, never clobbered, never flagged) and
      that the destination-name guard blocks forking over any canon name.
- [x] 5.5 Confirm `cospec doctor`'s schema-version check still iterates only
      `isCospecType` changes (unaffected by legacy-schema changes, which never
      carry a `schemaVersion`).
- [x] 5.6 Run `matrix-parity` and `schema-versioning` test suites unmodified and
      confirm they still pass (canon behavior untouched).

## 6. docs/schemas.md and shared.md

- [x] 6.1 Update `docs/schemas.md` tier 3 (Customization tiers) to document
      `cospec schema fork/init`, the reserved-name guard, the legacy lane's
      guarantees (openspec-delegated structural validation of the fork's own
      artifact graph; cospec's schema-agnostic hard gates; no typed proposal/
      verification/surface/blocker gate), and the template gap (config.yaml
      context/rules cannot override templates or replace instructions — only a
      fork can).
- [x] 6.2 Fix `docs/schemas.md:24` and `:195` (stale/contradictory references to
      fork/init being unsupported or bare-openspec).
- [x] 6.3 Update `.agents/shared.md`'s customization summary to match, then run
      `mise run agents:sync`; verify with `mise run agents:check`.

## 7. apps/docs (public site) parity with PR #19

- [x] 7.1 `apps/docs/concepts/stores.md` — replace the "stays OpenSpec's job"
      claim for `store setup/register/unregister/remove/list/ls/doctor`,
      `context`, and `workset` with the first-class-wrap/passthrough reality;
      document `store setup`/`register`'s auto `cospec init --harness none` and
      the `--no-cospec-init` opt-out; update the `## Setup` walkthrough to the
      one-step flow.
- [x] 7.2 `apps/docs/concepts/how-it-relates-to-openspec.md` — fix the "store
      lifecycle stays OpenSpec's job" sentence to the reversed split, linking to
      `stores.md` for mechanics.
- [x] 7.3 `apps/docs/reference/commands.md` — add rows for `store`, `context`,
      `workset`, `show`, `view`, `schemas`, `schema`, `templates`; add `--specs`
      to `list`'s key-flags cell; add a "Read-only and personal commands"
      subsection explaining the disciplined-passthrough guarantee for
      `show`/`view`/`context`/`schemas`/`schema`/`templates`/`workset`/
      `list --specs`.
- [x] 7.4 `apps/docs/reference/commands.md`'s `doctor` row — add the delegated
      relationship/store-health sentence; `apps/docs/concepts/stores.md` — add
      the cross-reference near its existing `cospec store doctor` mention.
- [x] 7.5 `mise run docs:build` — confirm the public site builds clean (no
      broken links/frontmatter) after all `apps/docs` edits.

## 8. Final gate

- [x] 8.1 Run `mise run check` (full CI gate: lint, format, typecheck, unit,
      contract, integration, pack smoke, generate:check, agents:check) and fix
      any failure. Never bypass with `--no-verify`.
