import { describe, expect, test } from 'bun:test'

import { parseDeltaSpec } from '../../../src/core/deltas.ts'
import {
  deltasRules,
  skipSpecsConflictIssues,
  unreadDeltaFileIssues,
} from '../../../src/core/rules/deltas.ts'
import { makeChange, rules } from './helpers.ts'

function delta(path: string, capability: string, text: string) {
  return makeChange({ deltaFiles: [{ path, capability, text }] })
}

const GOOD = `## ADDED Requirements

### Requirement: X

The system SHALL x.

#### Scenario: s

- **WHEN** a
- **THEN** b
`

describe('deltasRules', () => {
  test('a valid delta produces no issues', () => {
    expect(deltasRules(delta('specs/x/spec.md', 'x', GOOD))).toHaveLength(0)
  })

  test('deltas/scenario-depth on a 3-hashtag scenario', () => {
    const text =
      '## ADDED Requirements\n\n### Requirement: X\n\nThe system SHALL x.\n\n### Scenario: s\n'
    expect(rules(deltasRules(delta('specs/x/spec.md', 'x', text)))).toContain(
      'deltas/scenario-depth',
    )
  })

  test('deltas/header-present when no delta header exists', () => {
    expect(rules(deltasRules(delta('specs/x/spec.md', 'x', '# prose\n\nnothing')))).toContain(
      'deltas/header-present',
    )
  })

  test('deltas/requirement-shape when SHALL/MUST or a scenario is missing', () => {
    const noShall =
      '## ADDED Requirements\n\n### Requirement: X\n\nplain text.\n\n#### Scenario: s\n\n- **WHEN** a\n'
    const noScenario = '## ADDED Requirements\n\n### Requirement: X\n\nThe system SHALL x.\n'
    expect(rules(deltasRules(delta('specs/x/spec.md', 'x', noShall)))).toContain(
      'deltas/requirement-shape',
    )
    expect(rules(deltasRules(delta('specs/x/spec.md', 'x', noScenario)))).toContain(
      'deltas/requirement-shape',
    )
  })

  // A requirement whose only scenario is a bare header has no scenario at all,
  // and the author is staring at a visible `#### Scenario:` line while cospec
  // says there is none. Same condition and wording as openspec's
  // `emptyScenarioHint` (src/core/validation/validator.ts, 1.13.1).
  test('deltas/requirement-shape explains a scenario header that has no body', () => {
    const hollow =
      '## ADDED Requirements\n\n### Requirement: X\n\nThe system SHALL x.\n\n#### Scenario: s\n'
    const issues = deltasRules(delta('specs/x/spec.md', 'x', hollow))
    const shape = issues.filter((i) => i.rule === 'deltas/requirement-shape')
    expect(shape.map((i) => i.message)).toEqual([
      'ADDED "X" must include at least one #### Scenario:',
    ])
    expect(shape[0]!.hint).toBe(
      'a scenario header with no body under it does not count; add its steps, e.g. "- **WHEN** ..." and "- **THEN** ..."',
    )
  })

  test('the hint is withheld when the block carries no scenario header at all', () => {
    const noScenario = '## ADDED Requirements\n\n### Requirement: X\n\nThe system SHALL x.\n'
    const shape = deltasRules(delta('specs/x/spec.md', 'x', noScenario)).filter(
      (i) => i.rule === 'deltas/requirement-shape',
    )
    expect(shape).toHaveLength(1)
    expect(shape[0]!.hint).toBeUndefined()
  })

  test('deltas/capability-kebab on a non-kebab capability', () => {
    expect(rules(deltasRules(delta('specs/BadCap/spec.md', 'BadCap', GOOD)))).toContain(
      'deltas/capability-kebab',
    )
  })
})

describe('nested capability paths', () => {
  test('specs/<area>/<capability>/spec.md is valid', () => {
    expect(
      deltasRules(delta('specs/platform/session-layout/spec.md', 'platform/session-layout', GOOD)),
    ).toHaveLength(0)
  })

  test('deltas/capability-kebab on a non-kebab segment anywhere in the path', () => {
    expect(
      rules(
        deltasRules(
          delta('specs/Platform/session-layout/spec.md', 'Platform/session-layout', GOOD),
        ),
      ),
    ).toContain('deltas/capability-kebab')
  })

  test('deltas/capability-kebab on a delta file that is not spec.md', () => {
    expect(rules(deltasRules(delta('specs/web/extra.md', 'web', GOOD)))).toContain(
      'deltas/capability-kebab',
    )
  })
})

