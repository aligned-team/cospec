# Spec Delta

## MODIFIED Requirements

### Requirement: Verification artifact grammar and location

cospec SHALL define a machine-parsed `verification` artifact generating
`verification.md` at the change root, never under a `specs/` directory, parsed
with the checkbox lexer: groups `## <N>. <behavior description>` with optional
trailing `[critical]`, and rows
`- [<state>] <N>.<M> @<layer> [(<owner>)] <probe> -> <result>` where `<state>`
is a space (planned), `x` (verified), or `~` (deferred). That row form SHALL
stay the single canonical form.

#### Scenario: Well-formed verification file parses

- **WHEN** `cospec validate` runs on a change whose `verification.md` has at
  least one group, each group has at least one grammatical row, and every row
  names a known layer
- **THEN** no `verification/*` issue is emitted for that file

#### Scenario: Missing declared verification file

- **WHEN** a change's schema declares `verification` in `apply.requires` but no
  `verification.md` exists at the change root
- **THEN** cospec emits `verification/missing`

#### Scenario: Structure requires at least one group and row

- **WHEN** `verification.md` has zero groups, or a group with zero rows
- **THEN** cospec emits `verification/structure`

#### Scenario: Malformed row fails the grammar

- **WHEN** a row line cannot be parsed into the state, number, layer, optional
  owner, probe, and `->` result shape
- **THEN** cospec emits `verification/row-grammar` with the offending line

#### Scenario: Verification file is never placed under specs/

- **WHEN** the artifact table resolves the `generates` path for `verification`
- **THEN** the path resolves to the change root and no segment is literally
  `specs`, so the pinned openspec binary's hardcoded `CHANGE_NO_DELTAS` rule —
  behavior cospec has relied on since 1.3.1 — is never tripped

#### Scenario: A non-canonical list marker is reported, not dropped

- **WHEN** `verification.md` contains a row written
  `+ [ ] 1.1 @unit probe -> result` or `1. [ ] 1.1 @unit probe -> result`
- **THEN** cospec emits `verification/row-grammar` for that line, and the
  archive verdict counts it as a blocker instead of reporting `0/0 verified`

#### Scenario: A markdown link bullet is not a verification row

- **WHEN** `verification.md` contains the line `- [Some doc](./doc.md)`
- **THEN** no `verification/row-grammar` issue is emitted for that line

#### Scenario: Every CommonMark list marker is detected

- **WHEN** a checkbox-like row uses `*`, `+`, `<N>.` or `<N>)` as its marker
- **THEN** it is reported as `verification/row-grammar` rather than dropped from
  the parse

#### Scenario: A bracket followed by a link target is not a row

- **WHEN** a line's bracketed span is immediately followed by `(` or `[`
- **THEN** it is read as a markdown link, not a checkbox, and not reported

### Requirement: Per-type required-row facts

With `verification` enforced, cospec SHALL require: `feat`, a non-`@unit` row in
each `[critical]` group (`verification/critical-real-layer`); `fix`, a
`@regression` row (`verification/reproduces-bug`); `perf`, a `@benchmark` and an
`@equivalence` row (`verification/equivalence`); `refactor`, an `@equivalence`
row (`verification/invariant`); soft-promoted `revert`/`build`/`ci`, a
real-layer row (`verification/deploy-real-layer`: `@runtime` for `build`/`ci`,
any layer for `revert`).

#### Scenario: feat critical group without a real layer

- **WHEN** a `feat` change has a `[critical]` group whose only row is `@unit`
- **THEN** cospec emits `verification/critical-real-layer`

#### Scenario: fix without a regression row

- **WHEN** a `fix` change's `verification.md` has no `@regression` row
- **THEN** cospec emits `verification/reproduces-bug`

#### Scenario: perf missing benchmark or equivalence

- **WHEN** a `perf` change lacks either a `@benchmark` row or an `@equivalence`
  row
- **THEN** cospec emits `verification/equivalence`

#### Scenario: refactor without an equivalence row

- **WHEN** a `refactor` change's `verification.md` has no `@equivalence` row
- **THEN** cospec emits `verification/invariant`

### Requirement: Read-only verification verdict in status

`cospec status <slug> --json` SHALL emit a read-only `verification` block
`{ declared, total, verified, deferred, unresolved, ciUncatchable, blockedReasons }`
from the archive gate's computation plus each `verification/*` ERROR archive's
validation raises on `verification.md`. It SHALL NOT gate, add an artifact, or
carry autonomy, exposure, or embargo state. `archiveReady` in `status` and
`list` SHALL be false whenever `blockedReasons` is non-empty, the same value in
both for a change.

