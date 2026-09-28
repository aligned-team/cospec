// validation-parity, probed against the REAL pinned binary (DESIGN §8.2).
//
// Two lanes, two severity policies. A cospec-typed change keeps cospec's own
// rule ids and severities; a legacy (`spec-driven`) change keeps the binary's,
// relayed through the delegation untouched. Every row below builds its fixture
// in a temp repo, runs the pinned `openspec validate --strict --json` on it and
// reads the delegated message from that JSON — no test holds a hand-typed copy
// of a delegated message. The short fragments used to *find* a binary issue
// only locate it; every absence assertion compares against the message the
// binary actually printed.
//
// A row that asserts both a native cospec finding and a suppressed delegated
// twin is two tests, `<row> native` and `<row> twin`, so the track that adds
// the rule and the track that adds the dedupe each flip their own half.

import { afterAll, describe, expect, test } from 'bun:test'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import {
  cleanupAll,
  cospec,
  mkTempRepo,
  openspec,
  REPO_ROOT,
  writeFiles,
} from '../fixtures/support.ts'
import { writeLivingSpec } from './fixtures.ts'

afterAll(cleanupAll)

// --- fixture builders --------------------------------------------------------

const FEAT_PROPOSAL = `# change

## Why

The widget rendering path is being restated so the spec matches the code that
ships today; without the restatement the capability is documented wrongly.

## What Changes

- Restate the widget rendering requirement.

## Capabilities

### Modified Capabilities

- widgets

## Impact

- No breaking changes.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

const LEGACY_PROPOSAL = `# change

## Why

The widget rendering path is being restated so the spec matches the code that
ships today; without the restatement the capability is documented wrongly.

## What Changes

- Restate the widget rendering requirement.
`

const BLOCKERS = `# Dependencies

## Blocked by

None.

## Soft-blocked by

None.
`

const TASKS_DONE = `## 1. Implementation

- [x] 1.1 Restate the requirement
`

/** Line 4 sits under group 1 but says 2; line 5 re-declares line 3's id. */
const TASKS_MISNUMBERED = `## 1. Implementation

- [x] 1.1 Restate the requirement
- [x] 2.1 Add a covering test
- [x] 1.1 Update the docs
`

const LIVING = `# Widgets Specification

## Purpose

Real purpose text for the widgets capability.

## Requirements

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

/**
 * Copy this repo's composed `feat` schema into the temp store, as a real cospec
 * repo carries it. The binary reads `tracks:` from it to find the change's task
 * files, and its task-numbering check keys on the schema being its own
 * built-in `spec-driven` — which a `feat` fixture must visibly not be.
 */
function withFeatSchema(root: string): void {
  cpSync(join(REPO_ROOT, 'openspec/schemas/feat'), join(root, 'openspec/schemas/feat'), {
    recursive: true,
  })
}

interface BuildOptions {
  tasks?: string
  /** `false` writes no proposal.md, so the change is never delegated. */
  proposal?: boolean
  /** the living `widgets` spec; `LIVING` when omitted. */
  living?: string
}

/** A `feat` change carrying `specFiles` under its `specs/`, beside the living `widgets` spec. */
function buildFeat(
  root: string,
  name: string,
  specFiles: Record<string, string>,
  opts: BuildOptions = {},
): void {
  writeLivingSpec(root, 'widgets', opts.living ?? LIVING)
  withFeatSchema(root)
  mkdirSync(join(root, 'openspec/changes/archive'), { recursive: true })
  const c = `openspec/changes/${name}`
  const files: Record<string, string> = {
    [`${c}/.openspec.yaml`]: 'schema: feat\ncreated: 2026-07-06\n',
    [`${c}/blocking-changes.md`]: BLOCKERS,
    [`${c}/tasks.md`]: opts.tasks ?? TASKS_DONE,
  }
  if (opts.proposal !== false) files[`${c}/proposal.md`] = FEAT_PROPOSAL
  for (const [rel, body] of Object.entries(specFiles)) files[`${c}/specs/${rel}`] = body
  writeFiles(root, files)
}

/** The same shape under the binary's built-in `spec-driven` schema — cospec's legacy lane. */
function buildSpecDriven(
  root: string,
  name: string,
  specFiles: Record<string, string>,
  tasks = TASKS_DONE,
  living = LIVING,
): void {
  writeLivingSpec(root, 'widgets', living)
  mkdirSync(join(root, 'openspec/changes/archive'), { recursive: true })
  const c = `openspec/changes/${name}`
  const files: Record<string, string> = {
    [`${c}/.openspec.yaml`]: 'schema: spec-driven\ncreated: 2026-07-06\n',
    [`${c}/proposal.md`]: LEGACY_PROPOSAL,
    [`${c}/tasks.md`]: tasks,
  }
  for (const [rel, body] of Object.entries(specFiles)) files[`${c}/specs/${rel}`] = body
  writeFiles(root, files)
}

// --- report readers ------------------------------------------------------------

interface BinaryIssue {
  level: string
  path?: string
  line?: number
  message: string
}

interface ReportIssue {
  level: string
  rule: string
  path: string
  line?: number
  message: string
  hint?: string
}

interface JsonReport {
  items: { issues: ReportIssue[] }[]
  summary: { byRule: Record<string, number> }
}

/** Every issue the pinned binary's `validate --strict --json` reports for `name`. */
async function binaryIssues(root: string, name: string): Promise<BinaryIssue[]> {
  const res = await openspec(['validate', name, '--strict', '--json'], root)
  const parsed = JSON.parse(res.stdout) as { items: { id: string; issues: BinaryIssue[] }[] }
  return parsed.items.filter((i) => i.id === name).flatMap((i) => i.issues)
}

/** The binary issues whose message contains `fragment` — a locator, never an assertion. */
function binaryFind(bin: BinaryIssue[], fragment: string): BinaryIssue[] {
  return bin.filter((i) => i.message.includes(fragment))
}

/** The single binary issue whose message contains `fragment`. */
function binaryOne(bin: BinaryIssue[], fragment: string): BinaryIssue {
  const found = binaryFind(bin, fragment)
  expect(found).toHaveLength(1)
  return found[0]!
}

async function cospecValidate(
  root: string,
  name: string,
  extra: string[] = [],
): Promise<{ report: JsonReport; exitCode: number }> {
  const res = await cospec(['validate', name, '--strict', '--json', ...extra], { cwd: root })
  return { report: JSON.parse(res.stdout) as JsonReport, exitCode: res.exitCode }
}

function issues(report: JsonReport): ReportIssue[] {
  return report.items.flatMap((i) => i.issues)
}

/** Findings that move the verdict. v1 fixtures also carry `meta/schema-outdated` INFO. */
function problems(report: JsonReport): ReportIssue[] {
  return issues(report).filter((i) => i.level !== 'INFO')
}

function byRule(report: JsonReport, rule: string): ReportIssue[] {
  return issues(report).filter((i) => i.rule === rule)
}

function messages(report: JsonReport): string[] {
  return issues(report).map((i) => i.message)
}

/** The defined line numbers of `found`, ascending. */
function linesOf(found: { line?: number }[]): number[] {
  return found.flatMap((i) => (i.line === undefined ? [] : [i.line])).toSorted((a, b) => a - b)
}

/** 1-based line of the first line of `text` equal to `line`. */
function lineOf(text: string, line: string): number {
  const index = text.split('\n').indexOf(line)
  expect(index).toBeGreaterThanOrEqual(0)
  return index + 1
}

/** Run the pinned binary's own archive on a second copy of the fixture. */
async function binaryArchive(
  build: (root: string) => void,
  name: string,
): Promise<{ exitCode: number; moved: boolean }> {
  const root = mkTempRepo({ git: true })
  build(root)
  const res = await openspec(['archive', name, '-y'], root)
  return { exitCode: res.exitCode, moved: !existsSync(join(root, 'openspec/changes', name)) }
}

