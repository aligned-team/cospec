// `extractFlags`/`buildCompletionSpec` unit tests (DESIGN §2.2, ledger row
// 2.1). `extractFlags` is the one fragile part of the completion generator — a
// regex over a pre-formatted help string — so it gets both a targeted, hand-
// crafted-input suite and a snapshot check against cospec's REAL `COMMANDS`
// table: a command or flag added to `cli.ts` that the extractor cannot parse
// must fail here, not silently vanish from completion.

import { describe, expect, test } from 'bun:test'

import { COMMANDS, GLOBAL_OPTIONS } from '../../../src/cli.ts'
import { buildCompletionSpec, extractFlags } from '../../../src/core/completions/spec.ts'

describe('extractFlags — hand-crafted inputs', () => {
  test('undefined options → no flags', () => {
    expect(extractFlags(undefined)).toEqual([])
  })

  test('a single long flag with a value placeholder', () => {
    expect(extractFlags('  --change <slug>   The change to report on')).toEqual(['--change'])
  })

  test('multiple flags on one line, comma-separated (short + long alias)', () => {
    expect(extractFlags('  -r, --requirement <id>   Show a single requirement')).toEqual([
      '-r',
      '--requirement',
    ])
  })

  test('a prose continuation line contributes nothing, even mentioning a flag', () => {
    const options = `  --change <slug>   Required
  artifacts: proposal, blocking-changes, specs (mentions --allow-soft in prose)`
    expect(extractFlags(options)).toEqual(['--change'])
  })

  test('a parenthetical note line contributes nothing', () => {
    const options = `  --scope <scope>   Config scope
  (config is machine-global: --store never applies)`
    expect(extractFlags(options)).toEqual(['--scope'])
  })

  test('a bracketed placeholder is consumed the same as an angle-bracketed one', () => {
    expect(extractFlags('  --harness [list]   claude,codex,opencode')).toEqual(['--harness'])
  })

  test('duplicate flags across lines are de-duplicated, first occurrence order kept', () => {
    const options = `  --force   Overwrite conflicting managed files
  --force   (repeated by mistake)`
    expect(extractFlags(options)).toEqual(['--force'])
  })

  test('a --no-color style negated long flag is still one token', () => {
    expect(extractFlags('  --no-color     Disable ANSI color')).toEqual(['--no-color'])
  })
})

describe('buildCompletionSpec — snapshot against the REAL COMMANDS table', () => {
  const spec = buildCompletionSpec()

  test('hidden commands (__complete, check-commit) are filtered out', () => {
    const names = spec.commands.map((c) => c.name)
    expect(names).not.toContain('__complete')
    expect(names).not.toContain('check-commit')
  })

  test('every non-hidden COMMANDS entry appears exactly once', () => {
    const visible = COMMANDS.filter((c) => c.hidden !== true).map((c) => c.name)
    const names = spec.commands.map((c) => c.name)
    expect(names.toSorted()).toEqual([...new Set(visible)].toSorted())
    expect(names.length).toBe(visible.length)
  })

  test('global flags include --json, --no-color, --cwd, --store from GLOBAL_OPTIONS, plus -V/--version', () => {
    for (const flag of ['--json', '--no-color', '--cwd', '--store'])
      expect(spec.globalFlags).toContain(flag)
    expect(spec.globalFlags).toContain('-V')
    expect(spec.globalFlags).toContain('--version')
    expect(extractFlags(GLOBAL_OPTIONS).length).toBeGreaterThan(0)
  })

  test('config: flags are just --scope (the parenthetical note is not a flag)', () => {
    const config = spec.commands.find((c) => c.name === 'config')!
    expect(config.flags).toEqual(['--scope'])
  })

  test('completion: no flags at all (its options line is a parenthetical note)', () => {
    const completion = spec.commands.find((c) => c.name === 'completion')!
    expect(completion.flags).toEqual([])
  })

  test('feedback: --body and --upstream', () => {
    const feedback = spec.commands.find((c) => c.name === 'feedback')!
    expect(feedback.flags).toEqual(['--body', '--upstream'])
  })

  test('instructions: only --change and --allow-soft, never a token from the artifacts prose', () => {
    const instructions = spec.commands.find((c) => c.name === 'instructions')!
    expect(instructions.flags).toEqual(['--change', '--allow-soft'])
  })

  test('show: -r/--requirement extracted alongside the rest, in declared order', () => {
    const show = spec.commands.find((c) => c.name === 'show')!
    expect(show.flags).toEqual([
      '--type',
      '--deltas-only',
      '--requirements-only',
      '-r',
      '--requirement',
      '--no-scenarios',
    ])
  })

  test('dynamic positionals: new→types, show→changes+specs, archive→changes', () => {
    expect(spec.commands.find((c) => c.name === 'new')!.positional).toEqual(['types'])
    expect(spec.commands.find((c) => c.name === 'show')!.positional).toEqual(['changes', 'specs'])
    expect(spec.commands.find((c) => c.name === 'archive')!.positional).toEqual(['changes'])
    expect(spec.commands.find((c) => c.name === 'config')!.positional).toEqual([])
  })

  test('dynamic flag values: status --change and instructions --change complete to changes', () => {
    expect(spec.commands.find((c) => c.name === 'status')!.flagValues).toEqual({
      '--change': 'changes',
    })
    expect(spec.commands.find((c) => c.name === 'instructions')!.flagValues).toEqual({
      '--change': 'changes',
    })
  })
})
