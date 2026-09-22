## ADDED Requirements

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

## MODIFIED Requirements

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
