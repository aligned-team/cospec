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
(BOM, CRLF, HTML-comment, and fence-aware). A `#### ` header with no body — no
non-blank line before the next header or end of input — SHALL NOT be counted as
a scenario, and this SHALL apply identically to the delta side and the living
side, so the gate neither passes a delta that hollows a real scenario out to a
bare header nor refuses a merge the wrapped binary accepts because the living
spec carries one. The comparison SHALL be by scenario **name**, counted with
multiplicity: every living scenario name whose occurrences are not all matched
by an occurrence of the same name in the delta block is a missing scenario.
Names SHALL be compared case-sensitively, so a case-only rename is a drop. The
existing count comparison SHALL be retained as a second arm, and the step SHALL
refuse with exit 1 when either arm reports a loss. There SHALL be no escape
hatch: neither a `Scenario removed:` note nor any other annotation excuses a
name-identity or count drop, and a requirement dropped through `## REMOVED`
carries no MODIFIED operation and so is never seen by this gate. This SHALL
catch scenario thinning and same-count scenario renaming that `openspec archive`
would otherwise wave through at exit 0 on the lower half of the accepted
`>=1.0.0 <2.0.0` range. From OpenSpec 1.8.0 the wrapped binary carries its own
overlapping check; cospec's gate SHALL still run first, with cospec's own
message and rule id, because it remains the only defence on 1.0.0 through 1.7.x.

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
target-collision error the same shape raises today. Every one of these
judgements — the target's presence and each exemption — SHALL be made against
the spec as the wrapped binary has it when that operation runs, never the
untouched living spec; see "Case-only requirement-name collisions are refused at
pre-flight" for the replay. Each exemption SHALL be withheld when that spec
still carries a name that folds equal to the named requirement —
case-insensitively, with runs of whitespace collapsed — but is not it, because
that is a mistyped header the wrapped binary aborts on; the resulting ERROR
SHALL name the exact header to match. The remaining shapes SHALL stay ERRORs: an
ADDED collision whose normalised block differs, a RENAMED whose source and
target are both absent, a RENAMED applied while both source and target are
present, a RENAMED whose target collides with an `## ADDED` requirement in the
same delta — which the wrapped binary refuses before it classifies any early
sync, so the early-sync exemption SHALL NOT reach it — and a MODIFIED whose
target is absent — the wrapped binary refuses each of these, and relaxing any of
them would be a false archive PASS.

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

### Requirement: Case-only requirement-name collisions are refused at pre-flight

The archive-precondition rule family SHALL refuse a `## RENAMED` target and an
`## ADDED` name that collides with an existing requirement name only in letter
case or in internal whitespace, matching what the wrapped binary refuses when it
builds the updated spec. The comparison SHALL be the same fold the
`archive/target-missing` arm already uses — case-insensitive, with runs of
whitespace collapsed — and the resulting ERROR SHALL be `archive/added-exists`,
with a hint naming the exact header the name folds onto so the author can either
match it or choose a distinct name. The message SHALL say where that header came
from: the living spec, or an earlier operation in the same delta.

The names an operation is checked against SHALL be the spec as the wrapped
binary has it when that operation runs — the living spec with the delta's
earlier operations already applied to it, in the binary's own order (`RENAMED`,
then `REMOVED`, then `MODIFIED`, then `ADDED`) — and never the untouched living
spec. Checking against the untouched living spec alone reported clean on every
collision a delta makes with itself: two `## ADDED` names that fold onto each
other, an `## ADDED` that folds onto the delta's own `## RENAMED` target, a
second `## RENAMED` whose target folds onto the first one's. Each of those SHALL
be an `archive/added-exists` ERROR, reported on the later operation — the one
the binary refuses. A capability with no living spec SHALL be checked the same
way, starting from the empty skeleton spec the binary builds for it, because the
`## ADDED` operations of a brand-new capability collide with each other exactly
as they do against a living one.

