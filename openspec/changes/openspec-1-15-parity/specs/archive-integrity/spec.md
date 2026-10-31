# Spec Delta

## ADDED Requirements

### Requirement: Spec writes preserve line endings

Every spec write cospec performs or verifies, including `sync-specs` scratch
merges and archive post-conditions, SHALL keep a file's dominant line ending,
and SHALL write a new spec with LF.

#### Scenario: CRLF spec

- **WHEN** a change modifies one requirement in a CRLF living spec
- **THEN** after `cospec archive` the spec is still CRLF and the diff touches
  only that requirement

### Requirement: Retirement cleanup failure is reported precisely

When the delegated human-mode archive moves a change but capability-retirement
cleanup fails, `cospec archive` SHALL classify it from that call's output plus
the move verified on disk, report that the change was archived and cleanup did
not complete, and carry `archive_retirement_cleanup_failed` in its own `--json`
document. The single human-mode delegation SHALL be kept.

#### Scenario: Cleanup failure

- **WHEN** retirement cleanup fails after the move
- **THEN** cospec verifies the move on disk, still fans out blocker sync, and
  exits nonzero with that code

## MODIFIED Requirements

### Requirement: Verification-incomplete archive gate

`cospec archive` SHALL run an explicit `archive/verification-incomplete` step
after the tasks gate and before delegating to `openspec archive`, for every
change whose verification is enforced (per `enforcedApplyRequires`), with or
without specs. Every `verification.md` row SHALL be `[x]` with non-empty
evidence or `[~]` with a non-empty reason; a bare `[ ]` row SHALL refuse with
exit 1. There SHALL be no `--force` escape; a row is resolved by deferral.

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
before `openspec archive`, for specs-bearing changes. Each `## MODIFIED` block's
scenarios SHALL be compared with the living requirement's, found by shared
recursive spec discovery and read by cospec's BOM-, CRLF-, comment- and
fence-aware parser. It SHALL refuse with exit 1 when a living scenario name is
unmatched (case-sensitive, counted with multiplicity) or the count drops. No
annotation SHALL excuse a drop.

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

#### Scenario: A hollowed-out scenario is still a drop

- **WHEN** a MODIFIED delta keeps a living scenario's header but removes its
  body, leaving a bare `#### Scenario: Foo` line
- **THEN** the gate counts `Foo` as missing and refuses with exit 1, rather than
  crediting the empty header as preservation

#### Scenario: A bodyless living scenario is not a phantom loss

- **WHEN** the living spec carries a bodyless `#### Scenario: Foo` header that
  the MODIFIED delta does not repeat
- **THEN** the gate does not report a loss, matching the wrapped binary, rather
  than refusing an archive the binary accepts

#### Scenario: A bodyless header is no scenario on either side

- **WHEN** a `#### ` header has no non-blank line before the next header or the
  end of input, in the delta block or in the living requirement
- **THEN** the gate does not count it as a scenario on that side

#### Scenario: A removal note excuses nothing

- **WHEN** a MODIFIED block drops a living scenario and carries a
  `Scenario removed:` note or any other annotation about it
- **THEN** the gate still refuses with exit 1

#### Scenario: cospec's gate runs ahead of the binary's own check

- **WHEN** a scenario-dropping delta is archived with a wrapped binary at
  OpenSpec 1.8.0 or later, which carries its own overlapping check
- **THEN** cospec's gate still runs first and refuses with cospec's own message
  and rule id, as it does on 1.0.0 through 1.7.x where it is the only defence

### Requirement: Hard gates are explicit command steps

Both archive gates SHALL be explicit `cospec archive` command steps returning
`EXIT.failure` (1), the tasks gate's refusal code, not rules buried in the
specs-conditional archive-precondition family. A mirror scenario-preservation
rule in that family SHALL let `cospec validate --strict` surface it advisorily;
the hard block SHALL remain the command step. The tasks gate, `openspec archive`
delegation, move verification, and blocker fan-out SHALL be unchanged.

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

`cospec archive`'s post-delegation move check SHALL derive the expected archive
directory name from the **local** date the wrapped binary stamps, not a UTC
date. It SHALL accept both forms across the accepted range: `YYYY-MM-DD-<id>`
and, for an id already prefixed `YYYY-MM-DD-`, the id verbatim (openspec 1.7.0
and later). A successful archive SHALL never be reported as a failure over a
date or prefix mismatch.

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

### Requirement: Early-synced delta operations are not archive blockers

