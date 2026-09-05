// Pure argv-shaping unit tests for `cospec config` (DESIGN §1.3, ledger row 1.1
// + 1.2). Every assertion here maps to a verified constraint from the design:
//   - `--scope` is a parent-command option, hoisted to sit between `config`
//     and the subcommand, wherever it was typed.
//   - `--no-color` is NEVER appended (core/openspec.ts already prefixes it
//     before the subcommand on every wrapped spawn — see the module header of
//     commands/config.ts).
//   - `root.storeArgs` is never threaded through at all — `config` is
//     machine-global and has no store dimension.
//   - `--json` is appended only for `list`.
// isHandoverCall and precedenceNotes are exercised directly since they drive
// the Class A/B split and the two stderr notes.

import { describe, expect, test } from 'bun:test'

import {
  CONFIG_SUBCOMMANDS,
  isHandoverCall,
  planConfigCall,
  precedenceNotes,
} from '../../../src/commands/config.ts'

describe('planConfigCall — --scope hoisting', () => {
  test('bare form: --scope <value> anywhere is lifted to position 2', () => {
    const plan = planConfigCall(['list', '--scope', 'global'], { json: false })
    if (plan.kind !== 'pass') throw new Error(`expected pass, got ${plan.kind}`)
    expect(plan.argv).toEqual(['config', '--scope', 'global', 'list'])
  })

  test('--scope precedes the subcommand in the source args too', () => {
    const plan = planConfigCall(['--scope', 'global', 'get', 'profile'], { json: false })
    if (plan.kind !== 'pass') throw new Error(`expected pass, got ${plan.kind}`)
    expect(plan.argv).toEqual(['config', '--scope', 'global', 'get', 'profile'])
  })

  test('--scope=value form is parsed and re-emitted as two tokens', () => {
    const plan = planConfigCall(['get', 'profile', '--scope=global'], { json: false })
    if (plan.kind !== 'pass') throw new Error(`expected pass, got ${plan.kind}`)
    expect(plan.argv).toEqual(['config', '--scope', 'global', 'get', 'profile'])
  })

  test('any scope value but "global" is passed through verbatim — cospec never second-guesses it', () => {
    const plan = planConfigCall(['list', '--scope', 'project'], { json: false })
    if (plan.kind !== 'pass') throw new Error(`expected pass, got ${plan.kind}`)
    expect(plan.argv).toEqual(['config', '--scope', 'project', 'list'])
  })

  test('--scope with no value is a cospec-side error, not a wrapped spawn', () => {
    const plan = planConfigCall(['list', '--scope'], { json: false })
    expect(plan.kind).toBe('error')
    if (plan.kind === 'error') expect(plan.message).toContain('--scope requires a value')
  })

  test('no --scope at all: subcommand stays first after "config"', () => {
    const plan = planConfigCall(['path'], { json: false })
    if (plan.kind !== 'pass') throw new Error(`expected pass, got ${plan.kind}`)
    expect(plan.argv).toEqual(['config', 'path'])
  })
})

describe('planConfigCall — --no-color and storeArgs are never threaded', () => {
  test('no built argv ever contains --no-color, across every subcommand', () => {
    for (const sub of CONFIG_SUBCOMMANDS) {
      const plan = planConfigCall([sub], { json: false })
      if (plan.kind === 'error') continue
      expect(plan.argv).not.toContain('--no-color')
    }
  })

  test('planConfigCall accepts no root/storeArgs parameter at all (signature proof)', () => {
    // Two-arg signature only: (args, { json }). If a third `root`/`storeArgs`
    // parameter were ever added back, this call would need updating —
    // guarding against a silent re-introduction of `root.storeArgs`.
    expect(planConfigCall.length).toBe(2)
  })
})

describe('planConfigCall — --json is appended only for list', () => {
  test('list --json appends --json', () => {
    const plan = planConfigCall(['list'], { json: true })
    if (plan.kind !== 'pass') throw new Error(`expected pass, got ${plan.kind}`)
    expect(plan.argv).toEqual(['config', 'list', '--json'])
  })

  for (const sub of CONFIG_SUBCOMMANDS.filter((s) => s !== 'list')) {
    test(`${sub} --json does NOT append --json to the wrapped argv`, () => {
      const args = sub === 'get' || sub === 'set' || sub === 'unset' ? [sub, 'someKey'] : [sub]
      const plan = planConfigCall(args, { json: true })
      if (plan.kind === 'error') return
      expect(plan.argv).not.toContain('--json')
    })
  }
})