// --- fixtures --------------------------------------------------------------------

/** A requirement whose only SHALL sits in its header. */
const HEADER_ONLY_SHALL = `## ADDED Requirements

### Requirement: The system SHALL frob widgets

The system frobs widgets.

#### Scenario: Frob a widget

- **WHEN** a caller frobs a widget
- **THEN** the widget is frobbed
`

/**
 * Every SHALL/MUST shape the binary grades: header-only (WARNING), an empty
 * body under a keyword header (ERROR), no keyword anywhere (WARNING), and an
 * empty body under a plain header (ERROR, `is missing requirement text`). Each
 * carries a scenario, so the scenario arm of `deltas/requirement-shape` stays
 * quiet and each requirement's one cospec finding is attributable.
 */
const SHALL_SHAPES = `## ADDED Requirements

### Requirement: The system SHALL frob widgets

The system frobs widgets.

#### Scenario: Frob a widget

- **WHEN** a caller frobs a widget
- **THEN** the widget is frobbed

### Requirement: The system MUST be empty

#### Scenario: Stay empty

- **WHEN** a caller looks
- **THEN** nothing is there

### Requirement: Plain thing

The system does a plain thing.

#### Scenario: Do the plain thing

- **WHEN** a caller asks
- **THEN** the plain thing happens

### Requirement: Nothing here

#### Scenario: Find nothing

- **WHEN** a caller looks
- **THEN** nothing is found
`

/** cospec counts a scenario step's SHALL; the binary's requirement-text reader does not. */
const SHALL_IN_SCENARIO_ONLY = `## ADDED Requirements

### Requirement: Widget polishing

The system polishes widgets.

#### Scenario: Polish a widget

- **WHEN** a caller polishes a widget
- **THEN** the system SHALL return a polished widget
`

/** No body text at all; the only SHALL sits in a scenario step. */
const EMPTY_BODY_SHALL_IN_SCENARIO = `## ADDED Requirements

### Requirement: Widget buffing

#### Scenario: Buff a widget

- **WHEN** a caller buffs a widget
- **THEN** the system SHALL return a buffed widget
`

/**
 * The binary's skipped-header shapes: a divider between blocks, a nameless
 * requirement header, a stray `###` inside a block, and a `### Scenario:` one
 * level too shallow. The requirement's own scenario still counts.
 */
const SKIPPED_HEADERS = `## ADDED Requirements

### Documentation Requirements

### Requirement: Widget thing

The system SHALL do a widget thing.

### Notes inside

The notes stay inside the block.

#### Scenario: Works

- **WHEN** a caller asks
- **THEN** the thing is done

### Requirement:

### Scenario: Shallow

- **WHEN** a caller asks
`

/**
 * Two plain skipped headers in one file — each is its own finding. Neither
 * splits a requirement the archive refuses: `Alpha notes` sits above the first
 * requirement, and `Beta notes` follows the block's scenario and carries its
 * own, so the rebuilt spec still gives every `###` a scenario.
 */
const TWO_SKIPPED = `## ADDED Requirements

### Alpha notes

### Requirement: Widget thing

The system SHALL do a widget thing.

#### Scenario: Works

- **WHEN** a caller asks
- **THEN** the thing is done

### Beta notes

The system SHALL keep beta notes.

#### Scenario: Beta

- **WHEN** a caller reads the notes
- **THEN** the notes are there
`

/** A divider above the first requirement and a harmless in-block header. */
const HARMLESS_SKIPPED = `## ADDED Requirements

### Documentation Requirements

### Requirement: Widget thing

The system SHALL do a widget thing.

#### Scenario: Works

- **WHEN** a caller asks
- **THEN** the thing is done

### Notes after

The system SHALL keep notes.

#### Scenario: Notes

- **WHEN** a caller reads the notes
- **THEN** the notes are there
`

/** A nameless requirement header above the first requirement: dropped, never split. */
const NAMELESS_BEFORE_FIRST = `## ADDED Requirements

### Requirement:

### Requirement: Widget thing

The system SHALL do a widget thing.

#### Scenario: Works

- **WHEN** a caller asks
- **THEN** the thing is done
`

/**
 * Headers inside an HTML comment above the first requirement. cospec's
 * advisory reader masks comments, the binary's does not, so cospec is silent
 * here and the delegated INFOs are the only report of them — they must
 * survive. Above the first requirement they belong to no block, so the
 * archive drops them and nothing is split.
 */
const COMMENTED_HEADERS = `## ADDED Requirements

<!--
### Hidden notes
### Scenario: Hidden
-->

### Requirement: Widget thing

The system SHALL do a widget thing.

#### Scenario: Works

- **WHEN** a caller asks
- **THEN** the thing is done
`

const EMPTY_SECTION = `## ADDED Requirements
`

/** REMOVE and re-ADD one living requirement under the exact same header. */
const REMOVED_AND_ADDED = `## REMOVED Requirements

- \`### Requirement: Widget rendering\`

## ADDED Requirements

### Requirement: Widget rendering

The system SHALL render a widget on the new path.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered on the new path
`

/** The same pair, but the ADDED name is a fold variant — the binary archives it. */
const REMOVED_AND_ADDED_FOLD = `## REMOVED Requirements

- \`### Requirement: Widget rendering\`

## ADDED Requirements

### Requirement: WIDGET RENDERING

The system SHALL render a widget on the new path.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered on the new path
`

/** A brand-new capability whose one delta both ADDs and MODIFIES a name. */
const GADGETS_ADDED_AND_MODIFIED = `## ADDED Requirements

### Requirement: Gadget thing

The system SHALL do a gadget thing.

#### Scenario: Do the gadget thing

- **WHEN** a caller asks
- **THEN** the gadget thing is done

## MODIFIED Requirements

### Requirement: Gadget thing

The system SHALL do a gadget thing quickly.

#### Scenario: Do the gadget thing

- **WHEN** a caller asks
- **THEN** the gadget thing is done quickly
`

/**
 * ADDED byte-identical to the living block — the early-sync no-op on its own —
 * plus a MODIFIED of the same name that keeps the living scenario.
 */
const LIVING_ADDED_IDENTICAL_AND_MODIFIED = `## ADDED Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered

## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render a widget promptly when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

const VALID_MODIFIED = `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render a widget promptly when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

/** Every finding the legacy oracle must see, spread over three delta files. */
const ORACLE_SPECS: Record<string, string> = {
  'widgets/spec.md': `## REMOVED Requirements

- \`### Requirement: Widget rendering\`

## ADDED Requirements

### Requirement: Widget rendering

The system SHALL render a widget in the new way.

#### Scenario: Render

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered the new way

### Requirement: Widget caching

The system SHALL cache a widget in the new way.

#### Scenario: Cache

- **WHEN** a caller requests the same widget twice
- **THEN** the second request is served the new way

## MODIFIED Requirements

### Requirement: Widget caching

The system SHALL cache a rendered widget.

#### Scenario: Cache a widget

- **WHEN** a caller requests the same widget twice
- **THEN** the second request is served from cache
`,
  'shapes/spec.md': `## ADDED Requirements

### Documentation Requirements

${SHALL_SHAPES.replace('## ADDED Requirements\n\n', '')}
### Requirement:
`,
  'empties/spec.md': EMPTY_SECTION,
}

const SKIPPED_FRAGMENT = 'is not a "### Requirement:" header'
const NAMELESS_FRAGMENT = 'is missing a requirement name'

// --- 1. each lane keeps its own severities -----------------------------------------