The archive-precondition family SHALL treat as no-ops the three shapes the
wrapped binary treats as already synced: an `## ADDED` block equal, after
OpenSpec's CRLF-fold-and-trim, to the living one of that name; a `## REMOVED`
target already absent; a `## RENAMED` with source absent and target present,
suppressing its missing-source and living-side target-collision errors. Each
judgement SHALL use the spec as replayed up to that operation. Every other shape
SHALL stay an ERROR.

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

- **WHEN** a `## REMOVED` operation names a requirement absent from the spec the
  binary has by then, while a fold-equal name survives in it
- **THEN** `archive/target-missing` is still an ERROR and the hint names the
  exact living header

#### Scenario: Already-applied RENAME is a no-op

- **WHEN** a `## RENAMED` operation's source is absent from the living spec and
  its target is present, with no fold-equal near-miss of the source
- **THEN** neither `archive/target-missing` nor `archive/added-exists` is raised
  and the archive proceeds

#### Scenario: Mistyped RENAME source is still an error

- **WHEN** a `## RENAMED` operation's source is absent while a fold-equal name
  that is not the target survives to that operation
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

- **WHEN** a `## MODIFIED` operation names a requirement absent from the spec
  the binary has by the time its MODIFIED phase runs
- **THEN** `archive/target-missing` is still an ERROR, because the wrapped
  binary has no early-sync path for it

#### Scenario: A fold twin withholds the exemption

- **WHEN** the spec as the binary has it at that operation carries a name that
  folds equal to the named requirement (case-insensitive, whitespace runs
  collapsed) but is not it
- **THEN** the early-sync exemption is withheld, and the ERROR names the exact
  header to match

#### Scenario: A RENAMED with neither name present is still an error

- **WHEN** a `## RENAMED` operation's source and target are both absent from the
  spec as the binary has it at that operation
- **THEN** cospec reports an ERROR and refuses the archive, as the binary does

### Requirement: Case-only requirement-name collisions are refused at pre-flight

The archive-precondition family SHALL refuse, as `archive/added-exists` at
pre-flight, an `## ADDED` name or `## RENAMED` target that folds
(case-insensitive, whitespace runs collapsed) onto an existing name, hinting the
exact header and whether it is living or from an earlier operation. Names SHALL
be checked, exact and folded, against the spec replayed in the binary's order
(RENAMED, REMOVED, MODIFIED, ADDED; for a new capability from the empty
skeleton), never the untouched living spec.

#### Scenario: A case-only ADDED collision is refused

- **WHEN** an `## ADDED` requirement is named `User Auth` and the living spec
  carries `### Requirement: User auth`
- **THEN** `cospec validate --strict` reports `archive/added-exists` with a hint
  naming the living header, and `cospec archive` refuses at pre-flight rather
  than at delegation

#### Scenario: A spacing-only ADDED collision is refused

- **WHEN** an `## ADDED` requirement is named `User  Auth` and the living spec
  carries `### Requirement: User Auth`
- **THEN** `archive/added-exists` is an ERROR

#### Scenario: A case-only RENAMED target is refused

- **WHEN** a `## RENAMED` operation's target folds equal to a living requirement
  name that is not its own source
- **THEN** `archive/added-exists` is an ERROR

#### Scenario: A case-only rename is not a collision

- **WHEN** a `## RENAMED` operation renames `Foo` to `foo`, so its target folds
  equal to the living name its own source occupies and to no other
- **THEN** no `archive/added-exists` issue is raised and the archive proceeds

#### Scenario: An early-synced ADDED is not resurrected by the fold

- **WHEN** an `## ADDED` requirement's retained block matches the living
  requirement of the same name under OpenSpec's normalisation, and a fold-equal
  living name exists only because it is that same requirement
- **THEN** no `archive/added-exists` issue is raised and the archive proceeds

#### Scenario: An ADDED folding onto a name the delta removes is applied

- **WHEN** one delta both `## REMOVED`s `Widget caching` and `## ADDED`s
  `WIDGET CACHING`
- **THEN** no `archive/added-exists` issue is raised and the archive proceeds,
  matching the binary, which has already applied the removal by the time it
  checks the added name

#### Scenario: Two ADDED names in one delta that fold onto each other

- **WHEN** one delta `## ADDED`s both `Widget tracing` and `WIDGET TRACING`,
  neither of which the living spec carries
- **THEN** `archive/added-exists` is an ERROR on the second one, naming the
  first and saying it was written by an earlier operation in this delta

#### Scenario: An ADDED folding onto the delta's own RENAMED target

- **WHEN** one delta renames `Widget caching` to `Widget tracing` and
  `## ADDED`s `WIDGET TRACING`
- **THEN** `archive/added-exists` is an ERROR

