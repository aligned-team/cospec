# spec-parsing-and-discovery Specification

## Purpose

Defines how cospec parses and discovers capability spec files: normalising input
(BOM, CRLF, HTML-comment and code-fence masking) before scanning for
requirement/scenario headers, discovering capabilities recursively through one
shared module, flagging root-level and placeholder-purpose specs, and
suppressing delegated OpenSpec diagnostics that duplicate a cospec-native
finding for the same defect.

## Requirements

### Requirement: Delta and living-spec parsing tolerances

cospec's delta/living-spec parser SHALL normalise its input before scanning for
requirement and scenario headers: it SHALL strip a leading UTF-8 BOM, normalise
`\r\n` and bare `\r` to `\n`, mask HTML comment spans (including one left
unterminated to end of file), and compute code-fence state with upstream's
`buildCodeFenceMask` semantics — both ```and`~~~` fences, where a closing fence
MUST use the same marker character as the opening fence and be at least as long.
Masking SHALL blank content in place so every reported line number is unchanged.
Requirement and scenario headers inside a masked span SHALL NOT be counted by
any rule or by either hard archive gate.

The canonical requirement header's `Requirement:` keyword SHALL be matched
case-insensitively, mirroring OpenSpec 1.13.1's `REQUIREMENT_HEADER_REGEX`
(`src/core/parsers/requirement-blocks.ts`) and `REQUIREMENT_HEADER`
(`src/core/parsers/spec-structure.ts`). The keyword's case SHALL NOT affect the
parsed requirement name, the operation the block records, or which block a
following scenario belongs to. Case tolerance SHALL stop there: the bulleted
REMOVED form and the `FROM:`/`TO:` rename lines — keywords and their embedded
`Requirement:` alike — remain case-sensitive, because the wrapped binary's are.

#### Scenario: BOM-prefixed spec is parsed

- **WHEN** a delta or living `spec.md` begins with a UTF-8 BOM
- **THEN** its first `### Requirement:` header is recognised, exactly as if the
  BOM were absent

#### Scenario: CRLF line endings are parsed

- **WHEN** a spec file uses `\r\n` line endings
- **THEN** requirement and scenario headers are recognised and reported line
  numbers match the file's own line numbering

#### Scenario: Commented-out headers are not counted

- **WHEN** a `### Requirement:` or `#### Scenario:` header sits inside an
  `<!-- ... -->` span
- **THEN** it contributes nothing to the requirement/scenario counts used by
  validation or by the scenario-preservation gate

#### Scenario: A longer fence does not invert fence state

- **WHEN** a spec documents markdown inside a four-backtick fence containing a
  three-backtick line
- **THEN** fence state is closed only by a fence using the same marker and at
  least the opening length, so headers after the block are still counted

#### Scenario: Tilde fences are honored

- **WHEN** a spec uses `~~~` fences around a block containing a `#### Scenario:`
  line
- **THEN** that line is treated as fenced content and not counted as a scenario

#### Scenario: Masking preserves line numbers

- **WHEN** a rule reports an issue on a line following a masked comment or fence
  span
- **THEN** the reported line number equals the line's position in the original
  file

#### Scenario: A lower- or upper-case requirement keyword is a requirement

- **WHEN** a delta section holds `### requirement: Alpha` or
  `### REQUIREMENT: Alpha`
- **THEN** the block enters the operation list under its section's operation
  with the name `Alpha`, exactly as a canonical `### Requirement: Alpha` header
  would — so `archive/target-missing` and `archive/scenario-preservation` see
  the same operations the wrapped binary applies

#### Scenario: A case-variant header is not absorbed by the block above it

- **WHEN** one `## MODIFIED Requirements` section holds `### Requirement: Alpha`
  followed by `### requirement: Beta`
- **THEN** two MODIFIED operations are recorded, each carrying only its own
  scenarios — Beta is neither invisible to the gates nor folded into Alpha's
  scenario set

#### Scenario: Bulleted and rename forms stay case-sensitive

- **WHEN** a delta writes a REMOVED entry as ``- `### requirement: Alpha` `` or
  a rename as `- from:`/`- to:` lines
