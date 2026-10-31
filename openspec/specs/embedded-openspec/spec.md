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
when present and in the accepted range, else fall back to the embedded bundle
(by construction the pin). Version assertion and wrapped-call discipline SHALL
hold for both. `cospec doctor` SHALL follow the same order: with only the
embedded copy it SHALL report that source and no resolution error, and an
out-of-range project copy SHALL stay a version error. The check MUST NOT extract
the bundle to disk.

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

#### Scenario: Doctor is silent on an in-range project copy

- **WHEN** `cospec doctor` runs with a project copy that resolves in range
- **THEN** it reports no resolution finding for it

#### Scenario: Both sources keep the wrapped-call discipline

- **WHEN** a wrapped call runs against either the project copy or the embedded
  bundle
- **THEN** it declares its exit codes, stdout deny-list, and observable
  post-condition exactly as for the other source

### Requirement: Embedded bundle extraction

When the embedded bundle is used, cospec SHALL extract it write-once with an
atomic rename to `${XDG_CACHE_HOME:-~/.cache}/cospec/openspec-<version>/`, laid
out so the bundle's relative reads resolve (a synthesized manifest carrying the
pinned version). Extraction SHALL be spawned via `process.execPath` with
`BUN_BE_BUN=1` and SHALL enforce the post-condition that the extracted bundle
exists at the expected path with the expected byte length.

#### Scenario: Extraction is write-once and reused

- **WHEN** the embedded bundle has already been extracted for a version
- **THEN** a subsequent run reuses the extracted file without rewriting it

#### Scenario: Extraction post-condition holds

- **WHEN** cospec extracts the embedded bundle
- **THEN** the extracted file exists at the expected path and its byte length
  equals the embedded bundle's byte length, or the wrapped call fails

### Requirement: OpenSpec 1.15.0 pin

The dev/CI pin and the embedded bundle SHALL be `@fission-ai/openspec` 1.15.0,
with `EXPECTED_OPENSPEC_VERSION` equal to it and the accepted range unchanged at
`>=1.0.0 <2.0.0`. The contract, reachability, remedy-enumeration, key-oracle,
and optional-workflow differential suites SHALL pass against that pin with
`parity-pending.yaml` empty.

#### Scenario: Pin agreement

- **WHEN** `mise run check` runs
- **THEN** `package.json`, `mise.toml`, `EXPECTED_OPENSPEC_VERSION`, and the
  vendored bundle all name 1.15.0 and `vendor:openspec:check` reports no drift

#### Scenario: No pending surfaces

- **WHEN** the reachability test runs against the 1.15.0 dist
- **THEN** every command, flag, tool id and workflow resolves to the command
  table, an alias, or the single exception, and `parity-pending.yaml` is `[]`

### Requirement: Glob port follows the pin's glob stack

`core/glob.ts` SHALL match artifact paths as the pinned binary does. With 1.15.0
resolving globs through `tinyglobby`, `picomatch`, and `brace-expansion` instead
of `fast-glob`, cospec's exact glob devDependencies SHALL move to the versions
the pin resolves, and `test/contract/glob.test.ts` SHALL agree with the binary.

#### Scenario: Glob differential

- **WHEN** `test/contract/glob.test.ts` runs at the 1.15.0 pin
- **THEN** every pattern in its matrix matches the same paths in cospec and in
  the binary