describe('deltas/spec-at-specs-root', () => {
  test('a spec.md at the specs/ root is an ERROR and nothing else', () => {
    // The merge path drops it, so the change would otherwise validate clean and
    // archive while its requirements never reach openspec/specs/.
    const issues = deltasRules(delta('specs/spec.md', '', GOOD))
    expect(issues).toHaveLength(1)
    expect(issues[0]!.rule).toBe('deltas/spec-at-specs-root')
    expect(issues[0]!.level).toBe('ERROR')
  })

  test('a DIRECTORY named spec.md is a capability, not the root-level case', () => {
    // It still fails deltas/capability-kebab (a dot is not kebab-case), but it
    // must not be reported as the root-level delta openspec blocks outright.
    expect(rules(deltasRules(delta('specs/spec.md/spec.md', 'spec.md', GOOD)))).toEqual([
      'deltas/capability-kebab',
    ])
  })
})

// A rename cospec cannot pair is a rename that does not happen: openspec drops
// the stray line, archive still reports success, and the requirement keeps its
// old name. 1.13.1 reports the same shape as an ERROR; cospec reports it at
// every pin.
describe('deltas/unpaired-rename', () => {
  const renamed = (...lines: string[]) =>
    delta('specs/x/spec.md', 'x', ['## RENAMED Requirements', '', ...lines, ''].join('\n'))

  test('a complete FROM:/TO: pair reports nothing', () => {
    expect(
      deltasRules(renamed('- FROM: `### Requirement: A`', '- TO: `### Requirement: B`')),
    ).toHaveLength(0)
  })

  test('a dangling FROM: is an ERROR naming the missing TO:', () => {
    const issues = deltasRules(renamed('- FROM: `### Requirement: A`'))
    expect(issues).toHaveLength(1)
    const issue = issues[0]!
    expect(issue.rule).toBe('deltas/unpaired-rename')
    expect(issue.level).toBe('ERROR')
    expect(issue.line).toBe(3)
    expect(issue.message).toBe('RENAMED FROM: "A" has no matching TO: line')
    expect(issue.hint).toBe(
      'write each rename as a FROM: line followed immediately by its TO: line',
    )
  })

  test('a dangling TO: is an ERROR naming the missing FROM:', () => {
    const issue = deltasRules(renamed('- TO: `### Requirement: B`'))[0]!
    expect(issue.rule).toBe('deltas/unpaired-rename')
    expect(issue.message).toBe('RENAMED TO: "B" has no matching FROM: line')
  })

  test('the displaced FROM: of an interleaved run is reported once', () => {
    const issues = deltasRules(
      renamed(
        '- FROM: `### Requirement: a`',
        '- FROM: `### Requirement: b`',
        '- TO: `### Requirement: x`',
      ),
    )
    expect(rules(issues)).toEqual(['deltas/unpaired-rename'])
    expect(issues[0]!.message).toBe('RENAMED FROM: "a" has no matching TO: line')
  })
})

describe('skipSpecsConflictIssues', () => {
  test('no marker, no issue — whatever is under specs/', () => {
    expect(skipSpecsConflictIssues(makeChange({ files: ['specs/x/spec.md'] }))).toHaveLength(0)
  })

  test('the marker with an empty specs/ is accepted', () => {
    const change = makeChange({
      openspecYaml: { present: true, parseable: true, schema: 'feat', skipSpecs: true },
      files: ['proposal.md', 'tasks.md'],
    })
    expect(skipSpecsConflictIssues(change)).toHaveLength(0)
  })

  test('the marker plus ANY file under specs/ is an ERROR', () => {
    // Not just parsed deltas: a headerless or stray file is dropped at archive
    // while the change claims to carry nothing.
    const change = makeChange({
      openspecYaml: { present: true, parseable: true, schema: 'feat', skipSpecs: true },
      files: ['proposal.md', 'specs/notes.txt'],
    })
    const issues = skipSpecsConflictIssues(change)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.rule).toBe('deltas/skip-specs-conflict')
    expect(issues[0]!.level).toBe('ERROR')
  })
})

