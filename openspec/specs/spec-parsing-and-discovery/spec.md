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

cospec's delta/living-spec parser SHALL normalise input before scanning for
headers: strip a leading UTF-8 BOM, fold `\r\n` and bare `\r` to `\n`, mask HTML
comment spans (an unterminated one runs to end of file), and compute fence state
with upstream's `buildCodeFenceMask` semantics. Masking SHALL blank in place,
keeping line numbers, and masked headers SHALL NOT count for any rule or either
hard archive gate. The `Requirement:` keyword SHALL be matched
case-insensitively.

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

#### Scenario: Fence state follows buildCodeFenceMask

- **WHEN** a spec contains both backtick and `~~~` fences
- **THEN** both are honoured, and a closing fence MUST use the opening fence's
  marker character and be at least as long

#### Scenario: Keyword case tolerance mirrors the binary and stops there

- **WHEN** a requirement header spells `Requirement:` in another case
- **THEN** it is matched as OpenSpec 1.13.1's `REQUIREMENT_HEADER_REGEX`
  (`src/core/parsers/requirement-blocks.ts`) and `REQUIREMENT_HEADER`
  (`src/core/parsers/spec-structure.ts`) match it, the case affects neither the
  parsed name, the recorded operation, nor which block owns a following
  scenario; the bulleted REMOVED form and the `FROM:`/`TO:` rename lines,
  keywords and embedded `Requirement:` alike, stay case-sensitive as the
  binary's are

### Requirement: Recursive capability discovery

cospec SHALL discover capability spec files through one shared module
(`core/spec-paths.ts`) used by `cospec validate`, the scenario-preservation gate
and the post-archive spot check. Discovery SHALL recurse, skip dot-directories,
emit posix-style ids sorted by id, and take a file's capability from its
immediate parent directory, not the first path segment. Reading a directory, it
SHALL swallow only `ENOENT` and propagate every other error rather than return a
short list.

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

#### Scenario: Symlinked spec files are confined to their capability

- **WHEN** a capability's `spec.md` is a symlink
- **THEN** discovery resolves it when it stays inside its capability directory,
  rejects it when it resolves outside, and skips it when it dangles

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
`TBD - created by archiving` text and for a `## Purpose` section whose first
non-blank line opens with a placeholder marker: `TBD`/`TODO` in capitals
whatever follows, or any other casing only when followed by the end of the
Purpose, a line break, or marker punctuation. Rule id, severity, empty-Purpose
handling, and single reporting SHALL be unchanged.

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

#### Scenario: Ordinary word Todo is not a marker

- **WHEN** a spec's Purpose begins "Todo el flujo de pago…" or "Todo o fluxo…"
- **THEN** `specs/purpose-tbd` does not fire, while `todo -` and `tbd.` still do

### Requirement: Delegated duplicates are suppressed

When merging delegated OpenSpec issues into its report, cospec SHALL suppress a
delegated issue that duplicates a native cospec issue on the same file for the
same defect, and only when that native rule actually fired; otherwise the
delegated issue SHALL still be reported. Each pairing SHALL be keyed so a second
real finding survives and contract-tested with the pinned binary's real message.
Suppression SHALL NOT move a verdict or an exit code.

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

#### Scenario: Suppression patterns are anchored on a distinguishing clause

- **WHEN** two delegated messages share a prefix
- **THEN** each suppression regex is anchored through a clause that
  distinguishes it from the other, never through the shared prefix alone

#### Scenario: The suppressed defect classes

- **WHEN** a delegated issue duplicates a native one for the same file
- **THEN** the classes suppressed are: the placeholder `Purpose`; a root-level
  `specs/spec.md`; scenario loss in a MODIFIED delta; an archive-precondition
  failure the binary dry-runs during validate; a delta-shaped file cospec's
  discovery skips; tracked task files with no checkbox at all; an unpaired
  `RENAMED` `FROM:`/`TO:` line; a delta file whose sections parse to no entries;
  a non-requirement `###` header the delta reader skips; a requirement missing
  SHALL/MUST, its text or a scenario; an `## ADDED` name the same delta also
  removes or modifies; a `## MODIFIED` name it also removes; a duplicate
  `## ADDED` name; two `RENAMED` pairs sharing a source or a target; a `RENAMED`
  target the same delta ADDs; a skipped header splitting a requirement the
  archive refuses; a living spec the archive refuses as structurally invalid; a
  `## MODIFIED` of a `RENAMED` source; a `## MODIFIED` or `## RENAMED` on a
  capability with no living spec; a requirement outside every delta section; a
  delta with no delta section; a duplicate `## MODIFIED` or `## REMOVED` name;
  and a `## REMOVED` of a `RENAMED` source

