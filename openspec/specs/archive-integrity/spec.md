# archive-integrity Specification

## Purpose

Defines the two hard archive gates that run as explicit `cospec archive` command
steps before delegating to the wrapped openspec binary:
`archive/verification-incomplete` (refuses any change with a bare `[ ]`
verification row) and `archive/scenario-preservation` (refuses a delta that
drops or thins a spec scenario without an explicit removal note). Each returns
exit 1 and runs independently of the specs-conditional advisory rule family, so
cospec refuses an unsound archive even when openspec would return exit 0 — a
guarantee pinned by a real-binary contract test.

## Requirements

### Requirement: Verification-incomplete archive gate

`cospec archive` SHALL run an explicit `archive/verification-incomplete` step
after the tasks gate and before delegating to `openspec archive`, for any change
where verification is enforced (per `enforcedApplyRequires`), independent of
whether the change bears specs. The step SHALL parse `verification.md` and
require every row to be either `[x]` with non-empty evidence or `[~]` with a
non-empty reason; any bare `[ ]` row SHALL cause a refusal with exit 1. There
SHALL be no `--force` escape — a row is resolved on the record by deferral
instead.

#### Scenario: Unchecked row refuses archive

- **WHEN** `cospec archive` runs on an enforced change whose `verification.md`
  has a bare `[ ]` row
- **THEN** the command refuses with exit 1 and does not delegate to
  `openspec archive`

#### Scenario: Fully resolved ledger proceeds

- **WHEN** every verification row is `[x]` with evidence or `[~]` with a reason
- **THEN** the `archive/verification-incomplete` step passes

#### Scenario: Gate fires for a specs-less fix

- **WHEN** a `fix` change with no specs but an enforced `verification.md` has an
  unchecked row
- **THEN** the gate still refuses with exit 1, independent of the
  specs-conditional rule family

### Requirement: Scenario-preservation archive gate

`cospec archive` SHALL run an explicit `archive/scenario-preservation` step
before `openspec archive` executes, for specs-bearing changes only. For each
`## MODIFIED Requirements` delta, it SHALL read the current living spec at
`openspec/specs/<capability>/spec.md` and compare `#### Scenario:` counts; if
the delta drops scenarios without a matching `## REMOVED` operation or explicit
reason, the step SHALL refuse with exit 1. This SHALL catch scenario thinning
that `openspec archive` would otherwise wave through at exit 0.

#### Scenario: Dropped scenario refuses archive

- **WHEN** a MODIFIED delta reduces a requirement's scenario count below the
  living spec's without a matching REMOVED or explicit reason
- **THEN** `cospec archive` refuses with exit 1 before delegating

#### Scenario: Matched removal is allowed

- **WHEN** a delta drops a scenario and carries a corresponding `## REMOVED`
  operation or explicit reason
- **THEN** the `archive/scenario-preservation` step passes

#### Scenario: Refusal precedes a green openspec archive

- **WHEN** the pinned openspec binary would return exit 0 for a
  scenario-thinning delta — behavior cospec has relied on since 1.3.1
- **THEN** cospec refuses first, and a contract test against the pinned binary
  asserts this refusal

### Requirement: Hard gates are explicit command steps

Both archive gates SHALL be implemented as explicit `cospec archive` command
steps returning `EXIT.failure` (1) — the same refusal code the existing tasks
gate uses — rather than being buried in the specs-conditional
archive-precondition rule family. A mirror rule for scenario-preservation SHALL
be added to the archive-precondition family so `cospec validate --strict`
surfaces it advisorily, but the hard block SHALL remain the command step.
Existing archive behavior — the tasks gate, `openspec archive` delegation,
filesystem move verification, and blocker fan-out — SHALL be unchanged.

#### Scenario: Refusal uses the existing failure code

- **WHEN** either archive gate refuses
- **THEN** the command exits 1, matching the existing tasks-gate refusal
  convention

#### Scenario: Validate surfaces scenario-preservation advisorily

- **WHEN** `cospec validate --strict` runs on a specs-bearing change that would
  thin scenarios
- **THEN** the archive-precondition mirror rule surfaces the issue while the
  hard block remains the archive command step
