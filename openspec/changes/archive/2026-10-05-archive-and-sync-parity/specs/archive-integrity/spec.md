# Spec Delta

## ADDED Requirements

### Requirement: --no-validate skips only revalidation

`cospec archive <change> --no-validate` SHALL skip only cospec's revalidation
step (the archive-precondition validation `validateChange` runs) and SHALL
forward `--no-validate` to the wrapped `archive -y` call, so the binary skips
its own validation as the flag asks. The namespace-folder refusal, the tasks
gate, `archive/verification-incomplete`, the archive-slot check,
`archive/scenario-preservation`, the on-disk move verification and the
post-merge spot-check SHALL still run. Before any of them, cospec SHALL print a
banner on stderr, in text and `--json` mode alike, saying that revalidation was
skipped and naming the gates that still run. cospec SHALL NOT prompt: its
archive never prompts, so the binary's `--json --no-validate` confirmation
refusal (`archive_confirmation_required`) has no cospec counterpart.

#### Scenario: Both hard gates still refuse under --no-validate

- **WHEN** `cospec archive c1 --no-validate` runs on a change with a bare `[ ]`
  verification row, and again on a change whose MODIFIED block drops a living
  scenario
- **THEN** each is refused by its hard gate with exit 1, nothing is moved, and
  stderr carries the revalidation-skipped banner

#### Scenario: A change validation would refuse archives

- **WHEN** `cospec archive c1 --no-validate` runs on a change that only
  revalidation refuses (a delta the binary also archives under `--no-validate`)
- **THEN** the change archives with exit 0, the banner is on stderr, and the
  main specs equal what `openspec archive c1 -y --no-validate` writes on a copy

### Requirement: One scenario-preservation helper reads the verbatim view

The `archive/scenario-preservation` hard gate SHALL live in one shared helper
that `cospec archive` and `cospec sync-specs` both call, and that reads the
living spec and the delta the way the binary's archive reads them: code fences
masked and HTML comments kept. A scenario that sits inside a comment in the
living spec SHALL count as a living scenario, and a scenario the MODIFIED block
keeps only inside a comment SHALL count as kept, so the gate refuses and passes
exactly where `openspec archive` does.

#### Scenario: A scenario kept only inside a comment archives on both sides

- **WHEN** a MODIFIED block keeps one living scenario only inside an HTML
  comment
- **THEN** `cospec validate --strict`, `cospec archive` and
  `openspec archive -y` each accept it, and both archives write the same main
  spec

#### Scenario: A commented living scenario the delta omits is refused on both sides

- **WHEN** the living requirement carries a third scenario inside an HTML
  comment and the MODIFIED block repeats only the two visible ones
- **THEN** `cospec archive` refuses with `archive/scenario-preservation` naming
  that scenario, and `openspec archive -y` refuses and changes nothing

#### Scenario: A commented requirement header in the living spec blocks neither side

- **WHEN** the living spec ends with a requirement header and its scenario
  inside an HTML comment, and a MODIFIED block keeps every scenario of a visible
  requirement
- **THEN** `cospec archive` and `openspec archive -y` both archive it

### Requirement: Archive names why no spec sync happened

When `cospec archive` passes `--skip-specs` to the wrapped archive, its `Specs:`
line SHALL name which reason applied: the user passed `--skip-specs`, the
change's schema has no specs artifact, or the change has no delta spec files.
Under `--json` the document SHALL carry `specsSkipReason` with the value `flag`,
`schema` or `no-deltas`, and the existing `specs: "skipped"` value SHALL stay as
it is.

#### Scenario: A specs-bearing change with no delta files says so

- **WHEN** `cospec archive c1` runs on a `feat` change with no files under
  `specs/`
- **THEN** the `Specs:` line says there were no delta specs and so no spec sync,
  and `--json` carries `specsSkipReason: "no-deltas"`

### Requirement: An early-synced change archives as a no-op merge

`cospec archive` SHALL archive a change whose every delta operation is already
reflected in the main specs, as left by `cospec sync-specs` or by hand. That
covers an identical ADDED, an absent REMOVED, an applied RENAMED, an identical
MODIFIED, and a capability whose spec was already retired. The post-merge
spot-check SHALL accept each such operation, and the `Specs:` line SHALL report
that the specs were already in sync whenever the wrapped archive reports so, not
that operations were applied.

#### Scenario: A retired capability that is already gone archives

- **WHEN** a change under `retire_capabilities: true` REMOVEs every requirement
  of a capability whose `spec.md` is already deleted
- **THEN** `cospec validate --strict` and `cospec archive` accept it, the
  archive exits 0, and the binary's "already in sync" report is reflected in the
  `Specs:` line

### Requirement: A brand-new capability refuses only MODIFIED and RENAMED

`archive/new-spec-non-added` SHALL be an ERROR only on a MODIFIED or RENAMED
operation that targets a capability with no living spec. A REMOVED operation
there SHALL NOT be reported by it: the binary ignores it with a warning
("nothing to remove") and applies the rest of the delta. A delta whose only
operations on a new capability are REMOVED, without `retire_capabilities: true`,
SHALL still be refused, by `archive/rebuilt-spec-invalid`, because the spec the
binary would write has no requirements.

#### Scenario: ADDED with REMOVED on a new capability archives

- **WHEN** a delta for a capability with no living spec ADDs one requirement and
  REMOVEs another
- **THEN** `cospec validate --strict` reports no `archive/new-spec-non-added`,
  and `cospec archive` and `openspec archive -y` both archive it with the ADDED
  requirement written

#### Scenario: REMOVED-only on a new capability without the marker is still refused

- **WHEN** a delta for a capability with no living spec only REMOVEs, and the
  change does not declare `retire_capabilities: true`
- **THEN** `cospec validate --strict` reports `archive/rebuilt-spec-invalid`,
  `cospec archive` refuses before delegating, and `openspec archive -y` refuses
  too

### Requirement: Relayed archive output is spelled cospec

Every place `cospec archive` relays the wrapped archive's output (the aborted
and half-state reports, the relayed merge warnings, and the `message` and `fix`
of its failure document) SHALL pass that text through `respellRemedies`, so a
sentence on the remedy allowlist names `cospec`, while a path, a change name and
authored spec text pass through byte-for-byte.

#### Scenario: A relayed merge warning names cospec

- **WHEN** the wrapped archive creates a new capability whose carried Purpose is
  under the minimum length and cospec relays the binary's warning
- **THEN** the relayed `Warning:` line reads
  `… cospec validate --strict reports it as too brief.`, and no relayed line
  names a bare `openspec` command on the allowlist
