## ADDED Requirements

### Requirement: Artifact instructions are a disciplined passthrough

`cospec instructions <artifact>`'s generic branch SHALL route through the same
disciplined-passthrough runner every other wrapped read surface uses, gaining
the exit-code allow-list, the stdout deny-list, exit-code normalisation, and the
guaranteed single-JSON-document invariant for `--json` callers. `archive` SHALL
be listed among the artifacts the command advertises and SHALL pass through
read-only — it SHALL NOT be aliased to `cospec archive`, because the wrapped
`instructions archive` neither gates nor moves anything. The cospec-native
`apply` branch SHALL be unchanged.

#### Scenario: Archive instructions are listed and relayed

- **WHEN** `cospec instructions archive --change <slug>` runs against a wrapped
  binary that provides the artifact
- **THEN** the wrapped payload is relayed with the wrapped exit code, and
  `archive` appears in the command's advertised artifact list

#### Scenario: Archive instructions never gate or move

- **WHEN** `cospec instructions archive --change <slug>` completes
- **THEN** the change is still in `openspec/changes/`, no gate has run, and
  nothing was written

#### Scenario: A wrapped error body normalises to a failing exit code

- **WHEN** the wrapped binary returns a `status` array containing an `error`
  severity while exiting 0
- **THEN** `cospec instructions --json` emits exactly one JSON document and
  exits 1

#### Scenario: An older runtime relays a clean error

- **WHEN** the resolved wrapped binary predates the `archive` artifact
- **THEN** cospec relays the wrapped unknown-artifact error and exits non-zero,
  without a stack trace or partial JSON
