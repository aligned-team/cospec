// Change builders for the contract suite. Each writes a self-contained openspec
// tree into a temp repo so the SAME change can be handed to both `cospec` and the
// real `openspec` binary for parity/gotcha comparison (DESIGN §8.2).

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { writeFiles } from '../fixtures/support.ts'

/** Full-variant proposal that clears feat's proposal/sections + why-substantive. */
const PROPOSAL = `# ${'change'}

## Why

This capability does not exist yet and the product needs it to move forward;
without it the workflow described below cannot be completed at all.

## What Changes

- Introduce the capability described in the spec deltas.

## Capabilities

### New Capabilities

- widgets

## Impact

- New capability; no breaking changes.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

/** blocking-changes.md in the canonical §3.8 shape with both sections empty. */
const BLOCKERS = `# Dependencies

## Blocked by

None.

## Soft-blocked by

None.
`

const TASKS = `## 1. Implementation

- [ ] 1.1 Implement the capability
- [ ] 1.2 Add a covering test
`

function writeChangeShell(root: string, name: string, deltaFiles: Record<string, string>): void {
  const change = `openspec/changes/${name}`
  const files: Record<string, string> = {
    [`${change}/.openspec.yaml`]: 'schema: feat\ncreated: 2026-07-03\n',
    [`${change}/proposal.md`]: PROPOSAL,
    [`${change}/blocking-changes.md`]: BLOCKERS,
    [`${change}/tasks.md`]: TASKS,
  }
  for (const [rel, body] of Object.entries(deltaFiles)) files[`${change}/specs/${rel}`] = body
  writeFiles(root, files)
  // Ensure the openspec skeleton dirs exist even with no living specs.
  mkdirSync(join(root, 'openspec/specs'), { recursive: true })
  mkdirSync(join(root, 'openspec/changes/archive'), { recursive: true })
}

/** Write a living spec (main spec) at openspec/specs/<cap>/spec.md. */
export function writeLivingSpec(root: string, cap: string, body: string): void {
  const abs = join(root, `openspec/specs/${cap}/spec.md`)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

function livingSpec(cap: string, requirements: string): string {
  return `# ${cap} Specification

## Purpose

Real purpose text for the ${cap} capability.

## Requirements
${requirements}`
}

const ADDED_DELTA = `## ADDED Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

/**
 * The archive-precondition parity matrix (DESIGN §8.2). Each entry sets up a
 * `feat` change and (optionally) a living spec; `expectAbort` is the AUTHOR's
 * prediction, but the parity test also runs the real binary and never trusts it.
 */
export interface ParityFixture {
  key: string
  /** cospec archive/* (or deltas/*) rule expected to fire when abort is predicted. */
  rule?: string
  expectAbort: boolean
  /**
   * Set only where cospec is DELIBERATELY stricter than the binary: openspec
   * archives the fixture, cospec still flags it, and the named rule is the one
   * that must fire. The suite's policy allows cospec to be more conservative
   * (a false PASS is the release blocker, not a false flag) — naming the rule
   * here keeps that from drifting into an unrelated failure.
   */
  conservative?: string
  build(root: string): { name: string }
}

