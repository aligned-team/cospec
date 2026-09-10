# archive-integrity Specification

## Purpose

Defines the two hard archive gates that run as explicit `cospec archive` command
steps before delegating to the wrapped openspec binary:
`archive/verification-incomplete` (refuses any change with a bare `[ ]`
verification row) and `archive/scenario-preservation` (refuses a MODIFIED delta
that no longer covers a living spec scenario, by name or by count, with no
escape hatch). Each returns exit 1 and runs independently of the
specs-conditional advisory rule family, so cospec refuses an unsound archive
even when openspec would return exit 0 — a guarantee pinned by a real-binary
contract test.

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
`## MODIFIED Requirements` delta, it SHALL read the current living spec for the
delta's capability — resolved through the shared recursive spec discovery, so a
delta at `specs/<area>/<capability>/spec.md` is compared against the living
`<capability>` and not against `<area>` — and compare the delta block's
scenarios against the living requirement's, using cospec's normalising parser
(BOM, CRLF, HTML-comment, and fence-aware). The comparison SHALL be by scenario
**name**, counted with multiplicity: every living scenario name whose
occurrences are not all matched by an occurrence of the same name in the delta
block is a missing scenario. Names SHALL be compared case-sensitively, so a
case-only rename is a drop. The existing count comparison SHALL be retained as a
second arm, and the step SHALL refuse with exit 1 when either arm reports a
loss. There SHALL be no escape hatch: neither a `Scenario removed:` note nor any
other annotation excuses a name-identity or count drop, and a requirement
dropped through `## REMOVED` carries no MODIFIED operation and so is never seen
by this gate. This SHALL catch scenario thinning and same-count scenario
renaming that `openspec archive` would otherwise wave through at exit 0 on the
lower half of the accepted `>=1.0.0 <2.0.0` range. From OpenSpec 1.8.0 the
wrapped binary carries its own overlapping check; cospec's gate SHALL still run
first, with cospec's own message and rule id, because it remains the only
defence on 1.0.0 through 1.7.x.

#### Scenario: Dropped scenario refuses archive

- **WHEN** a MODIFIED delta reduces a requirement's scenario count below the
  living spec's
- **THEN** `cospec archive` refuses with exit 1 before delegating

#### Scenario: Matched removal is allowed

- **WHEN** a requirement's scenarios disappear because the whole requirement is
  dropped through a `## REMOVED` operation, so no MODIFIED operation names it
- **THEN** the `archive/scenario-preservation` step does not apply to that
  requirement and passes, while a delta that both REMOVEs and ADDs the same
  requirement name is refused by the wrapped binary itself

#### Scenario: Refusal precedes a green openspec archive

- **WHEN** a scenario-thinning delta runs against a wrapped binary in the
  1.0.0–1.7.x part of the accepted range, which returns exit 0 for it
- **THEN** cospec refuses first, and a contract test against the pinned binary
  asserts this refusal

#### Scenario: Gate resolves a nested capability correctly

- **WHEN** a MODIFIED delta lives at `specs/<area>/<capability>/spec.md` and
  thins a scenario
- **THEN** the gate compares against the living `<capability>` spec and refuses
  with exit 1, rather than finding no living spec and passing

#### Scenario: Fenced and commented headers do not fake preservation

- **WHEN** a MODIFIED delta's only remaining `#### Scenario:` headers sit inside
  a code fence or an HTML comment
- **THEN** the gate counts them as absent and refuses, rather than treating the
  requirement's scenarios as preserved

#### Scenario: Upstream's own check is not double-reported

- **WHEN** the wrapped binary also reports the same scenario loss for the same
  file
- **THEN** cospec's refusal is the one the user sees, and the delegated
  duplicate is suppressed in the merged report

#### Scenario: Same-count name swap refuses archive

- **WHEN** a MODIFIED delta replaces one scenario's name with a different name,
  leaving the scenario count unchanged
- **THEN** the gate refuses with exit 1 and names the dropped scenario

#### Scenario: Duplicate scenario names are counted, not deduped

- **WHEN** the living requirement carries one scenario name twice and the
  MODIFIED delta carries it once
- **THEN** the gate reports exactly one missing scenario and refuses

#### Scenario: A case-only scenario rename is a drop

- **WHEN** a MODIFIED delta renames a scenario only by letter case
- **THEN** the gate treats the original name as missing and refuses

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

### Requirement: Archive target verification uses the local date

`cospec archive`'s post-delegation filesystem verification SHALL derive the
expected archived directory name using the **local** date, matching the date the
wrapped binary stamps, rather than a UTC date. It SHALL accept both archive
directory forms produced across the accepted openspec range: `YYYY-MM-DD-<id>`
and, for a change id that already begins with a `YYYY-MM-DD-` prefix, the id
verbatim as written by openspec 1.7.0 and later. A successful archive SHALL
never be reported as a failure because of a date or prefix mismatch.

#### Scenario: Archive succeeds in a timezone ahead of UTC

- **WHEN** `cospec archive` runs late in the local day in a timezone ahead of
  UTC, so the local date and the UTC date differ
- **THEN** cospec finds the archived directory the wrapped binary created and
  reports success

#### Scenario: Both archive directory forms are accepted

- **WHEN** the wrapped binary produces either `YYYY-MM-DD-<id>` or an
  already-date-prefixed `<id>` verbatim
- **THEN** the post-move verification recognises the directory in both cases

#### Scenario: A genuinely missing move still fails

- **WHEN** the change directory was not moved into `openspec/changes/archive/`
- **THEN** cospec still reports the archive as failed, on the filesystem
  post-condition rather than the wrapped exit code

### Requirement: Wrapped archive warnings are relayed