describe('deltasRules — orphaned requirements', () => {
  // WARNING, not ERROR: pre-format archived changes carry this shape, and the
  // fix is to move the block. Same level openspec 1.13.1 chose.
  test('deltas/orphaned-requirement warns and names the section', () => {
    const text = `${GOOD}\n## Notes\n\n### Requirement: Stray\n`
    const issues = deltasRules(delta('specs/x/spec.md', 'x', text))
    expect(issues).toHaveLength(1)
    expect(issues[0]!.rule).toBe('deltas/orphaned-requirement')
    expect(issues[0]!.level).toBe('WARNING')
    expect(issues[0]!.message).toContain('under "## Notes"')
    expect(issues[0]!.hint).toContain('## ADDED Requirements')
  })

  test('a requirement above every section reports the above-first-section wording', () => {
    const text = `### Requirement: Stray\n\n${GOOD}`
    const issues = deltasRules(delta('specs/x/spec.md', 'x', text))
    expect(rules(issues)).toEqual(['deltas/orphaned-requirement'])
    expect(issues[0]!.message).toContain('above the first "## " section')
  })

  // header-present already stops the file, so the orphan is not piled on top.
  test('a file with no delta section at all reports only deltas/header-present', () => {
    expect(
      rules(deltasRules(delta('specs/x/spec.md', 'x', '## Notes\n\n### Requirement: A\n'))),
    ).toEqual(['deltas/header-present'])
  })
})

// openspec 1.13.1's `findUnreadDeltaFiles`. Both readers open exactly
// `spec.md`, so a delta written anywhere else under `specs/` is applied by
// nobody while `status` and `apply` count the specs as written.
function withUnread(path: string, expected: string, text: string) {
  return makeChange({ unreadSpecFiles: [{ path, expected, text }] })
}

describe('unreadDeltaFileIssues', () => {
  test('a delta-shaped file beside the real delta is an ERROR', () => {
    const issues = unreadDeltaFileIssues(withUnread('specs/x/notes.md', 'specs/x/spec.md', GOOD))
    expect(rules(issues)).toEqual(['deltas/unread-file'])
    expect(issues[0]!.level).toBe('ERROR')
    expect(issues[0]!.path).toBe('specs/x/notes.md')
    expect(issues[0]!.message).toContain('delta spec found at specs/x/notes.md')
    expect(issues[0]!.hint).toContain('specs/x/spec.md')
  })

  test('a delta-shaped file at the specs/ root names itself as the capability', () => {
    const issues = unreadDeltaFileIssues(withUnread('specs/x.md', 'specs/x/spec.md', GOOD))
    expect(rules(issues)).toEqual(['deltas/unread-file'])
    expect(issues[0]!.hint).toContain('specs/x/spec.md')
  })

  // The shape the `spec.md`-only filter exists to protect: a companion note is
  // not a delta, and openspec skips it on the same test.
  test('a companion note with no delta section is not reported', () => {
    const text = '# Notes\n\nWhy the delta looks the way it does.\n\n### Requirement: Quoted\n'
    expect(unreadDeltaFileIssues(withUnread('specs/x/notes.md', 'specs/x/spec.md', text))).toEqual(
      [],
    )
  })

  test('each unread delta file is its own finding', () => {
    const change = makeChange({
      unreadSpecFiles: [
        { path: 'specs/x/notes.md', expected: 'specs/x/spec.md', text: GOOD },
        { path: 'specs/y.md', expected: 'specs/y/spec.md', text: GOOD },
      ],
    })
    expect(unreadDeltaFileIssues(change).map((i) => i.path)).toEqual([
      'specs/x/notes.md',
      'specs/y.md',
    ])
  })
})

/**
 * Every skipped-header shape at once: between blocks, inside a block, nameless
 * (`### Requirement:` and `### requirement`), fenced, in a REMOVED section, a
 * `### Scenario:` one level too shallow, and one inside a MODIFIED block.
 */
