import { describe, expect, test } from 'bun:test'

import { parseLivingSpec } from '../../../src/core/deltas.ts'
import { archiveRules } from '../../../src/core/rules/archive.ts'
import { makeChange, rules } from './helpers.ts'

const LIVING = `# X Specification

## Purpose

Real purpose.

## Requirements

### Requirement: Existing

The system SHALL exist.

#### Scenario: s

- **WHEN** a
- **THEN** b
`

/** A second living requirement, so a delta removing `Existing` does not empty the spec. */
const KEPT =
  '\n### Requirement: Kept\n\nThe system SHALL keep.\n\n#### Scenario: k\n\n- **WHEN** a\n- **THEN** b\n'
const LIVING_TWO = `${LIVING}${KEPT}`

function change(text: string, opts: { living?: string } = {}) {
  const livingSpecs = new Map()
  if (opts.living !== undefined) livingSpecs.set('x', parseLivingSpec(opts.living))
  return makeChange({
    deltaFiles: [{ path: 'specs/x/spec.md', capability: 'x', text }],
    livingSpecs,
  })
}

const ADD = `## ADDED Requirements

### Requirement: Brand New

The system SHALL do new.

#### Scenario: s

- **WHEN** a
- **THEN** b
`

describe('archiveRules', () => {
  test('ADDED against a nonexistent living spec is fine (new spec)', () => {
    expect(archiveRules(change(ADD))).toHaveLength(0)
  })

  test('archive/new-spec-non-added: MODIFIED against a nonexistent living spec', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Whatever\n\nThe system SHALL x.\n\n#### Scenario: s\n\n- **WHEN** a\n'
    expect(rules(archiveRules(change(text)))).toContain('archive/new-spec-non-added')
  })

  test('archive/no-ops: header present, zero operations', () => {
    expect(rules(archiveRules(change('## ADDED Requirements\n\n(nothing parseable)\n')))).toContain(
      'archive/no-ops',
    )
  })

  test('archive/target-missing: MODIFIED a requirement absent from the living spec', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Ghost\n\nThe system SHALL x.\n\n#### Scenario: s\n\n- **WHEN** a\n'
    expect(rules(archiveRules(change(text, { living: LIVING })))).toContain(
      'archive/target-missing',
    )
  })

  test('archive/added-exists: ADDED a requirement that already lives with a different body', () => {
    // LIVING's block ends `- **WHEN** a` / `- **THEN** b`; this one omits the
    // THEN, so the bodies genuinely differ — a real collision, not an early sync.
    const text =
      '## ADDED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s\n\n- **WHEN** a\n'
    const issues = archiveRules(change(text, { living: LIVING }))
    expect(rules(issues)).toContain('archive/added-exists')
    expect(issues.find((i) => i.rule === 'archive/added-exists')?.message).toContain(
      'already exists with different content',
    )
  })

  // openspec's ADDED arm (`specs-apply.ts`) skips an ADDED block whose
  // normalized raw text matches the living requirement: the spec was already
  // synced to the baseline, so the archive is a clean no-op.
  test('an ADDED block identical to the living requirement is an early-sync no-op', () => {
    const text = `## ADDED Requirements

### Requirement: Existing

The system SHALL exist.

#### Scenario: s

- **WHEN** a
- **THEN** b
`
    expect(archiveRules(change(text, { living: LIVING }), { strict: true })).toHaveLength(0)
  })

  test('the early-sync no-op survives CRLF and trailing-blank-line differences', () => {
    const text =
      '## ADDED Requirements\r\n\r\n### Requirement: Existing\r\n\r\nThe system SHALL exist.\r\n\r\n#### Scenario: s\r\n\r\n- **WHEN** a\r\n- **THEN** b\r\n\r\n\r\n'
    expect(archiveRules(change(text, { living: LIVING }), { strict: true })).toHaveLength(0)
  })

  test('an ADDED block differing only in one scenario line is still a collision', () => {
    const text = `## ADDED Requirements

### Requirement: Existing

The system SHALL exist.

#### Scenario: s

- **WHEN** a
- **THEN** c
`
    expect(rules(archiveRules(change(text, { living: LIVING })))).toContain('archive/added-exists')
  })

  test('an ADDED block differing only in interior whitespace is still a collision', () => {
    const text = `## ADDED Requirements

### Requirement: Existing

The system  SHALL exist.

#### Scenario: s

- **WHEN** a
- **THEN** b
`
    expect(rules(archiveRules(change(text, { living: LIVING })))).toContain('archive/added-exists')
  })

  test('archive/added-exists: RENAMED-TO collides with an existing requirement', () => {
    const text =
      '## RENAMED Requirements\n\n- FROM: `### Requirement: Existing`\n- TO: `### Requirement: Existing`\n'
    expect(rules(archiveRules(change(text, { living: LIVING })))).toContain('archive/added-exists')
  })

  // Probed (validation-parity 20.24): openspec's archive does not refuse a
  // living spec with no `## Requirements` before merging — it appends one — so
  // a MODIFIED against it fails only because its target is not there.
  test('a living spec missing ## Requirements is no structural defect; its MODIFIED target is missing', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s\n\n- **WHEN** a\n'
    const broken = '## Purpose\n\ntext only, no requirements section\n'
    expect(rules(archiveRules(change(text, { living: broken })))).toEqual([
      'archive/target-missing',
    ])
  })

  // openspec's REMOVED and RENAMED arms (`specs-apply.ts`) skip an operation
  // whose target is already gone from the baseline: the delta was applied to
  // the spec ahead of the archive, so re-applying it is a no-op at exit 0.
  // Each skip is withheld for a fold-equal survivor, which is a mistyped
  // header the binary aborts on.

  test('a REMOVED target already absent from the living spec is an early-sync no-op', () => {
    const text = '## REMOVED Requirements\n\n- `### Requirement: Long Gone`\n'
    expect(archiveRules(change(text, { living: LIVING }))).toHaveLength(0)
  })

  test('a REMOVED target with a fold-equal living name is a mistyped header, not a no-op', () => {
    const text = '## REMOVED Requirements\n\n- `### Requirement: existing`\n'
    const issues = archiveRules(change(text, { living: LIVING }))
    expect(rules(issues)).toContain('archive/target-missing')
    expect(issues.find((i) => i.rule === 'archive/target-missing')?.hint).toContain(
      '"### Requirement: Existing" exists',
    )
  })

  test('a RENAMED whose source is gone and target present is an early-sync no-op', () => {
    // Both arms must stay silent: `archive/target-missing` on the absent
    // source, and the `archive/added-exists` TO-collision the same shape
    // would otherwise raise on the present target.
    const text =
      '## RENAMED Requirements\n\n- FROM: `### Requirement: Old Name`\n- TO: `### Requirement: Existing`\n'
    expect(archiveRules(change(text, { living: LIVING }))).toHaveLength(0)
  })

  test('an early-synced RENAMED-TO still collides with an ADDED in the same delta', () => {
    // The living arm is suppressed (the rename was already applied), but the
    // delta-internal ADDED collision is a separate upstream pre-validation
    // that runs regardless of early-sync — the binary refuses this shape with
    // `RENAMED TO collides with ADDED`, so cospec must too. The ADDED body is
    // identical to the living block, so the ADDED arm itself stays silent and
    // only the RENAMED-TO arm can catch it.
    const text = `## ADDED Requirements

### Requirement: Existing

The system SHALL exist.

#### Scenario: s

- **WHEN** a
- **THEN** b

## RENAMED Requirements

- FROM: \`### Requirement: Old Name\`
- TO: \`### Requirement: Existing\`
`
    const issues = archiveRules(change(text, { living: LIVING }))
    expect(rules(issues)).toContain('archive/added-exists')
    expect(issues.find((i) => i.rule === 'archive/added-exists')?.message).toContain(
      'ADDED requirement',
    )
  })

  test('a RENAMED source with a fold-equal near-miss that is not the target still errors', () => {
    const living = `${LIVING}
### Requirement: Old  Name

The system SHALL be old.

#### Scenario: s

- **WHEN** a
- **THEN** b
`
    const text =
      '## RENAMED Requirements\n\n- FROM: `### Requirement: Old Name`\n- TO: `### Requirement: Existing`\n'
    const issues = archiveRules(change(text, { living }))
    expect(rules(issues)).toContain('archive/target-missing')
    expect(issues.find((i) => i.rule === 'archive/target-missing')?.hint).toContain(
      '"### Requirement: Old  Name" exists',
    )
  })

  test('a case-only RENAMED lands its source on the target and stays a no-op', () => {
    // The only fold-equal survivor IS the target, which upstream excludes from
    // the near-miss search — otherwise `Foo` -> `foo` could never be synced.
    const text =
      '## RENAMED Requirements\n\n- FROM: `### Requirement: EXISTING`\n- TO: `### Requirement: Existing`\n'
    expect(archiveRules(change(text, { living: LIVING }))).toHaveLength(0)
  })

  // openspec 1.13.1's two case-collision refusals (`specs-apply.ts`, RENAMED and
  // ADDED arms). Two spellings differing only in case or interior whitespace
  // are one requirement written twice, and writing both would leave the spec
  // self-contradicting — so the binary aborts, and cospec has to refuse first.
  describe('fold-equal collisions (openspec 1.13.1)', () => {
    test('archive/added-exists: an ADDED whose name folds onto a living requirement', () => {
      const text =
        '## ADDED Requirements\n\n### Requirement: EXISTING\n\nThe system SHALL exist twice.\n\n#### Scenario: s\n\n- **WHEN** a\n'
      const issues = archiveRules(change(text, { living: LIVING }))
      expect(rules(issues)).toEqual(['archive/added-exists'])
      expect(issues[0]?.message).toContain('differs only in case or spacing from "Existing"')
    })

    test('interior whitespace folds the same way', () => {
      const living = LIVING.replace('### Requirement: Existing', '### Requirement: Two  Words')
      const text =
        '## ADDED Requirements\n\n### Requirement: Two Words\n\nThe system SHALL exist.\n\n#### Scenario: s\n\n- **WHEN** a\n'
      expect(rules(archiveRules(change(text, { living })))).toEqual(['archive/added-exists'])
    })

    // openspec applies RENAMED, then REMOVED, then MODIFIED, then ADDED, and
    // its near-miss search reads the spec as it stands by then — so a living
    // name this delta already took away is not a collision.
    test('an ADDED folding onto a requirement the same delta REMOVES is fine', () => {
      const text =
        '## REMOVED Requirements\n\n- `### Requirement: Existing`\n\n## ADDED Requirements\n\n### Requirement: EXISTING\n\nThe system SHALL exist anew.\n\n#### Scenario: s\n\n- **WHEN** a\n'
      expect(archiveRules(change(text, { living: LIVING }))).toHaveLength(0)
    })

    test('an ADDED folding onto a requirement the same delta RENAMES away is fine', () => {
      const text =
        '## RENAMED Requirements\n\n- FROM: `### Requirement: Existing`\n- TO: `### Requirement: Moved On`\n\n## ADDED Requirements\n\n### Requirement: EXISTING\n\nThe system SHALL exist anew.\n\n#### Scenario: s\n\n- **WHEN** a\n'
      expect(archiveRules(change(text, { living: LIVING }))).toHaveLength(0)
    })

    test('archive/added-exists: a RENAMED target that folds onto a living requirement', () => {
      const living = `${LIVING}
### Requirement: Other

The system SHALL other.

#### Scenario: s

- **WHEN** a
- **THEN** b
`
      const text =
        '## RENAMED Requirements\n\n- FROM: `### Requirement: Other`\n- TO: `### Requirement: EXISTING`\n'
      const issues = archiveRules(change(text, { living }))
      expect(rules(issues)).toEqual(['archive/added-exists'])
      expect(issues[0]?.message).toContain('differs only in case or spacing from "Existing"')
    })

    // The exemption upstream spells out at `specs-apply.ts` (`k !== from`):
    // renaming a requirement to another spelling of its own name is the rename.
    test('a case-only rename is not a fold collision', () => {
      const text =
        '## RENAMED Requirements\n\n- FROM: `### Requirement: Existing`\n- TO: `### Requirement: EXISTING`\n'
      expect(archiveRules(change(text, { living: LIVING }))).toHaveLength(0)
    })

    // The early-sync RENAMED never reaches upstream's target check at all: the
    // source-missing branch `continue`s before it.
    test('an early-synced RENAMED is not re-reported as a fold collision', () => {
      const text =
        '## RENAMED Requirements\n\n- FROM: `### Requirement: Old Name`\n- TO: `### Requirement: Existing`\n'
      expect(archiveRules(change(text, { living: LIVING }))).toHaveLength(0)
    })

    test('an exact ADDED collision still reports the exact-collision message', () => {
      const text =
        '## ADDED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist differently.\n\n#### Scenario: s\n\n- **WHEN** a\n'
      const issues = archiveRules(change(text, { living: LIVING }))
      expect(rules(issues)).toEqual(['archive/added-exists'])
      expect(issues[0]?.message).toContain('already exists with different content')
    })
  })

  // openspec folds an op's name against the spec as it stands when that op
  // runs — after the delta's earlier operations have been applied to it
  // (`specs-apply.ts` applies RENAMED, then REMOVED, then MODIFIED, then
  // ADDED, against one map). So a delta whose own two operations write one
  // requirement under two spellings is refused, and folding against the living
  // names alone reported it clean.
  describe('fold-equal collisions between two ops in one delta', () => {
    const body = (name: string, shall: string) =>
      `### Requirement: ${name}\n\nThe system SHALL ${shall}.\n\n#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n`

    test('archive/added-exists: two ADDED names that fold onto each other', () => {
      const text = `## ADDED Requirements\n\n${body('Widget Caching', 'cache')}\n${body('WIDGET CACHING', 'cache loudly')}`
      const issues = archiveRules(change(text, { living: LIVING }))
      // Reported once, on the second ADDED — the one openspec refuses.
      expect(rules(issues)).toEqual(['archive/added-exists'])
      expect(issues[0]?.message).toBe(
        'ADDED "WIDGET CACHING" differs only in case or spacing from "Widget Caching" in ' +
          "capability 'x', written by an earlier operation in this delta",
      )
      expect(issues[0]?.hint).toContain('this delta already writes')
    })

    // The shape the finding was reproduced on: a brand-new capability, where
    // openspec builds a skeleton spec and applies the ADDED ops to that.
    test('two ADDED names fold the same way for a capability with no living spec', () => {
      const text = `## ADDED Requirements\n\n${body('Widget Caching', 'cache')}\n${body('Widget  caching', 'cache loudly')}`
      const issues = archiveRules(change(text))
      expect(rules(issues)).toEqual(['archive/added-exists'])
      expect(issues[0]?.message).toContain('differs only in case or spacing from "Widget Caching"')
    })

    test("archive/added-exists: an ADDED folding onto this delta's RENAMED target", () => {
      const text = `## RENAMED Requirements\n\n- FROM: \`### Requirement: Existing\`\n- TO: \`### Requirement: Widget Caching\`\n\n## ADDED Requirements\n\n${body('WIDGET CACHING', 'cache')}`
      const issues = archiveRules(change(text, { living: LIVING }))
      expect(rules(issues)).toEqual(['archive/added-exists'])
      expect(issues[0]?.message).toContain('differs only in case or spacing from "Widget Caching"')
    })

    test('archive/added-exists: a second RENAMED target folding onto the first', () => {
      const living = `${LIVING}
### Requirement: Other

The system SHALL other.

#### Scenario: s

- **WHEN** a
- **THEN** b
`
      const text =
        '## RENAMED Requirements\n\n' +
        '- FROM: `### Requirement: Existing`\n- TO: `### Requirement: Widget Caching`\n' +
        '- FROM: `### Requirement: Other`\n- TO: `### Requirement: WIDGET CACHING`\n'
      const issues = archiveRules(change(text, { living }))
      expect(rules(issues)).toEqual(['archive/added-exists'])
      expect(issues[0]?.message).toContain(
        'RENAMED target "WIDGET CACHING" differs only in case or spacing from "Widget Caching"',
      )
    })

    // The other direction of the same replay: a living name an EARLIER rename
    // took away is gone by the time the next rename's target is checked, so
    // the second rename is the swap the author wrote, not a collision.
    test('a rename onto a name an earlier rename vacated is not a collision', () => {
      const living = `${LIVING}
### Requirement: Other

The system SHALL other.

#### Scenario: s

- **WHEN** a
- **THEN** b
`
      const text =
        '## RENAMED Requirements\n\n' +
        '- FROM: `### Requirement: Existing`\n- TO: `### Requirement: Moved On`\n' +
        '- FROM: `### Requirement: Other`\n- TO: `### Requirement: Existing`\n'
      expect(archiveRules(change(text, { living }))).toHaveLength(0)
    })

    test('two ADDED names that do not fold onto each other stay clean', () => {
      const text = `## ADDED Requirements\n\n${body('Widget Caching', 'cache')}\n${body('Widget Tracing', 'trace')}`
      expect(archiveRules(change(text, { living: LIVING }))).toHaveLength(0)
    })
  })

  // Same replay, the arms the fold work left behind. openspec resolves every
  // MODIFIED/REMOVED/RENAMED-FROM lookup and the exact ADDED collision against
  // `nameToBlock` as the earlier phases left it, so a header this delta's own
  // RENAMED created is there for them and a header it vacated is not. Reading
  // the pristine living spec instead refused three deltas the binary archives
  // at exit 0.
  describe('exact-name arms read the replayed spec, not the pristine one', () => {
    const body = (name: string, shall: string) =>
      `### Requirement: ${name}\n\nThe system SHALL ${shall}.\n\n#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n`

    test('a MODIFIED naming a header an earlier RENAMED created is applied', () => {
      const text =
        '## RENAMED Requirements\n\n' +
        '- FROM: `### Requirement: Existing`\n- TO: `### Requirement: Renamed`\n\n' +
        `## MODIFIED Requirements\n\n${body('Renamed', 'exist better')}`
      expect(archiveRules(change(text, { living: LIVING }), { strict: true })).toHaveLength(0)
    })

    test('a REMOVED naming a header an earlier RENAMED created is applied', () => {
      const text =
        '## RENAMED Requirements\n\n' +
        '- FROM: `### Requirement: Existing`\n- TO: `### Requirement: Renamed`\n\n' +
        '## REMOVED Requirements\n\n- `### Requirement: Renamed`\n'
      expect(archiveRules(change(text, { living: LIVING_TWO }), { strict: true })).toHaveLength(0)
    })

    test("a chained RENAMED taking the previous rename's target is applied", () => {
      const text =
        '## RENAMED Requirements\n\n' +
        '- FROM: `### Requirement: Existing`\n- TO: `### Requirement: Renamed`\n' +
        '- FROM: `### Requirement: Renamed`\n- TO: `### Requirement: Renamed Again`\n'
      expect(archiveRules(change(text, { living: LIVING }))).toHaveLength(0)
    })

    test('an ADDED re-using the exact header an earlier RENAMED vacated is applied', () => {
      const text =
        '## RENAMED Requirements\n\n' +
        '- FROM: `### Requirement: Existing`\n- TO: `### Requirement: Renamed`\n\n' +
        `## ADDED Requirements\n\n${body('Existing', 'exist for a new reason')}`
      expect(archiveRules(change(text, { living: LIVING }), { strict: true })).toHaveLength(0)
    })

    // Not the RENAMED case above: openspec's validator checks each delta file's
    // own section names first, and `Requirement present in both ADDED and
    // REMOVED` refuses the pair before any merge runs — `openspec archive`
    // validates first, so it aborts too. The replay alone called this applied.
    test('an ADDED re-using the exact header an earlier REMOVED vacated is refused', () => {
      const text =
        '## REMOVED Requirements\n\n- `### Requirement: Existing`\n\n' +
        `## ADDED Requirements\n\n${body('Existing', 'exist for a new reason')}`
      const found = archiveRules(change(text, { living: LIVING }), { strict: true })
      expect(found.map((i) => [i.rule, i.line, i.message])).toEqual([
        [
          'archive/added-exists',
          text.split('\n').indexOf('### Requirement: Existing') + 1,
          'ADDED "Existing" is also REMOVED in this delta',
        ],
      ])
    })

    // The near-miss twin the early-sync exemption is withheld for has to be one
    // that SURVIVES to this operation. Searching the pristine living spec found
    // a twin an earlier rename had already carried away, so cospec reported
    // `archive/target-missing` and — because the near miss also skipped the
    // `earlySynced` bookkeeping — a second, entirely invented
    // `archive/added-exists` on the RENAMED target.
    test('an early-synced RENAMED whose fold twin an earlier rename took away is a no-op', () => {
      const living = `${LIVING}
### Requirement: Other

The system SHALL other.

#### Scenario: s

- **WHEN** a
- **THEN** b
`
      const text =
        '## RENAMED Requirements\n\n' +
        '- FROM: `### Requirement: Existing`\n- TO: `### Requirement: Renamed`\n' +
        '- FROM: `### Requirement: existing`\n- TO: `### Requirement: Other`\n'
      expect(archiveRules(change(text, { living }))).toHaveLength(0)
    })

    // The other direction: nothing above may relax a refusal the binary makes.
    test('a MODIFIED naming a header an earlier RENAMED took away is still an error', () => {
      const text =
        '## RENAMED Requirements\n\n' +
        '- FROM: `### Requirement: Existing`\n- TO: `### Requirement: Renamed`\n\n' +
        `## MODIFIED Requirements\n\n${body('Existing', 'exist better')}`
      const issues = archiveRules(change(text, { living: LIVING }))
      expect(rules(issues)).toEqual(['archive/target-missing'])
      expect(issues[0]?.message).toBe(
        'MODIFIED target "Existing" no longer exists in capability \'x\' — an earlier ' +
          'operation in this delta renamed it to "Renamed"',
      )
    })

    // Reported once, by the arm that mirrors the upstream pre-validation the
    // binary actually aborts in — not a second time from the ADDED side.
    test('an ADDED taking a header an earlier RENAMED created is still a collision', () => {
      const text =
        '## RENAMED Requirements\n\n' +
        '- FROM: `### Requirement: Existing`\n- TO: `### Requirement: Renamed`\n\n' +
        `## ADDED Requirements\n\n${body('Renamed', 'exist twice')}`
      const issues = archiveRules(change(text, { living: LIVING }))
      expect(rules(issues)).toEqual(['archive/added-exists'])
      expect(issues[0]?.message).toBe(
        'RENAMED target "Renamed" collides with an ADDED requirement in capability \'x\'',
      )
    })

    test('an ADDED that re-adds an untouched living requirement is still a collision', () => {
      const text = `## ADDED Requirements\n\n${body('Existing', 'exist twice')}`
      const issues = archiveRules(change(text, { living: LIVING }))
      expect(rules(issues)).toEqual(['archive/added-exists'])
      expect(issues[0]?.message).toBe(
        'ADDED "Existing" already exists with different content in living spec ' +
          'openspec/specs/x/spec.md',
      )
    })

    // The gate that has to follow the rename with it: upstream compares the
    // MODIFIED block against the block the rename re-keyed, so the scenarios it
    // must preserve are the SOURCE's. Reading the (absent) target name in the
    // living spec found zero scenarios and waved the drop through.
    test('archive/scenario-preservation follows a rename to the source block', () => {
      const text =
        '## RENAMED Requirements\n\n' +
        '- FROM: `### Requirement: Existing`\n- TO: `### Requirement: Renamed`\n\n' +
        '## MODIFIED Requirements\n\n### Requirement: Renamed\n\nThe system SHALL exist better.\n\n#### Scenario: other\n\n- **WHEN** a\n- **THEN** b\n'
      const issues = archiveRules(change(text, { living: LIVING }), { strict: true })
      expect(rules(issues)).toEqual(['archive/scenario-preservation'])
      expect(issues[0]?.message).toContain('MODIFIED "Renamed" drops scenario(s) "s"')
    })
  })

  test('a RENAMED with source and target both absent is still an error', () => {
    const text =
      '## RENAMED Requirements\n\n- FROM: `### Requirement: Ghost A`\n- TO: `### Requirement: Ghost B`\n'
    expect(rules(archiveRules(change(text, { living: LIVING })))).toContain(
      'archive/target-missing',
    )
  })

  test('a valid MODIFIED against an existing requirement passes', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist better.\n\n#### Scenario: s\n\n- **WHEN** a\n'
    expect(archiveRules(change(text, { living: LIVING }))).toHaveLength(0)
  })
})