`cospec archive` SHALL surface the wrapped binary's non-blocking archive
warnings on the **success** path, where they are discarded today. They SHALL
appear in the human summary as warning lines and in `cospec archive --json` as a
`warnings` array of strings. Relaying warnings SHALL be additive output only: it
SHALL NOT change how success is computed, which remains the filesystem
post-condition, and warning text SHALL NOT be matched by the abort/cancel
detection that decides a failed archive.

#### Scenario: A note-loss warning reaches the user

- **WHEN** archiving a change whose delta carries an indented Notes paragraph
  inside a requirement, which the wrapped binary warns about
- **THEN** the warning appears in cospec's human output and in the `warnings`
  array of `cospec archive --json`

#### Scenario: Warnings do not fake an abort

- **WHEN** wrapped warning text is present on a successful archive
- **THEN** the abort/cancel detection does not match it and the archive is still
  reported as successful

#### Scenario: No warnings means an empty array

- **WHEN** the wrapped archive emits no warnings
- **THEN** `cospec archive --json` carries an empty `warnings` array and the
  human output gains no warning line

### Requirement: Completion and telemetry notices never reach the user

Every spawn of the wrapped binary SHALL force off the wrapped binary's first-run
advisory notices, adding `OPENSPEC_NO_COMPLETIONS=1` alongside the
`OPENSPEC_TELEMETRY=0` the spawn env already forces, so no cospec surface ever
relays a suggestion to run a bare `openspec` command. The forced
`OPENSPEC_TELEMETRY=0` additionally disables the wrapped binary's per-command
update check, which SHALL be treated as load-bearing rather than incidental.

#### Scenario: No completions hint on a fresh HOME

- **WHEN** any cospec command spawns the wrapped binary with a HOME carrying no
  prior openspec global config
- **THEN** the relayed stderr contains no shell-completions suggestion

#### Scenario: Spawn env carries both switches

- **WHEN** the wrapped-binary spawn environment is inspected
- **THEN** it sets both `OPENSPEC_TELEMETRY=0` and `OPENSPEC_NO_COMPLETIONS=1`

### Requirement: Early-synced delta operations are not archive blockers

The archive-precondition rule family SHALL treat as no-ops the three delta
shapes the wrapped binary treats as already synced to the baseline, so cospec
never refuses an archive that `openspec archive` performs at exit 0: an
`## ADDED` requirement whose retained block, normalised with OpenSpec's own
CRLF-fold-and-trim rule, matches the living requirement of the same name; a
`## REMOVED` target that is already absent from the living spec; and a
`## RENAMED` whose source is absent while its target is present, which SHALL
suppress both the missing-source error and the living-spec half of the
target-collision error the same shape raises today. Each exemption SHALL be
withheld when the living spec still carries a name that folds equal to the named
requirement — case-insensitively, with runs of whitespace collapsed — but is not
it, because that is a mistyped header the wrapped binary aborts on; the
resulting ERROR SHALL name the exact living header to match. The remaining
shapes SHALL stay ERRORs: an ADDED collision whose normalised block differs, a
RENAMED whose source and target are both absent, a RENAMED applied while both
source and target are present, a RENAMED whose target collides with an
`## ADDED` requirement in the same delta — which the wrapped binary refuses
before it classifies any early sync, so the early-sync exemption SHALL NOT reach
it — and a MODIFIED whose target is absent — the wrapped binary refuses each of
these, and relaxing any of them would be a false archive PASS.

#### Scenario: Identical ADDED block is a no-op

- **WHEN** an `## ADDED` requirement's block is identical to the living
  requirement of the same name, differing at most in line endings and outer
  whitespace
- **THEN** no `archive/added-exists` issue is raised and the archive proceeds

#### Scenario: Differing ADDED body is still a collision

- **WHEN** an `## ADDED` requirement's name collides with a living requirement
  and their normalised blocks differ
- **THEN** `archive/added-exists` is still an ERROR

#### Scenario: Already-removed REMOVED target is a no-op

- **WHEN** a `## REMOVED` operation names a requirement the living spec no
  longer has, and no fold-equal name exists
- **THEN** no `archive/target-missing` issue is raised and the archive proceeds

#### Scenario: Mistyped REMOVED header is still an error

- **WHEN** a `## REMOVED` operation names a requirement absent from the living
  spec while a fold-equal living name exists
- **THEN** `archive/target-missing` is still an ERROR and the hint names the
  exact living header

#### Scenario: Already-applied RENAME is a no-op

- **WHEN** a `## RENAMED` operation's source is absent from the living spec and
  its target is present, with no fold-equal near-miss of the source
- **THEN** neither `archive/target-missing` nor `archive/added-exists` is raised
  and the archive proceeds

#### Scenario: Mistyped RENAME source is still an error

- **WHEN** a `## RENAMED` operation's source is absent while a fold-equal living
  name that is not the target exists
- **THEN** `archive/target-missing` is still an ERROR

#### Scenario: A live rename onto an existing target is still an error

- **WHEN** a `## RENAMED` operation's source and target are both present in the
  living spec
- **THEN** `archive/added-exists` is still an ERROR, with no body comparison

#### Scenario: An early-synced RENAME onto an ADDED name is still an error

- **WHEN** a `## RENAMED` operation's source is absent and its target is present
  in the living spec, while an `## ADDED` requirement in the same delta carries
  the target name
- **THEN** `archive/added-exists` is still an ERROR, because the delta-internal
  collision is checked regardless of the early sync

#### Scenario: A missing MODIFIED target is still an error

- **WHEN** a `## MODIFIED` operation names a requirement absent from the living
  spec
- **THEN** `archive/target-missing` is still an ERROR, because the wrapped
  binary has no early-sync path for it