#### Scenario: Section and header pairing keys

- **WHEN** an empty-section, no-deltas, no-delta-sections or skipped-header
  message is relayed
- **THEN** the empty-sections message pairs with `archive/no-ops` on the same
  delta file and the change-level no-deltas message with `archive/no-ops` fired
  anywhere on the item (the binary raises it only when no delta file parsed an
  entry); the no-delta-sections message pairs with `deltas/header-present` on
  the same file, and the change-level no-deltas message with it fired anywhere
  on the item; both skipped-header messages (a non-requirement header, and a
  `### Requirement:` with no name) pair with `deltas/skipped-header` on the same
  file and header text, and both, a `### Scenario:` header included, also pair
  with `archive/split-requirement` on the same file and header text; a header
  key matches an empty header text, so a blank-titled `###` header pairs too

#### Scenario: Skipped scenario headers pair on their text

- **WHEN** the binary skips a `### Scenario:` header
- **THEN** it pairs with `deltas/scenario-depth` on the same file and header
  text, so one inside an HTML comment, which cospec's advisory reader masks,
  keeps its delegated INFO beside a real one with different text in the same
  file, and a commented and a real `### Scenario:` with the same text both pair
  with the real one's finding

#### Scenario: Requirement-shape pairing keys

- **WHEN** a keyword, missing-text or missing-scenario message is relayed
- **THEN** it pairs with `deltas/requirement-shape` on the same file, operation
  and requirement name, read off the header as written, a trailing HTML comment
  included as the binary reads it; the missing-text message pairs with either of
  that rule's two empty-statement wordings, and the missing-scenario message
  pairs with or without the binary's empty-scenario hint

#### Scenario: Commented requirement pairing keys

- **WHEN** a delta writes a requirement inside an HTML comment
- **THEN** the missing-text, keyword-only-in-the-header and missing-scenario
  messages pair with `archive/rebuilt-spec-invalid`'s finding on that block's
  delta line, on the same file and requirement name

#### Scenario: Cross-section and conflict pairing keys

- **WHEN** a cross-section, duplicate or rename-conflict message is relayed
- **THEN** `ADDED and REMOVED`, `MODIFIED and ADDED`, duplicate-ADDED,
  duplicate-RENAMED-target and RENAMED-target-collides-with-ADDED pair with
  `archive/added-exists` on the same file and requirement name;
  `MODIFIED and REMOVED` and duplicate-RENAMED-source pair with
  `archive/target-missing`'s "no longer exists" finding on the same file and
  requirement name; duplicate-MODIFIED, duplicate-REMOVED and
  RENAMED-and-REMOVED pair with `archive/op-conflict` on the same file and
  requirement name, the RENAMED FROM for the last

#### Scenario: Target and structure pairing keys

- **WHEN** a target, orphan or structurally-invalid message is relayed
- **THEN** the dry-run's structurally-invalid-target message pairs with
  `archive/target-invalid` on the same file and capability only when every
  defect it lists is a delta header, a requirement outside `## Requirements` or
  a duplicate requirement; MODIFIED-references-old-name pairs with
  `archive/target-missing` on the same file and the rename's TO name; the
  dry-run's target-spec-does-not-exist pairs with `archive/new-spec-non-added`
  on the same file and capability; and the orphaned-requirement message pairs
  with `deltas/orphaned-requirement` on the same file and requirement name,
  never the section text

#### Scenario: The archive-precondition family pairs per upstream shape