const SKIPPED = `## ADDED Requirements

### Documentation Requirements

### Requirement: Widget thing

The system SHALL do a widget thing.

### Notes inside

The notes stay inside the block.

#### Scenario: Works

- **WHEN** a caller asks
- **THEN** the thing is done

### Requirement:

### requirement

\`\`\`md
### Fenced header
\`\`\`

### Scenario: Shallow

- **WHEN** a caller asks

## REMOVED Requirements

### Removed notes

- \`### Requirement: Old thing\`

## MODIFIED Requirements

### Requirement: Other thing

### Between notes

The system MUST do the other thing.

#### Scenario: Other

- **WHEN** a
- **THEN** b
`

describe('parseDeltaSpec skippedHeaders', () => {
  test('records the lines the binary skips, and only those', () => {
    const p = parseDeltaSpec(SKIPPED, 'specs/x/spec.md', 'x')
    expect(p.skippedHeaders).toEqual([
      { header: 'Documentation Requirements', section: 'ADDED Requirements', line: 3 },
      { header: 'Notes inside', section: 'ADDED Requirements', line: 9 },
      { header: 'Requirement:', section: 'ADDED Requirements', line: 18 },
      { header: 'requirement', section: 'ADDED Requirements', line: 20 },
      { header: 'Scenario: Shallow', section: 'ADDED Requirements', line: 26 },
      { header: 'Between notes', section: 'MODIFIED Requirements', line: 40 },
    ])
  })

  // Captured from the parser before `skippedHeaders` existed: recording the
  // headers must not move a single op, count, line or block byte. (Only
  // `verbatimName` and `parts` were added since: the first equals `name` on a
  // comment-free header, the second only cuts the block at those headers.)
  test('recording them leaves ops, SHALL/MUST, scenario counts and lines unchanged', () => {
    const p = parseDeltaSpec(SKIPPED, 'specs/x/spec.md', 'x')
    expect(p.ops.map(({ raw: _raw, ...op }) => op)).toEqual([
      {
        operation: 'ADDED',
        name: 'Widget thing',
        verbatimName: 'Widget thing',
        line: 5,
        hasShallMust: true,
        scenarioCount: 1,
        scenarioNames: ['Works'],
        emptyScenarioCount: 0,
        scenarioRemovalReasons: [],
        parts: [
          { line: 5, scenarioCount: 0 },
          { header: 'Notes inside', line: 9, scenarioCount: 1 },
          { header: 'Requirement:', line: 18, scenarioCount: 0 },
          { header: 'requirement', line: 20, scenarioCount: 0 },
          { header: 'Scenario: Shallow', line: 26, scenarioCount: 0 },
        ],
      },
      {
        operation: 'REMOVED',
        name: 'Old thing',
        line: 34,
        hasShallMust: false,
        scenarioCount: 0,
        scenarioNames: [],
        emptyScenarioCount: 0,
        scenarioRemovalReasons: [],
      },
      {
        operation: 'MODIFIED',
        name: 'Other thing',
        verbatimName: 'Other thing',
        line: 38,
        hasShallMust: true,
        scenarioCount: 1,
        scenarioNames: ['Other'],
        emptyScenarioCount: 0,
        scenarioRemovalReasons: [],
        parts: [
          { line: 38, scenarioCount: 0 },
          { header: 'Between notes', line: 40, scenarioCount: 1 },
        ],
      },
    ])
    // A skipped header stays part of the block it sits in, as upstream's does.
    expect(p.ops[0]?.raw).toContain('### Notes inside')
    expect(p.ops[0]?.raw.endsWith('- **WHEN** a caller asks')).toBe(true)
    expect(p.ops[2]?.raw).toContain('### Between notes')
    expect(p.emptySections).toEqual([])
    expect(p.scenarioDepthIssues).toEqual([{ line: 26, header: 'Scenario: Shallow' }])
    expect(p.orphanedRequirements).toEqual([])
    expect(p.unpairedRenames).toEqual([])
  })

  test('a clean delta skips nothing', () => {
    expect(parseDeltaSpec(GOOD, 'specs/x/spec.md', 'x').skippedHeaders).toEqual([])
  })

  test('a repeated section copy quotes the first spelling, as the binary does', () => {
    const text = `## ADDED Requirements\n\n${GOOD.split('\n').slice(2).join('\n')}\n## Added Requirements\n\n### Stray\n`
    expect(parseDeltaSpec(text, 'specs/x/spec.md', 'x').skippedHeaders).toEqual([
      {
        header: 'Stray',
        section: 'ADDED Requirements',
        line: text.split('\n').indexOf('### Stray') + 1,
      },
    ])
  })
})

