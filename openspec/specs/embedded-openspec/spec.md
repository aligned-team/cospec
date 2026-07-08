# embedded-openspec Specification

## Purpose

Make the standalone compiled cospec binary fully self-contained: it embeds a
single-file bundle of the pinned OpenSpec CLI and can extract and run it with no
node_modules, no bun, and no npm, while still preferring a project-installed
in-range openspec when one exists.

## Requirements

### Requirement: Embedded openspec bundle

The compiled `cospec` binary SHALL embed a self-contained single-file JS bundle
of the pinned `@fission-ai/openspec` CLI, produced at build time and embedded
via a static `{ type: 'file' }` import so it is carried inside `$bunfs`. The
bundle SHALL be a committed, drift-gated generated asset that the CI gate fails
on when it is stale relative to the pinned openspec version.

#### Scenario: Bundle is embedded in the compiled binary

- **WHEN** the standalone binary is compiled with `bun build --compile`
- **THEN** the openspec bundle is readable from the binary at runtime via its
  `$bunfs` path with no `node_modules` present on disk

#### Scenario: Stale vendored bundle fails the gate

- **WHEN** the committed vendored bundle does not match a fresh build of the
  pinned openspec version
- **THEN** the vendored-bundle drift check exits non-zero

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

### Requirement: Embedded bundle extraction

When the embedded bundle is used, cospec SHALL extract it to a per-version cache
directory (`${XDG_CACHE_HOME:-~/.cache}/cospec/openspec-<version>/`), write-once
with an atomic rename, laid out so the bundle's runtime relative reads resolve
(a synthesized package manifest carrying the pinned version). The extraction
SHALL be spawned via `process.execPath` with `BUN_BE_BUN=1`, and SHALL enforce
an observable post-condition that the extracted bundle file exists at the
expected path with the expected byte length.

#### Scenario: Extraction is write-once and reused

- **WHEN** the embedded bundle has already been extracted for a version
- **THEN** a subsequent run reuses the extracted file without rewriting it

#### Scenario: Extraction post-condition holds

- **WHEN** cospec extracts the embedded bundle
- **THEN** the extracted file exists at the expected path and its byte length
  equals the embedded bundle's byte length, or the wrapped call fails
