## ADDED Requirements

### Requirement: Store group refusals and diagnostics are the binary's, spelled through cospec

`cospec store` with a missing, unknown or option-shaped subcommand, or a
subcommand after a `--`, SHALL delegate the user's argv (the `--` kept) to the
wrapped `openspec store`, threading `--json` when the caller asked for it, and
SHALL relay the binary's answer with its sentences spelled through cospec from
the pinned binary's allowlist: under `--json`, exactly one document whose
`status[0]` is the binary's `unknown_store_subcommand` diagnostic; otherwise the
binary's `Error: …` text, its lifecycle example spelled as the cospec command of
the same shape. Every diagnostic `cospec store` prints from a wrapped call's
document — the `status[]` of a mutation, cleanup, list or doctor payload and
each `stores[].status[]` — SHALL have its `fix` spelled through cospec, and on a
failed call its `message` too, in the text rendering and in the relayed `--json`
document alike, every other field unchanged. A `--cwd` that is not a directory
SHALL be answered with the resolver's `directory not found` refusal before
anything is spawned.

#### Scenario: An unknown store subcommand is one document

- **WHEN** `cospec store bogus --json`, `cospec store --json` or
  `cospec store --bogus --json` runs
- **THEN** stdout is exactly one JSON document whose `status[0].code` is
  `unknown_store_subcommand`, whose message names `cospec store`, and whose
  other fields equal the binary's for the same argv, exit 1

#### Scenario: An unknown store subcommand's text names cospec

- **WHEN** `cospec store new change x` runs
- **THEN** stderr is the binary's refusal with
  `Error: unknown command 'new' for 'cospec store'.` and the example
  `cospec new <type> x --store <id>`, exit 1

#### Scenario: A store diagnostic's fix names cospec

- **WHEN** `cospec store doctor <unregistered-id>` runs, text and `--json`
- **THEN** the fix reads `Run cospec store list to see registered stores.`, the
  code, target and message are the binary's, and the exit code is 1

#### Scenario: A missing working directory is refused before spawning

- **WHEN** `cospec store list --cwd <path>` runs and `<path>` does not exist
- **THEN** stderr is `cospec: directory not found: <path>`, the exit code is 1,
  and no wrapped call is made