describe('planConfigCall — subcommand validation', () => {
  test('missing subcommand is a usage error naming all eight subcommands', () => {
    const plan = planConfigCall([], { json: false })
    expect(plan.kind).toBe('error')
    if (plan.kind === 'error') {
      for (const sub of CONFIG_SUBCOMMANDS) expect(plan.message).toContain(sub)
    }
  })

  test('unknown subcommand is a usage error, not a wrapped spawn', () => {
    const plan = planConfigCall(['frobnicate'], { json: false })
    expect(plan.kind).toBe('error')
    if (plan.kind === 'error') expect(plan.message).toContain("unknown subcommand 'frobnicate'")
  })

  test('every declared subcommand plans successfully with no extra args', () => {
    for (const sub of CONFIG_SUBCOMMANDS) {
      const plan = planConfigCall([sub], { json: false })
      expect(plan.kind).not.toBe('error')
    }
  })
})

describe('isHandoverCall — Class A/B split', () => {
  test('edit is always a handover', () => {
    expect(isHandoverCall('edit', [])).toBe(true)
  })

  test('profile with no preset is a handover (interactive menu)', () => {
    expect(isHandoverCall('profile', [])).toBe(true)
  })

  test('profile with a preset positional is piped', () => {
    expect(isHandoverCall('profile', ['core'])).toBe(false)
  })

  test('reset --all with neither -y nor --yes is a handover (inquirer confirm)', () => {
    expect(isHandoverCall('reset', ['--all'])).toBe(true)
  })

  test('reset --all -y is piped', () => {
    expect(isHandoverCall('reset', ['--all', '-y'])).toBe(false)
  })

  test('reset --all --yes is piped', () => {
    expect(isHandoverCall('reset', ['--all', '--yes'])).toBe(false)
  })

  test('reset with no --all is piped (upstream usage error, no prompt)', () => {
    expect(isHandoverCall('reset', [])).toBe(false)
  })

  test('every other subcommand is always piped', () => {
    for (const sub of ['path', 'list', 'get', 'set', 'unset'] as const) {
      expect(isHandoverCall(sub, [])).toBe(false)
    }
  })
})

describe('planConfigCall — kind reflects the handover class', () => {
  test('config edit plans as a handover call', () => {
    const plan = planConfigCall(['edit'], { json: false })
    if (plan.kind === 'error') throw new Error('expected a plan')
    expect(plan.kind).toBe('handover')
  })

  test('config get some.key plans as a piped call', () => {
    const plan = planConfigCall(['get', 'some.key'], { json: false })
    if (plan.kind === 'error') throw new Error('expected a plan')
    expect(plan.kind).toBe('pass')
  })
})

describe('precedenceNotes — the two forced-override notes', () => {
  test('set telemetry.enabled true prints the telemetry-override note', () => {
    const notes = precedenceNotes('set', ['telemetry.enabled', 'true'])
    expect(notes.some((n) => n.includes('OPENSPEC_TELEMETRY=0'))).toBe(true)
  })

  test('set profile <preset> prints the harness-canon note', () => {
    const notes = precedenceNotes('set', ['profile', 'core'])
    expect(notes.some((n) => n.includes("run 'cospec update'"))).toBe(true)
  })

  test('set workflows / set delivery also print the harness-canon note', () => {
    expect(precedenceNotes('set', ['workflows', 'x']).length).toBeGreaterThan(0)
    expect(precedenceNotes('set', ['delivery', 'x']).length).toBeGreaterThan(0)
  })

  test('the `profile` subcommand itself (Class B) prints the harness-canon note', () => {
    const notes = precedenceNotes('profile', ['core'])
    expect(notes.some((n) => n.includes("run 'cospec update'"))).toBe(true)
  })

  test('an unrelated key gets no notes', () => {
    expect(precedenceNotes('set', ['defaultStore', 'x'])).toEqual([])
  })

  test('a non-set subcommand with an unrelated sub gets no notes', () => {
    expect(precedenceNotes('path', [])).toEqual([])
    expect(precedenceNotes('get', ['telemetry.enabled'])).toEqual([])
  })
})
