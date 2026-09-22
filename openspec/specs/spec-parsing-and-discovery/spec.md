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
root-level `specs/spec.md`, and scenario loss in a MODIFIED delta. Suppression
SHALL apply only when the native rule actually fired; when cospec's own rule is
silent, the delegated issue SHALL still be reported so nothing is lost.

#### Scenario: One diagnostic per defect

- **WHEN** `cospec validate --strict` runs on a change whose delta thins
  scenarios, and both cospec's own rule and the wrapped binary report it
- **THEN** the merged report contains exactly one issue for that defect, the
  cospec-native one, and the exit code is unchanged

#### Scenario: Unmatched delegated issue survives

- **WHEN** the wrapped binary reports a spec defect that no cospec rule covers
- **THEN** the delegated issue appears in the merged report unchanged

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
