## MODIFIED Requirements

### Requirement: Read-only verification verdict in status

`cospec status <slug> --json` SHALL emit a read-only `verification` block
reporting
`{ declared, total, verified, deferred, unresolved, ciUncatchable, blockedReasons }`
derived from the same computation the archive gate uses. The block SHALL NOT be
a gate, SHALL NOT introduce a new artifact, and SHALL carry no autonomy,
exposure, or embargo governance state. The `archiveReady` flag of
`cospec status` and of `cospec list` SHALL be false whenever `blockedReasons` is
non-empty, and the two commands SHALL report the same value for the same change.

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

#### Scenario: resolved rows leave archiveReady true

- **WHEN** every row of that `verification.md` is `[x] ... -> <evidence>` or
  `[~] ... -> defer: <reason>`
- **THEN** `archiveReady` is `true` in both commands, `blockedReasons` is empty,
  and `cospec archive <slug>` does not refuse with
  `archive/verification-incomplete`

#### Scenario: grandfathered and verification-free changes are unaffected

- **WHEN** the change is a v1 change with no `verification.md`, or its type
  forbids or does not require `verification`
- **THEN** its `archiveReady` is decided by required artifacts, tasks and the
  blocker gate alone