describe('deltas/skipped-header', () => {
  const skippedIssues = (text: string) =>
    deltasRules(delta('specs/x/spec.md', 'x', text)).filter(
      (i) => i.rule === 'deltas/skipped-header',
    )

  test('an INFO only for a header the archive keeps; a splitting one is left to archive/*', () => {
    // Every in-block header in SKIPPED leaves a piece of its block with no
    // scenario, which the archive refuses — `archive/split-requirement`'s
    // ERROR. Only the divider above the first requirement is this INFO.
    expect(
      skippedIssues(SKIPPED).map((i) => ({ level: i.level, line: i.line, message: i.message })),
    ).toEqual([
      {
        level: 'INFO',
        line: 3,
        message:
          'header "### Documentation Requirements" in ADDED Requirements is not a "### Requirement:" header and is ignored by validation',
      },
    ])
  })

  /** Both nameless shapes above the first requirement, and a harmless in-block divider. */
  const KEPT = `## ADDED Requirements

### Requirement:

### requirement

### Requirement: X

The system SHALL x.

#### Scenario: s

- **WHEN** a
- **THEN** b

### Notes

The system SHALL keep notes.

#### Scenario: n

- **WHEN** c
- **THEN** d

## MODIFIED Requirements

### Between notes

### Requirement: Other thing

The system MUST do the other thing.

#### Scenario: Other

- **WHEN** a
- **THEN** b
`

  test('an INFO for each nameless shape, a harmless in-block header, and a MODIFIED divider', () => {
    expect(
      skippedIssues(KEPT).map((i) => ({ level: i.level, line: i.line, message: i.message })),
    ).toEqual([
      {
        level: 'INFO',
        line: 3,
        message:
          'header "### Requirement:" in ADDED Requirements is missing a requirement name and is ignored by validation',
      },
      {
        level: 'INFO',
        line: 5,
        message:
          'header "### requirement" in ADDED Requirements is missing a requirement name and is ignored by validation',
      },
      {
        level: 'INFO',
        line: 16,
        message:
          'header "### Notes" in ADDED Requirements is not a "### Requirement:" header and is ignored by validation',
      },
      {
        level: 'INFO',
        line: 27,
        message:
          'header "### Between notes" in MODIFIED Requirements is not a "### Requirement:" header and is ignored by validation',
      },
    ])
  })

  test('each shape carries its own hint', () => {
    const [nameless] = skippedIssues(KEPT)
    const [divider] = skippedIssues(SKIPPED)
    expect(divider?.hint).toBe(
      'use "### Requirement: Documentation Requirements" if it should be validated as a requirement',
    )
    expect(nameless?.hint).toBe('add a name, e.g. "### Requirement: <name>"')
  })

  test('nothing for a fenced header, a REMOVED-section header, or a ### Scenario: line', () => {
    const lines = skippedIssues(SKIPPED).map((i) => i.line)
    const at = (header: string) => SKIPPED.split('\n').indexOf(header) + 1
    for (const header of ['### Fenced header', '### Removed notes', '### Scenario: Shallow'])
      expect(lines).not.toContain(at(header))
    // The shallow scenario is reported once, by the rule whose remedy fits it.
    expect(
      rules(deltasRules(delta('specs/x/spec.md', 'x', SKIPPED))).filter(
        (r) => r === 'deltas/scenario-depth',
      ),
    ).toHaveLength(1)
  })

  test("a scenario after a skipped header still counts; the header is archive/*'s", () => {
    const text = `## ADDED Requirements

### Requirement: X

The system SHALL x.

### Notes

#### Scenario: s

- **WHEN** a
- **THEN** b
`
    // No requirement-shape finding: the scenario is still X's. No INFO either:
    // the header leaves X's own piece with no scenario, which the archive refuses.
    expect(deltasRules(delta('specs/x/spec.md', 'x', text))).toEqual([])
  })

  test('INFO never moves the verdict', () => {
    const found = deltasRules(delta('specs/x/spec.md', 'x', KEPT))
    expect(rules(found).every((r) => r === 'deltas/skipped-header')).toBe(true)
    expect(found.filter((i) => i.level !== 'INFO')).toEqual([])
  })
})