export const PARITY_FIXTURES: ParityFixture[] = [
  {
    key: 'valid-added',
    expectAbort: false,
    build(root) {
      writeChangeShell(root, 'valid-added', { 'widgets/spec.md': ADDED_DELTA })
      return { name: 'valid-added' }
    },
  },
  {
    key: 'modified-missing-target',
    rule: 'archive/target-missing',
    expectAbort: true,
    build(root) {
      // Living spec exists but lacks the MODIFIED requirement name.
      writeLivingSpec(
        root,
        'widgets',
        livingSpec(
          'widgets',
          `
### Requirement: Existing thing

The system SHALL keep an existing thing.

#### Scenario: Existing

- **WHEN** x
- **THEN** y
`,
        ),
      )
      writeChangeShell(root, 'modified-missing-target', {
        'widgets/spec.md': `## MODIFIED Requirements

### Requirement: Nonexistent requirement

The system SHALL change a requirement that does not exist.

#### Scenario: Modify

- **WHEN** a
- **THEN** b
`,
      })
      return { name: 'modified-missing-target' }
    },
  },
  {
    key: 'renamed-collision',
    rule: 'archive/added-exists',
    expectAbort: true,
    build(root) {
      writeLivingSpec(
        root,
        'widgets',
        livingSpec(
          'widgets',
          `
### Requirement: Alpha

The system SHALL alpha.

#### Scenario: a

- **WHEN** a
- **THEN** b

### Requirement: Beta

The system SHALL beta.

#### Scenario: b

- **WHEN** c
- **THEN** d
`,
        ),
      )
      // Rename Alpha -> Beta, but Beta already exists (collision).
      writeChangeShell(root, 'renamed-collision', {
        'widgets/spec.md': `## RENAMED Requirements

- FROM: \`### Requirement: Alpha\`
- TO: \`### Requirement: Beta\`
`,
      })
      return { name: 'renamed-collision' }
    },
  },
  {
    key: 'zero-op-delta',
    rule: 'deltas/header-present',
    expectAbort: true,
    build(root) {
      // A spec file with no recognized delta header → zero operations.
      writeChangeShell(root, 'zero-op-delta', {
        'widgets/spec.md': `# widgets

Some prose but no ADDED/MODIFIED/REMOVED/RENAMED header at all.
`,
      })
      return { name: 'zero-op-delta' }
    },
  },
  {
    key: 'three-hashtag-scenario',
    rule: 'deltas/scenario-depth',
    expectAbort: true,
    build(root) {
      writeChangeShell(root, 'three-hashtag-scenario', {
        'widgets/spec.md': `## ADDED Requirements

### Requirement: Widget rendering

The system SHALL render a widget.

### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`,
      })
      return { name: 'three-hashtag-scenario' }
    },
  },
  {
    key: 'added-already-exists',
    rule: 'archive/added-exists',
    expectAbort: true,
    build(root) {
      writeLivingSpec(
        root,
        'widgets',
        livingSpec(
          'widgets',
          `
### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`,
        ),
      )
      // ADDED a requirement whose name already exists in the living spec, with a
      // DIFFERENT body. openspec 1.7.0 made an ADDED block identical to the
      // living one a no-op (the early-sync pattern — see the fixture below);
      // differing content is still the genuine collision it aborts on.
      writeChangeShell(root, 'added-already-exists', {
        'widgets/spec.md': `## ADDED Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested, and cache it.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a cached widget is rendered
`,
      })
      return { name: 'added-already-exists' }
    },
  },
  {
    // openspec 1.7.0 `archive-early-sync-existing-workflow-behavior`: an ADDED
    // block byte-identical to the living requirement means the spec was already
    // synced to the baseline, so re-applying it is a no-op and the archive
    // succeeds. cospec's `archive/added-exists` is name-based and still flags
    // it — a deliberate conservatism, recorded here rather than relaxed:
    // relaxing it needs raw-block capture and openspec's own normalization.
    key: 'added-identical-early-sync',
    conservative: 'archive/added-exists',
    expectAbort: false,
    build(root) {
      writeLivingSpec(
        root,
        'widgets',
        livingSpec(
          'widgets',
          `
### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`,
        ),
      )
      writeChangeShell(root, 'added-identical-early-sync', { 'widgets/spec.md': ADDED_DELTA })
      return { name: 'added-identical-early-sync' }
    },
  },
  {
    key: 'new-spec-non-added',
    rule: 'archive/new-spec-non-added',
    expectAbort: true,
    build(root) {
      // No living spec for this capability, yet the delta uses REMOVED.
      writeChangeShell(root, 'new-spec-non-added', {
        'widgets/spec.md': `## REMOVED Requirements

### Requirement: Widget rendering

The system SHALL no longer render a widget.

#### Scenario: Remove

- **WHEN** a
- **THEN** b
`,
      })
      return { name: 'new-spec-non-added' }
    },
  },
]

/** A minimal valid `feat` change with the given ADDED delta (for gotcha repos). */
export function buildValidFeat(root: string, name = 'add-widget'): void {
  writeChangeShell(root, name, { 'widgets/spec.md': ADDED_DELTA })
}