const TWO_SCENARIO_LIVING = `# X Specification

## Purpose

Real purpose.

## Requirements

### Requirement: Existing

The system SHALL exist.

#### Scenario: s1

- **WHEN** a
- **THEN** b

#### Scenario: s2

- **WHEN** c
- **THEN** d
`

describe('archiveRules: archive/scenario-preservation (advisory mirror)', () => {
  test('fires as WARNING by default when a MODIFIED delta drops a scenario', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s1\n\n- **WHEN** a\n'
    const issues = archiveRules(change(text, { living: TWO_SCENARIO_LIVING }))
    const issue = issues.find((i) => i.rule === 'archive/scenario-preservation')
    expect(issue?.level).toBe('WARNING')
  })

  test('is ERROR under --strict', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s1\n\n- **WHEN** a\n'
    const issues = archiveRules(change(text, { living: TWO_SCENARIO_LIVING }), { strict: true })
    expect(issues.find((i) => i.rule === 'archive/scenario-preservation')?.level).toBe('ERROR')
  })

  // openspec 1.8.0's own scenario-loss check refuses a MODIFIED block that omits
  // a living scenario, and its archive aborts on one, with no notion of cospec's
  // note — so the note is no longer an escape hatch. It only changes the hint.
  test('a `Scenario removed:` note no longer suppresses the mirror rule', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n- Scenario removed: s2 was redundant.\n\n#### Scenario: s1\n\n- **WHEN** a\n'
    const issues = archiveRules(change(text, { living: TWO_SCENARIO_LIVING }))
    const issue = issues.find((i) => i.rule === 'archive/scenario-preservation')
    expect(issue?.level).toBe('WARNING')
    expect(issue?.hint).toContain('no longer excuses the drop')
  })

  test('without a note the hint names the remedies but not the retired note', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s1\n\n- **WHEN** a\n'
    const issue = archiveRules(change(text, { living: TWO_SCENARIO_LIVING })).find(
      (i) => i.rule === 'archive/scenario-preservation',
    )
    expect(issue?.hint).not.toContain('no longer excuses the drop')
    expect(issue?.hint).toContain('copy the missing scenario back into the MODIFIED block')
    // openspec 1.13.1 refuses a REMOVE and an ADD of one requirement name in
    // the same delta (specs-apply.ts compares normalized, not case-folded,
    // names), so the retired remedy must never come back. Only a fold-VARIANT
    // of a removed name is applied at 1.13.1 — contract-pinned separately.
    expect(issue?.hint).not.toContain('ADD it back in the same delta')
    expect(issue?.hint).toContain('ADD the replacement in a later one')
  })

  test('an unchanged scenario count never fires', () => {
    expect(rules(archiveRules(change(ADD), { strict: true }))).not.toContain(
      'archive/scenario-preservation',
    )
  })

  test('the message names the dropped scenario and both counts', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s1\n\n- **WHEN** a\n'
    const issue = archiveRules(change(text, { living: TWO_SCENARIO_LIVING })).find(
      (i) => i.rule === 'archive/scenario-preservation',
    )
    expect(issue?.message).toBe('MODIFIED "Existing" drops scenario(s) "s2" (living 2 -> delta 1)')
  })

  // The shape the count-only gate waved through entirely.
  test('a same-count scenario NAME swap fires, naming the lost scenario', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s1\n\n- **WHEN** a\n\n#### Scenario: s3\n\n- **WHEN** c\n'
    const issue = archiveRules(change(text, { living: TWO_SCENARIO_LIVING }), {
      strict: true,
    }).find((i) => i.rule === 'archive/scenario-preservation')
    expect(issue?.level).toBe('ERROR')
    expect(issue?.message).toBe('MODIFIED "Existing" drops scenario(s) "s2" (living 2 -> delta 2)')
  })

  test('reordering the living scenarios never fires', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s2\n\n- **WHEN** c\n\n#### Scenario: s1\n\n- **WHEN** a\n'
    expect(
      rules(archiveRules(change(text, { living: TWO_SCENARIO_LIVING }), { strict: true })),
    ).not.toContain('archive/scenario-preservation')
  })
})

