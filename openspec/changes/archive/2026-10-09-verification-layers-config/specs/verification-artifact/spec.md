# Spec Delta

## ADDED Requirements

### Requirement: Project-declared layers are read from the config and checked by doctor

cospec SHALL read `verification.layers` from the project's
`openspec/config.yaml` (else `config.yml`) in every gate that validates
verification rows — `validate`, `apply`, `archive` and `sync-specs` — and SHALL
accept a row whose layer token is one of them. An entry MAY be spelled with or
without a leading `@`. A missing or unparseable config, a `verification` that is
not a mapping, a `layers` that is not a list, and an entry that is not a
non-empty string without whitespace SHALL yield no extra layer for that entry
and SHALL NOT fail the gate. `cospec doctor` SHALL emit a `config` WARNING when
`verification.layers` is present but malformed in any of those ways. The
`verification/layer-unknown` hint SHALL name the declared layers when there are
any.

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
