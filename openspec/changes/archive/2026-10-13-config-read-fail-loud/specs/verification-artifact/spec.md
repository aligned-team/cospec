# Spec Delta

## MODIFIED Requirements

### Requirement: Project-declared layers are read from the config and checked by doctor

cospec SHALL read `verification.layers` from the project's
`openspec/config.yaml` (else `config.yml`) in every gate that validates
verification rows — `validate`, `apply`, `archive` and `sync-specs` — and in the
archive-readiness verdict `status` and `list` report (`archiveReady` and
`verification.blockedReasons`), and SHALL accept a row whose layer token is one
of them. An entry MAY be spelled with or without a leading `@`. A missing config
SHALL yield no extra layer. A config that exists but cannot be read or does not
parse as YAML SHALL NOT be read as no config: cospec SHALL print the wrapped
binary's own `Warning: could not parse <path> (<detail>); ignoring it.` line on
stderr once per invocation, and every ledger those gates and that verdict
validate SHALL fail with a `verification/config-unreadable` ERROR naming the
file and the cause, in place of any `verification/layer-unknown` (the vocabulary
is unknown, so no row is judged outside it). A `verification` that is not a
mapping, a `layers` that is not a list, and an entry that is not a non-empty
string without whitespace SHALL yield no extra layer for that entry and SHALL
NOT fail the gate. `cospec doctor` SHALL emit a `config` WARNING when
`verification.layers` is present but malformed in any of those ways, and SHALL
report a config it cannot read as unreadable, naming the error code, rather than
as one that does not parse. The `verification/layer-unknown` hint SHALL name the
declared layers when there are any.

#### Scenario: A declared layer passes every gate, an undeclared one still fails

- **WHEN** `openspec/config.yaml` declares `verification.layers: [uat]` and one
  row names `@uat` and another `@staging`
- **THEN** `cospec validate --strict` emits no `verification/layer-unknown` for
  the `@uat` row and emits it for the `@staging` row, and `cospec apply` and
  `cospec archive` clear their validation gate for a change whose rows name only
  `@uat`

#### Scenario: Every YAML spelling of a declared layer is accepted

- **WHEN** the config declares `uat` as a block list, a flow list, or with a
  leading `@` (`"@uat"`)
- **THEN** a row naming `@uat` is accepted in each case

#### Scenario: A malformed declaration is ignored by gates and warned by doctor

- **WHEN** the config's `verification:` is a scalar, or `layers:` is a mapping
  or scalar, or an entry is a number or contains whitespace
- **THEN** gates add no layer for it and do not crash, and `cospec doctor`
  reports a `config` WARNING naming the malformed key

#### Scenario: status and list agree with validate and archive on a declared layer

- **WHEN** the config declares `verification.layers: [uat]` and a `fix` change
  whose tasks are done and whose gate is clear has resolved rows only, one of
  them a `[x]` or `[~] ... -> defer: <reason>` row naming `@uat`
- **THEN** `cospec status <slug> --json` reports `archiveReady: true` with an
  empty `verification.blockedReasons`, `cospec list --json` reports
  `archiveReady: true` for the change, `cospec validate <slug> --strict` passes,
  and `cospec archive <slug>` moves the change; without the declaration,
  `status` and `list` report `archiveReady: false` and `status` names
  `verification/layer-unknown` in `verification.blockedReasons`

#### Scenario: A config that cannot be read or parsed fails loud

- **WHEN** `openspec/config.yaml` declares `verification.layers: [uat]` but does
  not parse as YAML, or `openspec/config.yaml` is a directory, and a `fix`
  change whose tasks are done and whose gate is clear has a resolved row naming
  `@uat`
- **THEN** stderr carries
  `Warning: could not parse <path> (<detail>); ignoring it.`,
  `cospec validate <slug> --strict` exits 1 with
  `verification/config-unreadable` naming the file and no
  `verification/layer-unknown`, `cospec archive <slug>` refuses and leaves the
  change in place, `cospec status <slug> --json` reports `archiveReady: false`
  with the `verification/config-unreadable` reason in
  `verification.blockedReasons`, `cospec list --json` reports
  `archiveReady: false`, and `cospec doctor` reports the directory as a config
  it could not read (`EISDIR`)
