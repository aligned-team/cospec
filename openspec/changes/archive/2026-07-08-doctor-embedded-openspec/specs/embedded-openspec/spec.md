## MODIFIED Requirements

### Requirement: Wrapped-openspec resolution order

Wrapped-openspec resolution SHALL prefer a project's own `node_modules` copy
when it is present and its version satisfies the accepted range; otherwise it
SHALL fall back to the embedded bundle. The embedded copy is by construction the
pin, and the version assertion and wrapped-call discipline (declared exit codes,
stdout deny-list, observable post-conditions) SHALL be preserved for both
sources.

Diagnostics SHALL follow the same order: when only the embedded copy is
available, `cospec doctor` SHALL report it as the resolution source and SHALL
NOT report a resolution error. A resolving in-range project copy produces no
finding; an out-of-range project copy remains a version error. The doctor check
SHALL remain read-only: reporting the embedded source MUST NOT extract the
bundle to disk.

#### Scenario: Project copy is used when present and in range

- **WHEN** a project has an in-range `@fission-ai/openspec` in `node_modules`
- **THEN** cospec spawns that copy and does not extract the embedded bundle

#### Scenario: Embedded copy is used when no project copy resolves

- **WHEN** no `@fission-ai/openspec` resolves from the executable or the project
- **THEN** cospec spawns the extracted embedded bundle and the version assertion
  passes against the pinned version

#### Scenario: Doctor reports the embedded copy instead of a false error

- **WHEN** `cospec doctor` runs where no `@fission-ai/openspec` resolves from
  the executable or the project
- **THEN** the openspec check reports the embedded pinned copy as the resolution
  source with no `openspec-resolve` ERROR, and no bundle is extracted to disk

#### Scenario: Doctor still flags an out-of-range project copy

- **WHEN** `cospec doctor` runs where a project `@fission-ai/openspec` resolves
  with a version outside the accepted range
- **THEN** the check reports the existing `openspec-version` ERROR for the
  project copy