#### Scenario: A second RENAMED target folding onto the first

- **WHEN** one delta renames `Widget rendering` to `Widget tracing` and
  `Widget caching` to `WIDGET TRACING`
- **THEN** `archive/added-exists` is an ERROR on the second rename

#### Scenario: A rename onto a name an earlier rename vacated is applied

- **WHEN** one delta renames `Widget rendering` to `Widget streaming` and then
  `Widget caching` to `Widget rendering`
- **THEN** no `archive/added-exists` issue is raised and both cospec and the
  wrapped binary archive the change

#### Scenario: Two ADDED names fold the same way for a new capability

- **WHEN** a delta for a capability with no living spec `## ADDED`s two names
  that fold onto each other
- **THEN** `archive/added-exists` is an ERROR

#### Scenario: cospec and the binary agree in both directions

- **WHEN** the contract suite runs a case-only collision and a case-only rename
  against the pinned openspec binary
- **THEN** cospec refuses exactly the delta the binary refuses and accepts
  exactly the delta the binary accepts, so neither a false archive PASS nor a
  false refusal survives the suite

#### Scenario: A MODIFIED naming a header this delta renamed into existence is applied

- **WHEN** one delta renames `Widget rendering` to `Widget drawing` and then
  `## MODIFIED`s `Widget drawing`
- **THEN** no `archive/target-missing` issue is raised and both cospec and the
  wrapped binary archive the change

#### Scenario: A MODIFIED whose target an earlier operation carried away is refused

- **WHEN** one delta renames `Widget rendering` to `Widget drawing` and then
  `## MODIFIED`s `Widget rendering`
- **THEN** `archive/target-missing` is an ERROR whose message says an earlier
  operation in this delta renamed or removed the target

#### Scenario: An ADDED re-using a header an earlier RENAMED vacated is applied

- **WHEN** one delta renames `Widget rendering` to `Widget drawing` and
  `## ADDED`s a new `Widget rendering` with a different body
- **THEN** no `archive/added-exists` issue is raised and both cospec and the
  wrapped binary archive the change

#### Scenario: An early-synced RENAME whose fold twin an earlier rename took away is a no-op

- **WHEN** one delta renames `Widget rendering` to `Widget drawing` and then
  renames `widget  rendering` to the already-present `Widget caching`
- **THEN** neither `archive/target-missing` nor `archive/added-exists` is
  raised, matching the binary, which finds no surviving fold twin of the source

#### Scenario: A rename-then-modify that drops a scenario is still refused

- **WHEN** one delta renames `Widget rendering` to `Widget drawing` and the
  `## MODIFIED` block for `Widget drawing` omits a scenario the living
  `Widget rendering` carries
- **THEN** `archive/scenario-preservation` fires against the rename source's
  scenarios, matching the binary, which aborts the merge

#### Scenario: A name removed later is still present for a rename

- **WHEN** one delta renames `Widget caching` to `WIDGET RENDERING` and also
  `## REMOVED`s `Widget rendering`
- **THEN** `archive/added-exists` is an ERROR on the rename, because renames run
  before removals and the binary refuses there too

#### Scenario: A REMOVED or RENAMED source naming a renamed-in header resolves

- **WHEN** one delta renames `Widget rendering` to `Widget drawing` and then
  `## REMOVED`s `Widget drawing`, or renames `Widget drawing` onward
- **THEN** no `archive/target-missing` issue is raised, as the binary archives
  the change at exit 0

#### Scenario: An ADDED re-using a header REMOVED in the same file is refused

- **WHEN** one delta file `## REMOVED`s `Widget rendering` and `## ADDED`s the
  exact header `Widget rendering`
- **THEN** it is refused as a same-name cross-section conflict, as the binary
  refuses the pair before merging

#### Scenario: An ADDED onto the delta's own RENAMED target is reported once

- **WHEN** an `## ADDED` name lands on this delta's own `## RENAMED` target
- **THEN** exactly one `archive/added-exists` ERROR is reported, on the
  `## ADDED` operation

### Requirement: The post-merge spot-check judges an operation against the delta's net effect

After the delegated merge, `cospec archive` SHALL verify each delta operation
landed in the merged living spec, judging it against what the capability's other
operations in the delta do to that name, not the end state alone. A name another
operation writes SHALL NOT make a `## REMOVED` or `## RENAMED` source read as
"still present", and a name another operation takes away SHALL NOT make an
`## ADDED`, `## MODIFIED` or `## RENAMED` target read as "missing".

#### Scenario: A swap of two requirement names verifies clean

