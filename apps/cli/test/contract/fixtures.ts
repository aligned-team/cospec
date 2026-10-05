// Change builders for the contract suite. Each writes a self-contained openspec
// tree into a temp repo so the SAME change can be handed to both `cospec` and the
// real `openspec` binary for parity/gotcha comparison (DESIGN §8.2).

import { chmodSync, cpSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { REPO_ROOT, writeFiles } from '../fixtures/support.ts'

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

/** The living requirement `ADDED_DELTA` re-states verbatim. */
const LIVING_WIDGET_REQ = `
### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

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
    // block whose normalized raw text matches the living requirement means the
    // spec was already synced to the baseline, so re-applying it is a no-op and
    // the archive succeeds. cospec now compares the block bodies with a
    // verbatim port of openspec's `normalizeBlockRaw` and agrees: no rule
    // fires, and BOTH sides archive. The differing-body collision stays an
    // error — that is `added-already-exists`, directly above.
    key: 'added-identical-early-sync',
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
    // The same early sync with CRLF line endings on the delta side. openspec's
    // `normalizeBlockRaw` folds CR/CRLF before comparing, so the blocks are
    // identical and BOTH sides archive. Pins the port at exactly upstream's
    // tolerance: line endings, nothing more.
    key: 'added-identical-crlf',
    expectAbort: false,
    build(root) {
      writeLivingSpec(root, 'widgets', livingSpec('widgets', LIVING_WIDGET_REQ))
      writeChangeShell(root, 'added-identical-crlf', {
        'widgets/spec.md': ADDED_DELTA.replace(/\n/g, '\r\n'),
      })
      return { name: 'added-identical-crlf' }
    },
  },
  {
    // openspec 1.7.0 `archive-early-sync-*`, REMOVED arm: a REMOVED target
    // already gone from the living spec means the removal was applied ahead of
    // the archive. Upstream warns and continues at exit 0; cospec agrees.
    key: 'removed-already-missing',
    expectAbort: false,
    build(root) {
      writeLivingSpec(root, 'widgets', livingSpec('widgets', LIVING_WIDGET_REQ))
      writeChangeShell(root, 'removed-already-missing', {
        'widgets/spec.md': `## REMOVED Requirements

- \`### Requirement: Widget caching\`
`,
      })
      return { name: 'removed-already-missing' }
    },
  },
  {
    // The carve-out on the same arm: the target is absent, but a name that
    // folds equal to it still lives there. That is a mistyped header, and
    // upstream aborts rather than treating it as already removed.
    key: 'removed-near-miss-typo',
    rule: 'archive/target-missing',
    expectAbort: true,
    build(root) {
      writeLivingSpec(root, 'widgets', livingSpec('widgets', LIVING_WIDGET_REQ))
      writeChangeShell(root, 'removed-near-miss-typo', {
        'widgets/spec.md': `## REMOVED Requirements

- \`### Requirement: widget  rendering\`
`,
      })
      return { name: 'removed-near-miss-typo' }
    },
  },
  {
    // RENAMED arm: source gone, target present — the rename was already
    // applied. Both the missing-source error and the TO-collision the same
    // shape raises must stay silent, on both sides.
    key: 'renamed-early-sync',
    expectAbort: false,
    build(root) {
      writeLivingSpec(root, 'widgets', livingSpec('widgets', LIVING_WIDGET_REQ))
      writeChangeShell(root, 'renamed-early-sync', {
        'widgets/spec.md': `## RENAMED Requirements

- FROM: \`### Requirement: Widget drawing\`
- TO: \`### Requirement: Widget rendering\`
`,
      })
      return { name: 'renamed-early-sync' }
    },
  },
  {
    // The early-sync suppression is scoped to the LIVING collision only. The
    // binary's pre-validation refuses a RENAMED TO that collides with an ADDED
    // in the same delta unconditionally, before any early-sync classification,
    // so cospec must keep flagging it even when the rename itself is a no-op.
    // The ADDED body is identical to the living block, so cospec's ADDED arm
    // is silent and only the RENAMED-TO arm can catch this.
    key: 'renamed-early-sync-added-collision',
    rule: 'archive/added-exists',
    expectAbort: true,
    build(root) {
      writeLivingSpec(root, 'widgets', livingSpec('widgets', LIVING_WIDGET_REQ))
      writeChangeShell(root, 'renamed-early-sync-added-collision', {
        'widgets/spec.md': `${ADDED_DELTA}
## RENAMED Requirements

- FROM: \`### Requirement: Widget drawing\`
- TO: \`### Requirement: Widget rendering\`
`,
      })
      return { name: 'renamed-early-sync-added-collision' }
    },
  },
  {
    // The carve-out on the RENAMED arm: the source is absent, but a fold-equal
    // living name that is NOT the target survives — a typo'd FROM header.
    key: 'renamed-from-near-miss',
    rule: 'archive/target-missing',
    expectAbort: true,
    build(root) {
      writeLivingSpec(
        root,
        'widgets',
        livingSpec(
          'widgets',
          `${LIVING_WIDGET_REQ}
### Requirement: Widget  drawing

The system SHALL draw a widget.

#### Scenario: Draw a widget

- **WHEN** a caller requests a drawing
- **THEN** a widget is drawn
`,
        ),
      )
      writeChangeShell(root, 'renamed-from-near-miss', {
        'widgets/spec.md': `## RENAMED Requirements

- FROM: \`### Requirement: Widget drawing\`
- TO: \`### Requirement: Widget rendering\`
`,
      })
      return { name: 'renamed-from-near-miss' }
    },
  },
  {
    // A MODIFIED block that swaps one scenario's NAME at the same count. The
    // count arm alone sees `1 -> 1` and passes; the name arm refuses, and so
    // does the real binary from 1.8.0 on.
    key: 'scenario-name-swap',
    rule: 'archive/scenario-preservation',
    expectAbort: true,
    build(root) {
      writeLivingSpec(root, 'widgets', livingSpec('widgets', LIVING_WIDGET_REQ))
      writeChangeShell(root, 'scenario-name-swap', {
        'widgets/spec.md': `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Paint a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is painted
`,
      })
      return { name: 'scenario-name-swap' }
    },
  },
  {
    // openspec applies RENAMED before MODIFIED against ONE map, so a MODIFIED
    // naming the header this same delta renamed into existence resolves. cospec
    // read the pristine living spec here and refused a change the binary
    // archives at exit 0 — a false refusal with no workaround short of
    // splitting the rename and the edit into two changes.
    key: 'rename-then-modify',
    expectAbort: false,
    build(root) {
      writeLivingSpec(root, 'widgets', livingSpec('widgets', LIVING_WIDGET_REQ))
      writeChangeShell(root, 'rename-then-modify', {
        'widgets/spec.md': `## RENAMED Requirements

- FROM: \`### Requirement: Widget rendering\`
- TO: \`### Requirement: Widget drawing\`

## MODIFIED Requirements

### Requirement: Widget drawing

The system SHALL draw a widget promptly when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is drawn promptly
`,
      })
      return { name: 'rename-then-modify' }
    },
  },
  {
    // The gate that has to follow the rename with it. Upstream's MODIFIED arm
    // compares against the block the RENAMED phase re-keyed, so the scenarios
    // the MODIFIED block must preserve are the SOURCE's — and dropping one
    // aborts the merge. Resolving only the target name found no living
    // requirement, zero scenarios, and no drop: a false archive PASS.
    key: 'rename-then-modify-dropping-scenario',
    rule: 'archive/scenario-preservation',
    expectAbort: true,
    build(root) {
      writeLivingSpec(root, 'widgets', livingSpec('widgets', LIVING_WIDGET_REQ))
      writeChangeShell(root, 'rename-then-modify-dropping-scenario', {
        'widgets/spec.md': `## RENAMED Requirements

- FROM: \`### Requirement: Widget rendering\`
- TO: \`### Requirement: Widget drawing\`

## MODIFIED Requirements

### Requirement: Widget drawing

The system SHALL draw a widget promptly when requested.

#### Scenario: Draw a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is drawn promptly
`,
      })
      return { name: 'rename-then-modify-dropping-scenario' }
    },
  },
  {
    // Chained renames in one delta: the second one's source exists only because
    // the first one created it. Upstream re-keys `nameToBlock` as it goes.
    key: 'chained-renames',
    expectAbort: false,
    build(root) {
      writeLivingSpec(root, 'widgets', livingSpec('widgets', LIVING_WIDGET_REQ))
      writeChangeShell(root, 'chained-renames', {
        'widgets/spec.md': `## RENAMED Requirements

- FROM: \`### Requirement: Widget rendering\`
- TO: \`### Requirement: Widget drawing\`
- FROM: \`### Requirement: Widget drawing\`
- TO: \`### Requirement: Widget painting\`
`,
      })
      return { name: 'chained-renames' }
    },
  },
  {
    // The ADDED phase runs last, so a header this delta renamed away is free by
    // the time the addition lands. Re-using the vacated name for a genuinely
    // new requirement archives at exit 0; cospec called it a collision and
    // hinted at MODIFIED, which would have silently discarded the rename.
    key: 'rename-then-add-source',
    expectAbort: false,
    build(root) {
      writeLivingSpec(root, 'widgets', livingSpec('widgets', LIVING_WIDGET_REQ))
      writeChangeShell(root, 'rename-then-add-source', {
        'widgets/spec.md': `## RENAMED Requirements

- FROM: \`### Requirement: Widget rendering\`
- TO: \`### Requirement: Widget drawing\`

## ADDED Requirements

### Requirement: Widget rendering

The system SHALL render a widget through the new pipeline.

#### Scenario: Render through the pipeline

- **WHEN** a caller requests a widget
- **THEN** the new pipeline renders it
`,
      })
      return { name: 'rename-then-add-source' }
    },
  },
  {
    // The near-miss twin that withholds the RENAMED early-sync exemption has to
    // be one that SURVIVES to this operation. Here an earlier rename carried it
    // away, so upstream finds none and treats the second rename as already
    // applied. Searching the pristine living spec found the twin anyway and
    // produced TWO invented ERRORs under two different rule ids.
    key: 'renamed-near-miss-vacated-by-earlier-rename',
    expectAbort: false,
    build(root) {
      writeLivingSpec(
        root,
        'widgets',
        livingSpec(
          'widgets',
          `${LIVING_WIDGET_REQ}
### Requirement: Widget caching

The system SHALL cache a rendered widget.

#### Scenario: Cache a widget

- **WHEN** a caller requests the same widget twice
- **THEN** the second request is served from cache
`,
        ),
      )
      writeChangeShell(root, 'renamed-near-miss-vacated-by-earlier-rename', {
        'widgets/spec.md': `## RENAMED Requirements

- FROM: \`### Requirement: Widget rendering\`
- TO: \`### Requirement: Widget drawing\`
- FROM: \`### Requirement: widget  rendering\`
- TO: \`### Requirement: Widget caching\`
`,
      })
      return { name: 'renamed-near-miss-vacated-by-earlier-rename' }
    },
  },
  {
    key: 'new-spec-non-added',
    rule: 'archive/rebuilt-spec-invalid',
    expectAbort: true,
    build(root) {
      // No living spec for this capability, yet the delta only REMOVEs. The
      // binary ignores the REMOVED ("nothing to remove") and refuses the
      // rebuilt spec, which has no requirement — so that is the rule that
      // fires (archive-and-sync-parity design D9), not new-spec-non-added.
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
  // The `Requirement:` keyword is case-insensitive to the binary
  // (`REQUIREMENT_HEADER_REGEX`, 1.13.1), so cospec must read the same op the
  // binary applies. While cospec's header regex was case-sensitive these two
  // fixtures failed in the worst direction: no op parsed, so the read-only gate
  // was clean on BOTH — including the scenario-dropping one the binary refuses.
  {
    key: 'lowercase-header-modified',
    expectAbort: false,
    build(root) {
      writeLivingSpec(root, 'widgets', livingSpec('widgets', LIVING_WIDGET_REQ))
      writeChangeShell(root, 'lowercase-header-modified', {
        'widgets/spec.md': `## MODIFIED Requirements

### requirement: Widget rendering

The system SHALL render a widget promptly when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered promptly
`,
      })
      return { name: 'lowercase-header-modified' }
    },
  },
  {
    key: 'lowercase-header-modified-drops-scenario',
    rule: 'archive/scenario-preservation',
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

#### Scenario: Render a cached widget

- **WHEN** a caller requests the same widget twice
- **THEN** the second render is served from cache
`,
        ),
      )
      writeChangeShell(root, 'lowercase-header-modified-drops-scenario', {
        'widgets/spec.md': `## MODIFIED Requirements

### requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`,
      })
      return { name: 'lowercase-header-modified-drops-scenario' }
    },
  },
]

