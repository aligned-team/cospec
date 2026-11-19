# Proposal

## Why

cospec stamps every change's `.openspec.yaml` with a bare `schemaVersion` key.
OpenSpec 1.14 started reporting any top-level `.openspec.yaml` key it does not
know as unrecognized, and reserved keys with a lowercase `x-` prefix for tool
metadata. Under OpenSpec 1.15.0 a plain `openspec validate --strict` therefore
warns on, and fails, every change cospec creates.

The pinned 1.13.1 binary does not report it yet, so nothing is visibly broken
today. But the stamp is written into every change cospec ever creates and
archives, so the key has to move before the pin does. Renaming it here, on its
own and on the current pin, means the later parity bump can rely on it.

## What Changes

- `cospec new` and `cospec migrate` write the stamp as `x-cospec-schema-version`
  instead of `schemaVersion`.
- A change that still carries `schemaVersion` keeps working: cospec reads the
  legacy key as an equal fallback (the `x-` key wins when both are present), so
  grandfathering is unchanged.
- `cospec migrate <slug>` rewrites the legacy key as `x-cospec-schema-version`,
  in place, even on a change that is already at the current version (nothing
  else is touched, and no `verification.md` is scaffolded for it).
- `cospec doctor` lists every active change still carrying the legacy key under
  its `schema-version` check, naming `cospec migrate <slug>`.
- `meta/openspec-yaml` accepts either key and rejects a non-integer value under
  either; its message names both.
- Spec wording that named the old key is corrected where the stamp is described
  (`schema-versioning`, `schema-customization`, `upstream-command-spellings`).
- This change does not accept `x-` keys that users write, add a rule that
  reports unknown keys, or move the OpenSpec pin: that is the 1.15.0 parity
  change's work.

## Capabilities

### New Capabilities

### Modified Capabilities

- `schema-versioning`: the change stamp moves to `x-cospec-schema-version`
  (legacy `schemaVersion` read as fallback, rewritten by `migrate`, listed by
  `doctor`), so bare `openspec validate --strict` passes on cospec changes.
- `schema-customization`: a change on a legacy (forked) schema carries neither
  stamp key.
- `upstream-command-spellings`: a `new change` created on a config-default
  cospec type carries `x-cospec-schema-version: 2`.

## Impact

- Stack: this change sits on `shorten-long-requirements` (`main <- B <- A`). Its
  MODIFIED blocks for schema-customization and upstream-command-spellings are
  written against that change's shortened text, so it is soft-blocked by it.
- `apps/cli/src/core/change-metadata.ts` (the two key constants),
  `apps/cli/src/core/change.ts` (`rawSchemaVersionStamp`, `legacyStamp`),
  `commands/new.ts`, `commands/migrate.ts`, `commands/doctor.ts`,
  `commands/validate.ts`, `core/rules/meta.ts`, `core/rules/schema-info.ts`.
- Tests: the integration schema-versioning suite, a new unit test for the stamp,
  and the contract and unit fixtures that wrote `schemaVersion: 2`.
- Docs: `apps/docs` (types-and-artifacts, commands, validation-rules,
  configuration), `docs/architecture.md`, `docs/schemas.md`, `README.md`, and
  `.agents/shared.md` with its synced `CLAUDE.md` and `AGENTS.md`.
- Existing changes and archived changes are not rewritten; the legacy key stays
  readable indefinitely.

## Surfaces

- [ ] interactive — a CLI-UX surface (not touched: no output format changes)
- [ ] deploy
- [ ] integration
- [ ] agent-behavior