- **WHEN** one delta renames `Widget rendering` to `Widget streaming` and
  `Widget caching` to `Widget rendering`, and the delegated merge applies it
- **THEN** `cospec archive` exits 0, with no spec-merge verification failure for
  the source name the second rename put back

#### Scenario: A genuinely missing operation is still a breach

- **WHEN** the merged living spec is missing a requirement the delta `## ADDED`
  and no other operation in that capability removes it
- **THEN** `cospec archive` reports the spec-merge verification failure and
  exits non-zero

### Requirement: Same-name cross-section conflicts are refused at pre-flight

The archive-precondition family SHALL refuse at pre-flight an `## ADDED`
requirement whose exact normalised name (never folded) the same delta file also
names under `## REMOVED` or `## MODIFIED`, as the wrapped binary does. Each
SHALL be one `archive/added-exists` ERROR on the `## ADDED` operation naming the
requirement and the other section, read from the delta's own sections, and no
other `archive/added-exists` arm SHALL report that operation again.

#### Scenario: REMOVED then ADDED of one name is refused

- **WHEN** one delta file `## REMOVED`s `Widget rendering` and `## ADDED`s a new
  `Widget rendering` with a different body, against a living spec that carries
  it
- **THEN** `cospec validate --strict` reports one `archive/added-exists` ERROR
  on the ADDED operation naming the REMOVED pair, and the pinned binary's
  archive refuses the same change

#### Scenario: ADDED and MODIFIED of one name on a new capability is refused

- **WHEN** a delta for a capability with no living spec both `## ADDED`s and
  `## MODIFIED`s `Gadget thing`
- **THEN** `archive/added-exists` is an ERROR on the ADDED operation naming the
  MODIFIED pair, alongside the existing `archive/new-spec-non-added` on the
  MODIFIED operation

#### Scenario: ADDED matching the living block plus MODIFIED is refused

- **WHEN** one delta both `## ADDED`s `Widget rendering` with a block identical
  to the living requirement and `## MODIFIED`s `Widget rendering`
- **THEN** `archive/added-exists` is an ERROR, although the early-sync exemption
  would otherwise leave the ADDED silent, because the pinned binary refuses the
  pair

#### Scenario: A fold variant is not a cross-section conflict

- **WHEN** one delta `## REMOVED`s `Widget rendering` and `## ADDED`s
  `WIDGET RENDERING`
- **THEN** no cross-section conflict is raised, and the pinned binary archives
  the change

#### Scenario: One refusal per ADDED operation

- **WHEN** one delta `## ADDED`s `Widget rendering` with a body different from
  the living requirement and `## MODIFIED`s `Widget rendering`
- **THEN** the ADDED operation carries exactly one `archive/added-exists` ERROR,
  the cross-section one

#### Scenario: Cross-section conflicts ignore the living spec

- **WHEN** an `## ADDED` and a `## REMOVED` or `## MODIFIED` of one exact name
  sit in one delta file, for a new capability or a living one, whether or not
  the living spec carries the name or matches the ADDED block
- **THEN** `archive/added-exists` is an ERROR on the `## ADDED` operation

#### Scenario: Each pair is contract-tested against the binary

- **WHEN** the contract suite runs each cross-section pair through
  `cospec validate --strict` and the pinned binary's `archive`
- **THEN** cospec refuses exactly the pairs the binary refuses

### Requirement: Archive preconditions read what the archive merges

cospec SHALL scan each delta and living spec once, finding fences first so no
HTML comment opens or closes on a fenced line, yielding a verbatim view (fences
masked, comments kept) and a masked view (comments masked too). Every
`archive/*` rule, every gate-affecting `deltas/*` finding, and the hard
scenario-preservation gate SHALL read the verbatim view; the masked view SHALL
feed only `deltas/skipped-header`, `deltas/scenario-depth` and
`specs/purpose-tbd`.

#### Scenario: A comment opener inside a fenced example hides nothing

- **WHEN** a MODIFIED block's first scenario is a fenced example containing
  `<!-- note`, and its second scenario is the one the living spec has
- **THEN** `cospec validate --strict` reports no finding and `cospec archive`
  archives the change, as the binary's archive does

#### Scenario: A living scenario inside a comment is one a MODIFIED can drop

- **WHEN** the living `Widget caching` block carries a scenario inside an HTML
  comment, and the MODIFIED block omits it
- **THEN** `cospec validate --strict` reports `archive/scenario-preservation`
  naming it, and the binary's archive refuses the change

#### Scenario: A scenario kept inside a comment is kept

