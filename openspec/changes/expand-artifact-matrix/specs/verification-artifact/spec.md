## ADDED Requirements

### Requirement: Verification artifact grammar and location

cospec SHALL define a machine-parsed `verification` artifact that generates
`verification.md` at the change root — never under a directory named `specs/` —
and SHALL parse it with the existing checkbox lexer: groups written
`## <N>. <behavior description>` with an optional trailing `[critical]`, and
rows written `- [<state>] <N>.<M> @<layer> [(<owner>)] <probe> -> <result>`,
where `<state>` is one of a space (planned), `x` (verified), or `~` (deferred).

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
  `specs`, so openspec 1.3.1's hardcoded `CHANGE_NO_DELTAS` rule is never
  tripped

### Requirement: Closed layer vocabulary

Each verification row's `@<layer>` token SHALL be drawn from the closed core
vocabulary
`@unit @integration @e2e @manual @runtime @regression @equivalence @benchmark @eval`;
a token outside that set (and outside any project extension) SHALL fail closed
as `verification/layer-unknown`. Projects MAY extend the vocabulary through
`openspec/config.yaml` (`verification.layers`); core ships no vendor-specific
tokens.

#### Scenario: Unknown layer token is rejected

- **WHEN** a row names `@smoke` and the project has not declared `smoke` under
  `verification.layers`
- **THEN** cospec emits `verification/layer-unknown` for that row

#### Scenario: Project-extended layer is accepted

- **WHEN** `openspec/config.yaml` declares `verification.layers: [smoke]` and a
  row names `@smoke`
- **THEN** no `verification/layer-unknown` issue is emitted for that row

### Requirement: Check owners and CI-uncatchable flagging

cospec SHALL support an optional per-row owner in the closed set
`{(agent),(human)}`, and when the owner is absent SHALL default `@manual` rows
to `(human)` and all other layers to `(agent)`. An owner token outside that set
SHALL fail as `verification/owner-unknown`. cospec SHALL flag every `(human)` or
`@manual` row as CI-uncatchable in its reports so a reviewer knows it cannot be
auto-verified.

#### Scenario: Owner defaults by layer

- **WHEN** a row names `@manual` with no explicit owner
- **THEN** cospec treats its owner as `(human)`, and treats a `@integration` row
  with no explicit owner as `(agent)`

#### Scenario: Unknown owner token is rejected

- **WHEN** a row names `(bot)` as its owner
- **THEN** cospec emits `verification/owner-unknown`

#### Scenario: Human and manual rows are flagged CI-uncatchable

- **WHEN** a report is produced for a change containing a `(human)` or `@manual`
  row
- **THEN** that row is marked CI-uncatchable in the report

### Requirement: Evidence and deferral discipline

A checked (`[x]`) verification row SHALL carry a non-empty result on the
right-hand side of `->`, failing as `verification/evidence-required` when it is
empty. A deferred (`[~]`) row SHALL carry a non-empty `defer: <reason>`, failing
as `verification/deferred-reason` when the reason is absent. Deferral is the
only sanctioned escape from the archive gate; cospec SHALL provide no `--force`
for verification.

#### Scenario: Checked row without evidence is rejected

- **WHEN** a row is `[x]` but the text after `->` is empty
- **THEN** cospec emits `verification/evidence-required`

#### Scenario: Deferred row without a reason is rejected

- **WHEN** a row is `[~]` with no `defer: <reason>`
- **THEN** cospec emits `verification/deferred-reason`

#### Scenario: Deferred row with a reason passes

- **WHEN** a row is `[~]` and carries `defer: superseded by upstream fix`
- **THEN** no `verification/deferred-reason` issue is emitted for that row

### Requirement: Per-type required-row facts

cospec SHALL enforce a distinct required-row rule per change type when
`verification` is enforced: `feat` requires every `[critical]` group to have at
least one row whose layer is not `@unit` (`verification/critical-real-layer`);
`fix` requires at least one `@regression` row (`verification/reproduces-bug`);
`perf` requires at least one `@benchmark` row and at least one `@equivalence`
row (`verification/equivalence`); `refactor` requires at least one
`@equivalence` row (`verification/invariant`); and `revert`/`build`/`ci`, when
soft-promoted, require a real-layer row (`verification/deploy-real-layer`: a
`@runtime` row for `build`/`ci`; any layer for `revert`).

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

### Requirement: Verification matrix placement

cospec SHALL place `verification` in the type matrix as Required and in
`apply.requires` for `feat`, `fix`, `perf`, and `refactor`; as optional and
soft-promotable (never a hard require) for `revert`, `build`, and `ci`; and as
Forbidden for `chore`, `docs`, `style`, and `test`, emitting
`meta/forbidden-artifact` when a forbidden type carries a `verification.md`.
There SHALL be no lite variant of the artifact.

#### Scenario: feat requires verification at apply

- **WHEN** `cospec apply` runs on a `feat` change with no `verification.md`
- **THEN** the gate blocks with exit 2 and names `verification` as a missing
  required artifact

#### Scenario: forbidden type carries verification

- **WHEN** a `chore` change contains a `verification.md`
- **THEN** cospec emits `meta/forbidden-artifact`

#### Scenario: light type omits verification cleanly

- **WHEN** a `docs` change has no `verification.md`
- **THEN** no `verification/*` issue is emitted and the gate does not require it

### Requirement: Read-only verification verdict in status

`cospec status <slug> --json` SHALL emit a read-only `verification` block
reporting
`{ declared, total, verified, deferred, unresolved, ciUncatchable, blockedReasons }`
derived from the same computation the archive gate uses. The block SHALL NOT be
a gate, SHALL NOT introduce a new artifact, and SHALL carry no autonomy,
exposure, or embargo governance state.

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