// Gate regression for bodyless scenario headers. Probed against the 1.11.0 pin:
// a MODIFIED block that keeps a living scenario's header and deletes its steps
// validates clean (`Change 'x' is valid`, exit 0) and archives at exit 0,
// leaving the living spec holding the hollow header — the steps are gone and
// nothing on either side said so. cospec's gate is the only defence, here and
// on the whole 1.0.0-1.7.x lower half of the accepted range.
describe('archive gates count only scenarios that have a body', () => {
  test('hollowing a living scenario out to a bare header is a drop', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s1\n\n- **WHEN** a\n\n#### Scenario: s2\n'
    const issue = archiveRules(change(text, { living: TWO_SCENARIO_LIVING }), {
      strict: true,
    }).find((i) => i.rule === 'archive/scenario-preservation')
    expect(issue?.level).toBe('ERROR')
    // Both names are present on both sides, so the identity arm is satisfied and
    // the count arm — the belt-and-braces one — is what refuses.
    expect(issue?.message).toBe('MODIFIED "Existing" drops scenario count from 2 to 1')
  })

  // The other direction: gating the delta side alone would refuse a faithful
  // reproduction of a living block that happens to carry a bare header.
  test('a bodyless living header does not inflate the living count into a loss', () => {
    const living = `${TWO_SCENARIO_LIVING}
#### Scenario: s3
`
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s1\n\n- **WHEN** a\n\n#### Scenario: s2\n\n- **WHEN** c\n\n#### Scenario: s3\n'
    expect(rules(archiveRules(change(text, { living }), { strict: true }))).not.toContain(
      'archive/scenario-preservation',
    )
  })
})