- **WHEN** a MODIFIED block keeps a living scenario only inside an HTML comment
- **THEN** `cospec validate --strict` reports no
  `archive/scenario-preservation`, and the binary's archive applies the change

#### Scenario: The hard gate keeps a scenario kept inside a comment

- **WHEN** a MODIFIED block keeps a living scenario only inside an HTML comment
- **THEN** `cospec archive` archives the change, as the binary's archive does

#### Scenario: A comment spanning a section boundary is read as written

- **WHEN** a delta's `## ADDED Requirements` header sits inside an HTML comment
  above a complete requirement
- **THEN** `cospec validate --strict` and `cospec archive` accept the change, as
  the binary's validate and archive do

#### Scenario: A gate cannot be handed the masked parse

- **WHEN** a gate function is called with the comment-masked parse of a delta or
  living spec
- **THEN** the typecheck refuses the call

#### Scenario: A commented ADDED that collides is refused

- **WHEN** a delta's HTML comment carries an `## ADDED Requirements` section
  whose `Widget rendering` block differs from the living one
- **THEN** `cospec validate --strict` reports `archive/added-exists`, and the
  binary's archive refuses the change

#### Scenario: A commented MODIFIED with a missing target is refused

- **WHEN** a delta's HTML comment carries a `## MODIFIED Requirements` block for
  a requirement the living spec lacks
- **THEN** `cospec validate --strict` reports `archive/target-missing`, and the
  binary's archive refuses the change

#### Scenario: A comment-bearing ADDED name is not the REMOVED one

- **WHEN** a delta REMOVEs `Widget rendering` and ADDs
  `### Requirement: Widget rendering <!-- restated -->`
- **THEN** `cospec validate --strict` reports no cross-section conflict, and the
  binary's archive applies both operations

#### Scenario: Commented operations and names are read as written

- **WHEN** an operation, a requirement header's trailing comment, or a scenario
  sits inside an HTML comment in a delta or living spec
- **THEN** the operation is checked as the archive applies it, the comment is
  part of the name, and the scenario counts on both sides of the loss check

#### Scenario: Every comment shape matches the binary

- **WHEN** a statement, requirement or scenario header sits inside a comment, a
  comment spans a section boundary, a living spec carries a commented delta
  header, a scenario is kept only in a comment, a comment is unterminated, or a
  commented orphan or unread file exists
- **THEN** `cospec validate --strict` and `cospec archive` accept exactly what
  the pinned binary's `validate` and `archive` accept, under a contract test

#### Scenario: A rule-view unit test enumerates every rule

- **WHEN** the unit suite runs
- **THEN** it enumerates every `archive/*` and `deltas/*` rule and proves each
  reads the view it is registered under, the masked parse being a distinct type
  no gate accepts

#### Scenario: A BOM is stripped except for the structure check

- **WHEN** a delta or living spec opens with a UTF-8 BOM
- **THEN** both views strip it, except the living-spec structure check, which
  keeps it as the binary's structure reader does

### Requirement: A skipped header that splits a requirement is refused at pre-flight

The archive-precondition family SHALL refuse, as `archive/split-requirement` on
its line, a skipped `###` header inside an `## ADDED` or `## MODIFIED` block
that leaves a piece without a scenario, as the rebuilt spec reads it: a block's
first skipped header with no scenario above it, or any header with no bodied
scenario before the next header or block end. A header above the first
requirement or with its own scenario SHALL NOT be refused. Under `--fast` the
rule SHALL NOT run.

#### Scenario: A header between the text and the only scenario is refused

- **WHEN** an ADDED `Widget thing` block carries `### Notes inside` between its
  SHALL statement and its only `#### Scenario:`
- **THEN** `cospec validate --strict` reports `archive/split-requirement` on
  that line, and the binary's archive refuses the change

#### Scenario: A nameless header after the scenario is refused

- **WHEN** a `### Requirement:` line with no name follows a block's scenario
- **THEN** `archive/split-requirement` reports it, and the binary's archive
  refuses the change

#### Scenario: A commented header splits the block too

- **WHEN** a `### Hidden notes` line sits inside an HTML comment between a
  requirement's text and its scenario
- **THEN** `archive/split-requirement` reports it, and the binary's archive
  refuses the change

#### Scenario: A blank-titled header with no text before its scenario is refused

- **WHEN** an ADDED block carries a `###` line with only whitespace after it
  between two scenarios
- **THEN** `archive/split-requirement` reports it as leaving a requirement with
  no text, no `deltas/skipped-header` INFO is raised for it, and the binary's
  archive refuses the change

#### Scenario: A header whose only child is a bodied level-5 header is kept