- **THEN** no operation is recorded, matching the wrapped binary, which parses
  no delta from either form

### Requirement: Recursive capability discovery

cospec SHALL discover capability spec files through one shared module
(`core/spec-paths.ts`) used by `cospec validate`, the scenario-preservation
gate, and the post-archive spot check. Discovery SHALL recurse into nested
directories, skip dot-directories, emit posix-style ids sorted by id, and derive
a delta or living file's capability from the file's **immediate parent
directory** rather than the first path segment. It SHALL resolve a symlinked
`spec.md` that stays inside its capability directory, reject a link resolving
outside it, and skip a dangling link. It SHALL swallow only `ENOENT` while
reading a directory and SHALL propagate every other error rather than silently
returning a short list.

#### Scenario: Nested capability resolves to its own directory

- **WHEN** a change carries a delta at `specs/<area>/<capability>/spec.md`
- **THEN** validation, the scenario-preservation gate, and the post-archive spot
  check all resolve its capability to `<capability>`, not `<area>`

#### Scenario: Nested living specs are enumerated

- **WHEN** `openspec/specs/` contains capabilities nested under an area
  directory
- **THEN** the living-capability list used by validation includes every nested
  capability, keyed by its posix id

#### Scenario: An escaping symlink is rejected

- **WHEN** a capability's `spec.md` is a symlink resolving outside that
  capability's directory
- **THEN** discovery reports an error for that capability rather than including
  it

#### Scenario: An unreadable directory is not silently dropped

- **WHEN** reading a directory under `openspec/specs/` fails with anything other
  than `ENOENT`
- **THEN** the error propagates and the command fails loudly instead of
  proceeding with a partial capability list

### Requirement: Root-level specs/spec.md is refused

cospec SHALL raise a named ERROR when a change places a delta at `specs/spec.md`
with no capability directory, rather than silently bucketing it under a
capability literally named `spec.md`. The message SHALL name the expected
`specs/<capability>/spec.md` layout.

#### Scenario: Root-level delta is an error

- **WHEN** `cospec validate` runs on a change containing `specs/spec.md`
- **THEN** it emits a named ERROR pointing at the missing capability directory
  and does not report a capability named `spec.md`

### Requirement: Placeholder Purpose is flagged

The `specs/purpose-tbd` rule SHALL fire both for the archive-generated
`TBD - created by archiving` text it matches today and for a `## Purpose`
section whose first non-blank line opens with a `TBD` or `TODO` marker at a word
boundary. The rule id and its WARNING severity (ERROR under `--strict`) SHALL be
unchanged, an empty `## Purpose` SHALL keep its existing handling, and the two
placeholder forms SHALL NOT both fire for one spec.

#### Scenario: Leading TODO purpose is flagged

- **WHEN** a capability spec's `## Purpose` begins with `TODO: describe this`
- **THEN** `cospec validate` emits `specs/purpose-tbd` as a WARNING, and as an
  ERROR under `--strict`

#### Scenario: Archive placeholder still fires once

- **WHEN** a `## Purpose` carries the archive-generated
  `TBD - created by archiving` text
- **THEN** `specs/purpose-tbd` fires exactly once for that spec

#### Scenario: Empty purpose is unchanged

- **WHEN** a capability spec's `## Purpose` section is empty
- **THEN** the issues reported for that spec are unchanged from before this
  change

### Requirement: Delegated duplicates are suppressed

When cospec merges delegated OpenSpec issues into its own report, it SHALL
suppress a delegated issue that duplicates a native cospec issue already
reported for the same file and the same defect — the placeholder `Purpose`, a
root-level `specs/spec.md`, scenario loss in a MODIFIED delta, an
archive-precondition failure the wrapped binary dry-runs during validate, a
delta-shaped file cospec's own discovery skips, a change whose tracked task
files carry no checkbox at all, a `RENAMED` `FROM:`/`TO:` line that formed no
pair, a delta file whose sections parse to no entries, a non-requirement `###`
header the delta reader skips, a requirement missing SHALL/MUST, its requirement
text or a scenario, an `## ADDED` name the same delta file also removes or
modifies, a `## MODIFIED` name it also removes, a duplicate `## ADDED` name, two
`RENAMED` pairs sharing a source or a target, a `RENAMED` target the same delta
ADDs, a skipped header that splits a requirement the archive refuses, a living
spec the archive refuses as structurally invalid, a `## MODIFIED` of a `RENAMED`
source, a `## MODIFIED` or `## RENAMED` on a capability with no living spec, a
requirement outside every delta section, a delta with no delta section, a
duplicate `## MODIFIED` or `## REMOVED` name, and a `## REMOVED` of a `RENAMED`
source. Suppression SHALL apply only when the native rule actually fired; when
cospec's own rule is silent, the delegated issue SHALL still be reported so
nothing is lost.

