## MODIFIED Requirements

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

## ADDED Requirements

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
the scenario-loss check. Only the advisory `deltas/*` rules SHALL read the
masked view. A UTF-8 BOM SHALL be stripped in both views, except in the
living-spec structure check, which SHALL keep it as the wrapped binary's
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
requirement of its own, and refuses a requirement with no scenario. The header
SHALL be refused when it is the block's first skipped header and the
requirement's own text has no scenario above it, or when no scenario with a body
follows it before the next header or the block's end. A header above the first
requirement block, or one followed by a scenario of its own, SHALL NOT be
refused, because the archive keeps it. A header inside an HTML comment SHALL be
read as the archive reads it; a fenced one SHALL NOT. A `### Scenario:` line
that `deltas/scenario-depth` already reports SHALL NOT also be reported by this
rule. The rule SHALL also refuse such a header inside a living requirement in
the first `## Requirements` section that the delta neither MODIFIES, REMOVES nor
ADDs (read through the delta's RENAMEs), because the rebuilt spec keeps that
requirement as written; the message SHALL name the living line. Under `--fast`
the rule SHALL NOT run, and `deltas/skipped-header` SHALL report the header at
INFO instead.

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

#### Scenario: A header inside a surviving living requirement is refused

- **WHEN** the living `Widget rendering` block carries `### Notes on rendering`
  above its only scenario, and the delta MODIFIES `Widget caching` or RENAMES
  `Widget rendering`
- **THEN** `cospec validate --strict` reports `archive/split-requirement` naming
  the living line, and the binary's archive refuses the change

#### Scenario: A MODIFIED replacing the split living requirement is clean

- **WHEN** the delta MODIFIES `Widget rendering`, whose living block carries the
  splitting header
- **THEN** no `archive/split-requirement` is raised, and the binary's archive
  applies the change

#### Scenario: A header with its own scenario is kept

- **WHEN** a `### Notes after` line followed by its own `#### Scenario:` sits
  after a block's scenario
- **THEN** no `archive/split-requirement` is raised, `deltas/skipped-header`
  reports the line at INFO, and the binary's archive applies the change

### Requirement: A structurally invalid living spec is refused at pre-flight

`archive/target-invalid` SHALL also refuse a living spec that carries a delta
header (`## ADDED Requirements` and its siblings), a `### Requirement:` header
outside its `## Requirements` section, or a second requirement under a
normalised name already declared there, because the wrapped binary's archive
refuses to update such a spec before merging anything. The check SHALL read the
living spec as the wrapped binary's structure reader does: fenced lines
excluded, HTML comments read as written, a UTF-8 BOM kept. The message SHALL
name each defect's line.

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