- **WHEN** a `### Notes` line whose only child is a `##### Sub-case` with steps
  sits after a block's scenario, or above it under a `#####` of the block's own
- **THEN** no `archive/split-requirement` is raised, `deltas/skipped-header`
  reports the line at INFO, and the binary's archive applies the change

#### Scenario: A header with its own scenario is kept

- **WHEN** a `### Notes after` line followed by its own `#### Scenario:` sits
  after a block's scenario
- **THEN** no `archive/split-requirement` is raised, `deltas/skipped-header`
  reports the line at INFO, and the binary's archive applies the change

#### Scenario: Scenarios are counted on the rebuilt spec's parse

- **WHEN** a piece under a skipped header carries any deeper header with a body,
  a `#####` included, or the merge refuses before building a spec
- **THEN** the piece's scenarios are read off the rebuilt spec's own parse, or
  the block inside a spec of its own with the same parser, never off a count of
  `#### ` headers in the isolated block

#### Scenario: Fenced headers and already-reported lines are left alone

- **WHEN** the header sits inside a code fence, or is a `### Scenario:` line
  `deltas/scenario-depth` already reports
- **THEN** no `archive/split-requirement` is raised for it

#### Scenario: A cut inside a kept living requirement belongs elsewhere

- **WHEN** the same cut sits inside a living requirement the delta keeps
- **THEN** `archive/rebuilt-spec-invalid` reports it, not
  `archive/split-requirement`

#### Scenario: Under --fast the header is reported at INFO

- **WHEN** `cospec validate --fast` runs on a block with a splitting header
- **THEN** `archive/split-requirement` does not run and `deltas/skipped-header`
  reports the header at INFO

### Requirement: A structurally invalid living spec is refused at pre-flight

`archive/target-invalid` SHALL refuse, naming each defect's line, a living spec
with a delta header, a `### Requirement:` outside `## Requirements`, or a
duplicate normalised requirement name there, reading it as the binary's
structure reader does: fences excluded, comments as written, a BOM kept. A spec
missing `## Requirements` or `## Purpose` SHALL NOT be refused by this rule, as
the archive refuses neither before merging.

#### Scenario: A delta header in a living spec is refused, commented or not

- **WHEN** the living spec carries `## ADDED Requirements`, visibly or on its
  own line inside an HTML comment
- **THEN** `cospec validate --strict` reports `archive/target-invalid` naming
  the delta header, and the binary's archive refuses the change

#### Scenario: A BOM before a first-line ## Requirements is refused

- **WHEN** the living spec opens with a UTF-8 BOM directly before
  `## Requirements`
- **THEN** `archive/target-invalid` names every requirement as outside the
  section, and the binary's archive refuses the change

#### Scenario: A duplicate living requirement is refused

- **WHEN** the living spec declares `### Requirement: Widget rendering` twice
  under `## Requirements`
- **THEN** `cospec validate --strict` reports `archive/target-invalid` naming
  the duplicate, and the binary's archive refuses the change

#### Scenario: A requirement outside ## Requirements is refused

- **WHEN** the living spec carries `### Requirement: Stray` under `## Purpose`,
  written plainly or inside an HTML comment
- **THEN** `archive/target-invalid` names it as outside the section, and the
  binary's archive refuses the change

#### Scenario: A fenced requirement header is not a defect

- **WHEN** the `### Requirement: Stray` line under `## Purpose` sits inside a
  fenced code block
- **THEN** no `archive/target-invalid` is raised, and the binary's archive
  applies the change

#### Scenario: A living spec with no ## Requirements takes an ADDED

- **WHEN** the living spec has a `## Purpose` and no `## Requirements`, and the
  delta ADDs a requirement
- **THEN** no `archive/target-invalid` is raised, cospec reports no ERROR, and
  both the binary's archive and `cospec archive` apply the change

### Requirement: The rebuilt spec is validated as the archive validates it

The archive-precondition family SHALL rebuild each capability's main spec as the
wrapped binary's archive does, on the verbatim view, and run a port of its
main-spec validation over it, reporting each ERROR as
`archive/rebuilt-spec-invalid` naming the header and its living or delta line.
It SHALL NOT run for a capability another precondition rule refused, where the
merge refuses, or in the legacy lane. The rebuilt text SHALL equal, byte for
byte, what the pinned binary writes.

#### Scenario: A header above the first living requirement is refused

- **WHEN** the living spec carries `### Notes`, a loose `#### Scenario:`, or a
  `### Notes` inside a multi-line HTML comment between `## Requirements` and its
  first requirement, and the delta MODIFIES `Widget rendering`
