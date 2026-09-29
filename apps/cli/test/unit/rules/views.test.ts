// Every rule that reads a spec document reads the view it is registered under
// (`rules/views.ts`): gates read what openspec's archive reads — fences masked,
// HTML comments kept — and only the advisory findings read the masked view.
//
// Three guards. (1) The rule ids are enumerated from this directory's source,
// so a new `archive/*`, `deltas/*` or `specs/*` rule fails here until it is
// given a fixture below. (2) Each fixture is run twice, as written and wholly
// inside an HTML comment — which openspec reads exactly as written — so a gate
// wired to the masked view (which sees an empty document there) cannot pass.
// (3) The masked parse is a distinct type no gate accepts, and it is read only
// where the advisory findings are computed.

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  findScenarioDrops,
  parseAdvisoryDelta,
  parseDeltaSpec,
  parseLivingSpec,
} from '../../../src/core/deltas.ts'
import { findRequirementSplits, rebuildSpec } from '../../../src/core/rebuilt-spec.ts'
import { archiveRules } from '../../../src/core/rules/archive.ts'
import {
  deltasRules,
  requirementShapeIssues,
  unreadDeltaFileIssues,
} from '../../../src/core/rules/deltas.ts'
import type { Issue } from '../../../src/core/rules/issue.ts'
import { specsRules } from '../../../src/core/rules/specs.ts'
import { ADVISORY_RULES } from '../../../src/core/rules/views.ts'
import { makeChange } from './helpers.ts'

const SRC = join(import.meta.dir, '../../../src')
const RULES_DIR = join(SRC, 'core/rules')

/** Every `archive/*`, `deltas/*` and `specs/*` rule id this directory's source emits. */
function enumeratedRules(): string[] {
  const ids = new Set<string>()
  for (const file of readdirSync(RULES_DIR).filter((f) => f.endsWith('.ts')))
    for (const m of readFileSync(join(RULES_DIR, file), 'utf8').matchAll(
      /rule: '((?:archive|deltas|specs)\/[a-z-]+)'/g,
    ))
      ids.add(m[1]!)
  return [...ids].toSorted()
}

/** Rules that read no spec text at all — a path, a file list — so no view applies. */
const VIEW_FREE: Record<string, string> = {
  'deltas/capability-kebab': 'reads the delta file path',
  'deltas/spec-at-specs-root': 'reads the delta file path',
  'deltas/skip-specs-conflict': 'reads the change file list and .openspec.yaml',
}

const SCEN = '#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n'
const SCEN2 = '#### Scenario: t\n\n- **WHEN** c\n- **THEN** d\n'
const LIVING = `# X Specification\n\n## Purpose\n\nReal purpose for the x capability, long enough to read as one.\n\n## Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n${SCEN}\n${SCEN2}`
const added = (body: string): string =>
  `## ADDED Requirements\n\n### Requirement: Brand new\n\n${body}`

/** Wrap a whole document in one HTML comment, which openspec reads as written. */
const commented = (text: string): string => `<!--\n${text}\n-->\n`

interface Fixture {
  delta: string
  living?: string
  /** a markdown file under `specs/` that is not a capability's spec.md. */
  unread?: boolean
  /** which document goes inside the comment. */
  wrap?: 'delta' | 'living'
}

/** One triggering fixture per rule id that reads a spec document. */
const FIXTURES: Record<string, Fixture> = {
  'archive/no-ops': { delta: '## ADDED Requirements\n' },
  'archive/new-spec-non-added': {
    delta: `## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL x.\n\n${SCEN}`,
  },
  'archive/target-invalid': {
    delta: added(`The system SHALL do new.\n\n${SCEN}`),
    living: `${LIVING}\n## ADDED Requirements\n\nStray.\n`,
    wrap: 'living',
  },
  'archive/target-missing': {
    delta: `## MODIFIED Requirements\n\n### Requirement: Nope\n\nThe system SHALL x.\n\n${SCEN}`,
    living: LIVING,
  },
  'archive/added-exists': {
    delta: `## ADDED Requirements\n\n### Requirement: Existing\n\nThe system SHALL differ.\n\n${SCEN}`,
    living: LIVING,
  },
  'archive/op-conflict': {
    delta: `## REMOVED Requirements\n\n- \`### Requirement: Existing\`\n- \`### Requirement: Existing\`\n`,
    living: `${LIVING}\n### Requirement: Kept\n\nThe system SHALL keep.\n\n${SCEN}`,
  },
  'archive/rebuilt-spec-invalid': {
    delta: added(`The system SHALL do new.\n\n# Aside\n\n${SCEN}`),
    living: LIVING,
  },
  'archive/split-requirement': {
    delta: added(`The system SHALL do new.\n\n### Notes\n\n${SCEN}`),
    living: LIVING,
  },
  'archive/scenario-preservation': {
    delta: `## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist anew.\n\n${SCEN}`,
    living: LIVING,
  },
  'deltas/header-present': { delta: added(`The system SHALL do new.\n\n${SCEN}`) },
  'deltas/unpaired-rename': {
    delta: '## RENAMED Requirements\n\n- FROM: `### Requirement: Existing`\n',
    living: LIVING,
  },
  'deltas/orphaned-requirement': {
    delta: `## Notes\n\n### Requirement: Stray\n\nThe system SHALL stray.\n\n${SCEN}\n${added(`The system SHALL do new.\n\n${SCEN}`)}`,
  },
  'deltas/requirement-shape': { delta: added('The system SHALL do new.\n') },
  'deltas/unread-file': { delta: added(`The system SHALL do new.\n\n${SCEN}`), unread: true },
  'deltas/scenario-depth': {
    delta: added(`The system SHALL do new.\n\n${SCEN}\n### Scenario: Shallow\n`),
  },
  'deltas/skipped-header': {
    delta: added(`The system SHALL do new.\n\n${SCEN}\n### Notes\n\n${SCEN2}`),
  },
  'specs/purpose-tbd': {
    delta: '',
    living: '## Purpose\n\nTBD: decide what this is for.\n\n## Requirements\n',
    wrap: 'living',
  },
}