- **WHEN** an archive-precondition dry-run message is relayed
- **THEN** it is paired by one entry per upstream shape, since one class carries
  one native rule id: `MODIFIED` target, `REMOVED` target and `RENAMED` source
  not found pair with `archive/target-missing`; a `RENAMED` target or `ADDED`
  name that already exists, and their two case-or-spacing variants, pair with
  `archive/added-exists`; the name capture stops before the binary's
  `, but "…" exists` and `… and differs only in case or spacing` tails; and a
  `MODIFIED` header mismatch in content, with no cospec twin, is not suppressed

#### Scenario: Scenario preservation needs no suppression entry

- **WHEN** a MODIFIED delta drops a scenario
- **THEN** no suppression entry is added for scenario preservation, because the
  binary skips a path that already produced an ERROR and its own scenario-loss
  check emits one there, the existing scenario-loss pairing is unchanged, and at
  most one archive-precondition dry-run issue is reported per delta file per run

#### Scenario: The parity sweep finds no doubled finding

- **WHEN** every report the parity suite produces is swept
- **THEN** no relayed finding names the same requirement or header as a cospec
  finding on the same file, and the dry-run issues arrive at INFO, counted and
  rendered but never scored

### Requirement: Requirement-block retention and scenario-name identity

cospec's delta and living-spec parsers SHALL retain each `### Requirement:`
block's verbatim text, from its header to the line before the next
`### Requirement:`, level-2 `##` header, or end of input, and compare blocks
with OpenSpec's normalisation alone: CRLF folding plus one outer trim. Each
SHALL extract a block's ordered scenario names, compared case-sensitively as
OpenSpec's `scenarioNameAt` does. A living requirement's scope SHALL end at the
next level-2 header.

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

#### Scenario: Retained text comes from the unmasked view

- **WHEN** a requirement block is retained
- **THEN** its text is taken from the unmasked (BOM-stripped, LF-normalised)
  source view, with fenced content included verbatim

#### Scenario: What counts as a scenario and its name

- **WHEN** scenario names are extracted from a block
- **THEN** a scenario is a non-fenced level-4 header with at least one non-blank
  line before the next level-1-to-4 header or end of input, and its name is the
  header text minus an optional CommonMark closing `#` run and an optional
  case-insensitive `Scenario:` prefix, trimmed

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

cospec SHALL pair `FROM:` and `TO:` lines within one `## RENAMED Requirements`
section, recording `RENAMED` only when both sides exist, so a half-built
operation never reaches the archive preconditions. Each unpaired line SHALL be
kept on the parse result with its side, name and line, and reported as the ERROR
`deltas/unpaired-rename` naming the missing side. Lines in different sections
SHALL NOT pair, and a second `FROM:` SHALL NOT overwrite an earlier unpaired
one.

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
tree that carries a delta section header at a path delta discovery skips: not
named `spec.md`, or not at `specs/<capability-path>/spec.md`. Discovery SHALL
stay restricted to `spec.md`, so companion notes beside a delta stay unreported.
`cospec archive`'s zero-delta leniency SHALL NOT treat a change carrying only
such files as a no-op, so a misplaced delta cannot be archived as though the
change touched no spec.

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

cospec SHALL report as INFO `deltas/skipped-header` each non-fenced `### <text>`
line in an `## ADDED` or `## MODIFIED` section that is not a named
`### Requirement:` header, above the first block or inside one without splitting
it. A header splitting a block into a scenario-less piece SHALL be
`archive/split-requirement` instead, never both. The rule SHALL run on every
cospec-typed change with deltas, delegated or not. INFO SHALL never move `valid`
or the exit code.

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

#### Scenario: Reported lines match the binary's skipped lines

- **WHEN** this rule and `archive/split-requirement` report skipped headers
- **THEN** together they report the lines the binary's delta reader ignores,
  records as skipped and the archive keeps, with the same line numbers, except a
  header this rule's reader masks inside an HTML comment, which it does not
  report; above the first requirement the binary, which does not mask comments,
  keeps reporting it and that delegated INFO reaches the report unsuppressed,
  having no cospec twin

#### Scenario: Messages and hints per header kind

- **WHEN** a skipped header is reported
- **THEN** a nameless `### Requirement:` gets its own message saying the name is
  missing with `### Requirement: <name>` as the fix, any other header's hint
  names `### Requirement: <text>` as the spelling to use if the block is meant
  to be validated, and a `### Scenario:` line `deltas/scenario-depth` already
  reports is not reported again