Two exclusions SHALL hold, because either one gone wrong turns a false archive
PASS into a false refusal. A `## RENAMED` operation's fold check SHALL exclude
the name its own source occupies, so a case-only rename is applied as a rename
rather than reported as a collision against itself. The existing early-sync
exemptions SHALL keep applying, so a fold near-miss never resurrects a collision
on an `## ADDED` requirement whose retained block already matches the living
requirement of that name. Replaying the delta SHALL cover the rest: a living
name the same delta removes or renames away is gone before an `## ADDED` name is
folded against it, so the addition is not a second copy of anything; a name
removed later in the same delta is still present when a `## RENAMED` target is
checked, because renames run first, and the binary refuses there too; and a name
an earlier `## RENAMED` vacated SHALL be free for a later one to take.

The replayed set SHALL govern the exact-name arms too, not only the fold ones. A
`## MODIFIED`, a `## REMOVED` or a `## RENAMED` source naming a header an
earlier `## RENAMED` in the same delta created SHALL resolve; a `## RENAMED`
early sync's near-miss search SHALL see only the names that survive to that
operation; and an `## ADDED` SHALL be free to re-use the exact header an earlier
`## RENAMED` vacated. Each of those is a delta the wrapped binary archives at
exit 0, and judging them against the untouched living spec refused every one. An
`## ADDED` re-using the exact header an `## REMOVED` in the same delta file
names is not one of them: the wrapped binary refuses that pair before it merges
anything, and it is refused as a same-name cross-section conflict. The matching
refusals SHALL stay: a target an earlier operation carried away is an
`archive/target-missing` ERROR whose message says so, and an `## ADDED` landing
on this delta's own `## RENAMED` target stays the `archive/added-exists` ERROR
the binary's pre-validation raises, reported once.

`archive/scenario-preservation` SHALL follow a rename with the requirement: a
`## MODIFIED` block naming a header this delta renamed into existence SHALL be
measured against the scenarios of the `## RENAMED` source's living block,
because that is the block the wrapped binary compares it to. Measuring against
the absent target name instead found no living scenarios and waved through a
drop the binary aborts on — a false archive PASS.

Refusal SHALL happen at cospec's own pre-flight, before delegation, so the user
sees cospec's rule id and message rather than a late abort from inside the
delegated merge.

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

### Requirement: The post-merge spot-check judges an operation against the delta's net effect

After the delegated merge, `cospec archive` SHALL verify each delta operation
landed by reading the merged living spec — and SHALL judge each operation
against what the capability's other operations in the same delta do to that
name, not against the end state alone. A name another operation writes
(`## ADDED`, or a `## RENAMED` target) SHALL NOT make a `## REMOVED` or a
`## RENAMED` source read as "still present", and a name another operation takes
away SHALL NOT make an `## ADDED`, a `## MODIFIED` or a `## RENAMED` target read
as "missing". Reporting either one is a false invariant breach on a delta the
wrapped binary applies correctly, and the message it prints tells the user to
file a bug.

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

The archive-precondition rule family SHALL refuse an `## ADDED` requirement
whose exact name the same delta file also names under `## REMOVED` or under
`## MODIFIED`, because the wrapped binary's validation refuses both pairs before
its merge runs, and `openspec archive` exits without archiving. Names SHALL be
compared after the same requirement-name normalisation the parser already
applies, and never folded: an `## ADDED` that differs from a removed or modified
name only in case or spacing SHALL NOT be a cross-section conflict, as the
wrapped binary does not treat it as one.

Each conflict SHALL be an `archive/added-exists` ERROR reported once, on the
`## ADDED` operation, whose message names the requirement and the other section.
The check SHALL read the delta file's own section names, not the replayed spec,
so it SHALL fire on a new capability and on a living one alike, whether or not
the living spec carries the name and whether or not the ADDED block matches the
living requirement. When a cross-section conflict fires on an `## ADDED`
operation, the other `archive/added-exists` arms SHALL NOT report a second
finding on that same operation.