/** A minimal valid `feat` change with the given ADDED delta (for gotcha repos). */
export function buildValidFeat(root: string, name = 'add-widget'): void {
  writeChangeShell(root, name, { 'widgets/spec.md': ADDED_DELTA })
}

/**
 * A `feat` change whose MODIFIED header closes with an ATX run
 * (`### Requirement: Widget rendering ###`) against a living spec whose header
 * does not. The two binaries read this differently:
 *
 * - **1.11.0 (the pin)** captures the name greedily
 *   (`requirement-blocks.ts:33`), so the delta names `Widget rendering ###` and
 *   the archive aborts `… failed for header "### Requirement: Widget rendering
 *   ###" - not found`.
 * - **1.13.1** added `normalizeRequirementName`, which strips the closing run,
 *   so the same delta applies.
 *
 * cospec's parser now strips it too (openspec 1.13.1 parity), which is why this
 * fixture is deliberately NOT in `PARITY_FIXTURES`: at the pin cospec's
 * read-only gate is clean while the binary aborts. `archive-gotchas.test.ts`
 * pins both halves — the binary's real 1.11.0 refusal, and the fact that
 * `cospec archive` still reports failure because it verifies the move on disk
 * rather than trusting its own precondition pass.
 */
export function buildTrailingHashesModified(root: string, name = 'trailing-hashes-modified'): void {
  writeLivingSpec(root, 'widgets', livingSpec('widgets', LIVING_WIDGET_REQ))
  writeChangeShell(root, name, {
    'widgets/spec.md': `## MODIFIED Requirements

### Requirement: Widget rendering ###

The system SHALL render a widget promptly when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered promptly
`,
  })
}