#### Scenario: Splitting headers go to the archive rule only when it runs

- **WHEN** a header splits its requirement
- **THEN** it is left to `archive/split-requirement` only when the
  archive-precondition family runs, and under `--fast` this rule reports it;
  with or without `--strict`, INFO never changes `valid` or the exit code

### Requirement: A header-only SHALL/MUST carries the body hint

When an `## ADDED` or `## MODIFIED` requirement's body lacks SHALL/MUST but its
`### Requirement:` header has one, the `deltas/requirement-shape` ERROR SHALL
carry the binary's hint: move the SHALL/MUST statement to the line right after
the header. Its level, rule id and message SHALL be unchanged for a cospec-typed
change, except the message names the requirement by its header as written,
trailing HTML comment included. A header without SHALL/MUST SHALL get no hint.

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
binary's `extractRequirementBody` reads it. An empty statement SHALL be the
ERROR `deltas/requirement-shape` even when a scenario step holds SHALL/MUST,
worded `<OP> "<name>" is missing requirement text`, or the header-only wording
and hint when the header holds SHALL/MUST. SHALL/MUST SHALL count in the
statement alone, never in a scenario step, fenced example or header.

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

#### Scenario: The empty-statement ERROR pairs and stands alone

- **WHEN** a statement is empty, on a delegated change or one never delegated
- **THEN** the ERROR pairs with the binary's finding as one, and a change cospec
  never delegates is refused too

#### Scenario: How the statement is read

- **WHEN** a delta requirement's statement is read
- **THEN** it is the lines between its `### Requirement:` header and the first
  header under it, blank and fenced lines skipped, an HTML comment kept as text,
  and `**Key**: value` metadata lines counted only when nothing else is there,
  so a statement written inside a comment is a statement and one that is only a
  comment has no keyword

### Requirement: Delegated duplicate matching is linear and covers quoted headers

Each `DUPLICATE_CLASSES` pattern SHALL match a delegated message in time linear
in its length, whatever a requirement header holds. A pattern reading a list of
defect lines SHALL match the fixed head once, then each line on its own, with no
repeated group around a quantified span. The `archive/target-invalid` pairing
SHALL recognise a structurally-invalid-target message whose quoted header
contains `"`, so `### Requirement: Widget "quoted" name` is reported once.

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

### Requirement: Symlinked layouts inside the project are accepted

`list --specs`, `show`, `validate`, `sync-specs`, and `archive` SHALL accept a
symlinked `openspec/`, `openspec/changes`, or `openspec/specs` wherever it
resolves. A symlinked `specs/<capability>/spec.md` SHALL be accepted only when
its realpath stays inside the project, and refused otherwise. An `archive/`
directory SHALL be accepted only when it resolves inside `changes/`.

#### Scenario: Linked spec file

- **WHEN** `openspec/specs/auth/spec.md` is a symlink to `docs/auth-spec.md`
- **THEN** `cospec validate --strict` and `cospec archive` treat it as a normal
  spec

#### Scenario: Escaping link

- **WHEN** a symlinked `specs/<capability>/spec.md` resolves outside the project
  root
- **THEN** cospec refuses with an error naming the path

#### Scenario: Linked directories resolve anywhere

- **WHEN** `openspec/specs` is a symlink to a directory outside the project
- **THEN** `cospec validate --strict` and `cospec archive` accept it and read
  the specs through the link

#### Scenario: Archive directory escaping changes

- **WHEN** `openspec/changes/archive` resolves outside `openspec/changes/`
- **THEN** `cospec archive` refuses with an error naming the path

### Requirement: Glob patterns are bounded

An artifact `generates` or `apply.tracks` pattern that nests braces or
parentheses more than 16 levels, or brace-expands to more than 1024 paths, SHALL
be rejected with a clear error before matching. Brace-expanded paths SHALL stay
confined to the change directory.

#### Scenario: Deep nesting

- **WHEN** a schema declares a `generates` pattern with 17 nested brace levels
- **THEN** `cospec status` exits with an error naming the artifact and limit,
  not a stack overflow
