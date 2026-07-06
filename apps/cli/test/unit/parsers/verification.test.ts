import { describe, expect, test } from 'bun:test'

import {
  computeVerificationVerdict,
  CORE_LAYERS,
  defaultOwner,
  isKnownLayer,
  parseVerification,
} from '../../../src/core/verification.ts'

describe('parseVerification — groups', () => {
  test('parses a group heading and its rows', () => {
    const p = parseVerification(
      ['## 1. Login works', '- [ ] 1.1 @e2e (agent) drive the flow -> lands on /home'].join('\n'),
    )
    expect(p.groups).toHaveLength(1)
    expect(p.groups[0]!.num).toBe(1)
    expect(p.groups[0]!.title).toBe('Login works')
    expect(p.groups[0]!.critical).toBe(false)
    expect(p.groups[0]!.rows).toHaveLength(1)
    expect(p.rows).toHaveLength(1)
  })

  test('detects and strips a trailing [critical] marker', () => {
    const p = parseVerification(
      '## 2. Payment settles [critical]\n- [ ] 2.1 @integration hit stripe -> 200',
    )
    expect(p.groups[0]!.critical).toBe(true)
    expect(p.groups[0]!.title).toBe('Payment settles')
  })

  test('ignores rows inside a fenced code block', () => {
    const p = parseVerification(
      ['## 1. G', '```', '- [ ] 1.1 @unit not a real row -> x', '```'].join('\n'),
    )
    expect(p.rows).toHaveLength(0)
    expect(p.malformed).toHaveLength(0)
  })
})

describe('parseVerification — rows', () => {
  test('captures state, number, layer, owner, probe, result', () => {
    const p = parseVerification(
      '## 1. G\n- [x] 1.2 @integration (agent) call the real API -> HTTP 200 observed',
    )
    const row = p.rows[0]!
    expect(row.state).toBe('verified')
    expect(row.group).toBe(1)
    expect(row.index).toBe(2)
    expect(row.layer).toBe('integration')
    expect(row.ownerRaw).toBe('agent')
    expect(row.owner).toBe('agent')
    expect(row.probe).toBe('call the real API')
    expect(row.result).toBe('HTTP 200 observed')
  })

  test('planned and deferred states parse', () => {
    const p = parseVerification(
      [
        '## 1. G',
        '- [ ] 1.1 @unit run tests -> expected pass',
        '- [~] 1.2 @e2e skip -> defer: flaky harness',
      ].join('\n'),
    )
    expect(p.rows[0]!.state).toBe('planned')
    expect(p.rows[1]!.state).toBe('deferred')
    expect(p.rows[1]!.deferReason).toBe('flaky harness')
  })

  test('a deferred row with an empty reason records an empty deferReason', () => {
    const p = parseVerification('## 1. G\n- [~] 1.1 @unit run -> defer:')
    expect(p.rows[0]!.deferReason).toBe('')
  })

  test('owner defaults by layer when omitted', () => {
    const p = parseVerification(
      [
        '## 1. G',
        '- [ ] 1.1 @manual click the button -> it toggles',
        '- [ ] 1.2 @unit run -> pass',
      ].join('\n'),
    )
    expect(p.rows[0]!.owner).toBe('human')
    expect(p.rows[0]!.ownerRaw).toBeUndefined()
    expect(p.rows[1]!.owner).toBe('agent')
  })

  test('an @manual or (human) row is flagged CI-uncatchable', () => {
    const p = parseVerification(
      [
        '## 1. G',
        '- [ ] 1.1 @manual click -> toggles',
        '- [ ] 1.2 @e2e (human) inspect -> looks right',
        '- [ ] 1.3 @unit run -> pass',
      ].join('\n'),
    )
    expect(p.rows[0]!.ciUncatchable).toBe(true) // @manual
    expect(p.rows[1]!.ciUncatchable).toBe(true) // (human)
    expect(p.rows[2]!.ciUncatchable).toBe(false)
  })

  test('preserves an unknown owner token for the rule layer to reject', () => {
    const p = parseVerification('## 1. G\n- [ ] 1.1 @unit (bot) run -> pass')
    expect(p.rows[0]!.ownerRaw).toBe('bot')
    expect(p.rows[0]!.owner).toBe('agent') // defaulted by layer
  })

  test('preserves an unknown layer token for the rule layer to reject', () => {
    const p = parseVerification('## 1. G\n- [ ] 1.1 @smoke run -> pass')
    expect(p.rows[0]!.layer).toBe('smoke')
    expect(p.malformed).toHaveLength(0)
  })
})