/** A living spec with two requirements: one to keep, one to remove or rename. */
const LIVING_TWO_REQS = `
### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered

### Requirement: Widget caching

The system SHALL cache a rendered widget.

#### Scenario: Cache a widget

- **WHEN** a caller requests the same widget twice
- **THEN** the second request is served from cache
`

/** The requirement `buildMarkerRemoved`/`buildMarkerRenamed` target. */
export const MARKER_TARGET = 'Widget caching'

/**
 * A `feat` change whose `## REMOVED Requirements` entry is written with
 * `marker` as its bullet, against a living spec that still carries the target.
 *
 * `marker` is passed verbatim, so it carries the indentation too
 * (`'  -'` writes an indented hyphen). The two binaries disagree here:
 *
 * - **1.11.0 (the pin)** reads REMOVED bullets with
 *   `/^\s*-\s*`?###\s*Requirement:\s*(.+?)`?\s*$/` — leading whitespace yes,
 *   `*` and `+` no. A `*`/`+` entry parses as nothing, so the section is empty
 *   and `validate`/`archive` refuse with `… but no requirement entries parsed`.
 * - **1.13.1** widened the class to `[-*+]`, so the same delta applies.
 */
export function buildMarkerRemoved(root: string, marker: string, name: string): void {
  writeLivingSpec(root, 'widgets', livingSpec('widgets', LIVING_TWO_REQS))
  writeChangeShell(root, name, {
    'widgets/spec.md': `## REMOVED Requirements

${marker} \`### Requirement: ${MARKER_TARGET}\`
`,
  })
}