describe('1. each lane keeps its own severities', () => {
  test('1.1 the legacy lane relays every binary finding at the binary level', async () => {
    const root = mkTempRepo({ git: true })
    buildSpecDriven(root, 'legacy-oracle', ORACLE_SPECS, TASKS_MISNUMBERED)
    const bin = await binaryIssues(root, 'legacy-oracle')

    // The fixture really trips every shape the oracle is about.
    for (const fragment of [
      'in the requirement body, not only in the header',
      'should contain SHALL or MUST (RFC 2119',
      'must contain SHALL or MUST in the requirement body',
      'is missing requirement text',
      SKIPPED_FRAGMENT,
      NAMELESS_FRAGMENT,
      'were found, but no requirement entries parsed',
      'Requirement present in both ADDED and REMOVED',
      'Requirement present in both MODIFIED and ADDED',
      'but its leading number points to group',
      'is duplicated; it was first declared',
    ])
      expect(binaryFind(bin, fragment).length).toBeGreaterThan(0)

    const { report } = await cospecValidate(root, 'legacy-oracle')
    const all = issues(report)
    const relayed = all
      .filter((i) => i.rule === 'openspec/validate')
      .map((i) => `${i.level} ${i.message}`)
    expect(relayed.toSorted()).toEqual(bin.map((i) => `${i.level} ${i.message}`).toSorted())
    // cospec adds its classification note and nothing else: no cospec-typed rule
    // family runs on this lane.
    expect(all.filter((i) => i.rule !== 'openspec/validate').map((i) => i.rule)).toEqual([
      'meta/legacy-schema',
    ])
  })

  test('1.2 native: a header-only SHALL/MUST is one ERROR with the move hint', async () => {
    const root = mkTempRepo({ git: true })
    buildFeat(root, 'header-only', { 'widgets/spec.md': HEADER_ONLY_SHALL })
    const { report } = await cospecValidate(root, 'header-only')
    const shape = byRule(report, 'deltas/requirement-shape')
    expect(shape).toHaveLength(1)
    expect(shape[0]?.level).toBe('ERROR')
    expect(shape[0]?.line).toBe(
      lineOf(HEADER_ONLY_SHALL, '### Requirement: The system SHALL frob widgets'),
    )
    expect(shape[0]?.hint).toBe(
      'move the SHALL/MUST statement to the line immediately after the "### Requirement: ..." header',
    )
  })

  test('1.2 twin: the delegated header-only SHALL/MUST WARNING is not relayed', async () => {
    const root = mkTempRepo({ git: true })
    buildFeat(root, 'header-only', { 'widgets/spec.md': HEADER_ONLY_SHALL })
    const delegated = binaryOne(
      await binaryIssues(root, 'header-only'),
      'in the requirement body, not only in the header',
    )
    expect(delegated.level).toBe('WARNING')
    const { report } = await cospecValidate(root, 'header-only')
    expect(messages(report)).not.toContain(delegated.message)
    expect(byRule(report, 'deltas/requirement-shape')).toHaveLength(1)
  })
})

// --- 2. task numbering warns --------------------------------------------------------

describe('2. task numbering', () => {
  test('2.1 a cospec-typed change warns on a mismatched and a duplicate task id', async () => {
    const root = mkTempRepo({ git: true })
    buildFeat(
      root,
      'misnumbered',
      { 'widgets/spec.md': VALID_MODIFIED },
      { tasks: TASKS_MISNUMBERED },
    )

    // The binary runs its numbering check for its own `spec-driven` schema only,
    // so on this lane there is no delegated twin to dedupe.
    const bin = await binaryIssues(root, 'misnumbered')
    expect(binaryFind(bin, 'but its leading number points to group')).toEqual([])
    expect(binaryFind(bin, 'is duplicated; it was first declared')).toEqual([])

    const { report, exitCode } = await cospecValidate(root, 'misnumbered')
    const found = problems(report).map((i) => ({ rule: i.rule, level: i.level, line: i.line }))
    expect(found).toEqual([
      {
        rule: 'tasks/id-mismatch',
        level: 'WARNING',
        line: lineOf(TASKS_MISNUMBERED, '- [x] 2.1 Add a covering test'),
      },
      {
        rule: 'tasks/id-duplicate',
        level: 'WARNING',
        line: lineOf(TASKS_MISNUMBERED, '- [x] 1.1 Update the docs'),
      },
    ])
    const dup = byRule(report, 'tasks/id-duplicate')[0]
    expect(dup?.message).toContain(
      `line ${lineOf(TASKS_MISNUMBERED, '- [x] 1.1 Restate the requirement')}`,
    )
    expect(exitCode).toBe(1)
  })

  test('2.3 the legacy lane carries the binary numbering WARNINGs and no tasks/id-*', async () => {
    const root = mkTempRepo({ git: true })
    buildSpecDriven(
      root,
      'legacy-misnumbered',
      { 'widgets/spec.md': VALID_MODIFIED },
      TASKS_MISNUMBERED,
    )
    const bin = await binaryIssues(root, 'legacy-misnumbered')
    const mismatch = binaryOne(bin, 'but its leading number points to group')
    const duplicate = binaryOne(bin, 'is duplicated; it was first declared')
    expect(mismatch.level).toBe('WARNING')
    expect(duplicate.level).toBe('WARNING')

    const { report } = await cospecValidate(root, 'legacy-misnumbered')
    const relayed = byRule(report, 'openspec/validate')
    for (const d of [mismatch, duplicate])
      expect(relayed.filter((i) => i.message === d.message && i.level === 'WARNING')).toHaveLength(
        1,
      )
    expect(issues(report).filter((i) => i.rule.startsWith('tasks/id-'))).toEqual([])
  })
})

// --- 3. cross-section conflicts --------------------------------------------------------

const buildRemovedAndAdded = (root: string): void =>
  buildFeat(root, 'remove-and-add', { 'widgets/spec.md': REMOVED_AND_ADDED })
const buildGadgets = (root: string): void =>
  buildFeat(root, 'gadgets-pair', { 'gadgets/spec.md': GADGETS_ADDED_AND_MODIFIED })
const buildLivingPair = (root: string): void =>
  buildFeat(root, 'living-pair', { 'widgets/spec.md': LIVING_ADDED_IDENTICAL_AND_MODIFIED })

