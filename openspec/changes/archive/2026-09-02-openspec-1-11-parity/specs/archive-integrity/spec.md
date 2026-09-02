## MODIFIED Requirements

### Requirement: Scenario-preservation archive gate

`cospec archive` SHALL run an explicit `archive/scenario-preservation` step
before `openspec archive` executes, for specs-bearing changes only. For each
`## MODIFIED Requirements` delta, it SHALL read the current living spec for the
delta's capability — resolved through the shared recursive spec discovery, so a
delta at `specs/<area>/<capability>/spec.md` is compared against the living
`<capability>` and not against `<area>` — and compare `#### Scenario:` counts
parsed with cospec's normalising parser (BOM, CRLF, HTML-comment, and
fence-aware). If the delta drops scenarios without a matching `## REMOVED`
operation or explicit reason, the step SHALL refuse with exit 1. This SHALL
catch scenario thinning that `openspec archive` would otherwise wave through at
exit 0. From OpenSpec 1.6.0 the wrapped binary carries its own overlapping
check; cospec's gate SHALL still run first, with cospec's own message, because
it remains the only defence across the lower half of the accepted
`>=1.0.0 <2.0.0` range.

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

## ADDED Requirements

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