// Gate regression for the widened delta bullet markers. Before the widening,
// a `*`/`+`/indented REMOVED entry never entered `ParsedDelta.ops`, so the
// archive gate judged the section empty and never evaluated the target at all.
describe('archive gates see non-`-` delta bullets', () => {
  test('a `*`-bulleted REMOVED naming an absent requirement trips archive/target-missing', () => {
    // `existing` folds onto the living `Existing`: a mistyped header, which is
    // the one shape that survives the REMOVED early-sync exemption.
    const text = '## REMOVED Requirements\n\n* `### Requirement: existing`\n'
    const issues = archiveRules(change(text, { living: LIVING }))
    expect(rules(issues)).toContain('archive/target-missing')
    expect(issues.find((i) => i.rule === 'archive/target-missing')?.hint).toContain(
      '### Requirement: Existing',
    )
    // The op is real, so the section is no longer judged empty.
    expect(rules(issues)).not.toContain('archive/no-ops')
  })

  test('a `*`-bulleted REMOVED naming a present requirement is accepted', () => {
    const text = '## REMOVED Requirements\n\n* `### Requirement: Existing`\n'
    expect(archiveRules(change(text, { living: LIVING_TWO }))).toHaveLength(0)
  })

  test('an indented `+` REMOVED bullet is judged the same way', () => {
    const text = '## REMOVED Requirements\n\n  + `### Requirement: existing`\n'
    expect(rules(archiveRules(change(text, { living: LIVING })))).toContain(
      'archive/target-missing',
    )
  })
})