describe('3. cross-section conflicts appear in the validate preview', () => {
  test('3.1 native: REMOVED+ADDED of one name is refused, as the binary archive does', async () => {
    const root = mkTempRepo({ git: true })
    buildRemovedAndAdded(root)
    const { report, exitCode } = await cospecValidate(root, 'remove-and-add')
    const found = byRule(report, 'archive/added-exists')
    expect(found).toHaveLength(1)
    expect(found[0]?.level).toBe('ERROR')
    expect(found[0]?.line).toBe(lineOf(REMOVED_AND_ADDED, '### Requirement: Widget rendering'))
    expect(found[0]?.message).toContain('REMOVED')
    expect(exitCode).toBe(1)

    const archived = await binaryArchive(buildRemovedAndAdded, 'remove-and-add')
    expect(archived.exitCode).not.toBe(0)
    expect(archived.moved).toBe(false)
  })

  test('3.1 twin: the delegated ADDED/REMOVED conflict is not relayed', async () => {
    const root = mkTempRepo({ git: true })
    buildRemovedAndAdded(root)
    const delegated = binaryOne(
      await binaryIssues(root, 'remove-and-add'),
      'Requirement present in both ADDED and REMOVED',
    )
    const { report } = await cospecValidate(root, 'remove-and-add')
    expect(messages(report)).not.toContain(delegated.message)
  })

  test('3.2 native: a fresh capability both ADDing and MODIFYing a name is refused', async () => {
    const root = mkTempRepo({ git: true })
    buildGadgets(root)
    const { report } = await cospecValidate(root, 'gadgets-pair')
    const added = byRule(report, 'archive/added-exists')
    expect(added).toHaveLength(1)
    expect(added[0]?.line).toBe(lineOf(GADGETS_ADDED_AND_MODIFIED, '### Requirement: Gadget thing'))
    expect(added[0]?.message).toContain('MODIFIED')
    const nonAdded = byRule(report, 'archive/new-spec-non-added')
    expect(nonAdded).toHaveLength(1)
    const modifiedLine =
      GADGETS_ADDED_AND_MODIFIED.split('\n').lastIndexOf('### Requirement: Gadget thing') + 1
    expect(nonAdded[0]?.line).toBe(modifiedLine)

    const archived = await binaryArchive(buildGadgets, 'gadgets-pair')
    expect(archived.exitCode).not.toBe(0)
    expect(archived.moved).toBe(false)
  })

  test('3.2 twin: the delegated MODIFIED/ADDED conflict is not relayed', async () => {
    const root = mkTempRepo({ git: true })
    buildGadgets(root)
    const delegated = binaryOne(
      await binaryIssues(root, 'gadgets-pair'),
      'Requirement present in both MODIFIED and ADDED',
    )
    const { report } = await cospecValidate(root, 'gadgets-pair')
    expect(messages(report)).not.toContain(delegated.message)
  })

  test('3.3 native: a living ADDED-identical plus MODIFIED is no longer a false PASS', async () => {
    const root = mkTempRepo({ git: true })
    buildLivingPair(root)
    const { report, exitCode } = await cospecValidate(root, 'living-pair')
    const found = byRule(report, 'archive/added-exists')
    expect(found).toHaveLength(1)
    expect(found[0]?.level).toBe('ERROR')
    expect(found[0]?.line).toBe(
      lineOf(LIVING_ADDED_IDENTICAL_AND_MODIFIED, '### Requirement: Widget rendering'),
    )
    expect(found[0]?.message).toContain('MODIFIED')
    expect(exitCode).toBe(1)

    const archived = await binaryArchive(buildLivingPair, 'living-pair')
    expect(archived.exitCode).not.toBe(0)
    expect(archived.moved).toBe(false)
  })

  test('3.3 twin: the delegated MODIFIED/ADDED conflict is not relayed', async () => {
    const root = mkTempRepo({ git: true })
    buildLivingPair(root)
    const delegated = binaryOne(
      await binaryIssues(root, 'living-pair'),
      'Requirement present in both MODIFIED and ADDED',
    )
    const { report } = await cospecValidate(root, 'living-pair')
    expect(messages(report)).not.toContain(delegated.message)
  })

  test('3.4 a fold-variant REMOVED+ADDED is not a conflict, and the binary archives it', async () => {
    const build = (root: string): void =>
      buildFeat(root, 'fold-pair', { 'widgets/spec.md': REMOVED_AND_ADDED_FOLD })
    const root = mkTempRepo({ git: true })
    build(root)
    const bin = await binaryIssues(root, 'fold-pair')
    expect(binaryFind(bin, 'Requirement present in both')).toEqual([])
    const { report } = await cospecValidate(root, 'fold-pair')
    expect(byRule(report, 'archive/added-exists')).toEqual([])
    expect(problems(report)).toEqual([])

    const archived = await binaryArchive(build, 'fold-pair')
    expect(archived.exitCode).toBe(0)
    expect(archived.moved).toBe(true)
  })
})

// --- 4. skipped headers get a rule id ---------------------------------------------------

describe('4. skipped headers', () => {
  test('4.1 native: a divider above the first requirement is an INFO; in-block headers are refused', async () => {
    const build = (root: string): void =>
      buildFeat(root, 'skipped', { 'widgets/spec.md': SKIPPED_HEADERS })
    const root = mkTempRepo({ git: true })
    build(root)
    const archived = await binaryArchive(build, 'skipped')
    expect(archived.exitCode).not.toBe(0)
    expect(archived.moved).toBe(false)
    const bin = await binaryIssues(root, 'skipped')
    const skippedLines = [
      ...binaryFind(bin, SKIPPED_FRAGMENT),
      ...binaryFind(bin, NAMELESS_FRAGMENT),
    ].filter((i) => !i.message.includes('"### Scenario:'))
    expect(skippedLines).toHaveLength(3)

    const { report } = await cospecValidate(root, 'skipped')
    const native = byRule(report, 'deltas/skipped-header')
    expect(native.every((i) => i.level === 'INFO')).toBe(true)
    expect(linesOf(native)).toEqual([lineOf(SKIPPED_HEADERS, '### Documentation Requirements')])
    // `### Notes inside` and the nameless header sit inside `Widget thing`'s
    // block, so the archive's rebuilt spec reads each as a requirement of its
    // own and refuses the one left with no scenario.
    const split = byRule(report, 'archive/split-requirement')
    expect(split.every((i) => i.level === 'ERROR')).toBe(true)
    expect(linesOf(split)).toEqual([
      lineOf(SKIPPED_HEADERS, '### Notes inside'),
      lineOf(SKIPPED_HEADERS, '### Requirement:'),
    ])
    // Each line the binary skips gets exactly one of the two cospec findings.
    expect(linesOf([...native, ...split])).toEqual(linesOf(skippedLines))
    const depth = byRule(report, 'deltas/scenario-depth')
    expect(depth).toHaveLength(1)
    expect(depth[0]?.line).toBe(lineOf(SKIPPED_HEADERS, '### Scenario: Shallow'))
  })

  test('4.1 twin: none of the delegated skipped-header INFOs is relayed', async () => {
    const root = mkTempRepo({ git: true })
    buildFeat(root, 'skipped', { 'widgets/spec.md': SKIPPED_HEADERS })
    const bin = await binaryIssues(root, 'skipped')
    const delegated = [...binaryFind(bin, SKIPPED_FRAGMENT), ...binaryFind(bin, NAMELESS_FRAGMENT)]
    expect(delegated).toHaveLength(4)
    const { report } = await cospecValidate(root, 'skipped')
    for (const d of delegated) expect(messages(report)).not.toContain(d.message)
  })

  test('4.2 a never-delegated change still reports its skipped headers', async () => {
    const root = mkTempRepo({ git: true })
    buildFeat(root, 'skipped-local', { 'widgets/spec.md': SKIPPED_HEADERS }, { proposal: false })
    const { report } = await cospecValidate(root, 'skipped-local')
    expect(byRule(report, 'openspec/validate')).toEqual([])
    expect(linesOf(byRule(report, 'deltas/skipped-header'))).toEqual([
      lineOf(SKIPPED_HEADERS, '### Documentation Requirements'),
    ])
    expect(linesOf(byRule(report, 'archive/split-requirement'))).toEqual([
      lineOf(SKIPPED_HEADERS, '### Notes inside'),
      lineOf(SKIPPED_HEADERS, '### Requirement:'),
    ])
  })
})

// --- 5. nothing double-reports ------------------------------------------------------------

const buildEmptySection = (root: string): void =>
  buildFeat(root, 'empty-section', { 'widgets/spec.md': EMPTY_SECTION })