/**
 * The RENAMED twin of `buildMarkerRemoved`: `Widget caching` → `Widget
 * memoization`, with both `FROM:` and `TO:` bulleted by `marker`.
 *
 * At the pin the bullet is `/^\s*-?\s*FROM:…/` — an optional SINGLE hyphen — so
 * a `*`/`+` pair parses as nothing and the section reads as empty, exactly as
 * the REMOVED arm does. 1.13.1 accepts `[-*+]?`.
 */
export function buildMarkerRenamed(root: string, marker: string, name: string): void {
  writeLivingSpec(root, 'widgets', livingSpec('widgets', LIVING_TWO_REQS))
  writeChangeShell(root, name, {
    'widgets/spec.md': `## RENAMED Requirements

${marker} FROM: \`### Requirement: ${MARKER_TARGET}\`
${marker} TO: \`### Requirement: Widget memoization\`
`,
  })
}

// --- archive-and-sync-parity (archive --no-validate, archive's JSON, sync-specs) ---
//
// Every builder below writes a `feat` change at `schemaVersion: 2` with done
// tasks and a resolved verification ledger, so `cospec validate --strict`,
// `cospec archive` and the binary's own archive all accept it, except for the
// one thing the builder is named for. The composed cospec schema is copied in
// (`withCospecSchema`), because the binary honours `retire_capabilities:` and
// reads `tracks:` only for a change whose `schema:` it can load.

/** Copy this repo's composed cospec schema `schema` into `root`. */
export function withCospecSchema(root: string, schema: string): void {
  cpSync(join(REPO_ROOT, 'openspec/schemas', schema), join(root, 'openspec/schemas', schema), {
    recursive: true,
  })
}

const V2_PROPOSAL = `# change

## Why

The widgets capability has to change shape for the next release, and the main
specs must say so; without this change the archive would describe a widget
behaviour the product no longer has.

## What Changes

- Change the widgets capability as the spec deltas describe.

## Capabilities

### Modified Capabilities

- widgets

## Impact

- No breaking changes.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

/** A proposal that only cospec's typed rules refuse: it has no `## Why`. */
const V2_PROPOSAL_NO_WHY = V2_PROPOSAL.replace(
  /## Why\n\n[\s\S]*?\n\n## What Changes/,
  '## What Changes',
)

const V2_TASKS_DONE = `## 1. Implementation

- [x] 1.1 Implement the capability
`

const V2_TASKS_INCOMPLETE = `## 1. Implementation

- [x] 1.1 Implement the capability
- [ ] 1.2 Add a covering test
`

const V2_VERIFICATION_DONE = `# Verification

## 1. Widgets behave [critical]

- [x] 1.1 @integration (agent) render a widget -> rendered
`

const V2_VERIFICATION_BARE = `# Verification

## 1. Widgets behave [critical]

- [ ] 1.1 @integration (agent) render a widget -> rendered
`