The refusal SHALL happen at cospec's own pre-flight, before delegation, and a
contract test SHALL run each pair through both `cospec validate --strict` and
the pinned binary's `archive`, so that cospec refuses exactly the pairs the
binary refuses.

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

### Requirement: Archive preconditions read what the archive merges

cospec SHALL scan each delta file and living spec once, finding code fences on
the raw lines before anything else, and SHALL NOT let an HTML comment open or
close on a fenced line. Two views SHALL be read off that one scan: the verbatim
view (fenced code masked, HTML comments kept — what the wrapped binary's readers
and its archive read) and the masked view (HTML comments masked as well). Every
rule in the archive-precondition family, `archive/scenario-preservation`
included, SHALL read the verbatim view of both the delta files and the living
spec: an operation written inside an HTML comment SHALL be checked as the
operation the archive applies, a requirement header's trailing comment SHALL be
part of its name, and a scenario inside a comment SHALL count on both sides of
the scenario-loss check. Every other check that can change a gate outcome SHALL
read the verbatim view too: every `deltas/*` finding at ERROR or WARNING that
reads spec text — the statement, SHALL/MUST and scenario checks of
`deltas/requirement-shape` among them — and the hard scenario-preservation gate
of `cospec archive`. The masked view SHALL feed only advisory findings that no
commented line can trigger (`deltas/skipped-header`, `deltas/scenario-depth`,
`specs/purpose-tbd`), and the masked parse SHALL be a distinct type that no gate
accepts, with a unit test enumerating every `archive/*` and `deltas/*` rule and
proving each reads the view it is registered under. For every way an HTML
comment has made the two readings differ — a statement, a requirement header or
a scenario header inside a comment, a comment spanning a section boundary, a
commented delta header in a living spec, a scenario kept only inside a comment,
an unterminated comment, a commented orphan or unread file —
`cospec validate --strict` and `cospec archive` SHALL accept exactly what the
wrapped binary accepts. A UTF-8 BOM SHALL be stripped in both views, except in
the living-spec structure check, which SHALL keep it as the wrapped binary's
structure reader does. Each shape SHALL be covered by a contract test that runs
the pinned binary's `validate` and `archive` on the fixture.

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

### Requirement: A skipped header that splits a requirement is refused at pre-flight

The archive-precondition rule family SHALL refuse, as the ERROR
`archive/split-requirement` on the header's line, a skipped `###` header inside
an `## ADDED` or `## MODIFIED` requirement block that leaves a piece of the
block with no scenario: the wrapped binary's archive appends the block as
written and re-validates the rebuilt spec, where every `###` header is a
requirement of its own, and refuses a requirement with no scenario. What counts
as a scenario SHALL be read off the rebuilt spec's own parse, where any deeper
header with a body under the piece — a `#####` included — is one, never off a
count of `#### ` headers in the isolated block; where the merge refuses before
building a spec, the block SHALL be read inside a spec of its own with the same
parser. The header SHALL be refused when it is the block's first skipped header
and the requirement's own text has no scenario above it, or when no scenario
with a body follows it before the next header or the block's end. A header above
the first requirement block, or one followed by a scenario of its own, SHALL NOT
be refused, because the archive keeps it. A header inside an HTML comment SHALL
be read as the archive reads it; a fenced one SHALL NOT. A `### Scenario:` line
that `deltas/scenario-depth` already reports SHALL NOT also be reported by this
rule. A header whose title is blank (`###` followed only by whitespace) SHALL
also be refused when a scenario follows it but no line of text sits between the
two, because the rebuilt spec reads it as a requirement with no text. The same
cut inside a living requirement the delta keeps SHALL be
`archive/rebuilt-spec-invalid`'s to report, not this rule's. Under `--fast` the
rule SHALL NOT run, and `deltas/skipped-header` SHALL report the header at INFO
instead.

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