describe('5.1 one pinned-message test per DUPLICATE_CLASSES entry', () => {
  test('entry 1: empty delta sections pair with archive/no-ops', async () => {
    const root = mkTempRepo({ git: true })
    buildEmptySection(root)
    const delegated = binaryOne(
      await binaryIssues(root, 'empty-section'),
      'were found, but no requirement entries parsed',
    )
    expect(delegated.level).toBe('ERROR')
    const { report } = await cospecValidate(root, 'empty-section')
    expect(messages(report)).not.toContain(delegated.message)
    expect(byRule(report, 'archive/no-ops')).toHaveLength(1)
  })

  test('entry 2: no deltas at all pairs with archive/no-ops', async () => {
    const root = mkTempRepo({ git: true })
    buildEmptySection(root)
    const delegated = binaryOne(
      await binaryIssues(root, 'empty-section'),
      'Change must have at least one delta',
    )
    expect(delegated.level).toBe('ERROR')
    const { report } = await cospecValidate(root, 'empty-section')
    expect(messages(report)).not.toContain(delegated.message)
    expect(byRule(report, 'archive/no-ops')).toHaveLength(1)
  })

  test('entry 3: a non-requirement header pairs with deltas/skipped-header', async () => {
    const root = mkTempRepo({ git: true })
    buildFeat(root, 'harmless', { 'widgets/spec.md': HARMLESS_SKIPPED })
    const delegated = binaryFind(await binaryIssues(root, 'harmless'), SKIPPED_FRAGMENT)
    expect(delegated).toHaveLength(2)
    const { report } = await cospecValidate(root, 'harmless')
    const native = byRule(report, 'deltas/skipped-header')
    for (const d of delegated) {
      expect(d.level).toBe('INFO')
      expect(messages(report)).not.toContain(d.message)
      expect(native.filter((n) => n.line === d.line)).toHaveLength(1)
    }
  })

  test('entry 4: a nameless requirement header pairs with deltas/skipped-header', async () => {
    const root = mkTempRepo({ git: true })
    buildFeat(root, 'nameless', { 'widgets/spec.md': NAMELESS_BEFORE_FIRST })
    const delegated = binaryOne(await binaryIssues(root, 'nameless'), NAMELESS_FRAGMENT)
    expect(delegated.level).toBe('INFO')
    const { report } = await cospecValidate(root, 'nameless')
    expect(messages(report)).not.toContain(delegated.message)
    const native = byRule(report, 'deltas/skipped-header').filter((n) => n.line === delegated.line)
    expect(native).toHaveLength(1)
    expect(native[0]?.message).toContain('is missing a requirement name')
  })

  test('entry 5: a skipped ### Scenario: pairs with deltas/scenario-depth', async () => {
    const root = mkTempRepo({ git: true })
    buildFeat(root, 'skipped', { 'widgets/spec.md': SKIPPED_HEADERS })
    const delegated = binaryFind(await binaryIssues(root, 'skipped'), SKIPPED_FRAGMENT).filter(
      (i) => i.message.includes('"### Scenario:'),
    )
    expect(delegated).toHaveLength(1)
    expect(delegated[0]?.level).toBe('INFO')
    const { report } = await cospecValidate(root, 'skipped')
    expect(messages(report)).not.toContain(delegated[0]?.message)
    expect(byRule(report, 'deltas/scenario-depth')).toHaveLength(1)
    // Left to scenario-depth: the line never gets a second cospec finding.
    expect(
      byRule(report, 'deltas/skipped-header').filter((n) => n.line === delegated[0]?.line),
    ).toEqual([])
  })

  for (const [shape, fragment, level, name] of [
    [
      'header-only keyword',
      'in the requirement body, not only in the header',
      'WARNING',
      'The system SHALL frob widgets',
    ],
    [
      'empty body under a keyword header',
      'must contain SHALL or MUST in the requirement body',
      'ERROR',
      'The system MUST be empty',
    ],
    ['no keyword anywhere', 'should contain SHALL or MUST (RFC 2119', 'WARNING', 'Plain thing'],
  ] as const)
    test(`entry 6: the ${shape} SHALL/MUST finding pairs with deltas/requirement-shape`, async () => {
      const root = mkTempRepo({ git: true })
      buildFeat(root, 'shall-shapes', { 'widgets/spec.md': SHALL_SHAPES })
      const delegated = binaryFind(await binaryIssues(root, 'shall-shapes'), fragment).filter((i) =>
        i.message.includes(`"${name}"`),
      )
      expect(delegated).toHaveLength(1)
      expect(delegated[0]?.level).toBe(level)
      const { report } = await cospecValidate(root, 'shall-shapes')
      expect(messages(report)).not.toContain(delegated[0]?.message)
      expect(
        byRule(report, 'deltas/requirement-shape').filter((n) => n.message.includes(`"${name}"`)),
      ).toHaveLength(1)
    })

  test('entry 7: missing requirement text pairs with deltas/requirement-shape', async () => {
    const root = mkTempRepo({ git: true })
    buildFeat(root, 'shall-shapes', { 'widgets/spec.md': SHALL_SHAPES })
    const delegated = binaryOne(
      await binaryIssues(root, 'shall-shapes'),
      'is missing requirement text',
    )
    expect(delegated.level).toBe('ERROR')
    expect(delegated.message).toContain('"Nothing here"')
    const { report } = await cospecValidate(root, 'shall-shapes')
    expect(messages(report)).not.toContain(delegated.message)
    expect(
      byRule(report, 'deltas/requirement-shape').filter((n) =>
        n.message.includes('"Nothing here"'),
      ),
    ).toHaveLength(1)
  })

  test('entry 8: the ADDED/REMOVED conflict pairs with archive/added-exists', async () => {
    const root = mkTempRepo({ git: true })
    buildRemovedAndAdded(root)
    const delegated = binaryOne(
      await binaryIssues(root, 'remove-and-add'),
      'Requirement present in both ADDED and REMOVED',
    )
    expect(delegated.level).toBe('ERROR')
    const { report } = await cospecValidate(root, 'remove-and-add')
    expect(messages(report)).not.toContain(delegated.message)
    expect(byRule(report, 'archive/added-exists')).toHaveLength(1)
  })

  test('entry 9: the MODIFIED/ADDED conflict pairs with archive/added-exists', async () => {
    const root = mkTempRepo({ git: true })
    buildLivingPair(root)
    const delegated = binaryOne(
      await binaryIssues(root, 'living-pair'),
      'Requirement present in both MODIFIED and ADDED',
    )
    expect(delegated.level).toBe('ERROR')
    const { report } = await cospecValidate(root, 'living-pair')
    expect(messages(report)).not.toContain(delegated.message)
    expect(byRule(report, 'archive/added-exists')).toHaveLength(1)
  })
})

