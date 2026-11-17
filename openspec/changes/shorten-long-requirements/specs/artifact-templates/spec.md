# Spec Delta

## MODIFIED Requirements

### Requirement: Artifact templates open with a top-level heading

Every artifact template body cospec scaffolds SHALL open with a single top-level
`# <Artifact name>` heading in Title Case matching the artifact id —
`# Proposal`, `# Blocking Changes`, `# Specs`, `# Design`, `# Tasks`,
`# Verification` — so a fresh artifact is a document and satisfies the
one-H1-first rule (MD041). This SHALL hold for every template variant, including
both `proposal` variants, and the heading SHALL be the literal first line of the
template body.

#### Scenario: a scaffolded feat change opens every artifact with an H1

- **WHEN** `cospec new feat <slug>` scaffolds a change and each generated
  artifact body is read
- **THEN** `proposal.md`, `design.md`, `tasks.md`, `verification.md` and each
  delta `specs/**/spec.md` opens with a single `# ` heading whose text is the
  artifact name in Title Case

#### Scenario: both proposal variants carry the heading

- **WHEN** the `full` and the reduced `proposal` template variants are read
- **THEN** each opens with `# Proposal` as its first line

### Requirement: The tasks guidance never produces an archive task

Every type's tasks instruction SHALL state that archiving is not a task (only
the step that refuses an open task could complete it) and SHALL tell the agent
to end the list at the last implementation or documentation task. Where the
repo's flow lands the archive as a commit after the last task, that task's
description SHALL end with `The archive commit follows this one`. The tasks
`templateBody` SHALL contain no archive row, and no type's note SHALL instruct
adding one.

#### Scenario: every type's tasks guidance states the rule

- **WHEN** the generated schema of each of the eleven types is read
- **THEN** its tasks instruction states that archiving is not a task and gives
  the `The archive commit follows this one` wording

#### Scenario: no template offers an archive row

- **WHEN** the tasks `templateBody` and every type's tasks note are read
- **THEN** none contains a task that asks to archive the change