const CHORE_PROPOSAL = `## Why

The build scripts carry a stale path that every release has to work around;
this removes the path so the release steps run without the manual fix-up.

## What Changes

- Remove the stale path from the build scripts.

## Impact

- No user-facing change.
`

export interface V2ChangeOptions {
  /** `.openspec.yaml` lines after `schemaVersion: 2`. */
  yamlExtra?: string
  tasks?: string
  /** `false` writes no verification.md. */
  verification?: string | false
  proposal?: string
}

/** A `feat` v2 change named `name` with `deltas` under its `specs/`. */
export function writeV2Change(
  root: string,
  name: string,
  deltas: Record<string, string>,
  opts: V2ChangeOptions = {},
): void {
  withCospecSchema(root, 'feat')
  const change = `openspec/changes/${name}`
  const files: Record<string, string> = {
    [`${change}/.openspec.yaml`]: `schema: feat\ncreated: 2026-10-05\nschemaVersion: 2\n${opts.yamlExtra ?? ''}`,
    [`${change}/proposal.md`]: opts.proposal ?? V2_PROPOSAL,
    [`${change}/blocking-changes.md`]: BLOCKERS,
    [`${change}/tasks.md`]: opts.tasks ?? V2_TASKS_DONE,
  }
  if (opts.verification !== false)
    files[`${change}/verification.md`] = opts.verification ?? V2_VERIFICATION_DONE
  for (const [rel, body] of Object.entries(deltas)) files[`${change}/specs/${rel}`] = body
  writeFiles(root, files)
  mkdirSync(join(root, 'openspec/specs'), { recursive: true })
  mkdirSync(join(root, 'openspec/changes/archive'), { recursive: true })
}

const RENDERING_BLOCK = `### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

const RENDERING_MODIFIED_BLOCK = `### Requirement: Widget rendering

The system SHALL render a widget promptly when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

const LEGACY_REMOVED = `## REMOVED Requirements

### Requirement: Widget legacy mode

**Reason**: The legacy mode is gone.

**Migration**: None.
`

/** A living requirement with two visible scenarios. */
const RENDERING_TWO_SCENARIOS = `
### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered

#### Scenario: Render an empty widget

- **WHEN** a caller requests an empty widget
- **THEN** a placeholder is rendered
`

/** One fixture: what it builds, and how each side's validate reads it. */
export interface R7Fixture {
  key: string
  /** Writes the fixture into `root` and returns its change name. */
  build(root: string): string
  /**
   * `openspec validate <name> --strict` exits 0. A change with no delta files
   * fails it (`Change must have at least one delta`) and still archives.
   */
  binaryValid: boolean
  /** `cospec validate <name> --strict` exits 0. */
  cospecValid: boolean
}

function r7(
  key: string,
  binaryValid: boolean,
  cospecValid: boolean,
  build: (root: string) => string,
): R7Fixture {
  return { key, build, binaryValid, cospecValid }
}

/** ADDED on a capability with no living spec. */
export const R7_ADDED_NEW = r7('added-new', true, true, (root) => {
  writeV2Change(root, 'c1', { 'widgets/spec.md': `## ADDED Requirements\n\n${RENDERING_BLOCK}` })
  return 'c1'
})

/** MODIFIED keeping every living scenario. */
export const R7_MODIFIED = r7('modified', true, true, (root) => {
  writeLivingSpec(root, 'widgets', livingSpec('widgets', LIVING_TWO_REQS))
  writeV2Change(root, 'c1', {
    'widgets/spec.md': `## MODIFIED Requirements\n\n${RENDERING_MODIFIED_BLOCK}`,
  })
  return 'c1'
})

/** REMOVED of one of two living requirements. */
export const R7_REMOVED = r7('removed', true, true, (root) => {
  writeLivingSpec(root, 'widgets', livingSpec('widgets', LIVING_TWO_REQS))
  writeV2Change(root, 'c1', {
    'widgets/spec.md': `## REMOVED Requirements

### Requirement: ${MARKER_TARGET}

**Reason**: Caching moved elsewhere.

**Migration**: None.
`,
  })
  return 'c1'
})

/** RENAMED of a living requirement. */
export const R7_RENAMED = r7('renamed', true, true, (root) => {
  writeLivingSpec(root, 'widgets', livingSpec('widgets', LIVING_TWO_REQS))
  writeV2Change(root, 'c1', {
    'widgets/spec.md': `## RENAMED Requirements

- FROM: \`### Requirement: ${MARKER_TARGET}\`
- TO: \`### Requirement: Widget memoization\`
`,
  })
  return 'c1'
})