Each of those later pairings SHALL be keyed so that a second real finding
survives. The empty-sections message SHALL pair with `archive/no-ops` on the
same delta file, and the change-level no-deltas message with `archive/no-ops`
fired anywhere on the item, because the wrapped binary raises it only when no
delta file parsed an entry. The two skipped-header messages (a non-requirement
header, and a `### Requirement:` with no name) SHALL pair with
`deltas/skipped-header` on the same file and the same header text, and both (a
`### Scenario:` header included) SHALL also pair with
`archive/split-requirement` on the same file and the same header text. A skipped
`### Scenario:` header SHALL pair with `deltas/scenario-depth` on the same file
and the same header text, so a `### Scenario:` written inside an HTML comment,
which cospec's advisory reader masks, keeps its delegated INFO beside a real one
with different text in the same file; a commented and a real `### Scenario:`
with the same text SHALL both pair with the real one's finding. The keyword and
missing-text messages SHALL pair with `deltas/requirement-shape` on the same
file, operation and requirement name (the missing-text message with either of
that rule's two wordings for an empty statement), the name read off the header
as written — a trailing HTML comment included, as the wrapped binary reads it;
so SHALL the missing-scenario message, with or without the binary's
empty-scenario hint. The two cross-section messages (`ADDED and REMOVED`,
`MODIFIED and ADDED`) SHALL pair with `archive/added-exists` on the same file
and requirement name, and so SHALL the duplicate-ADDED, duplicate-RENAMED-target
and RENAMED-target-collides-with-ADDED messages. The `MODIFIED and REMOVED` and
duplicate-RENAMED-source messages SHALL pair with `archive/target-missing`'s "no
longer exists" finding on the same file and requirement name. The dry-run's
structurally-invalid-target message SHALL pair with `archive/target-invalid` on
the same file and capability, and only when every defect it lists is a delta
header, a requirement outside `## Requirements` or a duplicate requirement. The
MODIFIED-references-old-name message SHALL pair with `archive/target-missing` on
the same file and the rename's TO name, which cospec's message names. The
dry-run's target-spec-does-not-exist message SHALL pair with
`archive/new-spec-non-added` on the same file and capability. The
orphaned-requirement message SHALL pair with `deltas/orphaned-requirement` on
the same file and requirement name, never the section text. The
no-delta-sections message SHALL pair with `deltas/header-present` on the same
file, and the change-level no-deltas message with it fired anywhere on the item.
The duplicate-MODIFIED, duplicate-REMOVED and RENAMED-and-REMOVED messages SHALL
pair with `archive/op-conflict` on the same file and requirement name, the
RENAMED FROM for the last. For a requirement a delta writes inside an HTML
comment, the missing-text, keyword-only-in-the-header and missing-scenario
messages SHALL pair with `archive/rebuilt-spec-invalid`'s finding on that
block's delta line, on the same file and requirement name. A header key SHALL
match an empty header text, so a blank-titled `###` header pairs too. Each
pairing SHALL be covered by a contract test whose delegated message is read from
the pinned binary, never typed by hand, and a sweep over every report the parity
suite produces SHALL find no relayed finding naming the same requirement or
header as a cospec finding on the same file.

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
  `### Documentation Requirements` and a nameless `### Requirement:` line above
  its first requirement, and the wrapped binary reports an INFO for each
- **THEN** the merged report contains one `deltas/skipped-header` INFO per line
  and no delegated INFO for either

#### Scenario: A splitting header is reported once

- **WHEN** a `### Notes` line inside a requirement block leaves a piece of it
  with no scenario, and the wrapped binary reports it as a skipped header
- **THEN** the merged report contains one `archive/split-requirement` ERROR for
  that line and no delegated INFO for it

#### Scenario: A commented three-hashtag scenario keeps its INFO

- **WHEN** a delta carries a real `### Scenario: Shallow` inside a block and a
  `### Scenario: Commented` inside an HTML comment above the first requirement
- **THEN** the merged report contains the `deltas/scenario-depth` ERROR for
  `Shallow` and the wrapped binary's INFO for `Commented`

#### Scenario: A comment-bearing requirement name is reported once

- **WHEN** an ADDED `### Requirement: Widget polishing <!-- restated -->` lacks
  SHALL/MUST, and the wrapped binary warns under that whole name
- **THEN** the merged report contains one `deltas/requirement-shape` ERROR
  naming `Widget polishing <!-- restated -->` and no delegated WARNING

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

#### Scenario: Conflict, orphan and headerless doubles are reported once

- **WHEN** a cospec-typed change's delta MODIFIES a requirement's RENAMED
  source, MODIFIES on a capability with no living spec, carries a requirement
  under `## Notes`, has no delta section, MODIFIES one requirement twice, or
  carries a blank-titled `###` header that splits a block
- **THEN** the merged report carries cospec's finding for it and not the wrapped
  binary's twin, and the sweep over the parity suite finds no double report

#### Scenario: A different header or requirement is a second finding

- **WHEN** the wrapped binary reports a skipped header, a missing keyword or a
  cross-section conflict for a header text, requirement name or delta file that
  cospec's own rule did not fire on
- **THEN** the delegated issue is not suppressed and appears in the merged
  report

### Requirement: Requirement-block retention and scenario-name identity

cospec's delta and living-spec parsers SHALL retain, for every
`### Requirement:` block, the verbatim source text of that block — the header
line through the last line before the next `### Requirement:` header, the next
level-2 `##` section header, or end of input — taken from the unmasked
(BOM-stripped, LF-normalised) source view, with fenced content included
verbatim. Comparison of two retained blocks SHALL use OpenSpec's own
normalisation — CRLF folding plus a single outer trim — and nothing further, so
cospec can never call a genuine collision identical. Each parser SHALL
additionally extract the ordered list of scenario names in a block, where a
scenario is any non-fenced level-4 header carrying a body — at least one
non-blank line before the next level-1-to-4 header or end of input — and its
name is the header text with an optional CommonMark closing `#` run and an
optional case-insensitive `Scenario:` prefix removed, then trimmed. Scenario
names SHALL be compared case-sensitively, matching OpenSpec's `scenarioNameAt`.
A living-spec requirement's scope SHALL end at the next level-2 section header,
so content in a later section is credited to no requirement.

#### Scenario: Identical blocks compare equal across line endings

- **WHEN** two requirement blocks differ only in CRLF versus LF line endings and
  in trailing blank lines
- **THEN** their normalised raw text compares equal

#### Scenario: Interior differences are not folded away

- **WHEN** two requirement blocks differ in interior whitespace, in scenario
  order, or in one scenario's body
- **THEN** their normalised raw text compares unequal

#### Scenario: Fenced content is retained verbatim

- **WHEN** a requirement block contains a `####`-looking line inside a code
  fence
- **THEN** that line is part of the block's retained raw text and yields no
  scenario name

#### Scenario: ATX-closed and prefixed scenario headers fold to one name

- **WHEN** a block carries `#### Scenario: Foo`, `#### Foo`, and `#### Foo ####`
- **THEN** each yields the scenario name `Foo`

#### Scenario: Scenario names are case-sensitive

- **WHEN** a block carries scenarios named `Foo` and `foo`
- **THEN** they are two distinct scenario names, not one

#### Scenario: A later section ends a requirement's scope

- **WHEN** a living spec's last requirement is followed by a `## Notes` section
  containing level-4 headers
- **THEN** the requirement keeps only its own scenarios and the ones in the
  later section are credited to no requirement

#### Scenario: A bodyless scenario header is not a scenario

- **WHEN** a requirement block carries a `#### Scenario: Foo` header with no
  non-blank line under it before the next header or end of input
- **THEN** it yields no scenario name and is not counted as a scenario, on the
  delta side and on the living side alike

### Requirement: Delta operation bullets accept every CommonMark marker

cospec's delta parser SHALL recognise a `REMOVED` bullet and a `RENAMED`
`FROM:`/`TO:` line written with any CommonMark bullet marker — `-`, `*` or `+` —
and with leading indentation, matching OpenSpec's own delta reader. A bullet
line that sits inside a code fence or an HTML comment SHALL still parse as
nothing, so masking continues to win over recognition.

#### Scenario: Star and plus bulleted REMOVED enters the operation list

- **WHEN** a delta writes `* ### Requirement: Foo` or `+ \`### Requirement:
  Foo\``under`## REMOVED Requirements`
- **THEN** the parser records a REMOVED operation naming `Foo`, so
  `archive/target-missing` sees it

#### Scenario: Indented rename lines are paired

- **WHEN** a `## RENAMED Requirements` section writes its `FROM:` and `TO:`
  lines indented under a parent bullet
- **THEN** both lines are recognised and the rename operation is recorded

#### Scenario: A fenced bullet parses as nothing

- **WHEN** a `* ### Requirement: Foo` line appears inside a code fence
- **THEN** no operation is recorded for it

### Requirement: Unpaired rename lines are refused

cospec SHALL pair `FROM:` and `TO:` rename lines within a single
`## RENAMED Requirements` section and SHALL record a `RENAMED` operation only
when both sides are present, so a half-built operation can never reach the
archive preconditions. Every unpaired line SHALL be retained on the parse result
with its side, name and line number, and reported as an ERROR with rule id
`deltas/unpaired-rename` naming the missing side. A `FROM:` line SHALL NOT be
paired with a `TO:` line in a different section, and a second `FROM:` SHALL NOT
overwrite an earlier unpaired one.

#### Scenario: A dangling FROM is an error, not a phantom rename

- **WHEN** a delta's `## RENAMED Requirements` section ends with a `FROM:` line
  whose `TO:` never arrives
- **THEN** `cospec validate --strict` reports `deltas/unpaired-rename` naming
  the missing `TO:` side, and no RENAMED operation is recorded

#### Scenario: Unpaired lines no longer suppress the empty-section report

- **WHEN** a `## RENAMED Requirements` section contains only a dangling `FROM:`
  line
- **THEN** the section is still reported as empty, because the phantom operation
  that previously counted for it is no longer created

#### Scenario: Interleaved rename lines do not cross-pair

- **WHEN** a section writes `FROM: a`, `FROM: b`, `TO: x`
- **THEN** exactly one unpaired `FROM:` is reported and `b` is not silently
  renamed to `x`

### Requirement: Requirement names ignore a closing ATX run

cospec's requirement-name normalisation SHALL strip a CommonMark closing `#` run
from a `### Requirement:` header before the name is used for matching, collision
detection or reporting, matching OpenSpec's own normalisation exactly. The run
SHALL be recognised only when preceded by a space or a tab — `[ \t]+#+[ \t]*$`,
never `\s` — so a name ending in a `#` that is part of the name itself is
preserved. The case-folding helper used for near-miss detection SHALL inherit
the same normalisation.

#### Scenario: An ATX-closed header resolves to the living requirement

- **WHEN** a delta writes `### Requirement: Foo ###` against a living spec
  carrying `### Requirement: Foo`
- **THEN** the names match, and `archive/target-missing` does not fire

#### Scenario: A hash that is part of the name survives

- **WHEN** a spec declares `### Requirement: C#`
- **THEN** the requirement name remains `C#`

#### Scenario: The living side is normalised identically

- **WHEN** a living spec carries `### Requirement: Foo ###` and a delta MODIFIES
  `Foo`
- **THEN** the two resolve to one requirement rather than two

### Requirement: Orphaned requirement blocks are reported

cospec SHALL report a `### Requirement:` block that sits outside all four delta
sections — before the first `## ` header, or under a section that is not
`ADDED`, `MODIFIED`, `REMOVED` or `RENAMED Requirements` — instead of discarding
it silently. The diagnostic SHALL carry rule id `deltas/orphaned-requirement` at
WARNING level, naming the requirement and its line, because archived changes
written before the current delta format legally carry this shape.

#### Scenario: A requirement above the first section is reported

- **WHEN** a delta file opens with a `### Requirement: Foo` block before any
  `## ` section header
- **THEN** `cospec validate` reports `deltas/orphaned-requirement` as a WARNING
  naming `Foo`

#### Scenario: A requirement under an unrecognised section is reported

- **WHEN** a `### Requirement: Foo` block appears under a `## Notes` section
- **THEN** the same WARNING is reported, and the block contributes no delta
  operation

#### Scenario: Orphaned blocks do not change the exit code

- **WHEN** a delta's only defect is an orphaned requirement block
- **THEN** `cospec validate` reports the WARNING and the non-strict exit code is
  unchanged

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

### Requirement: Skipped delta headers are reported

cospec SHALL report, as the INFO `deltas/skipped-header`, every level-three
header inside an `## ADDED Requirements` or `## MODIFIED Requirements` section
that the delta reader ignores and the archive keeps: a non-fenced `### <text>`
line that is not a named `### Requirement:` header, whether it sits above the
first requirement block or inside one without splitting it. A header inside a
block that leaves a piece of it with no scenario is refused by the archive, and
SHALL be reported as `archive/split-requirement` instead (see
archive-integrity), never as both. The lines reported by the two rules together
SHALL be the lines the wrapped binary's delta reader records as skipped, with
the same line numbers, except a header this rule's advisory reader masks inside
an HTML comment: it SHALL NOT report one, while the wrapped binary's own reader
doesn't mask comments and keeps reporting it — above the first requirement that
delegated INFO SHALL still reach the report unsuppressed, because no cospec rule
has a twin to raise there. A header that is `### Requirement:` with no name
SHALL get its own message, saying the name is missing and giving
`### Requirement: <name>` as the fix. Any other header's hint SHALL name
`### Requirement: <text>` as the spelling to use if the block is meant to be
validated. A `### Scenario:` line that `deltas/scenario-depth` already reports
SHALL NOT also be reported by this rule.

The rule SHALL run on every cospec-typed change that carries delta files,
whether or not cospec delegates the change to the wrapped binary. A header that
splits its requirement SHALL be left to `archive/split-requirement` only when
the archive-precondition family runs; under `--fast` this rule SHALL report it.
INFO SHALL never move `valid` or the exit code, with or without `--strict`.

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

#### Scenario: A header inside a requirement block that keeps a scenario is reported

- **WHEN** a `### Notes` line followed by a `#### Scenario:` of its own sits
  after a requirement's own scenario
- **THEN** `deltas/skipped-header` reports that line, and no
  `archive/split-requirement` is raised

#### Scenario: A header that splits a requirement is left to the archive rule

- **WHEN** a `### Notes` line sits between a requirement's body and its only
  `#### Scenario:` block
- **THEN** `deltas/skipped-header` does not report that line, and the
  requirement's scenario still counts for `deltas/requirement-shape`

#### Scenario: A change cospec does not delegate still gets the finding

- **WHEN** a cospec-typed change with a skipped header has no `proposal.md`, so
  cospec does not delegate it to the wrapped binary
- **THEN** `deltas/skipped-header` is still reported

#### Scenario: Under --fast a splitting header keeps its INFO

- **WHEN** `cospec validate --fast` runs on a change whose `### Notes inside`
  splits its requirement, delegated or not
- **THEN** `deltas/skipped-header` reports that line at INFO, no
  `archive/split-requirement` is raised, and the wrapped binary's INFO for the
  line is not relayed beside it

#### Scenario: A fenced header is not reported

- **WHEN** a `### Example` line sits inside a fenced code block in an ADDED
  requirement
- **THEN** no `deltas/skipped-header` issue is raised for it

#### Scenario: A header inside an HTML comment is not reported, and the delegated INFO survives

- **WHEN** a `###` header sits inside an HTML comment above the first
  requirement in an ADDED section of a change cospec delegates
- **THEN** no `deltas/skipped-header` issue is raised for it, and the wrapped
  binary's own INFO for that header reaches the merged report unsuppressed

### Requirement: A header-only SHALL/MUST carries the body hint

When an `## ADDED` or `## MODIFIED` requirement's body lacks SHALL or MUST and
its `### Requirement:` header contains one, the `deltas/requirement-shape` ERROR
SHALL carry the wrapped binary's hint: move the SHALL/MUST statement to the line
immediately after the `### Requirement: ...` header. The ERROR's level, rule id
and message SHALL stay as they are for a cospec-typed change, except that the
message names the requirement by its header as written, a trailing HTML comment
included. A requirement whose header lacks SHALL/MUST too SHALL get no hint.

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

### Requirement: An empty statement is refused however its scenarios read

An `## ADDED` or `## MODIFIED` requirement's statement SHALL be read as the
wrapped binary's `extractRequirementBody` reads it: the lines between its
`### Requirement:` header and the first header under it, blank and fenced lines
skipped, an HTML comment kept as text, and `**Key**: value` metadata lines
counted only when nothing else is there. An empty statement SHALL be the ERROR
`deltas/requirement-shape` even when a scenario step holds SHALL or MUST,
because the binary refuses an empty one in its validate and its archive; the
message SHALL be `<OP> "<name>" is missing requirement text`, or the header-only
wording and hint when the header itself holds SHALL/MUST, so it pairs with the
binary's finding and a change cospec never delegates is refused too. SHALL/MUST
SHALL count in the statement alone — never in a scenario step, a fenced example
or the header — so a statement written inside an HTML comment is a statement,
and one that is only a comment has no keyword.

#### Scenario: A SHALL only in a scenario step, on a change never delegated

- **WHEN** a change with no `proposal.md` ADDs `Widget buffing` with no
  statement and a scenario step reading
  `the system SHALL return a buffed widget`
- **THEN** `cospec validate` reports `deltas/requirement-shape` at ERROR on the
  header's line, and the binary's validate and archive refuse the change

#### Scenario: The delegated twin is one finding

- **WHEN** the same change carries a `proposal.md`
- **THEN** the binary's `is missing requirement text` ERROR is not relayed
  beside cospec's

#### Scenario: A statement written inside a comment is a statement

- **WHEN** an ADDED requirement's statement is
  `<!-- The system SHALL export widgets. -->` and its scenario has steps
- **THEN** `cospec validate` reports no `deltas/requirement-shape`, as the
  binary's validate and archive accept it

#### Scenario: A comment-only statement has no keyword

- **WHEN** an ADDED requirement's statement is `<!-- draft note -->` and its
  only SHALL sits in a scenario step
- **THEN** `cospec validate` reports `deltas/requirement-shape` at ERROR,
  `must use SHALL/MUST normative language`, and the binary's WARNING for it is
  not relayed beside it

#### Scenario: A SHALL in a fenced example is not the statement's

- **WHEN** an ADDED requirement's statement is `The system exports widgets.` and
  its only SHALL sits in a fenced example
- **THEN** `cospec validate` reports `deltas/requirement-shape` at ERROR, as the
  binary warns

### Requirement: Delegated duplicate matching is linear and covers quoted headers

Each `DUPLICATE_CLASSES` pattern SHALL match a delegated message in time linear
in the message's length, whatever text a spec author puts in a requirement
header. A pattern that reads a list of defect lines SHALL match the fixed head
once and then each line on its own, with no repeated group around a quantified
span. The `archive/target-invalid` pairing SHALL recognise a
structurally-invalid-target message whose quoted header text itself contains
`"`, so a header such as `### Requirement: Widget "quoted" name` is reported
once, by cospec's rule.

#### Scenario: A quoted header is reported once

- **WHEN** `cospec validate --json` runs on a change whose living spec
  duplicates `### Requirement: Widget "quoted" name`
- **THEN** the report carries cospec's `archive/target-invalid` ERROR and not
  the binary's structurally-invalid INFO for the same spec

#### Scenario: An adversarial message is matched quickly

- **WHEN** the dedupe runs on a structurally-invalid message of two hundred
  quote-heavy defect lines followed by a line that doesn't match
- **THEN** it finishes within the unit test's bound, a bound the previous
  pattern exceeds on the same input