- **THEN** `cospec validate --strict` reports one `archive/rebuilt-spec-invalid`
  naming the header and its living line, the binary's validate reports nothing,
  and the binary's archive refuses the change

#### Scenario: A surviving requirement with no scenario is refused

- **WHEN** a living requirement the delta keeps has no scenario, a scenario
  header with no steps, or a scenario only inside a code fence, or the living
  spec ends with a commented-out draft requirement
- **THEN** `archive/rebuilt-spec-invalid` names the requirement and its living
  line, and the binary's archive refuses the change

#### Scenario: A split in a surviving living requirement is refused

- **WHEN** the living `Widget rendering` block carries `### Notes on rendering`
  above its only scenario, and the delta MODIFIES `Widget caching` or RENAMES
  `Widget rendering`
- **THEN** `archive/rebuilt-spec-invalid` names the requirement, the header and
  the header's living line, no `archive/split-requirement` is raised, and the
  binary's archive refuses the change

#### Scenario: Spec-level defects are refused

- **WHEN** the living spec has no `## Purpose` text, carries a
  `### Requirements` heading under `## Purpose`, or the delta removes every
  requirement without `retire_capabilities: true`
- **THEN** `archive/rebuilt-spec-invalid` reports it, and the binary's archive
  refuses the change

#### Scenario: A declared retirement the archive refuses is refused

- **WHEN** a change with `retire_capabilities: true` removes every requirement
  of a living spec that also holds prose, a comment, a fence, a heading, a table
  or a trailing section outside `## Purpose` and the blocks' own parts — above
  the requirements, or inside or below a removed block — or removes none from a
  spec with no `## Requirements`
- **THEN** `cospec validate --strict` reports one `archive/rebuilt-spec-invalid`
  quoting the blocking lines the binary's refusal quotes (or saying the change
  removes none of its requirements), and the binary's archive refuses the change

#### Scenario: A retirement the archive performs is clean

- **WHEN** a change with `retire_capabilities: true` removes every requirement
  of a living spec whose `## Purpose` holds a `### Requirements` or
  `#### Requirements` heading, or whose scenario bullets wrap
- **THEN** no `archive/rebuilt-spec-invalid` is raised, and the binary's archive
  deletes the spec and archives the change

#### Scenario: A block written inside an HTML comment is refused on its line

- **WHEN** a delta carries a `### Requirement:` block inside an HTML comment
  with no statement or no scenario, and the change is never delegated
- **THEN** `archive/rebuilt-spec-invalid` reports it on the commented header's
  delta line, and the binary's validate and archive refuse the change

#### Scenario: Shapes the archive accepts are clean

- **WHEN** a living requirement's scenario sits inside an HTML comment or under
  a level-5 header, the preamble holds prose or a one-line comment, a MODIFIED
  replaces a split requirement, or the change retires the capability it empties
- **THEN** no `archive/rebuilt-spec-invalid` is raised, and the binary's archive
  applies the change

#### Scenario: A delta block the delta rules miss is refused on its line

- **WHEN** an ADDED block carries a `# Aside` heading between its text and its
  scenario
- **THEN** `archive/rebuilt-spec-invalid` reports it on the block's delta line,
  and the binary's archive refuses the change

#### Scenario: cospec archive refuses before delegating

- **WHEN** `cospec archive` runs on a change whose living spec carries a
  preamble `### Notes`
- **THEN** it exits non-zero naming `archive/rebuilt-spec-invalid`, and the
  change stays in place

#### Scenario: An unhonourable marker is refused with its reason

- **WHEN** a change sets `retire_capabilities: true` with an empty `goal:`, an
  `affected_areas:` that is not a list, a `created:` not in `YYYY-MM-DD` form,
  or a `schema:` the binary cannot list, and REMOVEs every requirement
- **THEN** `cospec validate` reports `archive/rebuilt-spec-invalid` naming the
  reason the binary's archive quotes, and the binary's archive refuses the
  change

#### Scenario: The rebuild follows the binary's merge

- **WHEN** a capability's spec is rebuilt
- **THEN** it starts from the living spec, or for a new capability the skeleton
  carrying the delta's readable `## Purpose`, applies RENAMED, REMOVED, MODIFIED
  then ADDED, keeps living order with new blocks appended, and keeps the
  preamble and every other section as written

#### Scenario: The ported validation checks what the archive checks

- **WHEN** the rebuilt spec is validated
- **THEN** every header under the first `Requirements` section needs text and a
  bodied scenario, `## Purpose` needs text, at least one requirement must exist,
  the three structure defects are refused, and every `### Requirement:` needs a
  statement