/** Every finding of `rule` the rule layer reports on `fixture`. */
function findings(rule: string, fixture: Fixture): Issue[] {
  const living = fixture.living === undefined ? undefined : parseLivingSpec(fixture.living)
  if (rule.startsWith('specs/')) return specsRules(living!, 'specs/x/spec.md')
  const change = makeChange({
    deltaFiles: fixture.unread
      ? []
      : [{ path: 'specs/x/spec.md', capability: 'x', text: fixture.delta }],
    unreadSpecFiles: fixture.unread
      ? [{ path: 'specs/x/notes.md', expected: 'specs/x/spec.md', text: fixture.delta }]
      : [],
    livingSpecs: living === undefined ? new Map() : new Map([['x', living]]),
  })
  return [...unreadDeltaFileIssues(change), ...deltasRules(change), ...archiveRules(change)].filter(
    (i) => i.rule === rule,
  )
}

function inComment(fixture: Fixture): Fixture {
  return fixture.wrap === 'living'
    ? { ...fixture, living: commented(fixture.living!) }
    : { ...fixture, delta: commented(fixture.delta) }
}

describe('rule views', () => {
  test('every rule that reads a spec document has a fixture, and every other one is view-free', () => {
    const ids = enumeratedRules()
    expect(ids.length).toBeGreaterThan(15)
    expect(ids.filter((id) => FIXTURES[id] === undefined && VIEW_FREE[id] === undefined)).toEqual(
      [],
    )
    expect(Object.keys(FIXTURES).filter((id) => !ids.includes(id))).toEqual([])
  })

  test('no archive/* rule is advisory, and every advisory rule is enumerated', () => {
    expect(ADVISORY_RULES.filter((id) => id.startsWith('archive/'))).toEqual([])
    expect(ADVISORY_RULES.filter((id) => !enumeratedRules().includes(id))).toEqual([])
  })

  // Each advisory rule is an exception to the verbatim view, proven by a
  // differential fixture: `deltas/scenario-depth`'s is
  // `test/contract/validation-parity.test.ts` row 36.1 ("commented mis-depth
  // scenario: the binary archives it and cospec raises no deltas/scenario-depth").
  const advisory = new Set<string>(ADVISORY_RULES)
  for (const [rule, fixture] of Object.entries(FIXTURES)) {
    if (advisory.has(rule))
      test(`${rule} is advisory: it fires on a visible line and never on a commented one`, () => {
        expect(findings(rule, fixture).length).toBeGreaterThan(0)
        expect(findings(rule, inComment(fixture))).toEqual([])
      })
    else
      test(`${rule} reads what openspec reads: a commented copy decides exactly as the visible one`, () => {
        const visible = findings(rule, fixture)
        const hidden = findings(rule, inComment(fixture))
        // The fixture decides differently from an empty document, which is
        // all the masked view sees of the commented copy.
        const empty = findings(rule, inComment({ ...fixture, delta: '', living: fixture.living }))
        if (fixture.wrap !== 'living') expect(visible.length).not.toBe(empty.length)
        else expect(visible.length).toBeGreaterThan(0)
        // The comment's opening line shifts every line number by one.
        const decided = (found: Issue[]) =>
          found.map((i) => [i.level, i.message.replace(/\d+/g, 'N')])
        expect(decided(hidden)).toEqual(decided(visible))
      })
  }

  test('the masked parse is read only where the advisory findings are computed', () => {
    const readers = (pattern: RegExp): string[] => {
      const found: string[] = []
      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const path = join(dir, entry.name)
          if (entry.isDirectory()) walk(path)
          else if (entry.name.endsWith('.ts') && pattern.test(readFileSync(path, 'utf8')))
            found.push(path.slice(SRC.length + 1))
        }
      }
      walk(SRC)
      return found.toSorted()
    }
    expect(readers(/parseAdvisoryDelta\(/)).toEqual(['core/deltas.ts', 'core/rules/deltas.ts'])
    expect(readers(/\.advisory\b/)).toEqual(['core/rules/specs.ts'])
  })

  test('no gate accepts the masked parse (checked by the typecheck, not at runtime)', () => {
    const typeLevel = (text: string): void => {
      const masked = parseAdvisoryDelta(text, 'specs/x/spec.md', 'x')
      const verbatim = parseDeltaSpec(text, 'specs/x/spec.md', 'x')
      const living = parseLivingSpec(LIVING)
      requirementShapeIssues(verbatim, 'specs/x/spec.md')
      // @ts-expect-error a masked parse is not the delta openspec validates
      requirementShapeIssues(masked, 'specs/x/spec.md')
      // @ts-expect-error nor the one the archive splits
      findRequirementSplits(masked, undefined)
      const merge = { capability: 'x', changeName: 'c', living: LIVING, deltaText: text }
      // @ts-expect-error nor the one it merges
      rebuildSpec({ ...merge, delta: masked })
      // @ts-expect-error nor the ops the scenario-preservation gate compares
      findScenarioDrops([{ capability: 'x', ops: masked.ops }], new Map([['x', living]]))
      // @ts-expect-error nor is the masked living view the gate's baseline
      findScenarioDrops([{ capability: 'x', ops: verbatim.ops }], new Map([['x', living.advisory]]))
    }
    expect(typeof typeLevel).toBe('function')
  })
})
