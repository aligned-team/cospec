# schema-customization Specification

## Purpose

Let cospec resolve, guard, and delegate project-local ("legacy") OpenSpec
schemas so teams can extend the workflow beyond the 11 canon conventional-commit
types without leaving the `cospec` CLI. `cospec schema fork`/`init` create a
legacy schema (refusing only a destination name that collides with a canon
type), and `cospec new <legacy-schema> <slug>` runs a change on one — down the
legacy lane, which keeps every schema-agnostic hard gate and delegates
structural validation to OpenSpec, while scoping out the cospec-typed gates the
11 canon types rely on. All customization guidance routes through `cospec`,
never bare `openspec`.

## Requirements

### Requirement: Schema fork and init are disciplined passthroughs

`cospec schema fork <type> [name]` and `cospec schema init <name>` SHALL be
routed through the same disciplined-passthrough runner as
`cospec schema which`/`validate` (deny-list + exit-code discipline), rather than
refusing at exit 1. A successful fork or init SHALL create a project-local
`openspec/schemas/<name>/schema.yaml` on disk that `resolveSchema` classifies as
`kind: 'legacy'`.

#### Scenario: Fork creates a legacy schema

- **WHEN** `cospec schema fork feat my-custom` runs in a repo with an
  `openspec/` directory
- **THEN** `openspec/schemas/my-custom/schema.yaml` exists on disk and
  `resolveSchema(cwd, 'my-custom').kind` is `'legacy'`

#### Scenario: Init creates a legacy schema

- **WHEN** `cospec schema init my-workflow` runs in a repo with an `openspec/`
  directory
- **THEN** `openspec/schemas/my-workflow/schema.yaml` exists on disk and
  `resolveSchema(cwd, 'my-workflow').kind` is `'legacy'`

### Requirement: Reserved canon names are refused before spawning

Before invoking the wrapped `openspec schema fork`/`init` binary, cospec SHALL
compute the destination schema name (fork: the explicit `[name]` argument if
given, else `<source>-custom`; init: the explicit `<name>` argument) and SHALL
refuse with exit 1 and guidance, without spawning the wrapped binary or creating
any directory, if that name is one of the 11 `COSPEC_TYPES`.

#### Scenario: Fork refuses a canon-type destination

- **WHEN** `cospec schema fork chore feat` runs (explicit destination `feat`)
- **THEN** cospec exits 1, prints guidance naming `feat` as canon-managed, and
  `openspec/schemas/feat/` is not created or modified on disk

#### Scenario: Fork refuses its own default canon-collision

- **WHEN** `cospec schema fork feat` runs with no explicit name (default
  destination `feat-custom`, which is not a canon name)
- **THEN** the fork proceeds — the guard only refuses when the resolved
  destination name is exactly one of the 11 `COSPEC_TYPES`

#### Scenario: Init refuses a canon-type destination

- **WHEN** `cospec schema init feat` runs
- **THEN** cospec exits 1, prints guidance naming `feat` as canon-managed, and
  the existing `openspec/schemas/feat/schema.yaml` (canon-composed) is
  unmodified

### Requirement: `cospec new` accepts resolvable legacy schemas

`cospec new <name> <slug>` SHALL, when `<name>` is not one of the 11 cospec
types, check `resolveSchema(base, <name>).kind`. When it resolves to `'legacy'`,
`cospec new` SHALL delegate to `openspec new change <slug> --schema <name>`,
verify the written `.openspec.yaml` schema pointer, SHALL NOT stamp a cospec
`schemaVersion`, SHALL NOT print the typed artifact-plan output, and SHALL print
a note that the change carries reduced cospec guarantees (structural checks and
openspec-delegated validation only). A name that is neither a cospec type nor a
resolvable legacy schema SHALL still produce today's unknown-type error.

#### Scenario: New change on a legacy schema

- **WHEN** `cospec new my-custom some-slug` runs and `my-custom` resolves as
  `kind: 'legacy'`
- **THEN** `openspec/changes/some-slug/.openspec.yaml` has `schema: my-custom`,
  has no `schemaVersion` field, and cospec prints a reduced-guarantees note
  instead of the typed artifact plan

#### Scenario: New change on an unresolvable name still errors

- **WHEN** `cospec new totally-unknown some-slug` runs and `totally-unknown`
  resolves as `kind: 'unknown'`
- **THEN** cospec exits 1 with the existing unknown-type error and does not
  create a change

### Requirement: Customization guidance routes through cospec

Every surface that advises schema customization SHALL name a `cospec` command,
never bare `openspec`, and SHALL be accurate for npm consumers who have no canon
to edit: the composed `schema.yaml` header, the `meta/openspec-yaml`
unknown-type hint, and the `doctor` legacy-schema remedy SHALL each say
`cospec schema fork <type> <name>`.

#### Scenario: Composed schema header names cospec

- **WHEN** any of the 11 canon `schema.yaml` files is regenerated via
  `mise run generate`
- **THEN** its header comment says `cospec schema fork <type> <name>` and does
  not say `openspec schema fork`

#### Scenario: Doctor remedy names cospec

- **WHEN** `cospec doctor` reports a legacy-schema change
- **THEN** its remedy text says `cospec schema fork` and does not say bare
  `openspec schema fork` or "edit the canon"