// Gate regression for the phantom RENAMED op. A bare `FROM:` used to open a
// RENAMED op that `closeReq()` pushed with `toName` undefined: it counted as
// this section's one entry (so `archive/no-ops` stayed quiet), it was skipped
// by the RENAMED-TO collision arm for want of a `toName`, and its `fromName`
// still drew an `archive/target-missing` — a rename that never happened,
// reported as a missing target rather than as the malformed pair it is.
describe('archive gates no longer see a half-built RENAMED', () => {
  test('a RENAMED section holding only a dangling FROM: trips archive/no-ops', () => {
    const text = '## RENAMED Requirements\n\n- FROM: `### Requirement: Existing`\n'
    const issues = archiveRules(change(text, { living: LIVING }))
    expect(rules(issues)).toEqual(['archive/no-ops'])
  })

  test('a dangling FROM: naming an absent requirement no longer reports target-missing', () => {
    const text = '## RENAMED Requirements\n\n- FROM: `### Requirement: Nowhere`\n'
    expect(rules(archiveRules(change(text, { living: LIVING })))).not.toContain(
      'archive/target-missing',
    )
  })

  test('an interleaved run gates the pair the author actually wrote', () => {
    // The op is `b` -> `Renamed thing`, so the missing target named is `b`.
    // `a` is neither paired with the TO: nor gated as a rename source.
    const text =
      '## RENAMED Requirements\n\n- FROM: `### Requirement: a`\n- FROM: `### Requirement: b`\n- TO: `### Requirement: Renamed thing`\n'
    const issues = archiveRules(change(text, { living: LIVING }))
    expect(rules(issues)).toEqual(['archive/target-missing'])
    expect(issues[0]!.message).toBe(
      'RENAMED target "b" does not exist in living spec openspec/specs/x/spec.md',
    )
    expect(issues[0]!.line).toBe(4)
  })

  // The collision arm is gated on `op.toName !== undefined`, so the phantom
  // slipped past it entirely; a real pair must still be judged by it.
  test('the surviving pair still gates its TO: collision', () => {
    const living = `${LIVING}
### Requirement: Other

The system SHALL other.

#### Scenario: s

- **WHEN** a
- **THEN** b
`
    const text =
      '## RENAMED Requirements\n\n- FROM: `### Requirement: a`\n- FROM: `### Requirement: Other`\n- TO: `### Requirement: Existing`\n'
    const issues = archiveRules(change(text, { living }))
    expect(rules(issues)).toEqual(['archive/added-exists'])
    expect(issues[0]!.message).toBe(
      `RENAMED target "Existing" collides with an existing requirement in capability 'x'`,
    )
  })
})

// Gate regression for closing ATX runs. `### Requirement: Existing ###` renders
// as `Existing`, and openspec 1.13.1 keys every lookup on the stripped name.
// Before the strip, cospec read `Existing ###` here: it refused a delta the
// binary applies, and it read `Existing` and `Existing ###` as two requirements
// where the binary sees one collision.
describe('archive gates strip a closing ATX run from requirement names', () => {
  test('a MODIFIED header with a closing run resolves to the living requirement', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing ###\n\nThe system SHALL exist.\n\n#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n'
    expect(archiveRules(change(text, { living: LIVING }))).toHaveLength(0)
  })

  test('a REMOVED bullet with a closing run resolves to the living requirement', () => {
    const text = '## REMOVED Requirements\n\n- `### Requirement: Existing ###`\n'
    expect(archiveRules(change(text, { living: LIVING_TWO }))).toHaveLength(0)
  })

  test('an ADDED header with a closing run still collides with the living requirement', () => {
    const text =
      '## ADDED Requirements\n\n### Requirement: Existing ###\n\nThe system SHALL exist.\n\n#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n'
    expect(rules(archiveRules(change(text, { living: LIVING })))).toContain('archive/added-exists')
  })

  test('a name whose final `#` is part of the name is not resolved to a stripped twin', () => {
    // No space before the `#`, so CommonMark does not close the heading and
    // `Existing#` stays whole — a different requirement from `Existing`.
    const living = LIVING.replace('### Requirement: Existing', '### Requirement: Existing#')
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n'
    expect(rules(archiveRules(change(text, { living })))).toContain('archive/target-missing')
  })
})

// A case-variant `Requirement:` keyword parses for the binary, so the hard
// archive gates must see the op too. While cospec's header regex was
// case-sensitive these blocks produced no op at all: the gates stayed silent and
// the binary applied the delta — a false archive PASS.
describe('archiveRules: case-variant requirement headers reach the gates', () => {
  test('archive/target-missing sees a lowercase MODIFIED header', () => {
    const text =
      '## MODIFIED Requirements\n\n### requirement: Ghost\n\nThe system SHALL x.\n\n#### Scenario: s\n\n- **WHEN** a\n'
    expect(rules(archiveRules(change(text, { living: LIVING })))).toContain(
      'archive/target-missing',
    )
  })

  test('archive/target-missing sees an uppercase MODIFIED header', () => {
    const text =
      '## MODIFIED Requirements\n\n### REQUIREMENT: Ghost\n\nThe system SHALL x.\n\n#### Scenario: s\n\n- **WHEN** a\n'
    expect(rules(archiveRules(change(text, { living: LIVING })))).toContain(
      'archive/target-missing',
    )
  })

  test('archive/scenario-preservation refuses a drop under a lowercase header', () => {
    const text =
      '## MODIFIED Requirements\n\n### requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s1\n\n- **WHEN** a\n'
    const issues = archiveRules(change(text, { living: TWO_SCENARIO_LIVING }), { strict: true })
    const issue = issues.find((i) => i.rule === 'archive/scenario-preservation')
    expect(issue?.level).toBe('ERROR')
    expect(issue?.message).toContain('"s2"')
  })

  // A REMOVED target that is simply absent is an early-sync no-op upstream, so
  // the op reaching the gate is proven by the near-miss arm instead: a mistyped
  // header the binary aborts on.
  test('a lowercase-header REMOVED reaches the near-miss arm', () => {
    const text = '## REMOVED Requirements\n\n### requirement: EXISTING\n'
    const issues = archiveRules(change(text, { living: LIVING }))
    expect(rules(issues)).toContain('archive/target-missing')
    expect(issues.find((i) => i.rule === 'archive/target-missing')?.hint).toContain(
      '### Requirement: Existing',
    )
  })

  test('a case-variant header no longer hides behind archive/no-ops', () => {
    const text =
      '## MODIFIED Requirements\n\n### REQUIREMENT: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n'
    expect(rules(archiveRules(change(text, { living: LIVING })))).not.toContain('archive/no-ops')
  })
})

// openspec's validator refuses a requirement one delta file both ADDs and
// REMOVEs or both ADDs and MODIFIES, comparing normalised names (not folded
// ones), before any merge runs.
describe('archive/added-exists: cross-section conflicts in one delta', () => {
  const block = (name: string, shall: string) =>
    `### Requirement: ${name}\n\nThe system SHALL ${shall}.\n\n#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n`

  test('an ADDED with a differing body plus a MODIFIED of one name is one finding', () => {
    const text =
      `## ADDED Requirements\n\n${block('Existing', 'exist differently')}\n` +
      `## MODIFIED Requirements\n\n${block('Existing', 'exist better')}`
    const found = archiveRules(change(text, { living: LIVING }), { strict: true })
    expect(found.map((i) => [i.rule, i.line, i.message])).toEqual([
      ['archive/added-exists', 3, 'ADDED "Existing" is also MODIFIED in this delta'],
    ])
  })

  test('a fold-variant REMOVED+ADDED is no cross-section conflict', () => {
    const text =
      '## REMOVED Requirements\n\n- `### Requirement: Existing`\n\n' +
      `## ADDED Requirements\n\n${block('EXISTING', 'exist anew')}`
    expect(archiveRules(change(text, { living: LIVING }), { strict: true })).toEqual([])
  })

  test('a fold-variant MODIFIED+ADDED is the fold collision, not a cross-section one', () => {
    const text =
      `## MODIFIED Requirements\n\n${block('Existing', 'exist better')}\n` +
      `## ADDED Requirements\n\n${block('EXISTING', 'exist anew')}`
    const found = archiveRules(change(text, { living: LIVING }), { strict: true })
    expect(found.map((i) => i.rule)).toEqual(['archive/added-exists'])
    expect(found[0]?.message).toContain('differs only in case or spacing from "Existing"')
  })
})

