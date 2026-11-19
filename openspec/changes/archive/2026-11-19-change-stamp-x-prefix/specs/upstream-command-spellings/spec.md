# Spec Delta

## MODIFIED Requirements

### Requirement: new change is upstream's create spelling

`cospec new change <name> [--schema <s>] [--description <text>] [--goal <text>]`
SHALL create change `<name>`. `--schema` SHALL name a cospec type or legacy
schema, checked as on `cospec new <type> <name>`; absent or `''`, the wrapped
call SHALL get none, so the binary resolves the config default (else
`spec-driven`), and the type SHALL be the `schema:` it writes. An unresolvable
schema SHALL get the binary's refusal, nothing written.

#### Scenario: The key oracle agrees

- **WHEN** `cospec new change foo --schema feat --json` and
  `openspec new change foo --schema feat --json` run in two copies of the same
  cospec-initialised root
- **THEN** every key of the binary's document is present in cospec's with a
  value of the same type, `change.id` is `foo`, `change.schema` is `feat`, and
  `type`, `dir` and `artifacts` sit beside them

#### Scenario: The config default schema applies

- **WHEN** `cospec new change foo` runs in a root whose `config.yaml` says
  `schema: feat`
- **THEN** `openspec/changes/foo/.openspec.yaml` says `schema: feat` and carries
  `x-cospec-schema-version: 2`

#### Scenario: An empty --schema is no --schema

- **WHEN** `cospec new change foo --schema ''` runs in a cospec root and in an
  upstream-initialised root
- **THEN** each creates `foo` with the schema the binary creates there (`feat`,
  `spec-driven`), exit 0

#### Scenario: A config upstream cannot use falls back with its warning

- **WHEN** `cospec new change foo` (or with `--json`) runs where `config.yaml`
  is unparseable, not a YAML object, empty, or says `schema: 42` / `schema: ""`
- **THEN** stderr carries the binary's warning line for that config, `foo` is
  created on `spec-driven`, exit 0, and under `--json` stdout is one document
  whose `change` equals the binary's

#### Scenario: The binary's field warnings reach stderr

- **WHEN** `cospec new change foo` (or with `--json`) runs where `config.yaml`
  has an invalid `context:`, `rules:`, `operations:`, `references:`, `store:` or
  `githubCopilot:` field
- **THEN** cospec's stderr is the binary's stderr for the same argv under
  `--json`, `foo` is created on `spec-driven`, exit 0

#### Scenario: A whitespace-only schema is the binary's refusal

- **WHEN** `cospec new change foo` (or with `--json`) runs where `config.yaml`
  says `schema: "  "`
- **THEN** it exits 1 with `cospec new: Unknown schema '  '. Available: …` (or,
  under `--json`, the binary's own `{change: null, status}` document), and the
  tree is unchanged

#### Scenario: An unknown --schema leaves nothing behind

- **WHEN** `cospec new change foo --schema nope` runs, with or without `--json`
- **THEN** it exits 1 and the tree is unchanged

#### Scenario: The goal is stored

- **WHEN** `cospec new change foo --goal "ship it"` runs
- **THEN** `.openspec.yaml` holds `goal: ship it`

#### Scenario: A removed option gets upstream's explanation

- **WHEN** `cospec new change foo --initiative x` runs
- **THEN** stderr is upstream's `--initiative is no longer supported. …`
  message, exit 1, and no change directory exists
- **AND WHEN** `cospec new change foo --areas x --json` runs
- **THEN** stdout is one document whose status code is `areas_option_removed`

#### Scenario: The written schema is the change's type

- **WHEN** `cospec new change <name>` runs without `--schema`
- **THEN** the change's type is the `schema:` read back from the
  `.openspec.yaml` the binary writes, which equals its document's
  `change.schema`

#### Scenario: The goal is stored on both spellings

- **WHEN** `--goal <text>` is given to `cospec new change <name>` or to
  `cospec new <type> <slug>`
- **THEN** it is stored as `goal:` in the change's `.openspec.yaml`

#### Scenario: Every dropped-field warning reaches stderr as written

- **WHEN** the binary warns on stderr that it drops a config field — a config it
  cannot read or parse, one that is not a YAML object, a `schema:` that is not a
  non-empty string (each falling back to `spec-driven`), or an invalid
  `context:`, `rules:` (or empty rule strings), `operations:`, `references:`,
  `store:` or `githubCopilot:`
- **THEN** the warning reaches cospec's stderr as written, in text and under
  `--json` alike, with stdout staying one document

#### Scenario: An unusable config default is the binary's refusal

- **WHEN** the config's `schema:` default is whitespace-only or names a cospec
  type the repo has no schema for
- **THEN** cospec answers with the binary's own refusal and writes nothing

#### Scenario: Removed options are refused first and hidden

- **WHEN** `--initiative <x>` or `--areas <x>` is given
- **THEN** before any other action-level check it is refused with upstream's
  removed-option message on stderr, or under `--json` its
  `{change: null, status: [...]}` document carrying code
  `initiative_option_removed` or `areas_option_removed`, exit 1, and neither
  option appears in `--help` or completion

#### Scenario: The JSON document carries upstream's change and root

- **WHEN** `cospec new change <name> --json` or
  `cospec new <type> <slug> --json` runs
- **THEN** the first emits upstream's `change {id, path, metadataPath, schema}`
  and `root` from the wrapped call's own document, with cospec's `type`, `dir`
  and `artifacts` beside them; the second keeps `change: <slug>` and gains the
  same `root`
