# Spec Delta

## ADDED Requirements

### Requirement: Store edit scope includes the declaring project

For a store-backed change, `cospec status --json`'s
`actionContext.allowedEditRoots` SHALL list the project on the current path that
declares the store alongside the store. When no project on the path declares it,
the constraint SHALL tell the agent to ask which repository to edit.

#### Scenario: Declaring project present

- **WHEN** `cospec status --change x --json` runs inside a repo whose config
  points at store `plans`
- **THEN** `allowedEditRoots` holds both the repo root and the store root
