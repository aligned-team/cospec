// `cospec doctor` folds the wrapped `openspec doctor --json` call's stderr
// (change `passthrough-json-and-doctor`, ledger 14.1): one WARNING finding per
// non-blank line, each spelled through the remedies allowlist on its own.

import { describe, expect, test } from 'bun:test'

import * as doctor from '../../../src/commands/doctor.ts'

interface Finding {
  level: string
  check: string
  message: string
  remedy?: string
}

type Fold = (stderr: string, findings: Finding[]) => void

const fold = (doctor as unknown as Record<string, unknown>).foldWrappedStderr as Fold | undefined

describe('doctor folds the wrapped call stderr', () => {
  test.failing('each non-blank line is one WARNING finding, respelled', () => {
    const findings: Finding[] = []
    fold!(
      "Invalid 'context' field in config (must be string)\r\n\n" +
        'Pass --type change|spec, or use: openspec change show / openspec spec show\n' +
        "   \nSome 'references' entries are invalid, ignoring them\n",
      findings,
    )
    expect(findings).toEqual([
      {
        level: 'WARNING',
        check: 'openspec-stderr',
        message: "Invalid 'context' field in config (must be string)",
      },
      { level: 'WARNING', check: 'openspec-stderr', message: 'Pass --type change|spec.' },
      {
        level: 'WARNING',
        check: 'openspec-stderr',
        message: "Some 'references' entries are invalid, ignoring them",
      },
    ])
  })

  test.failing('an empty stderr adds nothing', () => {
    const findings: Finding[] = []
    fold!('', findings)
    expect(findings).toEqual([])
    expect(typeof fold).toBe('function')
  })
})