describe('parseVerification — grammar violations', () => {
  test('a checkbox-like line without the row shape is malformed', () => {
    const p = parseVerification('## 1. G\n- [ ] no numbering here')
    expect(p.rows).toHaveLength(0)
    expect(p.malformed).toHaveLength(1)
  })

  test('a row missing the ` -> ` separator is malformed', () => {
    const p = parseVerification('## 1. G\n- [ ] 1.1 @unit run the tests')
    expect(p.malformed).toHaveLength(1)
  })

  test('a row with no layer is malformed', () => {
    const p = parseVerification('## 1. G\n- [ ] 1.1 run the tests -> pass')
    expect(p.malformed).toHaveLength(1)
  })

  test('a row with an empty probe is malformed', () => {
    const p = parseVerification('## 1. G\n- [ ] 1.1 @unit -> pass')
    expect(p.malformed).toHaveLength(1)
  })

  test('an indented prose-wrap continuation after a row is rejected, not silently dropped', () => {
    // oxfmt hard-wraps a >printWidth row onto an indented continuation line;
    // the parser must flag it (row-grammar) so the evidence is never truncated.
    const p = parseVerification(
      [
        '## 1. G',
        '- [x] 1.1 @e2e drive it -> observed a very long evidence string that',
        '      wraps onto a second physical line and would otherwise be dropped',
      ].join('\n'),
    )
    expect(p.rows).toHaveLength(1)
    expect(p.rows[0]!.result).toBe('observed a very long evidence string that')
    expect(p.malformed).toHaveLength(1)
    expect(p.malformed[0]!.line).toBe(3)
  })

  test('unindented prose between rows is not treated as a continuation', () => {
    const p = parseVerification(
      ['## 1. G', '- [x] 1.1 @e2e drive it -> observed', 'A note at column zero.'].join('\n'),
    )
    expect(p.rows).toHaveLength(1)
    expect(p.malformed).toHaveLength(0)
  })
})

describe('parseVerification — line endings', () => {
  test('CRLF content parses identically to LF', () => {
    const rows = ['## 1. G', '- [ ] 1.1 @unit run -> pass', '- [x] 1.2 @e2e drive -> observed']
    const lf = parseVerification(rows.join('\n'))
    const crlf = parseVerification(rows.join('\r\n'))
    expect(crlf.rows).toHaveLength(2)
    expect(crlf.malformed).toHaveLength(0)
    expect(crlf.rows.map((r) => r.result)).toEqual(lf.rows.map((r) => r.result))
    expect(crlf.groups[0]!.rows).toHaveLength(2)
  })
})

describe('layer helpers', () => {
  test('the nine core layers are known', () => {
    for (const layer of CORE_LAYERS) expect(isKnownLayer(layer)).toBe(true)
    expect(CORE_LAYERS).toHaveLength(9)
  })

  test('an unknown token is rejected unless project-extended', () => {
    expect(isKnownLayer('smoke')).toBe(false)
    expect(isKnownLayer('smoke', ['smoke'])).toBe(true)
  })

  test('defaultOwner maps @manual to human, everything else to agent', () => {
    expect(defaultOwner('manual')).toBe('human')
    expect(defaultOwner('e2e')).toBe('agent')
  })
})

describe('computeVerificationVerdict (DESIGN §3.6 status --json block)', () => {
  test('a not-declared type reports the empty verdict', () => {
    expect(computeVerificationVerdict(false, undefined)).toEqual({
      declared: false,
      total: 0,
      verified: 0,
      deferred: 0,
      unresolved: 0,
      ciUncatchable: 0,
      blockedReasons: [],
    })
  })

  test('a declared type with no file yet is blocked with a named reason', () => {
    const v = computeVerificationVerdict(true, undefined)
    expect(v.declared).toBe(true)
    expect(v.blockedReasons).toEqual(['verification.md is not created yet'])
  })

  test('tallies verified/deferred/unresolved and flags CI-uncatchable rows', () => {
    const text = [
      '## 1. G [critical]',
      '- [x] 1.1 @e2e drive it -> observed the flow',
      '- [~] 1.2 @manual click it -> defer: no browser in CI',
      '- [ ] 1.3 @unit run it -> expected',
    ].join('\n')
    const v = computeVerificationVerdict(true, text)
    expect(v).toMatchObject({
      declared: true,
      total: 3,
      verified: 1,
      deferred: 1,
      unresolved: 1,
      ciUncatchable: 1,
    })
    expect(v.blockedReasons).toEqual(['1 row(s) still unresolved (bare [ ])'])
  })

  test('a fully resolved ledger has no blocked reasons', () => {
    const text = [
      '## 1. G',
      '- [x] 1.1 @e2e drive it -> observed',
      '- [~] 1.2 @manual click it -> defer: no browser in CI',
    ].join('\n')
    expect(computeVerificationVerdict(true, text).blockedReasons).toEqual([])
  })
})
