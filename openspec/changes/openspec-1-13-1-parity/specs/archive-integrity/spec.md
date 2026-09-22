# Spec Delta

## ADDED Requirements

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
