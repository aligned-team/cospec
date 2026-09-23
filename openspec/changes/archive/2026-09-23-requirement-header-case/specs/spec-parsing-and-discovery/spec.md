## MODIFIED Requirements

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