describe('5.2 a delegated finding survives where its cospec twin is silent', () => {
  test('entry 6: a SHALL only in a scenario step keeps the binary WARNING', async () => {
    const root = mkTempRepo({ git: true })
    buildFeat(root, 'shall-in-scenario', { 'widgets/spec.md': SHALL_IN_SCENARIO_ONLY })
    const delegated = binaryOne(
      await binaryIssues(root, 'shall-in-scenario'),
      'should contain SHALL or MUST (RFC 2119',
    )
    expect(delegated.level).toBe('WARNING')
    const { report } = await cospecValidate(root, 'shall-in-scenario')
    expect(byRule(report, 'deltas/requirement-shape')).toEqual([])
    expect(messages(report)).toContain(delegated.message)
  })

  test('entry 7: an empty body with a SHALL only in a scenario keeps the binary ERROR', async () => {
    const root = mkTempRepo({ git: true })
    buildFeat(root, 'buffing', { 'widgets/spec.md': EMPTY_BODY_SHALL_IN_SCENARIO })
    const delegated = binaryOne(await binaryIssues(root, 'buffing'), 'is missing requirement text')
    expect(delegated.level).toBe('ERROR')
    const { report } = await cospecValidate(root, 'buffing')
    expect(byRule(report, 'deltas/requirement-shape')).toEqual([])
    expect(messages(report)).toContain(delegated.message)
  })

  test('entries 1 and 2: under --fast the empty-section and no-deltas ERRORs are kept', async () => {
    const root = mkTempRepo({ git: true })
    buildEmptySection(root)
    const bin = await binaryIssues(root, 'empty-section')
    const delegated = [
      binaryOne(bin, 'were found, but no requirement entries parsed'),
      binaryOne(bin, 'Change must have at least one delta'),
    ]
    const { report } = await cospecValidate(root, 'empty-section', ['--fast'])
    expect(byRule(report, 'archive/no-ops')).toEqual([])
    for (const d of delegated) expect(messages(report)).toContain(d.message)
  })

  test('entries 8 and 9: under --fast both cross-section ERRORs are kept', async () => {
    const pairs: [(root: string) => void, string, string][] = [
      [buildRemovedAndAdded, 'remove-and-add', 'Requirement present in both ADDED and REMOVED'],
      [buildGadgets, 'gadgets-pair', 'Requirement present in both MODIFIED and ADDED'],
    ]
    for (const [build, name, fragment] of pairs) {
      const root = mkTempRepo({ git: true })
      build(root)
      const delegated = binaryOne(await binaryIssues(root, name), fragment)
      const { report } = await cospecValidate(root, name, ['--fast'])
      expect(byRule(report, 'archive/added-exists')).toEqual([])
      expect(messages(report)).toContain(delegated.message)
    }
  })

  test('entries 3 and 4: two skipped headers in one file are each suppressed by their own twin', async () => {
    const root = mkTempRepo({ git: true })
    buildFeat(root, 'two-skipped', { 'widgets/spec.md': TWO_SKIPPED })
    const delegated = binaryFind(await binaryIssues(root, 'two-skipped'), SKIPPED_FRAGMENT)
    expect(delegated).toHaveLength(2)
    const { report } = await cospecValidate(root, 'two-skipped')
    const native = byRule(report, 'deltas/skipped-header')
    const suppressed = delegated.filter((d) => !messages(report).includes(d.message))
    expect(suppressed).toHaveLength(native.length)
    expect(linesOf(native)).toEqual(linesOf(delegated))
  })

  test('entries 3 and 5: headers inside an HTML comment keep their delegated INFOs', async () => {
    const root = mkTempRepo({ git: true })
    buildFeat(root, 'commented', { 'widgets/spec.md': COMMENTED_HEADERS })
    const delegated = binaryFind(await binaryIssues(root, 'commented'), SKIPPED_FRAGMENT)
    expect(delegated).toHaveLength(2)
    const { report } = await cospecValidate(root, 'commented')
    expect(byRule(report, 'deltas/skipped-header')).toEqual([])
    expect(byRule(report, 'deltas/scenario-depth')).toEqual([])
    for (const d of delegated) expect(messages(report)).toContain(d.message)

    const archived = await binaryArchive(
      (r) => buildFeat(r, 'commented', { 'widgets/spec.md': COMMENTED_HEADERS }),
      'commented',
    )
    expect(archived.exitCode).toBe(0)
    expect(archived.moved).toBe(true)
  })
})

describe('5.3 an empty section is one finding', () => {
  test('5.3 exactly archive/no-ops, with neither delegated twin', async () => {
    const root = mkTempRepo({ git: true })
    buildEmptySection(root)
    const { report } = await cospecValidate(root, 'empty-section')
    expect(problems(report).map((i) => i.rule)).toEqual(['archive/no-ops'])
  })
})

// --- 10. the archive family reads what the binary's archive reads -----------------------
//
// The binary's delta and spec readers mask fenced code only; an HTML comment is
// read as written. cospec's advisory `deltas/*` rules keep their comment-masked
// view, but every `archive/*` rule reads the view the binary's archive applies.

/** REMOVE `Widget rendering`, ADD `Widget rendering <!-- restated -->` — two names to the binary. */
const REMOVED_AND_ADDED_COMMENT_NAME = `## REMOVED Requirements

- \`### Requirement: Widget rendering\`

## ADDED Requirements

### Requirement: Widget rendering <!-- restated -->

The system SHALL render a widget on the new path.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered on the new path
`

/** An ADDED written inside a comment still lands on the living `Widget rendering`. */
const COMMENTED_ADDED_COLLISION = `## MODIFIED Requirements

### Requirement: Widget caching

The system SHALL cache a rendered widget quickly.

#### Scenario: Cache a widget

- **WHEN** a caller requests the same widget twice
- **THEN** the second request is served from cache

<!--
## ADDED Requirements

### Requirement: Widget rendering

The system SHALL render a widget differently.

#### Scenario: Render differently

- **WHEN** a caller requests a widget
- **THEN** a different widget is rendered
-->
`

/** A MODIFIED written inside a comment still names a requirement the living spec lacks. */
const COMMENTED_MODIFIED_MISSING = `## ADDED Requirements

### Requirement: Widget polishing

The system SHALL polish a widget.

#### Scenario: Polish a widget

- **WHEN** a caller polishes a widget
- **THEN** the widget is polished

<!--
## MODIFIED Requirements

### Requirement: Widget nonexistent

The system SHALL do a nonexistent thing.

#### Scenario: Do it

- **WHEN** a caller asks
- **THEN** it is done
-->
`

/** No SHALL/MUST, under a header whose name the binary reads with its comment. */
const COMMENT_NAMED_NO_SHALL = `## ADDED Requirements

### Requirement: Widget polishing <!-- restated -->

The system polishes widgets.

#### Scenario: Polish a widget

- **WHEN** a caller polishes a widget
- **THEN** the widget is polished
`

/**
 * A real `### Scenario:` one level too shallow inside a block, and a commented
 * one above the first requirement: two delegated INFOs, one cospec twin.
 */
const SHALLOW_AND_COMMENTED_SCENARIO = `## ADDED Requirements

<!--
### Scenario: Commented
-->

### Requirement: Widget thing

The system SHALL do a widget thing.

#### Scenario: Works

- **WHEN** a caller asks
- **THEN** the thing is done

### Scenario: Shallow

- **WHEN** a caller asks
`

