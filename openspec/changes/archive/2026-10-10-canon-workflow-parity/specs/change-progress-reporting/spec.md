# Delta for change-progress-reporting

## ADDED Requirements

### Requirement: Apply declares and relays the binary's operation inputs

`ApplyInstructionsJson` SHALL declare `context?`, `operationGuidance?` and
`references?`, the optional keys the pinned binary's `instructions apply --json`
carries, and `cospec apply` SHALL relay them in both of its output paths: the
clear-gate path and the legacy-schema path, each in its `--json` document and
its human transcript. `context` and `operationGuidance` SHALL pass byte for
byte, including an entry that begins `openspec `. The command fields of
`references` (`references[].fetch` and `references[].status[].fix`) SHALL be
spelled through cospec by the whole-value remedy rule and nothing else in the
document SHALL be respelled by it.

The human transcript SHALL print a `### Referenced Stores` section before the
instruction when `references` is present, and a
`### Project Context (required instruction input)` section and a
`### Operation Guidance (advisory)` section after the instruction, each only
when its input is present, rendered as the pinned binary renders them. When none
of the three is present the transcript SHALL be byte-identical to what it was
without them.

#### Scenario: configured guidance surfaces in both paths, text and JSON

- **WHEN** a project's `config.yaml` sets `context` and
  `operations.apply.guidance` and `cospec apply <change>` runs on a cospec-typed
  change and on a legacy-schema change, each with and without `--json`
- **THEN** every output carries the context and each guidance entry, and the
  text sections equal the pinned binary's own for the same project

#### Scenario: nothing configured prints nothing new

- **WHEN** no `context`, `operations` or `references` is configured
- **THEN** both transcripts are byte-identical to the previous release's and
  neither prints `No project context or operation guidance configured.`

#### Scenario: user text is never respelled, reference commands are

- **WHEN** an `operations.apply.guidance` entry begins `openspec list` and a
  declared reference carries a `fetch` command beginning `openspec `
- **THEN** the guidance entry is relayed unchanged and the `fetch` field reads
  `cospec ...`
