// The optional-workflow conditional grammar (workflow-profiles design D6), ported from the
// pinned binary's `core/templates/optional-workflow.js`. Every failure message is quoted here
// in full, byte for byte; the contract differential compares the two implementations over a
// wider matrix.

import { describe, expect, test } from 'bun:test'

import {
  assertWorkflowConditionalsResolved,
  onlyWithWorkflow,
  optionalWorkflow,
  resolveOptionalWorkflows,
} from '../../../src/harness/optional-workflow.ts'

const ALL = new Set(['continue', 'verify', 'sync-specs'])
const NONE = new Set<string>()

const UNRECOGNIZED = (at: string): string =>
  `Malformed optional-workflow conditional: unrecognized marker at '${at}'. Markers are ` +
  '[[opsx:if-workflow <id>]], [[opsx:else]] and [[opsx:end]].'
const OUT_OF_ORDER =
  'Malformed optional-workflow conditional: markers are out of order or a block is incomplete. ' +
  'Each block needs the full [[opsx:if-workflow <id>]] ... [[opsx:else]] ... [[opsx:end]] form, ' +
  'and blocks cannot nest.'
const UNRESOLVED = (reason: string, marker: string): string =>
  `${reason}: '${marker}' is unresolved. Optional-workflow blocks are resolved by ` +
  'getSkillTemplates()/getCommandTemplates() against the installed workflow set, and each ' +
  'needs the full [[opsx:if-workflow <id>]] ... [[opsx:else]] ... [[opsx:end]] form.'

describe('helper constructors', () => {
  test('optionalWorkflow spells the full if/else/end block', () => {
    expect(optionalWorkflow('continue', 'A', 'B')).toBe(
      '[[opsx:if-workflow continue]]A[[opsx:else]]B[[opsx:end]]',
    )
  })

  test('onlyWithWorkflow is an optionalWorkflow with an empty else branch', () => {
    expect(onlyWithWorkflow('verify', 'A')).toBe(
      '[[opsx:if-workflow verify]]A[[opsx:else]][[opsx:end]]',
    )
  })
})

describe('resolveOptionalWorkflows', () => {
  test('an inline block keeps the installed branch', () => {
    const text = `Next, ${optionalWorkflow('continue', 'run /cospec:continue', 'run cospec status')}.\n`
    expect(resolveOptionalWorkflows(text, ALL)).toBe('Next, run /cospec:continue.\n')
    expect(resolveOptionalWorkflows(text, NONE)).toBe('Next, run cospec status.\n')
  })

  test('a whole-line block with an empty branch takes its line with it', () => {
    const text = `| a | b |\n${onlyWithWorkflow('verify', '| /cospec:verify | check |')}\n| c | d |\n`
    expect(resolveOptionalWorkflows(text, NONE)).toBe('| a | b |\n| c | d |\n')
    expect(resolveOptionalWorkflows(text, ALL)).toBe(
      '| a | b |\n| /cospec:verify | check |\n| c | d |\n',
    )
  })

  test('a whole-line block keeps its indent and drops trailing blanks', () => {
    const text = `- one\n  ${onlyWithWorkflow('verify', '- nested')}  \n- two\n`
    expect(resolveOptionalWorkflows(text, ALL)).toBe('- one\n  - nested\n- two\n')
    expect(resolveOptionalWorkflows(text, NONE)).toBe('- one\n- two\n')
  })

  test('a whole-line block ending CRLF resolves to an LF line', () => {
    const text = `a\r\n${optionalWorkflow('verify', 'X', 'Y')}\r\nb\r\n`
    expect(resolveOptionalWorkflows(text, ALL)).toBe('a\r\nX\nb\r\n')
  })

  test('blank lines around a dropped line are preserved', () => {
    const text = `para\n\n${onlyWithWorkflow('verify', 'only')}\n\nnext\n`
    expect(resolveOptionalWorkflows(text, NONE)).toBe('para\n\n\nnext\n')
  })

  test('a block that is the final line with no newline resolves inline', () => {
    const text = `a\n${onlyWithWorkflow('verify', 'X')}`
    expect(resolveOptionalWorkflows(text, NONE)).toBe('a\n')
    expect(resolveOptionalWorkflows(text, ALL)).toBe('a\nX')
  })

  test('two blocks on one line resolve independently when text follows the last', () => {
    const text = `${optionalWorkflow('verify', 'V', 'v')} and ${optionalWorkflow('continue', 'C', 'c')}.\n`
    expect(resolveOptionalWorkflows(text, new Set(['continue']))).toBe('v and C.\n')
  })

  // Upstream's whole-line pattern is lazy up to the LAST `[[opsx:end]]` before the newline, so
  // a line that is exactly two blocks reads as one block spanning both. Ported as is; canon
  // authoring must not put two blocks alone on a line.
  test('a line that is exactly two blocks reads as one whole-line block', () => {
    const text = `${optionalWorkflow('verify', 'V', 'v')} and ${optionalWorkflow('continue', 'C', 'c')}\n`
    expect(resolveOptionalWorkflows(text, ALL)).toBe('V\n')
    expect(() => resolveOptionalWorkflows(text, new Set(['continue']))).toThrow(
      UNRESOLVED('Malformed optional-workflow conditional', '[[opsx:end'),
    )
  })

  test('a multi-line inline block keeps the chosen branch verbatim', () => {
    const text = 'x [[opsx:if-workflow verify]]one\ntwo[[opsx:else]]three\n[[opsx:end]] y\n'
    expect(resolveOptionalWorkflows(text, ALL)).toBe('x one\ntwo y\n')
    expect(resolveOptionalWorkflows(text, NONE)).toBe('x three\n y\n')
  })

  test('an id outside the installed set resolves to the else branch', () => {
    expect(resolveOptionalWorkflows(optionalWorkflow('no-such-workflow', 'A', 'B'), ALL)).toBe('B')
  })

  test('text with no markers passes through unchanged', () => {
    const text = 'plain /cospec:apply text\n'
    expect(resolveOptionalWorkflows(text, NONE)).toBe(text)
  })
})