describe('10. the archive family reads what the binary archive reads', () => {
  test('10.1 REMOVED X plus ADDED "X <!-- note -->" is accepted, as the binary archives it', async () => {
    const build = (root: string): void =>
      buildFeat(root, 'comment-name', { 'widgets/spec.md': REMOVED_AND_ADDED_COMMENT_NAME })
    const root = mkTempRepo({ git: true })
    build(root)
    const archived = await binaryArchive(build, 'comment-name')
    expect(archived.exitCode).toBe(0)
    expect(archived.moved).toBe(true)
    const bin = await binaryIssues(root, 'comment-name')
    expect(binaryFind(bin, 'Requirement present in both')).toEqual([])
    const { report, exitCode } = await cospecValidate(root, 'comment-name')
    expect(byRule(report, 'archive/added-exists')).toEqual([])
    expect(problems(report)).toEqual([])
    expect(exitCode).toBe(0)
  })

  test('10.2 native: an ADDED inside a comment that collides is refused', async () => {
    const build = (root: string): void =>
      buildFeat(root, 'commented-add', { 'widgets/spec.md': COMMENTED_ADDED_COLLISION })
    const root = mkTempRepo({ git: true })
    build(root)
    const archived = await binaryArchive(build, 'commented-add')
    expect(archived.exitCode).not.toBe(0)
    expect(archived.moved).toBe(false)
    const { report, exitCode } = await cospecValidate(root, 'commented-add')
    const found = byRule(report, 'archive/added-exists')
    expect(found).toHaveLength(1)
    expect(found[0]?.level).toBe('ERROR')
    expect(found[0]?.line).toBe(
      lineOf(COMMENTED_ADDED_COLLISION, '### Requirement: Widget rendering'),
    )
    expect(exitCode).toBe(1)
  })

  test('10.2 twin: the delegated already-exists dry-run INFO is not relayed', async () => {
    const root = mkTempRepo({ git: true })
    buildFeat(root, 'commented-add', { 'widgets/spec.md': COMMENTED_ADDED_COLLISION })
    const delegated = binaryOne(
      await binaryIssues(root, 'commented-add'),
      'ADDED failed for header "### Requirement: Widget rendering" - already exists',
    )
    expect(delegated.level).toBe('INFO')
    const { report } = await cospecValidate(root, 'commented-add')
    expect(messages(report)).not.toContain(delegated.message)
  })

  test('10.3 native: a MODIFIED inside a comment whose target is missing is refused', async () => {
    const build = (root: string): void =>
      buildFeat(root, 'commented-mod', { 'widgets/spec.md': COMMENTED_MODIFIED_MISSING })
    const root = mkTempRepo({ git: true })
    build(root)
    const archived = await binaryArchive(build, 'commented-mod')
    expect(archived.exitCode).not.toBe(0)
    expect(archived.moved).toBe(false)
    const { report, exitCode } = await cospecValidate(root, 'commented-mod')
    const found = byRule(report, 'archive/target-missing')
    expect(found).toHaveLength(1)
    expect(found[0]?.level).toBe('ERROR')
    expect(found[0]?.line).toBe(
      lineOf(COMMENTED_MODIFIED_MISSING, '### Requirement: Widget nonexistent'),
    )
    expect(exitCode).toBe(1)
  })

  test('10.3 twin: the delegated not-found dry-run INFO is not relayed', async () => {
    const root = mkTempRepo({ git: true })
    buildFeat(root, 'commented-mod', { 'widgets/spec.md': COMMENTED_MODIFIED_MISSING })
    const delegated = binaryOne(
      await binaryIssues(root, 'commented-mod'),
      'MODIFIED failed for header "### Requirement: Widget nonexistent" - not found',
    )
    expect(delegated.level).toBe('INFO')
    const { report } = await cospecValidate(root, 'commented-mod')
    expect(messages(report)).not.toContain(delegated.message)
  })

  test('10.4 a comment-bearing header missing SHALL/MUST is reported once, by its binary name', async () => {
    const build = (root: string): void =>
      buildFeat(root, 'comment-shall', { 'widgets/spec.md': COMMENT_NAMED_NO_SHALL })
    const root = mkTempRepo({ git: true })
    build(root)
    // A WARNING does not stop the binary's archive; cospec-typed changes keep
    // cospec's ERROR.
    const archived = await binaryArchive(build, 'comment-shall')
    expect(archived.exitCode).toBe(0)
    expect(archived.moved).toBe(true)
    const delegated = binaryOne(
      await binaryIssues(root, 'comment-shall'),
      'should contain SHALL or MUST (RFC 2119',
    )
    expect(delegated.level).toBe('WARNING')
    expect(delegated.message).toContain('"Widget polishing <!-- restated -->"')
    const { report } = await cospecValidate(root, 'comment-shall')
    expect(messages(report)).not.toContain(delegated.message)
    const shape = byRule(report, 'deltas/requirement-shape')
    expect(shape).toHaveLength(1)
    expect(shape[0]?.level).toBe('ERROR')
    expect(shape[0]?.message).toContain('"Widget polishing <!-- restated -->"')
  })

  test('10.5 a commented ### Scenario: keeps its delegated INFO beside a real one', async () => {
    const build = (root: string): void =>
      buildFeat(root, 'two-shallow', { 'widgets/spec.md': SHALLOW_AND_COMMENTED_SCENARIO })
    const root = mkTempRepo({ git: true })
    build(root)
    const archived = await binaryArchive(build, 'two-shallow')
    expect(archived.exitCode).not.toBe(0)
    expect(archived.moved).toBe(false)
    const delegated = binaryFind(await binaryIssues(root, 'two-shallow'), '"### Scenario:')
    expect(delegated).toHaveLength(2)
    const at = (header: string): BinaryIssue => {
      const found = delegated.filter(
        (d) => d.line === lineOf(SHALLOW_AND_COMMENTED_SCENARIO, header),
      )
      expect(found).toHaveLength(1)
      return found[0]!
    }
    const commented = at('### Scenario: Commented')
    const shallow = at('### Scenario: Shallow')
    expect(commented.level).toBe('INFO')
    expect(shallow.level).toBe('INFO')

    const { report } = await cospecValidate(root, 'two-shallow')
    const depth = byRule(report, 'deltas/scenario-depth')
    expect(linesOf(depth)).toEqual([
      lineOf(SHALLOW_AND_COMMENTED_SCENARIO, '### Scenario: Shallow'),
    ])
    expect(messages(report)).not.toContain(shallow.message)
    expect(messages(report)).toContain(commented.message)
    // The in-block `### Scenario:` is scenario-depth's alone.
    expect(byRule(report, 'archive/split-requirement')).toEqual([])
  })
})

// --- 11. a header that splits a requirement is refused at pre-flight ----------------------
//
// The binary's archive appends each ADDED/MODIFIED block verbatim, then
// re-validates the rebuilt spec, where every `###` header is a requirement of
// its own. A skipped header inside a block therefore splits it, and the rebuilt
// spec is refused when a piece is left with no scenario.

/** The head of the block has no scenario above the header. */
const SPLIT_BEFORE_SCENARIO = `## ADDED Requirements

### Requirement: Widget thing

The system SHALL do a widget thing.

### Notes inside

The notes stay inside the block.

#### Scenario: Works

- **WHEN** a caller asks
- **THEN** the thing is done
`

/** A nameless header after the scenario is a requirement with none. */
const SPLIT_NAMELESS = `## ADDED Requirements

### Requirement: Widget thing

The system SHALL do a widget thing.

#### Scenario: Works

- **WHEN** a caller asks
- **THEN** the thing is done

### Requirement:
`

/** A header written inside a comment splits the block all the same. */
const SPLIT_COMMENTED = `## ADDED Requirements

### Requirement: Widget thing

The system SHALL do a widget thing.

<!--
### Hidden notes
-->

#### Scenario: Works

- **WHEN** a caller asks
- **THEN** the thing is done
`