describe('deltas/requirement-shape header-only SHALL/MUST hint', () => {
  const shape = (header: string, body: string) =>
    deltasRules(
      delta(
        'specs/x/spec.md',
        'x',
        `## ADDED Requirements\n\n### Requirement: ${header}\n\n${body}#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n`,
      ),
    ).filter((i) => i.rule === 'deltas/requirement-shape')

  const HINT =
    'move the SHALL/MUST statement to the line immediately after the "### Requirement: ..." header'

  test('a keyword only in the header is an ERROR carrying the move hint', () => {
    expect(shape('The system SHALL frob widgets', 'The system frobs widgets.\n\n')).toEqual([
      {
        level: 'ERROR',
        rule: 'deltas/requirement-shape',
        path: 'specs/x/spec.md',
        line: 3,
        message: 'ADDED "The system SHALL frob widgets" must use SHALL/MUST normative language',
        hint: HINT,
      },
    ])
  })

  test('an empty body under a keyword header is an ERROR carrying the move hint', () => {
    expect(shape('The system MUST be empty', '')).toEqual([
      {
        level: 'ERROR',
        rule: 'deltas/requirement-shape',
        path: 'specs/x/spec.md',
        line: 3,
        message: 'ADDED "The system MUST be empty" must use SHALL/MUST normative language',
        hint: HINT,
      },
    ])
  })

  test('no keyword anywhere is the same ERROR with no hint', () => {
    expect(shape('Plain thing', 'The system does a plain thing.\n\n')).toEqual([
      {
        level: 'ERROR',
        rule: 'deltas/requirement-shape',
        path: 'specs/x/spec.md',
        line: 3,
        message: 'ADDED "Plain thing" must use SHALL/MUST normative language',
        hint: undefined,
      },
    ])
  })
})

// openspec's validator quotes a requirement by the header as written, trailing
// HTML comment included, so cospec's finding must too — or its delegated twin
// names a different requirement and is relayed as a second finding.
describe('deltas/requirement-shape names the header as written', () => {
  test('a comment-bearing header is named with its comment', () => {
    const text =
      '## ADDED Requirements\n\n### Requirement: Widget polishing <!-- restated -->\n\n' +
      'The system polishes widgets.\n\n#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n'
    const found = deltasRules(delta('specs/x/spec.md', 'x', text))
    expect(found.map((i) => [i.rule, i.message])).toEqual([
      [
        'deltas/requirement-shape',
        'ADDED "Widget polishing <!-- restated -->" must use SHALL/MUST normative language',
      ],
    ])
  })

  test('the masked name still drives every other reading of the op', () => {
    const p = parseDeltaSpec(
      '## ADDED Requirements\n\n### Requirement: Foo <!-- note -->\n\nThe system SHALL foo.\n',
      'specs/x/spec.md',
      'x',
    )
    expect(p.ops.map((o) => [o.name, o.verbatimName])).toEqual([['Foo', 'Foo <!-- note -->']])
  })
})

describe('deltas/scenario-depth quotes its header', () => {
  test('the message names the header as written, for the dedupe key', () => {
    const text =
      '## ADDED Requirements\n\n### Requirement: X\n\nThe system SHALL x.\n\n###   Scenario: Shallow <!-- c -->\n'
    const found = deltasRules(delta('specs/x/spec.md', 'x', text)).filter(
      (i) => i.rule === 'deltas/scenario-depth',
    )
    expect(found.map((i) => [i.line, i.message])).toEqual([
      [
        7,
        'scenario heading "### Scenario: Shallow <!-- c -->" uses 3 hashtags; must be `#### Scenario:`',
      ],
    ])
  })
})