// openspec's archive reads HTML comments as written (its readers mask fenced
// code only), so every archive rule reads the verbatim view: an op inside
// `<!-- … -->` is merged, a header's trailing comment is part of its name, and
// a scenario inside a comment is one the archive's scenario-loss check counts.
describe('archiveRules read the verbatim view the archive merges', () => {
  const block = (name: string, shall: string) =>
    `### Requirement: ${name}\n\nThe system SHALL ${shall}.\n\n#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n`

  test('an ADDED inside a comment that collides with a living requirement is refused', () => {
    const text = `## ADDED Requirements\n\n${block('Brand New', 'do new')}\n<!--\n${block('Existing', 'exist differently')}-->\n`
    const found = archiveRules(change(text, { living: LIVING }))
    expect(found.map((i) => [i.rule, i.line])).toEqual([['archive/added-exists', 13]])
  })

  test('a MODIFIED inside a comment whose target is missing is refused', () => {
    const text = `## ADDED Requirements\n\n${block('Brand New', 'do new')}\n<!--\n## MODIFIED Requirements\n\n${block('Ghost', 'haunt')}-->\n`
    const found = archiveRules(change(text, { living: LIVING }))
    expect(found.map((i) => [i.rule, i.line])).toEqual([['archive/target-missing', 15]])
  })

  test('REMOVED X beside ADDED "X <!-- note -->" is two names, not a conflict', () => {
    const text =
      '## REMOVED Requirements\n\n- `### Requirement: Existing`\n\n' +
      `## ADDED Requirements\n\n${block('Existing <!-- restated -->', 'exist anew')}`
    expect(archiveRules(change(text, { living: LIVING }), { strict: true })).toEqual([])
  })

  test('a living requirement inside a comment is still a MODIFIED target', () => {
    const living = LIVING.replace(
      '### Requirement: Existing',
      '<!--\n### Requirement: Hidden\n\nThe system SHALL hide.\n-->\n\n### Requirement: Existing',
    )
    const text = `## MODIFIED Requirements\n\n${block('Hidden', 'hide better')}`
    expect(rules(archiveRules(change(text, { living })))).not.toContain('archive/target-missing')
  })

  test('scenario-preservation reads the verbatim view: a scenario kept inside a comment is kept', () => {
    // The delta's second scenario sits in a comment. The archive reads it, so
    // the MODIFIED block still covers the living `t` and nothing is dropped.
    const living = LIVING.replace(
      '- **THEN** b\n',
      '- **THEN** b\n\n#### Scenario: t\n\n- **WHEN** c\n- **THEN** d\n',
    )
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n' +
      '#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n\n<!--\n#### Scenario: t\n\n- **WHEN** c\n-->\n'
    expect(archiveRules(change(text, { living }), { strict: true })).toEqual([])
  })

  test('scenario-preservation reads the verbatim view: a living scenario inside a comment can be dropped', () => {
    const living = LIVING.replace(
      '- **THEN** b\n',
      '- **THEN** b\n\n<!--\n#### Scenario: hidden\n\n- **WHEN** c\n-->\n',
    )
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n' +
      '#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n'
    const found = archiveRules(change(text, { living }), { strict: true })
    expect(found.map((i) => [i.rule, i.message])).toEqual([
      [
        'archive/scenario-preservation',
        'MODIFIED "Existing" drops scenario(s) "hidden" (living 2 -> delta 1)',
      ],
    ])
  })

  test('scenario-preservation names a comment-bearing requirement as its header is written', () => {
    const named = (s: string) =>
      s.replace('### Requirement: Existing', '### Requirement: Existing <!-- c -->')
    const living = named(
      LIVING.replace('- **THEN** b\n', '- **THEN** b\n\n#### Scenario: t\n\n- **WHEN** c\n'),
    )
    const text = named(
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n' +
        '#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n',
    )
    const found = archiveRules(change(text, { living }), { strict: true })
    expect(found.map((i) => i.message)).toEqual([
      'MODIFIED "Existing <!-- c -->" drops scenario(s) "t" (living 2 -> delta 1)',
    ])
  })
})

// The archive appends each ADDED/MODIFIED block verbatim and re-validates the
// rebuilt spec, whose reader takes every `###` header as a requirement of its
// own. A skipped header inside a block therefore cuts it, and a piece left
// with no scenario is refused (`Requirement must have at least one scenario`).
describe('archive/split-requirement', () => {
  const splits = (text: string) =>
    archiveRules(change(text, { living: LIVING })).filter(
      (i) => i.rule === 'archive/split-requirement',
    )
  const SCEN = '#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n'

  test('a header between the requirement text and its only scenario leaves the head empty', () => {
    const text = `## ADDED Requirements\n\n### Requirement: Brand New\n\nThe system SHALL do new.\n\n### Notes\n\n${SCEN}`
    expect(splits(text).map((i) => [i.level, i.line, i.message])).toEqual([
      [
        'ERROR',
        7,
        'header "### Notes" inside ADDED "Brand New" splits it when archived, leaving "Brand New" with no scenario above the header',
      ],
    ])
  })

  test('a header after the scenario with none of its own is a requirement with no scenario', () => {
    const text = `## ADDED Requirements\n\n### Requirement: Brand New\n\nThe system SHALL do new.\n\n${SCEN}\n### Requirement:\n`
    expect(splits(text).map((i) => [i.line, i.message])).toEqual([
      [
        12,
        'header "### Requirement:" inside ADDED "Brand New" splits it when archived, leaving the header a requirement with no scenario',
      ],
    ])
  })

  test('a header carrying its own scenario after the block scenario is not refused', () => {
    const text = `## ADDED Requirements\n\n### Requirement: Brand New\n\nThe system SHALL do new.\n\n${SCEN}\n### Notes\n\n${SCEN}`
    expect(splits(text)).toEqual([])
  })

  test('a header above the first requirement belongs to no block', () => {
    const text = `## ADDED Requirements\n\n### Notes\n\n### Requirement: Brand New\n\nThe system SHALL do new.\n\n${SCEN}`
    expect(splits(text)).toEqual([])
  })

  test('a header inside an HTML comment splits the block all the same', () => {
    const text = `## ADDED Requirements\n\n### Requirement: Brand New\n\nThe system SHALL do new.\n\n<!--\n### Hidden\n-->\n\n${SCEN}`
    expect(splits(text).map((i) => i.line)).toEqual([8])
  })

  test('a MODIFIED block splits the same way', () => {
    const text = `## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n### Notes\n\n${SCEN}`
    expect(splits(text).map((i) => i.line)).toEqual([7])
  })

  test('a fenced header is content, not a cut', () => {
    const text = `## ADDED Requirements\n\n### Requirement: Brand New\n\nThe system SHALL do new.\n\n\`\`\`md\n### Fenced\n\`\`\`\n\n${SCEN}`
    expect(splits(text)).toEqual([])
  })

  test("a visible ### Scenario: is scenario-depth's alone; a commented one is split's", () => {
    const visible = `## ADDED Requirements\n\n### Requirement: Brand New\n\nThe system SHALL do new.\n\n${SCEN}\n### Scenario: Shallow\n\n- **WHEN** a\n`
    expect(splits(visible)).toEqual([])
    const commented = `## ADDED Requirements\n\n### Requirement: Brand New\n\nThe system SHALL do new.\n\n${SCEN}\n<!--\n### Scenario: Hidden\n-->\n`
    expect(splits(commented).map((i) => i.line)).toEqual([13])
  })
})