/** REMOVED of a capability's last requirement under `retire_capabilities: true`. */
export const R7_RETIRED = r7('retired', true, true, (root) => {
  writeLivingSpec(root, 'widgets', livingSpec('widgets', LIVING_WIDGET_REQ))
  writeV2Change(
    root,
    'c1',
    {
      'widgets/spec.md': `## REMOVED Requirements

### Requirement: Widget rendering

**Reason**: The capability is retired.

**Migration**: None.
`,
    },
    { yamlExtra: 'retire_capabilities: true\n' },
  )
  return 'c1'
})

/** The delta shapes `sync-specs` must write byte-for-byte as archive does. */
export const R7_SYNC_SHAPES: readonly R7Fixture[] = [
  R7_ADDED_NEW,
  R7_MODIFIED,
  R7_REMOVED,
  R7_RENAMED,
  R7_RETIRED,
]

/** A MODIFIED block keeping one living scenario only inside an HTML comment. */
export const R7_COMMENT_KEPT = r7('comment-kept-scenario', true, true, (root) => {
  writeLivingSpec(root, 'widgets', livingSpec('widgets', RENDERING_TWO_SCENARIOS))
  writeV2Change(root, 'c1', {
    'widgets/spec.md': `## MODIFIED Requirements

${RENDERING_MODIFIED_BLOCK}
<!--
#### Scenario: Render an empty widget

- **WHEN** a caller requests an empty widget
- **THEN** a placeholder is rendered
-->
`,
  })
  return 'c1'
})

/** A living requirement with a third scenario inside a comment the MODIFIED block omits. */
export const R7_COMMENTED_LIVING_SCENARIO = r7(
  'commented-living-scenario',
  false,
  false,
  (root) => {
    writeLivingSpec(
      root,
      'widgets',
      livingSpec(
        'widgets',
        `${RENDERING_TWO_SCENARIOS}
<!--
#### Scenario: Render a hidden widget

- **WHEN** a caller requests a hidden widget
- **THEN** nothing is shown
-->
`,
      ),
    )
    writeV2Change(root, 'c1', {
      'widgets/spec.md': `## MODIFIED Requirements
${RENDERING_TWO_SCENARIOS.replace('render a widget when', 'render a widget promptly when')}`,
    })
    return 'c1'
  },
)

/** A living spec ending in a commented requirement header; MODIFIED keeps every visible scenario. */
export const R7_COMMENTED_LIVING_HEADER = r7('commented-living-header', true, true, (root) => {
  writeLivingSpec(
    root,
    'widgets',
    livingSpec(
      'widgets',
      `${LIVING_WIDGET_REQ}
<!--
### Requirement: Widget drafts

The system SHALL keep widget drafts.

#### Scenario: Keep a draft

- **WHEN** a caller saves a draft
- **THEN** the draft is kept
-->
`,
    ),
  )
  writeV2Change(root, 'c1', {
    'widgets/spec.md': `## MODIFIED Requirements\n\n${RENDERING_MODIFIED_BLOCK}`,
  })
  return 'c1'
})

/** The MODIFIED fixture with a bare `[ ]` verification row. */
export const R7_BARE_VERIFICATION = r7('bare-verification', true, true, (root) => {
  R7_MODIFIED.build(root)
  writeFileSync(join(root, 'openspec/changes/c1/verification.md'), V2_VERIFICATION_BARE)
  return 'c1'
})

/** The MODIFIED fixture with an incomplete task. */
export const R7_INCOMPLETE_TASK = r7('incomplete-task', true, true, (root) => {
  R7_MODIFIED.build(root)
  writeFileSync(join(root, 'openspec/changes/c1/tasks.md'), V2_TASKS_INCOMPLETE)
  return 'c1'
})

/** A MODIFIED block that drops one of the living requirement's two scenarios. */
export const R7_SCENARIO_DROP = r7('scenario-drop', false, false, (root) => {
  writeLivingSpec(root, 'widgets', livingSpec('widgets', RENDERING_TWO_SCENARIOS))
  writeV2Change(root, 'c1', {
    'widgets/spec.md': `## MODIFIED Requirements\n\n${RENDERING_MODIFIED_BLOCK}`,
  })
  return 'c1'
})

/** The MODIFIED fixture with a proposal only cospec's typed rules refuse. */
export const R7_REVALIDATION_ONLY = r7('revalidation-only', true, false, (root) => {
  R7_MODIFIED.build(root)
  writeFileSync(join(root, 'openspec/changes/c1/proposal.md'), V2_PROPOSAL_NO_WHY)
  return 'c1'
})

/** A namespace folder `mobile/` wrapping the change `mobile/refresh/`. */
export const R7_NAMESPACE = r7('namespace-folder', false, false, (root) => {
  R7_MODIFIED.build(root)
  const nested = join(root, 'openspec/changes/mobile/refresh')
  mkdirSync(dirname(nested), { recursive: true })
  cpSync(join(root, 'openspec/changes/c1'), nested, { recursive: true })
  return 'mobile'
})

