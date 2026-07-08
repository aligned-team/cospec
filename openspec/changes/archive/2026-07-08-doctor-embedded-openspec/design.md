# Design

## Context

`bundle-openspec` gave wrapped spawns a two-step resolution (project
`node_modules` copy, else embedded pinned bundle) inside `openspecBin()`, but
`doctor.ts`'s `checkOpenspecVersion` still calls `openspecPackageDir()` directly
— a function that only knows the node_modules bases and throws otherwise. Root
cause: the fallback lives in the spawn path, not in a shared resolution
primitive, so the diagnostic path silently kept the old behavior and reports a
healthy standalone install as an ERROR.

## Goals / Non-Goals

**Goals:**

- One resolution path shared by spawns and diagnostics; doctor reports the
  source it would actually spawn.
- Doctor stays read-only — reporting the embedded source must not extract the
  bundle.

**Non-Goals:**

- Changing resolution order or the version assertion for wrapped spawns.
- Extending doctor with any new checks beyond the corrected source report.

## Decisions

- Expose a `resolveOpenspec()` outcome from `core/openspec.ts` — project package
  dir (with on-disk version) or embedded pin — and have both `openspecBin()` and
  doctor consume it. Rejected: patching doctor with its own try/catch fallback,
  which duplicates the order and lets the two paths drift again (the exact shape
  of this bug).
- Doctor reports the embedded case from the compile-time
  `PINNED_OPENSPEC_VERSION` constant without calling `extractEmbeddedOpenspec`.
  Rejected: extracting and reading the synthesized manifest — a write side
  effect in a read-only health check, for a value known at compile time.

## Risks / Trade-offs

- [Doctor says "embedded" but a later wrapped call resolves differently because
  `node_modules` changed in between] → both consume the same
  `resolveOpenspec()`; within one process the outcome is cached, and across runs
  the report names its source explicitly.

## Operational surface

- CLI-only change: `cospec doctor` text output and exit code on standalone (mise
  / GitHub-release) installs. No bind address, container, or secret is involved.
- Binary/arch surface unchanged: the seven platform executables already embed
  the bundle; doctor merely reports the compile-time pin
  (`PINNED_OPENSPEC_VERSION`) and touches no cache directory.
