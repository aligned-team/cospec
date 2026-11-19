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

### Requirement: Init runs at a store-only repository root

`cospec init` at the root of a repository whose `openspec/` holds only a
`store:` pointer SHALL install harness integrations without changing the pointer
config and without creating local planning directories, matching OpenSpec
1.14.0. An invalid `store:` line SHALL still be refused.

#### Scenario: Store-only repo

- **WHEN** `cospec init --tools claude` runs at a repo whose
  `openspec/config.yaml` holds only `store: plans`
- **THEN** `.claude/` is written, the config is byte-identical, and no
  `openspec/changes` or `openspec/specs` is created