/** ADDED + REMOVED on a capability with no living spec. */
export const R7_NEW_ADDED_REMOVED = r7('new-added-removed', true, true, (root) => {
  writeV2Change(root, 'c1', {
    'widgets/spec.md': `## ADDED Requirements\n\n${RENDERING_BLOCK}\n${LEGACY_REMOVED}`,
  })
  return 'c1'
})

/** REMOVED-only on a capability with no living spec, without the retire marker. */
export const R7_NEW_REMOVED_ONLY = r7('new-removed-only', true, false, (root) => {
  writeV2Change(root, 'c1', { 'widgets/spec.md': LEGACY_REMOVED })
  return 'c1'
})

/** REMOVED-only on a capability with no living spec, under `retire_capabilities: true`. */
export const R7_NEW_REMOVED_ONLY_MARKED = r7('new-removed-only-marked', true, true, (root) => {
  writeV2Change(
    root,
    'c1',
    { 'widgets/spec.md': LEGACY_REMOVED },
    { yamlExtra: 'retire_capabilities: true\n' },
  )
  return 'c1'
})

/**
 * `openspec/specs/alias -> widgets` with a delta for each name: `cospec
 * validate --strict` passes it, and the binary's archive refuses it after
 * taking its archive claim (`… resolve to the same target …`).
 */
export const R7_SYMLINKED_ALIAS = r7('symlinked-alias', true, true, (root) => {
  writeLivingSpec(root, 'widgets', livingSpec('widgets', LIVING_TWO_REQS))
  symlinkSync('widgets', join(root, 'openspec/specs/alias'))
  writeV2Change(root, 'c1', {
    'widgets/spec.md': `## MODIFIED Requirements\n\n${RENDERING_MODIFIED_BLOCK}`,
    'alias/spec.md': `## MODIFIED Requirements

### Requirement: ${MARKER_TARGET}

The system SHALL cache a rendered widget for a minute.

#### Scenario: Cache a widget

- **WHEN** a caller requests the same widget twice
- **THEN** the second request is served from cache
`,
  })
  return 'c1'
})

/** A new capability whose delta carries a Purpose under the binary's minimum length. */
export const R7_SHORT_PURPOSE = r7('short-purpose', true, true, (root) => {
  writeV2Change(root, 'c1', {
    'widgets/spec.md': `## Purpose\n\nWidgets.\n\n## ADDED Requirements\n\n${RENDERING_BLOCK}`,
  })
  return 'c1'
})

/**
 * A `feat` change with no delta files. `--strict` reports its missing `specs`
 * artifact; archive's own (non-strict) revalidation reads that as INFO.
 */
export const R7_NO_DELTA = r7('no-delta-feat', false, false, (root) => {
  writeV2Change(root, 'c1', {})
  return 'c1'
})

/** A `feat` change with no delta files that declares `skip_specs: true`. */
export const R7_SKIP_SPECS = r7('skip-specs-feat', true, true, (root) => {
  writeV2Change(root, 'c1', {}, { yamlExtra: 'skip_specs: true\n' })
  return 'c1'
})

/** A `chore` change (its schema has no specs artifact). */
export const R7_CHORE = r7('chore', false, true, (root) => {
  withCospecSchema(root, 'chore')
  const change = 'openspec/changes/c1'
  writeFiles(root, {
    [`${change}/.openspec.yaml`]: 'schema: chore\ncreated: 2026-10-05\nschemaVersion: 2\n',
    [`${change}/proposal.md`]: CHORE_PROPOSAL,
    [`${change}/blocking-changes.md`]: BLOCKERS,
    [`${change}/tasks.md`]: V2_TASKS_DONE,
  })
  mkdirSync(join(root, 'openspec/specs'), { recursive: true })
  mkdirSync(join(root, 'openspec/changes/archive'), { recursive: true })
  return 'c1'
})

/**
 * The MODIFIED fixture with `openspec/changes/archive/` at mode 000. The
 * caller restores the mode (`restoreArchiveMode`) before cleanup.
 */
export const R7_ARCHIVE_UNREADABLE = r7('archive-unreadable', true, true, (root) => {
  R7_MODIFIED.build(root)
  chmodSync(join(root, 'openspec/changes/archive'), 0o000)
  return 'c1'
})

/** Undo `R7_ARCHIVE_UNREADABLE`'s mode so the tree can be removed. */
export function restoreArchiveMode(root: string): void {
  chmodSync(join(root, 'openspec/changes/archive'), 0o755)
}

/**
 * MODIFIED on a capability with no living spec. The binary's `validate
 * --strict` passes it with an INFO (`Archive would refuse this delta`).
 */