#### Scenario: status reports the verification block

- **WHEN** `cospec status <slug> --json` runs on a change whose schema declares
  `verification`
- **THEN** the JSON output contains a `verification` object with the fields
  `declared`, `total`, `verified`, `deferred`, `unresolved`, `ciUncatchable`,
  and `blockedReasons`

#### Scenario: verdict never gates

- **WHEN** the `verification` block reports unresolved rows
- **THEN** `cospec status` still exits successfully; only `cospec apply` and
  `cospec archive` gate on verification

#### Scenario: unresolved or malformed rows make archiveReady false

- **WHEN** `cospec status <slug> --json` or `cospec list --json` runs on a `fix`
  change whose tasks are done, whose gate is clear and whose `verification.md`
  has a bare `- [ ]` row or a row that does not parse
- **THEN** `archiveReady` is `false` in both, and `status` lists the reason in
  `verification.blockedReasons`

#### Scenario: a ledger that archive's validation refuses makes archiveReady false

- **WHEN** `cospec status <slug> --json` or `cospec list --json` runs on a `fix`
  change whose tasks are done, whose gate is clear and whose `verification.md`
  has a `[~]` row with no `defer: <reason>`, or a `## N.` group with no rows
- **THEN** `archiveReady` is `false` in both, and `status` lists the
  `verification/deferred-reason` or `verification/structure` reason in
  `verification.blockedReasons`

#### Scenario: resolved rows leave archiveReady true

- **WHEN** every row of that `verification.md` is `[x] ... -> <evidence>` or
  `[~] ... -> defer: <reason>`
- **THEN** `archiveReady` is `true` in both commands, `blockedReasons` is empty,
  and `cospec archive <slug>` does not refuse with
  `archive/verification-incomplete`

#### Scenario: grandfathered and verification-free changes are unaffected

- **WHEN** the change is a v1 change with no `verification.md`, or its type
  forbids `verification`, or does not require it and carries no
  `verification.md`
- **THEN** its `archiveReady` is decided by required artifacts, tasks and the
  blocker gate alone

#### Scenario: a present ledger on an unenforced type is still validated

- **WHEN** `cospec status <slug> --json` or `cospec list --json` runs on a
  `build`, `ci` or `revert` change, or a schemaVersion 1 `fix`/`feat`/`perf`/
  `refactor` change, whose tasks are done, whose gate is clear and whose
  `verification.md` has a `[~]` row with no `defer: <reason>` or a `## N.` group
  with no rows
- **THEN** `archiveReady` is `false` in both, `verification.declared` stays
  `false`, and `status` lists the `verification/*` reason in
  `verification.blockedReasons`, because `cospec archive` validates that ledger
  and refuses it; a bare `- [ ]` row on such a change does not block

### Requirement: Project-declared layers are read from the config and checked by doctor

The row-validating gates (`validate`, `apply`, `archive`, `sync-specs`) and the
`status`/`list` readiness verdict SHALL read `verification.layers` from
`openspec/config.yaml` (else `config.yml`) and accept a row on one of those
layers, each spelled with or without `@`. A missing config SHALL add none; an
unreadable or unparseable one SHALL fail loud; a malformed `verification`,
`layers`, or entry SHALL add none and not fail. The `verification/layer-unknown`
hint SHALL name any declared layers.

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

#### Scenario: An unreadable config fails every ledger it governs

- **WHEN** `openspec/config.yaml` exists but cannot be read or is not YAML
- **THEN** cospec prints the binary's
  `Warning: could not parse <path> (<detail>); ignoring it.` on stderr once per
  invocation, and every ledger those gates and that verdict validate fails with
  a `verification/config-unreadable` ERROR naming the file and cause, in place
  of any `verification/layer-unknown`

#### Scenario: What counts as a malformed declaration

- **WHEN** `verification` is not a mapping, `layers` is not a list, or an entry
  is not a non-empty string without whitespace
- **THEN** that entry adds no layer and no gate fails because of it

#### Scenario: Doctor warns on a malformed or unreadable config

- **WHEN** `cospec doctor` runs with a malformed `verification.layers`, or a
  config it cannot read
- **THEN** it emits a `config` WARNING for the malformed declaration, and
  reports the unreadable config as unreadable, naming the error code, rather
  than as one that does not parse