describe('malformed conditionals', () => {
  test('an unrecognised marker quotes up to 40 characters of its line', () => {
    const text = 'see [[opsx:unless verify]] this line is long enough to be truncated here\n'
    expect(() => resolveOptionalWorkflows(text, ALL)).toThrow(
      UNRECOGNIZED('[[opsx:unless verify]] this line is long'),
    )
  })

  test('the quoted remainder stops at the end of its line', () => {
    expect(() => resolveOptionalWorkflows('[[opsx:x]]\nmore', ALL)).toThrow(
      UNRECOGNIZED('[[opsx:x]]'),
    )
  })

  test('an if marker with no id is unrecognised', () => {
    expect(() =>
      resolveOptionalWorkflows('[[opsx:if-workflow]]A[[opsx:else]]B[[opsx:end]]', ALL),
    ).toThrow(UNRECOGNIZED('[[opsx:if-workflow]]AB'))
  })

  test('an uppercase id is unrecognised', () => {
    expect(() =>
      resolveOptionalWorkflows('[[opsx:if-workflow Verify]]A[[opsx:else]]B[[opsx:end]]', ALL),
    ).toThrow(UNRECOGNIZED('[[opsx:if-workflow Verify]]AB'))
  })

  test('else before if is out of order', () => {
    expect(() =>
      resolveOptionalWorkflows('[[opsx:else]]A[[opsx:if-workflow verify]]B[[opsx:end]]', ALL),
    ).toThrow(OUT_OF_ORDER)
  })

  test('a block missing its end is incomplete', () => {
    expect(() =>
      resolveOptionalWorkflows('[[opsx:if-workflow verify]]A[[opsx:else]]B', ALL),
    ).toThrow(OUT_OF_ORDER)
  })

  test('a block missing its else is incomplete', () => {
    expect(() => resolveOptionalWorkflows('[[opsx:if-workflow verify]]A[[opsx:end]]', ALL)).toThrow(
      OUT_OF_ORDER,
    )
  })

  test('a nested block fails', () => {
    const text =
      '[[opsx:if-workflow verify]][[opsx:if-workflow continue]]A[[opsx:else]]B[[opsx:end]]' +
      '[[opsx:else]]C[[opsx:end]]'
    expect(() => resolveOptionalWorkflows(text, ALL)).toThrow(OUT_OF_ORDER)
  })

  test('a truncated block in the dropped branch fails for every installed set', () => {
    const text =
      '[[opsx:if-workflow verify]]keep[[opsx:else]]' +
      '[[opsx:if-workflow continue]]half[[opsx:else]][[opsx:end]]'
    for (const set of [ALL, NONE, new Set(['verify']), new Set(['continue'])]) {
      expect(() => resolveOptionalWorkflows(text, set)).toThrow(OUT_OF_ORDER)
    }
  })
})

describe('assertWorkflowConditionalsResolved', () => {
  test('passes text with no marker', () => {
    expect(() => assertWorkflowConditionalsResolved('clean\n', 'reason')).not.toThrow()
  })

  test('names the first residual marker and the reason', () => {
    expect(() =>
      assertWorkflowConditionalsResolved(
        'a [[opsx:else]] b [[opsx:end]]',
        'Malformed optional-workflow conditional',
      ),
    ).toThrow(UNRESOLVED('Malformed optional-workflow conditional', '[[opsx:else'))
  })

  test('the write-point reasons for a skill and a command', () => {
    const body = optionalWorkflow('verify', 'A', 'B')
    const skill =
      "Skill 'cospec-apply-change' was generated without resolving its optional-workflow blocks"
    const command = "Command 'apply' was generated without resolving its optional-workflow blocks"
    expect(() => assertWorkflowConditionalsResolved(body, skill)).toThrow(
      UNRESOLVED(skill, '[[opsx:if-workflow'),
    )
    expect(() => assertWorkflowConditionalsResolved(body, command)).toThrow(
      UNRESOLVED(command, '[[opsx:if-workflow'),
    )
  })
})
