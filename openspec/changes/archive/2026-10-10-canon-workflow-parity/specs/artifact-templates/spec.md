# Delta for artifact-templates

## ADDED Requirements

### Requirement: The tasks guidance never produces an archive task

The tasks artifact's instruction, in every conventional-commit type's schema,
SHALL state that archiving is not a task, because a task that describes the
archive can only be completed by the step that refuses it while it is open, and
SHALL tell the agent to end the list at the last implementation or documentation
task. It SHALL tell the agent that, where the repo's flow lands the archive as a
commit after the last task, that task's description ends with
`The archive commit follows this one`. The tasks `templateBody` SHALL contain no
archive row, and no type's note SHALL instruct adding one.

#### Scenario: every type's tasks guidance states the rule

- **WHEN** the generated schema of each of the eleven types is read
- **THEN** its tasks instruction states that archiving is not a task and gives
  the `The archive commit follows this one` wording

#### Scenario: no template offers an archive row

- **WHEN** the tasks `templateBody` and every type's tasks note are read
- **THEN** none contains a task that asks to archive the change