// openspec's archive refuses to update a living spec that `findMainSpecStructureIssues`
// flags, before merging anything: a requirement outside `## Requirements`, or
// a second one under a name already declared there. Fenced lines are excluded;
// HTML comments are not.
// The rebuilt spec keeps every living requirement the delta does not replace
// or remove, as written, so a skipped `###` header already inside one splits
// it exactly as one inside an ADDED block does — one shape of the rebuilt-spec
// check, which names the requirement left without a scenario.
describe('archive/rebuilt-spec-invalid: a split in a surviving living requirement', () => {
  const SCEN = '#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n'
  const livingWith = (inside: string) =>
    LIVING.replace('The system SHALL exist.\n\n', `The system SHALL exist.\n\n${inside}\n\n`)
  const rebuilt = (text: string, living: string) =>
    archiveRules(change(text, { living })).filter((i) => i.rule === 'archive/rebuilt-spec-invalid')
  const modify = (name: string) =>
    `## MODIFIED Requirements\n\n### Requirement: ${name}\n\nThe system SHALL ${name.toLowerCase()} anew.\n\n${SCEN}`

  test('a header above the living scenario, beside an unrelated MODIFIED, names the requirement and the header', () => {
    const living = `${livingWith('### Notes')}\n### Requirement: Other\n\nThe system SHALL other.\n\n${SCEN}`
    const found = rebuilt(modify('Other'), living)
    const notes = living.split('\n').indexOf('### Notes') + 1
    expect(found.map((i) => [i.level, i.path, i.line, i.message])).toEqual([
      [
        'ERROR',
        'specs/x/spec.md',
        undefined,
        `requirement "Existing" (line 9 of openspec/specs/x/spec.md) has no scenario in the rebuilt spec — header "### Notes" (line ${notes} of openspec/specs/x/spec.md) splits it, and the scenarios below go with that header`,
      ],
    ])
    expect(found[0]?.hint).toContain('Requirement must have at least one scenario')
  })

  test('a header with no scenario of its own becomes a requirement with none', () => {
    const living = LIVING.replace('- **THEN** b\n', '- **THEN** b\n\n### Requirement:\n')
    expect(living.split('\n').indexOf('### Requirement:') + 1).toBe(18)
    expect(rebuilt(ADD, living).map((i) => i.message)).toEqual([
      'header "### Requirement:" (line 18 of openspec/specs/x/spec.md) becomes a requirement with no scenario in the rebuilt spec',
    ])
  })

  test('a header written inside a multi-line comment splits it too', () => {
    expect(rebuilt(ADD, livingWith('<!--\n### Hidden\n-->'))).toHaveLength(1)
  })

  test('a RENAMED carries the block, and its split, to the new name', () => {
    const text =
      '## RENAMED Requirements\n\n- FROM: `### Requirement: Existing`\n- TO: `### Requirement: Renamed`\n'
    expect(rebuilt(text, livingWith('### Notes')).map((i) => i.message)).toEqual([
      expect.stringContaining('requirement "Renamed" (line 9 of openspec/specs/x/spec.md)'),
    ])
  })

  test('a MODIFIED or REMOVED of the requirement replaces the block, so nothing splits', () => {
    expect(rebuilt(modify('Existing'), livingWith('### Notes'))).toEqual([])
    const removed = '## REMOVED Requirements\n\n- `### Requirement: Existing`\n'
    expect(rebuilt(removed, `${livingWith('### Notes')}${KEPT}`)).toEqual([])
  })

  test('a REMOVED after a RENAMED reads the new name, as the merge applies it', () => {
    const text =
      '## RENAMED Requirements\n\n- FROM: `### Requirement: Existing`\n- TO: `### Requirement: Renamed`\n\n' +
      '## REMOVED Requirements\n\n- `### Requirement: Renamed`\n'
    expect(rebuilt(text, `${livingWith('### Notes')}${KEPT}`)).toEqual([])
  })

  test('a one-line comment, a fenced header, and a header with its own scenario are no split', () => {
    expect(rebuilt(ADD, livingWith('<!-- ### Notes -->'))).toEqual([])
    expect(rebuilt(ADD, livingWith('```md\n### Fenced\n```'))).toEqual([])
    const own = LIVING.replace('- **THEN** b\n', `- **THEN** b\n\n### Notes\n\n${SCEN}`)
    expect(rebuilt(ADD, own)).toEqual([])
  })

  test('a living spec the archive will not update is target-invalid alone', () => {
    const living = `${LIVING}\n## Notes\n\n### Requirement: Stray\n\nThe system SHALL stray.\n\n### Notes\n`
    expect(rules(archiveRules(change(ADD, { living })))).toEqual(['archive/target-invalid'])
  })
})

describe('archive/target-invalid: living-spec structure', () => {
  const MOD =
    '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n'
  const invalid = (living: string) =>
    archiveRules(change(MOD, { living })).filter((i) => i.rule === 'archive/target-invalid')
  const EXTRA =
    '### Requirement: Other\n\nThe system SHALL other.\n\n#### Scenario: o\n\n- **WHEN** c\n- **THEN** d\n'

  test('a duplicate requirement name is refused, naming both lines', () => {
    const found = invalid(`${LIVING}\n${EXTRA.replace('Other', 'Existing')}`)
    expect(found.map((i) => [i.level, i.message])).toEqual([
      [
        'ERROR',
        'living spec openspec/specs/x/spec.md is structurally invalid — line 18: requirement "Existing" duplicates the one declared on line 9',
      ],
    ])
    expect(found[0]?.hint).toContain('under "## Requirements"')
  })

  test('a closing ATX run does not make a second name', () => {
    expect(invalid(`${LIVING}\n${EXTRA.replace('Other', 'Existing ###')}`)).toHaveLength(1)
  })

  test('a requirement outside ## Requirements is refused, commented or not', () => {
    for (const stray of ['### Requirement: Stray', '<!--\n### Requirement: Stray\n-->']) {
      const found = invalid(LIVING.replace('## Purpose\n\n', `## Purpose\n\n${stray}\n\n`))
      expect(found).toHaveLength(1)
      expect(found[0]?.message).toContain(
        'requirement "Stray" is outside the ## Requirements section',
      )
    }
  })

  test('a requirement under a later ## section is outside too', () => {
    const found = invalid(`${LIVING}\n## Notes\n\n${EXTRA}`)
    expect(found[0]?.message).toContain('requirement "Other" is outside')
  })

  test('a fenced requirement header is content, not a defect', () => {
    expect(
      invalid(
        LIVING.replace('## Purpose\n\n', '## Purpose\n\n```\n### Requirement: Stray\n```\n\n'),
      ),
    ).toEqual([])
  })

  test('a delta header is refused on its line, visible or inside a comment', () => {
    for (const header of ['## ADDED Requirements\n\nStray.', '<!--\n## ADDED Requirements\n-->']) {
      const living = `${LIVING}\n${header}\n`
      const found = invalid(living)
      const line = living.split('\n').indexOf('## ADDED Requirements') + 1
      expect(found.map((i) => i.message)).toEqual([
        `living spec openspec/specs/x/spec.md is structurally invalid — line ${line}: delta header "## ADDED Requirements" belongs only in a change's delta spec`,
      ])
      expect(found[0]?.hint).toContain('delta header')
    }
  })

  test('the delta-header check reads the words as upstream does, any case and spacing', () => {
    expect(invalid(`${LIVING}\n## added   requirements\n`)).toHaveLength(1)
  })

  test('a BOM before a first-line ## Requirements hides it, as upstream reads it', () => {
    const living = `\uFEFF${LIVING.slice(LIVING.indexOf('## Requirements'))}\n## Purpose\n\nReal purpose.\n`
    const found = invalid(living)
    expect(found).toHaveLength(1)
    expect(found[0]?.message).toContain(
      'requirement "Existing" is outside the ## Requirements section',
    )
  })

  test('a BOM before an ordinary title changes nothing', () => {
    expect(invalid(`\uFEFF${LIVING}`)).toEqual([])
  })

  test('a missing ## Requirements is no defect of its own; the stray requirement is named', () => {
    const found = invalid(
      '# X\n\n## Purpose\n\nReal purpose.\n\n### Requirement: Existing\n\nThe system SHALL exist.\n',
    )
    expect(found.map((i) => i.message)).toEqual([
      'living spec openspec/specs/x/spec.md is structurally invalid — line 7: requirement "Existing" is outside the ## Requirements section, so openspec never reads it',
    ])
  })
})

