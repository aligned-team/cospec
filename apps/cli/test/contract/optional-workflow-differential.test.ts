// cospec's optional-workflow resolver against the pinned binary's own
// (`core/templates/optional-workflow.js`, workflow-profiles design D6). The module is pure, so
// it is imported in-process: one matrix of well-formed and malformed texts and installed sets
// runs through both, and the outputs and thrown messages must be equal cell for cell.

import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { openspecPackageDir } from '../../src/core/openspec.ts'
import * as cospec from '../../src/harness/optional-workflow.ts'

type Module = typeof cospec

const upstream = (await import(
  join(openspecPackageDir(), 'dist/core/templates/optional-workflow.js')
)) as Module

const SETS: readonly (readonly string[])[] = [
  [],
  ['verify'],
  ['continue'],
  ['verify', 'continue', 'sync-specs'],
]

const IF = (id: string): string => `[[opsx:if-workflow ${id}]]`
const ELSE = '[[opsx:else]]'
const END = '[[opsx:end]]'

const TEXTS: readonly [string, string][] = [
  ['no markers', 'plain /cospec:apply text\n'],
  ['empty', ''],
  ['inline', `Next, ${IF('continue')}run /cospec:continue${ELSE}run cospec status${END}.\n`],
  ['whole line, empty else', `| a |\n${IF('verify')}| /cospec:verify |${ELSE}${END}\n| c |\n`],
  ['whole line, both branches', `${IF('verify')}yes${ELSE}no${END}\n`],
  ['whole line, indented, trailing blanks', `- a\n  ${IF('verify')}- b${ELSE}${END} \t\n- c\n`],
  ['whole line, CRLF', `a\r\n${IF('verify')}X${ELSE}Y${END}\r\nb\r\n`],
  ['whole line, empty if', `x\n${IF('verify')}${ELSE}fallback${END}\ny\n`],
  ['final line, no newline', `a\n${IF('verify')}X${ELSE}${END}`],
  ['blank lines around', `p\n\n${IF('verify')}only${ELSE}${END}\n\nq\n`],
  ['two on one line', `${IF('verify')}V${ELSE}v${END} and ${IF('continue')}C${ELSE}c${END}\n`],
  ['sequence of whole lines', `${IF('verify')}1${ELSE}${END}\n${IF('continue')}2${ELSE}${END}\n`],
  ['multi-line inline', `x ${IF('verify')}one\ntwo${ELSE}three\n${END} y\n`],
  ['unknown id', `${IF('no-such-workflow')}A${ELSE}B${END}\n`],
  ['sync-specs id', `${IF('sync-specs')}S${ELSE}s${END}\n`],
  ['unrecognised marker', 'see [[opsx:unless verify]] this line is long enough to be truncated\n'],
  ['unrecognised marker, short line', '[[opsx:x]]\nmore'],
  ['if with no id', `[[opsx:if-workflow]]A${ELSE}B${END}`],
  ['uppercase id', `[[opsx:if-workflow Verify]]A${ELSE}B${END}`],
  ['digit in id', `[[opsx:if-workflow v2]]A${ELSE}B${END}`],
  ['unterminated marker', '[[opsx:else]'],
  ['else before if', `${ELSE}A${IF('verify')}B${END}`],
  ['missing end', `${IF('verify')}A${ELSE}B`],
  ['missing else', `${IF('verify')}A${END}`],
  ['lone end', `text ${END}\n`],
  ['nested in if', `${IF('verify')}${IF('continue')}A${ELSE}B${END}${ELSE}C${END}`],
  ['truncated in else', `${IF('verify')}keep${ELSE}${IF('continue')}half${ELSE}${END}`],
  ['second block incomplete', `${IF('verify')}a${ELSE}b${END} ${IF('continue')}c${ELSE}d`],
]

type Outcome = { ok: string } | { error: string }

function run(fn: () => string): Outcome {
  try {
    return { ok: fn() }
  } catch (err) {
    if (!(err instanceof Error)) throw err
    return { error: err.message }
  }
}

describe('resolveOptionalWorkflows matches the pinned binary', () => {
  for (const [name, text] of TEXTS) {
    for (const set of SETS) {
      test(`${name} with {${set.join(', ')}}`, () => {
        const installed = new Set(set)
        expect(run(() => cospec.resolveOptionalWorkflows(text, installed))).toEqual(
          run(() => upstream.resolveOptionalWorkflows(text, installed)),
        )
      })
    }
  }
})

describe('assertWorkflowConditionalsResolved matches the pinned binary', () => {
  const reasons = [
    'Malformed optional-workflow conditional',
    "Skill 'cospec-apply-change' was generated without resolving its optional-workflow blocks",
    "Command 'apply' was generated without resolving its optional-workflow blocks",
  ]
  for (const [name, text] of TEXTS) {
    for (const reason of reasons) {
      test(`${name}: ${reason.split(' ')[0]}`, () => {
        const check = (m: Module): Outcome =>
          run(() => {
            m.assertWorkflowConditionalsResolved(text, reason)
            return text
          })
        expect(check(cospec)).toEqual(check(upstream))
      })
    }
  }
})

describe('the helper constructors match the pinned binary', () => {
  test('optionalWorkflow', () => {
    expect(cospec.optionalWorkflow('continue', 'A', 'B')).toBe(
      upstream.optionalWorkflow('continue', 'A', 'B'),
    )
  })

  test('onlyWithWorkflow', () => {
    expect(cospec.onlyWithWorkflow('verify', 'A')).toBe(upstream.onlyWithWorkflow('verify', 'A'))
  })
})