### Requirement: A structurally invalid living spec is refused at pre-flight

`archive/target-invalid` SHALL refuse a living spec that carries a delta header
(`## ADDED Requirements` and its siblings), a `### Requirement:` header outside
its `## Requirements` section, or a second requirement under a normalised name
already declared there, because the wrapped binary's archive refuses to update
such a spec before merging anything. The check SHALL read the living spec as the
wrapped binary's structure reader does: fenced lines excluded, HTML comments
read as written, a UTF-8 BOM kept. The message SHALL name each defect's line. A
living spec missing `## Requirements` or `## Purpose` SHALL NOT be refused by
this rule, because the wrapped binary's archive refuses neither before merging:
it appends an empty `## Requirements`, and a missing Purpose is the rebuilt
spec's to refuse.

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

The archive-precondition rule family SHALL rebuild each capability's main spec
the way the wrapped binary's archive does — the living spec, or for a new
capability the skeleton the archive writes with the delta's readable
`## Purpose` carried, with the delta's operations applied in the binary's order
(RENAMED, REMOVED, MODIFIED, ADDED), the living order kept and new blocks
appended, and the preamble and every other section kept as written — reading
both files on the verbatim view. It SHALL then run a port of the binary's
main-spec validation over the result and report each ERROR it raises as the
ERROR `archive/rebuilt-spec-invalid`, naming the header and the living-spec line
it came from, or for a block the delta writes, its delta line. That validation
takes every header under the first section titled `Requirements` as a
requirement needing text and a scenario with a body, needs `## Purpose` text and
at least one requirement, refuses the three structure defects, and needs a
statement under every `### Requirement:` header.

A finding on a line a delta block writes SHALL be dropped only where
`deltas/requirement-shape` or `archive/split-requirement` reported that very
line, never on the assumption that one did; a block written inside an HTML
comment, which `deltas/requirement-shape` reads as the wrapped binary's
validator does, SHALL be that rule's, as a visible one is. The rule SHALL NOT
run for a capability another archive-precondition rule already refused, because
the archive stops there first, nor where the merge itself refuses.

The marker SHALL count only where the wrapped binary's archive honours it
(`readBooleanMarker`): the whole `.openspec.yaml` passes its change-metadata
schema and its `schema:` is one the binary lists and loads. A marker it cannot
honour SHALL count as none, and the finding for a spec the change empties SHALL
name the binary's reason. Under an honoured `retire_capabilities: true` the
no-requirements ERROR SHALL be skipped only on the wrapped binary's own
retirement decision: no requirement block survives the merge, every ERROR of the
rebuilt spec is a no-requirements one at whatever level the header read as the
Requirements section sits, nothing in the living spec sits outside what a
retirement can name (the title, `## Purpose`, and each requirement block's own
header, statement and scenario bullets), and this change removed a requirement
block. A declared retirement the content blocks SHALL be reported with the
blocking lines quoted as the binary's refusal quotes them; one the change did
not empty SHALL be reported as such. Without the marker, the finding SHALL name
the marker only when setting it alone would let the archive through, and the
blocking lines otherwise. The legacy lane SHALL NOT run the rule. The rebuilt
text SHALL equal, byte for byte, the spec the pinned binary writes for the same
change.

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

### Requirement: In-file operation conflicts are refused natively

The archive-precondition rule family SHALL refuse, as the ERROR
`archive/op-conflict`, the three conflicts inside one delta file that the
wrapped binary's validate refuses and no other archive-precondition rule
reports: a `## MODIFIED` requirement written twice, a `## REMOVED` requirement
written twice (exact names), and a `## REMOVED` name that folds onto a
`## RENAMED` FROM name. A cospec-typed change with no `proposal.md`, which
cospec never delegates, SHALL be refused natively on every conflict shape the
wrapped binary's validate reports.

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
