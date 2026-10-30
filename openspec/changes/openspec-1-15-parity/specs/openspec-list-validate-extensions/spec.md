# Spec Delta

## ADDED Requirements

### Requirement: List browses archived changes

`cospec list --archived` SHALL list archived changes and `cospec list --all`
SHALL list active and archived changes, both honouring `--sort` and `--json` as
the pinned binary does. Each row SHALL also carry the change's commit type and
archive date, and the `--json` document SHALL be additive over upstream's.

#### Scenario: Archived listing

- **WHEN** a user runs `cospec list --archived --json`
- **THEN** every upstream key is present and each item adds `type` and
  `archivedOn`

#### Scenario: All with sort

- **WHEN** a user runs `cospec list --all --sort name`
- **THEN** active and archived changes appear together in name order, each
  marked active or archived

### Requirement: Over-long requirements warn

A requirement description over 500 characters, in a living spec or an ADDED or
MODIFIED requirement in a change, SHALL be a WARNING with a stable rule ID whose
message explains how to split it without losing scenarios, so
`cospec validate --strict` fails on it.

#### Scenario: Strict fails

- **WHEN** a change ADDs a requirement whose description is 620 characters
- **THEN** `cospec validate <slug> --strict` exits nonzero naming the
  requirement and the rule ID

### Requirement: Text archive would drop is a warning

`cospec validate` and `cospec archive` SHALL warn when a delta spec holds text
archive does not carry: a `## ` section other than Purpose and the four delta
sections, text above the first `## ` header, or prose before the first
requirement in ADDED or MODIFIED.

#### Scenario: Foreign section

- **WHEN** a delta spec contains `## Notes` with prose
- **THEN** validate warns that the section will not reach the main spec and
  `--strict` fails

### Requirement: Placeholder purpose follows upstream case rules

`TBD`/`TODO` in capitals SHALL mark a placeholder Purpose whatever follows; any
other casing SHALL count only when followed by the end of the Purpose, a line
break, or marker punctuation.

#### Scenario: Spanish purpose

- **WHEN** a spec's Purpose begins "Todo el flujo de pago…"
- **THEN** no placeholder-purpose issue is reported

### Requirement: Scenario-loss message names what changed

When the MODIFIED scenario-loss guard fires, the message SHALL state the
scenario count on each side and name up to three scenarios the block introduces.
The guard's verdict and exit code SHALL be unchanged.

#### Scenario: Rename looks like a rename

- **WHEN** a MODIFIED block drops scenario "Old" and adds "New"
- **THEN** the message names "Old" as omitted, "New" as introduced, and the
  counts 1 and 1

### Requirement: Non-string rules items are located

A `rules:` entry in `openspec/config.yaml` that is not a string SHALL be
reported with its artifact, index, the parsed shape, and the quoting fix.

#### Scenario: Unquoted colon

- **WHEN** a rules item reads `- Use: tabs` unquoted
- **THEN** the warning names the index, says it parsed as a mapping, and shows
  the quoted form

### Requirement: No redraw on a zero-width terminal

cospec SHALL draw no spinner or progress redraw when stdout reports zero
columns, when `CI` is set, or when `OPEN_SPEC_INTERACTIVE=0`, and SHALL pass the
same environment to every wrapped call.

#### Scenario: Hook-runner pty

- **WHEN** `cospec validate --all` runs under a pty with `columns === 0`
- **THEN** it completes with plain output in bounded time