/** The same split in a MODIFIED block. */
const SPLIT_MODIFIED = `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.

### Notes

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

describe('11. a header that splits a requirement is refused at pre-flight', () => {
  for (const [row, name, text, header] of [
    ['11.1', 'split-before', SPLIT_BEFORE_SCENARIO, '### Notes inside'],
    ['11.2', 'split-nameless', SPLIT_NAMELESS, '### Requirement:'],
    ['11.3', 'split-commented', SPLIT_COMMENTED, '### Hidden notes'],
    ['11.4', 'split-modified', SPLIT_MODIFIED, '### Notes'],
  ] as const) {
    const build = (root: string): void => buildFeat(root, name, { 'widgets/spec.md': text })

    test(`${row} native: "${header}" inside a block is an archive/split-requirement ERROR, as the binary archive refuses`, async () => {
      const root = mkTempRepo({ git: true })
      build(root)
      const archived = await binaryArchive(build, name)
      expect(archived.exitCode).not.toBe(0)
      expect(archived.moved).toBe(false)
      const { report, exitCode } = await cospecValidate(root, name)
      const split = byRule(report, 'archive/split-requirement')
      expect(split).toHaveLength(1)
      expect(split[0]?.level).toBe('ERROR')
      expect(split[0]?.line).toBe(lineOf(text, header))
      expect(split[0]?.message).toContain(`"${header}"`)
      // One cospec finding per line: the INFO is left to headers the archive keeps.
      expect(byRule(report, 'deltas/skipped-header')).toEqual([])
      expect(exitCode).toBe(1)
    })

    test(`${row} twin: the delegated skipped-header INFO for "${header}" is not relayed`, async () => {
      const root = mkTempRepo({ git: true })
      build(root)
      const delegated = binaryFind(await binaryIssues(root, name), `Header "${header}"`)
      expect(delegated).toHaveLength(1)
      expect(delegated[0]?.level).toBe('INFO')
      expect(delegated[0]?.line).toBe(lineOf(text, header))
      const { report } = await cospecValidate(root, name)
      expect(messages(report)).not.toContain(delegated[0]?.message)
    })
  }

  test('11.5 an in-block header carrying its own scenario stays an INFO, as the binary archives it', async () => {
    const build = (root: string): void =>
      buildFeat(root, 'harmless', { 'widgets/spec.md': HARMLESS_SKIPPED })
    const root = mkTempRepo({ git: true })
    build(root)
    const archived = await binaryArchive(build, 'harmless')
    expect(archived.exitCode).toBe(0)
    expect(archived.moved).toBe(true)
    const { report, exitCode } = await cospecValidate(root, 'harmless')
    expect(byRule(report, 'archive/split-requirement')).toEqual([])
    expect(linesOf(byRule(report, 'deltas/skipped-header'))).toEqual([
      lineOf(HARMLESS_SKIPPED, '### Documentation Requirements'),
      lineOf(HARMLESS_SKIPPED, '### Notes after'),
    ])
    expect(problems(report)).toEqual([])
    expect(exitCode).toBe(0)
  })

  test('11.6 under --fast the split is not checked and the delegated INFO is kept', async () => {
    const root = mkTempRepo({ git: true })
    buildFeat(root, 'split-before', { 'widgets/spec.md': SPLIT_BEFORE_SCENARIO })
    const delegated = binaryOne(
      await binaryIssues(root, 'split-before'),
      'Header "### Notes inside"',
    )
    const { report } = await cospecValidate(root, 'split-before', ['--fast'])
    expect(byRule(report, 'archive/split-requirement')).toEqual([])
    expect(messages(report)).toContain(delegated.message)
  })
})

// --- 12. a structurally invalid living spec is refused at pre-flight ----------------------

const MODIFIED_CACHING = `## MODIFIED Requirements

### Requirement: Widget caching

The system SHALL cache a rendered widget quickly.

#### Scenario: Cache a widget

- **WHEN** a caller requests the same widget twice
- **THEN** the second request is served from cache
`

const LIVING_DUPLICATE = `${LIVING}
### Requirement: Widget rendering

The system SHALL render a widget twice.

#### Scenario: Render again

- **WHEN** a caller requests a widget again
- **THEN** a widget is rendered again
`

const strayUnderPurpose = (stray: string): string =>
  LIVING.replace('## Purpose\n\n', `## Purpose\n\n${stray}\n\n`)

const LIVING_STRAY = strayUnderPurpose('### Requirement: Stray\n\nThe system SHALL stray.')
const LIVING_STRAY_COMMENTED = strayUnderPurpose('<!--\n### Requirement: Stray\n-->')
const LIVING_STRAY_FENCED = strayUnderPurpose('```\n### Requirement: Stray\n```')

describe('12. a structurally invalid living spec is refused at pre-flight', () => {
  for (const [row, name, living, fragment] of [
    ['12.1', 'living-dup', LIVING_DUPLICATE, 'duplicates'],
    ['12.2', 'living-stray', LIVING_STRAY, 'outside'],
    ['12.3', 'living-stray-comment', LIVING_STRAY_COMMENTED, 'outside'],
  ] as const) {
    const build = (root: string): void =>
      buildFeat(root, name, { 'widgets/spec.md': MODIFIED_CACHING }, { living })

    test.failing(
      `${row} native: a living spec whose requirement ${fragment} is an archive/target-invalid ERROR`,
      async () => {
        const root = mkTempRepo({ git: true })
        build(root)
        const archived = await binaryArchive(build, name)
        expect(archived.exitCode).not.toBe(0)
        expect(archived.moved).toBe(false)
        const { report, exitCode } = await cospecValidate(root, name)
        const found = byRule(report, 'archive/target-invalid')
        expect(found).toHaveLength(1)
        expect(found[0]?.level).toBe('ERROR')
        expect(found[0]?.message).toContain(fragment)
        expect(exitCode).toBe(1)
      },
    )

    test.failing(
      `${row} twin: the delegated structurally-invalid dry-run INFO is not relayed`,
      async () => {
        const root = mkTempRepo({ git: true })
        build(root)
        const delegated = binaryOne(
          await binaryIssues(root, name),
          'target spec is structurally invalid',
        )
        expect(delegated.level).toBe('INFO')
        expect(delegated.message).toContain(fragment)
        const { report } = await cospecValidate(root, name)
        expect(messages(report)).not.toContain(delegated.message)
      },
    )
  }

  test('12.4 a fenced requirement header outside ## Requirements is not a defect', async () => {
    const build = (root: string): void =>
      buildFeat(
        root,
        'living-fenced',
        { 'widgets/spec.md': MODIFIED_CACHING },
        { living: LIVING_STRAY_FENCED },
      )
    const root = mkTempRepo({ git: true })
    build(root)
    const archived = await binaryArchive(build, 'living-fenced')
    expect(archived.exitCode).toBe(0)
    expect(archived.moved).toBe(true)
    expect(binaryFind(await binaryIssues(root, 'living-fenced'), 'structurally invalid')).toEqual(
      [],
    )
    const { report, exitCode } = await cospecValidate(root, 'living-fenced')
    expect(byRule(report, 'archive/target-invalid')).toEqual([])
    expect(problems(report)).toEqual([])
    expect(exitCode).toBe(0)
  })
})

// --- 13. the legacy lane keeps upstream's severity for every round-2 shape -----------------

describe('13. the legacy lane relays each round-2 shape at the binary level', () => {
  for (const [name, text, living] of [
    ['legacy-comment-name', REMOVED_AND_ADDED_COMMENT_NAME, LIVING],
    ['legacy-commented-add', COMMENTED_ADDED_COLLISION, LIVING],
    ['legacy-commented-mod', COMMENTED_MODIFIED_MISSING, LIVING],
    ['legacy-comment-shall', COMMENT_NAMED_NO_SHALL, LIVING],
    ['legacy-two-shallow', SHALLOW_AND_COMMENTED_SCENARIO, LIVING],
    ['legacy-split-before', SPLIT_BEFORE_SCENARIO, LIVING],
    ['legacy-split-nameless', SPLIT_NAMELESS, LIVING],
    ['legacy-split-commented', SPLIT_COMMENTED, LIVING],
    ['legacy-split-modified', SPLIT_MODIFIED, LIVING],
    ['legacy-living-dup', MODIFIED_CACHING, LIVING_DUPLICATE],
    ['legacy-living-stray', MODIFIED_CACHING, LIVING_STRAY],
    ['legacy-living-stray-comment', MODIFIED_CACHING, LIVING_STRAY_COMMENTED],
  ] as const)
    test(`13.1 ${name}: every binary finding is relayed at its level, and no cospec rule runs`, async () => {
      const root = mkTempRepo({ git: true })
      buildSpecDriven(root, name, { 'widgets/spec.md': text }, TASKS_DONE, living)
      const bin = await binaryIssues(root, name)
      const { report } = await cospecValidate(root, name)
      const all = issues(report)
      const relayed = all
        .filter((i) => i.rule === 'openspec/validate')
        .map((i) => `${i.level} ${i.message}`)
      expect(relayed.toSorted()).toEqual(bin.map((i) => `${i.level} ${i.message}`).toSorted())
      expect(all.filter((i) => i.rule !== 'openspec/validate').map((i) => i.rule)).toEqual([
        'meta/legacy-schema',
      ])
    })
})
