# artifact-templates Specification

## Purpose

Govern the shape of the artifact template bodies cospec scaffolds — the starting
text a user or agent is handed for `proposal`, `blocking-changes`, `specs`,
`design`, `tasks`, and `verification`. Templates are composed from
`apps/cli/src/canon/artifacts/**` and must stay parseable by cospec's own
artifact parsers while reading as complete Markdown documents to outside
tooling: each body opens with a single top-level heading, and every template
variant an artifact defines obeys the same rule.

## Requirements

### Requirement: Artifact templates open with a top-level heading

Every artifact template body cospec scaffolds SHALL open with a single top-level
`# <Artifact name>` heading, in Title Case matching the artifact id —
`# Proposal`, `# Blocking Changes`, `# Specs`, `# Design`, `# Tasks`,
`# Verification` — so a freshly scaffolded artifact is a document rather than a
fragment and satisfies the one-H1-first rule (MD041) that common Markdown
linters enforce. The rule SHALL hold for every template variant an artifact
defines, including both `proposal` variants, and the heading SHALL be the
literal first line of the template body.

#### Scenario: a scaffolded feat change opens every artifact with an H1

- **WHEN** `cospec new feat <slug>` scaffolds a change and each generated
  artifact body is read
- **THEN** `proposal.md`, `design.md`, `tasks.md`, `verification.md` and each
  delta `specs/**/spec.md` opens with a single `# ` heading whose text is the
  artifact name in Title Case

#### Scenario: both proposal variants carry the heading

- **WHEN** the `full` and the reduced `proposal` template variants are read
- **THEN** each opens with `# Proposal` as its first line

### Requirement: Template readers are top-level-heading agnostic

Adding a top-level heading to a template body SHALL NOT change any parse,
validation, or composition result. The task and verification group readers, the
delta section reader, and the composer's `Surfaces` block append path SHALL all
be inert with respect to a leading `# ` line, and an untouched scaffold SHALL
validate exactly as it did before the heading was introduced.

#### Scenario: an untouched scaffold validates unchanged

- **WHEN** `cospec validate <slug> --strict` runs against a freshly scaffolded
  change whose artifacts have not been edited
- **THEN** its verdict and issue set are identical to the verdict and issue set
  produced before the top-level headings were added

#### Scenario: group and section readers ignore the heading

- **WHEN** a `tasks.md`, `verification.md`, or delta `spec.md` body that opens
  with a `# ` heading is parsed
- **THEN** the task groups, verification groups, and delta sections found are
  the same as for the same body without that heading, and the `Surfaces` block
  is still appended to the proposal at its established position