// openspec's archive re-validates the whole spec it rebuilt, so what the delta
// never touches can abort it. Each finding names the living or delta line.
describe('archive/rebuilt-spec-invalid', () => {
  const rebuilt = (text: string, living?: string, yaml?: Record<string, unknown>) =>
    archiveRules(
      makeChange({
        deltaFiles: [{ path: 'specs/x/spec.md', capability: 'x', text }],
        livingSpecs: living === undefined ? new Map() : new Map([['x', parseLivingSpec(living)]]),
        ...(yaml === undefined
          ? {}
          : { openspecYaml: { present: true, parseable: true, schema: 'feat', ...yaml } }),
      }),
    ).filter((i) => i.rule === 'archive/rebuilt-spec-invalid')
  const MOD =
    '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist anew.\n\n#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n'
  const REMOVE_EXISTING = '## REMOVED Requirements\n\n- `### Requirement: Existing`\n'

  test('a header above the first living requirement becomes a requirement with no scenario', () => {
    const living = LIVING.replace('## Requirements\n\n', '## Requirements\n\n### Notes\n\n')
    expect(rebuilt(MOD, living).map((i) => [i.level, i.line, i.message])).toEqual([
      [
        'ERROR',
        undefined,
        'header "### Notes" (line 9 of openspec/specs/x/spec.md) becomes a requirement with no scenario in the rebuilt spec',
      ],
    ])
  })

  test('a surviving living requirement with no scenario is refused', () => {
    const living = `${LIVING}\n### Requirement: Bare\n\nThe system SHALL be bare.\n`
    expect(rebuilt(ADD, living).map((i) => i.message)).toEqual([
      'requirement "Bare" (line 18 of openspec/specs/x/spec.md) has no scenario in the rebuilt spec',
    ])
  })

  test('a scenario only inside an HTML comment or at level 5 still counts, as the archive reads it', () => {
    const commented = LIVING.replace('#### Scenario: s', '<!--\n#### Scenario: s').replace(
      '- **THEN** b\n',
      '- **THEN** b\n-->\n',
    )
    expect(rebuilt(ADD, commented)).toEqual([])
    expect(rebuilt(ADD, LIVING.replace('#### Scenario: s', '##### s'))).toEqual([])
  })

  test('a delta block with no scenario is the delta rules’ to report, not a second finding', () => {
    const text = '## ADDED Requirements\n\n### Requirement: Brand New\n\nThe system SHALL do new.\n'
    expect(rebuilt(text, LIVING)).toEqual([])
  })

  test('a level-1 header in a delta block that takes its scenario is refused on the delta line', () => {
    const text = ADD.replace('#### Scenario: s', '# Aside\n\n#### Scenario: s')
    expect(rebuilt(text, LIVING).map((i) => [i.line, i.message])).toEqual([
      [3, 'requirement "Brand New" (line 3 of this delta) has no scenario in the rebuilt spec'],
    ])
  })

  test('removing the last requirement is refused unless the change retires the capability', () => {
    expect(rebuilt(REMOVE_EXISTING, LIVING).map((i) => i.message)).toEqual([
      "the rebuilt spec for 'x' has no requirement left",
    ])
    expect(rebuilt(REMOVE_EXISTING, LIVING, { retireCapabilities: true })).toEqual([])
    expect(rebuilt(REMOVE_EXISTING, LIVING_TWO)).toEqual([])
  })

  test('a declared retirement is refused while the spec holds content the merge cannot name', () => {
    const living = LIVING.replace('## Requirements\n\n', '## Requirements\n\nIntro prose.\n\n')
    const found = rebuilt(REMOVE_EXISTING, living, { retireCapabilities: true })
    expect(found.map((i) => i.message)).toEqual([
      `the rebuilt spec for 'x' has no requirement left, and retire_capabilities cannot retire it: the spec holds content the merge cannot safely account for and deleting the file would take with it: "Intro prose."`,
    ])
    expect(found[0]?.hint).not.toContain('retire_capabilities: true')
  })

  test('undeclared, a retirement the content blocks names the content, not the marker', () => {
    const living = `${LIVING}\nA note below the scenarios.\n`
    const found = rebuilt(REMOVE_EXISTING, living)
    expect(found[0]?.message).toContain('"A note below the scenarios."')
    expect(found[0]?.hint).not.toContain('retire_capabilities: true')
  })

  test('a declared retirement of a spec this change did not empty is refused', () => {
    const found = rebuilt(REMOVE_EXISTING, '# X\n\n## Purpose\n\nReal purpose.\n', {
      retireCapabilities: true,
    })
    expect(found.map((i) => i.message)).toEqual([
      "the rebuilt spec for 'x' has no requirement left, and retire_capabilities cannot retire it: this change removes none of its requirements",
    ])
  })

  test('a declared retirement is decided on the ERRORs, not the level of the Requirements header', () => {
    const living = LIVING.replace('Real purpose.\n', 'Real purpose.\n\n### Requirements\n')
    expect(rebuilt(REMOVE_EXISTING, living, { retireCapabilities: true })).toEqual([])
    expect(rebuilt(REMOVE_EXISTING, living).map((i) => i.message)).toEqual([
      `the rebuilt spec for 'x' has no requirement: "### Requirements" (line 7 of openspec/specs/x/spec.md) is read as its Requirements section, and nothing sits under it`,
    ])
  })

  test('a living spec with no Purpose text is refused; one with no ## Requirements is not', () => {
    const noPurpose = LIVING.replace('Real purpose.\n\n', '')
    expect(rebuilt(MOD, noPurpose).map((i) => i.message)).toEqual([
      "the rebuilt spec for 'x' has no ## Purpose text: openspec/specs/x/spec.md has none for the merge to keep",
    ])
    expect(rebuilt(ADD, '# X\n\n## Purpose\n\nReal purpose.\n')).toEqual([])
  })

  test('a heading titled Requirements under Purpose is read as the section, and refused', () => {
    const living = LIVING.replace('Real purpose.\n', 'Real purpose.\n\n### Requirements\n')
    expect(rebuilt(MOD, living).map((i) => i.message)).toEqual([
      `the rebuilt spec for 'x' has no requirement: "### Requirements" (line 7 of openspec/specs/x/spec.md) is read as its Requirements section, and nothing sits under it`,
    ])
  })

  test('a precondition the merge refuses first leaves the rebuilt spec unread', () => {
    const living = LIVING.replace('## Requirements\n\n', '## Requirements\n\n### Notes\n\n')
    const missing = MOD.replace('Existing', 'Missing')
    expect(rules(archiveRules(change(missing, { living })))).toEqual(['archive/target-missing'])
  })

  test('a new capability that only ADDs is clean', () => {
    expect(rebuilt(ADD)).toEqual([])
  })

  test('a nameless header with a scenario but no statement is a text split, not a second finding', () => {
    const text = ADD.replace(
      '- **THEN** b\n',
      '- **THEN** b\n\n###   \n\n#### Scenario: t\n\n- **WHEN** c\n',
    )
    const found = archiveRules(change(text, { living: LIVING }))
    expect(found.map((i) => [i.rule, i.line])).toEqual([['archive/split-requirement', 12]])
    expect(found[0]?.message).toContain('leaving the header a requirement with no text')
  })
})

// The in-file conflicts openspec's validate refuses and no other archive/* arm
// reports; a change cospec never delegates had no finding for them at all.
describe('archive/op-conflict', () => {
  const conflicts = (text: string, living = LIVING_TWO) =>
    archiveRules(change(text, { living })).filter((i) => i.rule === 'archive/op-conflict')
  const MOD =
    '### Requirement: Existing\n\nThe system SHALL exist anew.\n\n#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n'
  const RENAME =
    '## RENAMED Requirements\n\n- FROM: `### Requirement: Existing`\n- TO: `### Requirement: Renamed`\n\n'

  test('a MODIFIED written twice is refused on the second copy', () => {
    const text = `## MODIFIED Requirements\n\n${MOD}\n${MOD}`
    expect(conflicts(text).map((i) => [i.level, i.line, i.message])).toEqual([
      ['ERROR', 12, 'MODIFIED "Existing" appears twice in this delta'],
    ])
  })

  test('a REMOVED written twice is refused on the second entry', () => {
    const text =
      '## REMOVED Requirements\n\n- `### Requirement: Existing`\n- `### Requirement: Existing`\n'
    expect(conflicts(text).map((i) => [i.line, i.message])).toEqual([
      [4, 'REMOVED "Existing" appears twice in this delta'],
    ])
  })

  test('a REMOVED of a RENAMED source is refused, a fold variant too', () => {
    for (const removed of ['Existing', 'existing']) {
      const text = `${RENAME}## REMOVED Requirements\n\n- \`### Requirement: ${removed}\`\n`
      expect(conflicts(text).map((i) => i.message)).toEqual([
        `REMOVED "${removed}" names the source of RENAMED "Existing" -> "Renamed" in this delta`,
      ])
    }
  })

  test('distinct names, and a REMOVED of the rename target, are no conflict here', () => {
    expect(
      conflicts(
        '## REMOVED Requirements\n\n- `### Requirement: Existing`\n- `### Requirement: Kept`\n',
      ),
    ).toEqual([])
    expect(
      conflicts(`${RENAME}## REMOVED Requirements\n\n- \`### Requirement: Renamed\`\n`),
    ).toEqual([])
  })
})