export const R7_NEW_MODIFIED = r7('new-modified', true, false, (root) => {
  writeV2Change(root, 'c1', {
    'widgets/spec.md': `## MODIFIED Requirements\n\n${RENDERING_MODIFIED_BLOCK}`,
  })
  return 'c1'
})

/** RENAMED on a capability with no living spec. */
export const R7_NEW_RENAMED = r7('new-renamed', true, false, (root) => {
  writeV2Change(root, 'c1', {
    'widgets/spec.md': `## RENAMED Requirements

- FROM: \`### Requirement: ${MARKER_TARGET}\`
- TO: \`### Requirement: Widget memoization\`
`,
  })
  return 'c1'
})

/** An ADDED requirement with no scenario: both validators, and both archives, refuse it. */
export const R7_DELTA_INVALID = r7('delta-invalid', false, false, (root) => {
  writeV2Change(root, 'c1', {
    'widgets/spec.md': `## ADDED Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.
`,
  })
  return 'c1'
})

// The early-sync shapes (verification 7.2): each delta is already reflected in
// the living spec, so the binary's archive reports `Specs already in sync`.

/** An ADDED block identical to the living requirement. */
export const R7_SYNCED_ADDED = r7('synced-added', true, true, (root) => {
  writeLivingSpec(root, 'widgets', livingSpec('widgets', `\n${RENDERING_BLOCK}`))
  writeV2Change(root, 'c1', { 'widgets/spec.md': `## ADDED Requirements\n\n${RENDERING_BLOCK}` })
  return 'c1'
})

/** A REMOVED whose requirement is already gone. */
export const R7_SYNCED_REMOVED = r7('synced-removed', true, true, (root) => {
  writeLivingSpec(root, 'widgets', livingSpec('widgets', LIVING_WIDGET_REQ))
  writeV2Change(root, 'c1', {
    'widgets/spec.md': `## REMOVED Requirements

### Requirement: ${MARKER_TARGET}

**Reason**: Caching moved elsewhere.

**Migration**: None.
`,
  })
  return 'c1'
})

/** A RENAMED already applied: the source is gone and the target present. */
export const R7_SYNCED_RENAMED = r7('synced-renamed', true, true, (root) => {
  writeLivingSpec(
    root,
    'widgets',
    livingSpec('widgets', LIVING_TWO_REQS.replace(MARKER_TARGET, 'Widget memoization')),
  )
  writeV2Change(root, 'c1', {
    'widgets/spec.md': `## RENAMED Requirements

- FROM: \`### Requirement: ${MARKER_TARGET}\`
- TO: \`### Requirement: Widget memoization\`
`,
  })
  return 'c1'
})

/** A MODIFIED block identical to the living requirement. */
export const R7_SYNCED_MODIFIED = r7('synced-modified', true, true, (root) => {
  writeLivingSpec(root, 'widgets', livingSpec('widgets', `\n${RENDERING_MODIFIED_BLOCK}`))
  writeV2Change(root, 'c1', {
    'widgets/spec.md': `## MODIFIED Requirements\n\n${RENDERING_MODIFIED_BLOCK}`,
  })
  return 'c1'
})

/** Each early-sync shape, the already-retired capability last. */
export const R7_SYNCED_SHAPES: readonly R7Fixture[] = [
  R7_SYNCED_ADDED,
  R7_SYNCED_REMOVED,
  R7_SYNCED_RENAMED,
  R7_SYNCED_MODIFIED,
  R7_NEW_REMOVED_ONLY_MARKED,
]

/** Every archive-and-sync-parity builder, for the smoke rows. */
export const R7_FIXTURES: readonly R7Fixture[] = [
  ...R7_SYNC_SHAPES,
  R7_COMMENT_KEPT,
  R7_COMMENTED_LIVING_SCENARIO,
  R7_COMMENTED_LIVING_HEADER,
  R7_BARE_VERIFICATION,
  R7_INCOMPLETE_TASK,
  R7_SCENARIO_DROP,
  R7_REVALIDATION_ONLY,
  R7_NAMESPACE,
  R7_NEW_ADDED_REMOVED,
  R7_NEW_REMOVED_ONLY,
  R7_NEW_REMOVED_ONLY_MARKED,
  R7_SYMLINKED_ALIAS,
  R7_SHORT_PURPOSE,
  R7_NO_DELTA,
  R7_SKIP_SPECS,
  R7_CHORE,
  R7_ARCHIVE_UNREADABLE,
  R7_NEW_MODIFIED,
  R7_NEW_RENAMED,
  R7_DELTA_INVALID,
  R7_SYNCED_ADDED,
  R7_SYNCED_REMOVED,
  R7_SYNCED_RENAMED,
  R7_SYNCED_MODIFIED,
]
