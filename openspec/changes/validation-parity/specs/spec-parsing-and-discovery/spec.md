## MODIFIED Requirements

### Requirement: Delegated duplicates are suppressed

When cospec merges delegated OpenSpec issues into its own report, it SHALL
suppress a delegated issue that duplicates a native cospec issue already
reported for the same file and the same defect — the placeholder `Purpose`, a
root-level `specs/spec.md`, scenario loss in a MODIFIED delta, an
archive-precondition failure the wrapped binary dry-runs during validate, a
delta-shaped file cospec's own discovery skips, a change whose tracked task
files carry no checkbox at all, a `RENAMED` `FROM:`/`TO:` line that formed no
pair, a delta file whose sections parse to no entries, a non-requirement `###`
header the delta reader skips, a requirement missing SHALL/MUST or its
requirement text, and an `## ADDED` name the same delta file also removes or
modifies. Suppression SHALL apply only when the native rule actually fired; when
cospec's own rule is silent, the delegated issue SHALL still be reported so
nothing is lost.

Each of those later pairings SHALL be keyed so that a second real finding
survives. The empty-sections message SHALL pair with `archive/no-ops` on the
same delta file, and the change-level no-deltas message with `archive/no-ops`
fired anywhere on the item, because the wrapped binary raises it only when no
delta file parsed an entry. The two skipped-header messages (a non-requirement
header, and a `### Requirement:` with no name) SHALL pair with
`deltas/skipped-header` on the same file and the same header text. A skipped
`### Scenario:` header SHALL pair with `deltas/scenario-depth` on the same file.
The keyword and missing-text messages SHALL pair with `deltas/requirement-shape`
on the same file, operation and requirement name. The two cross-section messages
(`ADDED and REMOVED`, `MODIFIED and ADDED`) SHALL pair with
`archive/added-exists` on the same file and requirement name. Each pairing SHALL
be covered by a contract test whose delegated message is read from the pinned
binary, never typed by hand.

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

#### Scenario: An empty delta section is reported once

- **WHEN** a cospec-typed change's only delta file carries
  `## ADDED Requirements` with no requirement under it, and the wrapped binary
  reports both its empty-sections ERROR and its no-deltas ERROR
- **THEN** the merged report contains exactly one finding for it, cospec's
  `archive/no-ops`

#### Scenario: A skipped header is reported once

- **WHEN** a cospec-typed change's ADDED section carries
  `### Documentation Requirements` and a nameless `### Requirement:` line, and
  the wrapped binary reports an INFO for each
- **THEN** the merged report contains one `deltas/skipped-header` INFO per line
  and no delegated INFO for either

#### Scenario: A three-hashtag scenario is reported once

- **WHEN** an ADDED section carries `### Scenario: Shallow`, which cospec
  reports as `deltas/scenario-depth` and the wrapped binary reports as a skipped
  header
- **THEN** the merged report contains the `deltas/scenario-depth` ERROR and
  neither a `deltas/skipped-header` nor a delegated INFO for that line

#### Scenario: A missing SHALL/MUST is reported once

- **WHEN** a cospec-typed change's ADDED requirements lack SHALL/MUST in the
  body, one with the keyword only in its header, one with an empty body and one
  with no keyword anywhere
- **THEN** the merged report contains one `deltas/requirement-shape` ERROR per
  requirement and none of the wrapped binary's three messages

#### Scenario: A cross-section conflict is reported once

- **WHEN** a cospec-typed change's delta both REMOVEs and ADDs
  `Widget rendering`, and the wrapped binary reports the pair
- **THEN** the merged report contains exactly one `archive/added-exists` ERROR
  naming `Widget rendering` and no delegated cross-section message

#### Scenario: A different header or requirement is a second finding

- **WHEN** the wrapped binary reports a skipped header, a missing keyword or a
  cross-section conflict for a header text, requirement name or delta file that
  cospec's own rule did not fire on
- **THEN** the delegated issue is not suppressed and appears in the merged
  report

## ADDED Requirements

### Requirement: Skipped delta headers are reported

cospec SHALL report, as the INFO `deltas/skipped-header`, every level-three
header inside an `## ADDED Requirements` or `## MODIFIED Requirements` section
that the delta reader ignores: a non-fenced `### <text>` line that is not a
named `### Requirement:` header, whether it sits between requirement blocks or
inside one. The lines reported SHALL be exactly the lines the wrapped binary's
delta reader records as skipped, with the same line numbers. A header that is
`### Requirement:` with no name SHALL get its own message, saying the name is
missing and giving `### Requirement: <name>` as the fix. Any other header's hint
SHALL name `### Requirement: <text>` as the spelling to use if the block is
meant to be validated. A `### Scenario:` line that `deltas/scenario-depth`
already reports SHALL NOT also be reported by this rule.

The rule SHALL run on every cospec-typed change that carries delta files,
whether or not cospec delegates the change to the wrapped binary. INFO SHALL
never move `valid` or the exit code, with or without `--strict`.

#### Scenario: A stray divider is reported

- **WHEN** a delta's `## ADDED Requirements` section carries
  `### Documentation Requirements` above its first requirement
- **THEN** `cospec validate` reports `deltas/skipped-header` at INFO on that
  line, with a hint naming `### Requirement: Documentation Requirements`

#### Scenario: A nameless requirement header is reported

- **WHEN** a delta's ADDED section carries a `### Requirement:` line with no
  name
- **THEN** `deltas/skipped-header` reports it as missing a requirement name,
  with a hint naming `### Requirement: <name>`

#### Scenario: A header inside a requirement block is reported

- **WHEN** a `### Notes` line sits between a requirement's body and its
  `#### Scenario:` block
- **THEN** `deltas/skipped-header` reports that line, and the requirement's
  scenario still counts

#### Scenario: A change cospec does not delegate still gets the finding

- **WHEN** a cospec-typed change with a skipped header has no `proposal.md`, so
  cospec does not delegate it to the wrapped binary
- **THEN** `deltas/skipped-header` is still reported

#### Scenario: A fenced header is not reported

- **WHEN** a `### Example` line sits inside a fenced code block in an ADDED
  requirement
- **THEN** no `deltas/skipped-header` issue is raised for it

### Requirement: A header-only SHALL/MUST carries the body hint

When an `## ADDED` or `## MODIFIED` requirement's body lacks SHALL or MUST and
its `### Requirement:` header contains one, the `deltas/requirement-shape` ERROR
SHALL carry the wrapped binary's hint: move the SHALL/MUST statement to the line
immediately after the `### Requirement: ...` header. The ERROR's level, rule id
and message SHALL stay as they are for a cospec-typed change. A requirement
whose header lacks SHALL/MUST too SHALL get no hint.

#### Scenario: The keyword only in the header

- **WHEN** a cospec-typed change ADDs
  `### Requirement: The system SHALL frob widgets` whose body reads
  `The system frobs widgets.`
- **THEN** `cospec validate` reports `deltas/requirement-shape` at ERROR with
  the move-it-to-the-body hint

#### Scenario: An empty body with the keyword in the header

- **WHEN** an ADDED requirement's header holds SHALL and its body is empty
- **THEN** the `deltas/requirement-shape` ERROR carries the same hint

#### Scenario: No keyword anywhere

- **WHEN** neither the header nor the body of an ADDED requirement holds SHALL
  or MUST
- **THEN** `deltas/requirement-shape` is an ERROR with no hint
