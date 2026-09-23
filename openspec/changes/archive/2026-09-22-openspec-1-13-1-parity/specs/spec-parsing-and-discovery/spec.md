# Spec Delta

## MODIFIED Requirements

### Requirement: Delegated duplicates are suppressed

When cospec merges delegated OpenSpec issues into its own report, it SHALL
suppress a delegated issue that duplicates a native cospec issue already
reported for the same file and the same defect — the placeholder `Purpose`, a
root-level `specs/spec.md`, scenario loss in a MODIFIED delta, an
archive-precondition failure the wrapped binary dry-runs during validate, a
delta-shaped file cospec's own discovery skips, a change whose tracked task
files carry no checkbox at all, and a `RENAMED` `FROM:`/`TO:` line that formed
no pair. Suppression SHALL apply only when the native rule actually fired; when
cospec's own rule is silent, the delegated issue SHALL still be reported so
nothing is lost.

The archive-precondition family SHALL be paired one entry per upstream
precondition shape, because a duplicate class carries a single native rule id
and the family spans two — a `MODIFIED` target not found, a `REMOVED` target not
found, and a `RENAMED` source not found pair with `archive/target-missing`; a
`RENAMED` target that already exists, an `ADDED` name that already exists, and
their two case-or-spacing variants pair with `archive/added-exists`. Each
pairing SHALL capture the requirement name for comparison against the native
issue's own key, and that capture SHALL stop before the conditional
`, but "…" exists` and `… and differs only in case or spacing` tails the wrapped
binary appends, or it can never match. A precondition shape with no cospec twin
— a `MODIFIED` header mismatch in content — SHALL NOT be suppressed.

No suppression entry SHALL be added for scenario preservation, because the
wrapped binary skips a spec whose path has already produced an ERROR and its own
scenario-loss check emits one on that same path, so the scenario blocker never
becomes a dry-run issue. The existing scenario-loss pairing is unchanged. This
same path-keying bounds the dry-run family: at most one archive-precondition
dry-run issue can be reported per delta file per run.

Every suppression regex SHALL be anchored through a clause that distinguishes it
from the other delegated messages it shares a prefix with, not through the
shared prefix alone. Suppression SHALL NOT move a verdict or an exit code: the
dry-run issues arrive at INFO, which is counted and rendered but never scored.

#### Scenario: One diagnostic per defect

- **WHEN** `cospec validate --strict` runs on a change whose delta thins
  scenarios, and both cospec's own rule and the wrapped binary report it
- **THEN** the merged report contains exactly one issue for that defect, the
  cospec-native one, and the exit code is unchanged

#### Scenario: Unmatched delegated issue survives

- **WHEN** the wrapped binary reports a spec defect that no cospec rule covers
- **THEN** the delegated issue appears in the merged report unchanged

#### Scenario: An archive-precondition dry-run issue is deduped

- **WHEN** `cospec validate --strict` runs on a change whose `## MODIFIED` delta
  targets a requirement absent from the living spec, and the wrapped binary's
  merge dry-run reports the same precondition failure
- **THEN** the merged report contains exactly one finding for it, cospec's own
  `archive/target-missing`, and both the `valid` verdict and the exit code are
  unchanged from the previous pin

#### Scenario: A header-mismatch dry-run issue has no twin and survives

- **WHEN** the wrapped binary's merge dry-run reports a `MODIFIED` header
  mismatch in content, for which cospec has no native rule
- **THEN** the delegated issue appears in the merged report unchanged

#### Scenario: Zero-checkbox reporting is not doubled

- **WHEN** a change's `tasks.md` contains only plain list items, so cospec's
  `tasks/has-tasks` ERROR and the wrapped binary's zero-task WARNING both
  describe it
- **THEN** the merged report contains exactly one finding, cospec's ERROR

#### Scenario: An unpaired rename line is not doubled

- **WHEN** a change's delta carries a `RENAMED` `FROM:` line with no matching
  `TO:` line, so cospec's `deltas/unpaired-rename` ERROR and the wrapped
  binary's own unpaired-line ERROR both describe it
- **THEN** the merged report contains exactly one finding, cospec's ERROR

#### Scenario: A second unpaired rename line is a second finding

- **WHEN** the wrapped binary reports an unpaired line for a different side of
  the pair, a different requirement name, or a different delta file than the one
  cospec's rule fired on
- **THEN** the delegated issue is not suppressed and appears in the merged
  report

#### Scenario: A shared prefix does not suppress a different defect

- **WHEN** a change carries a delta-shaped file whose delegated message begins
  with the same prefix as the root-level `specs/spec.md` message but describes a
  different path
- **THEN** the root-level pairing does not suppress it, and the defect is
  reported

## ADDED Requirements

### Requirement: Delta-shaped files at unread paths are reported

cospec SHALL report a named ERROR for a markdown file under a change's `specs/`
tree that carries a delta section header but sits at a path cospec's own delta
discovery skips — a file not named `spec.md`, or one at a depth that is not
`specs/<capability-path>/spec.md`. The discovery filter itself SHALL be
unchanged: restricting delta files to `spec.md` is what lets an author keep
companion notes beside a delta, and those notes SHALL stay unreported. What
changes is that a genuinely delta-shaped file is no longer skipped in silence.

`cospec archive`'s zero-delta leniency SHALL NOT treat a change carrying only
such files as a true no-op, so a misplaced delta cannot be archived as though
the change touched no spec.

#### Scenario: A misnamed delta file is reported

- **WHEN** a change carries `specs/user-auth.md` whose content includes a
  `## ADDED Requirements` header
- **THEN** `cospec validate` reports `deltas/unread-file` as an ERROR naming
  that path, and the delegated twin for the same file is suppressed

#### Scenario: A delta file at the wrong depth is reported

- **WHEN** a change carries `specs/user-auth/delta.md` whose content includes a
  delta section header
- **THEN** `cospec validate` reports `deltas/unread-file` as an ERROR naming
  that path

#### Scenario: A companion note is still silent

- **WHEN** a change carries `specs/user-auth/spec.md` alongside
  `specs/user-auth/notes.md`, and the note carries no delta section header
- **THEN** no `deltas/unread-file` issue is reported for the note

#### Scenario: A misplaced delta is not a clean no-op at archive

- **WHEN** `cospec archive` runs on a change whose only spec-tree content is a
  delta-shaped file at an unread path
- **THEN** the change is not treated as a no-delta change, and the archive does
  not report a clean skip