#### Scenario: A delta-line finding is dropped only where another rule reported

- **WHEN** a finding falls on a line a delta block writes
- **THEN** it is dropped only where `deltas/requirement-shape` or
  `archive/split-requirement` reported that very line, a commented block being
  `deltas/requirement-shape`'s as a visible one is

#### Scenario: The retirement marker counts only where the binary honours it

- **WHEN** a change sets `retire_capabilities: true`
- **THEN** it counts only if the whole `.openspec.yaml` passes the binary's
  change-metadata schema and its `schema:` is one the binary lists and loads,
  and otherwise counts as none, with the finding naming the binary's reason

#### Scenario: The no-requirements ERROR is skipped only on the binary's decision

- **WHEN** an honoured marker is set
- **THEN** the no-requirements ERROR is skipped only if no block survives, every
  rebuilt ERROR is a no-requirements one, nothing in the living spec lies
  outside the title, `## Purpose` and each block's header, statement and
  scenario bullets, and this change removed a block; a blocked retirement quotes
  the blocking lines and one the change did not empty is reported as such

#### Scenario: Without the marker the finding says what would help

- **WHEN** a change empties a spec without the marker
- **THEN** the finding names the marker only when setting it alone would let the
  archive through, and the blocking lines otherwise

### Requirement: In-file operation conflicts are refused natively

The archive-precondition family SHALL refuse, as `archive/op-conflict`, three
in-file conflicts the wrapped binary's validate refuses and no other rule
reports: a `## MODIFIED` or a `## REMOVED` requirement written twice (exact
names), and a `## REMOVED` name folding onto a `## RENAMED` FROM name. A
cospec-typed change with no `proposal.md`, never delegated, SHALL be refused
natively on every conflict shape the binary's validate reports.

#### Scenario: A duplicated MODIFIED or REMOVED is refused

- **WHEN** a delta MODIFIES `Widget caching` twice, or REMOVES it twice
- **THEN** `archive/op-conflict` names it on the later entry, and the binary's
  archive refuses the change

#### Scenario: A REMOVED of a RENAMED source is refused

- **WHEN** a delta RENAMES `Widget rendering` and REMOVES `Widget rendering` or
  `widget  rendering`
- **THEN** `archive/op-conflict` names the REMOVED and the RENAMED FROM, and the
  binary's archive refuses the change

#### Scenario: A never-delegated change is refused on every conflict shape

- **WHEN** a cospec-typed change with no `proposal.md` carries any conflict the
  binary's validate refuses — a duplicate ADDED, MODIFIED or REMOVED, a
  duplicate RENAMED source or target, a cross-section pair, a REMOVED or
  MODIFIED of a RENAMED source, or a RENAMED target the delta ADDs
- **THEN** a native `archive/*` ERROR names the requirement, and no relayed
  finding appears

### Requirement: --no-validate skips only revalidation

`cospec archive <change> --no-validate` SHALL skip only cospec's revalidation
(`validateChange`) and forward `--no-validate` to the wrapped `archive -y`.
Every other gate SHALL still run, preceded by a stderr banner, in text and
`--json` mode, saying revalidation was skipped and naming the gates that still
run. cospec SHALL NOT prompt, so the binary's `archive_confirmation_required`
refusal has no cospec counterpart.

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

#### Scenario: The gates that still run are named

- **WHEN** `cospec archive c1 --no-validate` runs
- **THEN** the namespace-folder refusal, the tasks gate,
  `archive/verification-incomplete`, the archive-slot check,
  `archive/scenario-preservation`, the on-disk move verification and the
  post-merge spot-check all still run, and the banner names them

### Requirement: One scenario-preservation helper reads the verbatim view

The `archive/scenario-preservation` gate SHALL live in one shared helper that
`cospec archive` and `cospec sync-specs` both call, reading the living spec and
delta as the binary's archive does: fences masked, HTML comments kept. A
commented living scenario SHALL count as living, and one a MODIFIED block keeps
only in a comment SHALL count as kept, so the gate refuses and passes exactly
where `openspec archive` does.

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

### Requirement: A brand-new capability refuses only MODIFIED and RENAMED

`archive/new-spec-non-added` SHALL be an ERROR only on a MODIFIED or RENAMED
operation targeting a capability with no living spec. A REMOVED there SHALL NOT
be reported by it, as the binary ignores it with a warning ("nothing to remove")
and applies the rest. A delta only REMOVing on a new capability, without
`retire_capabilities: true`, SHALL still be refused, by
`archive/rebuilt-spec-invalid`, as the spec written has no requirements.

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
