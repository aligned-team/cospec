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
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, openspec, writeFiles } from '../fixtures/support.ts'
import { writeLivingSpec } from './fixtures.ts'

afterAll(cleanupAll)

// --- fixture builders --------------------------------------------------------

const LEGACY_PROPOSAL = `# change

## Why

The widget rendering path is being restated so the spec matches the code that
ships today; without the restatement the capability is documented wrongly.

## What Changes

- Restate the widget rendering requirement.
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
function buildSpecDriven(
  root: string,
  name: string,
  specFiles: Record<string, string>,
  tasks = TASKS_DONE,
): void {
  writeLivingSpec(root, 'widgets', LIVING)
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
function byRule(report: JsonReport, rule: string): ReportIssue[] {
  return issues(report).filter((i) => i.rule === rule)
}

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
const EMPTY_SECTION = `## ADDED Requirements
`

/** REMOVE and re-ADD one living requirement under the exact same header. */
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
})

// --- 2. task numbering warns --------------------------------------------------------

describe('2. task numbering', () => {
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
