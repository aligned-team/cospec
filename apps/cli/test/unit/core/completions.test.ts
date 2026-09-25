// `buildCompletionSpec` unit tests (ledger rows 3.2, 3.3). The completion
// spec, `--help` and the parser all read the same `COMMAND_TABLE` row, so this
// file checks two things: the spec matches the table directly (a regression
// tripwire per command), and the three surfaces — help, completion, parser —
// never drift apart (the three-way parity test, ledger 3.3).

import { describe, expect, test } from 'bun:test'

import { run } from '../../../src/cli.ts'
import {
  COMMAND_TABLE,
  GLOBAL_FLAGS,
  isPending,
  offeredFlags,
  parseCommandArgs,
  type TableCommandRow,
} from '../../../src/core/command-table.ts'
import { buildCompletionSpec, offeredFlagTokens } from '../../../src/core/completions/spec.ts'

/** Capture `run()`'s stdout for a `--help` invocation. */
async function helpOutput(command: string): Promise<string> {
  let out = ''
  const orig = process.stdout.write
  process.stdout.write = ((chunk: unknown): boolean => {
    out += typeof chunk === 'string' ? chunk : String(chunk)
    return true
  }) as typeof process.stdout.write
  try {
    await run([command, '--help'])
  } finally {
    process.stdout.write = orig
  }
  return out
}

describe('buildCompletionSpec — matches COMMAND_TABLE', () => {
  const spec = buildCompletionSpec()

  test('hidden commands (__complete, check-commit) are filtered out', () => {
    const names = spec.commands.map((c) => c.name)
    expect(names).not.toContain('__complete')
    expect(names).not.toContain('check-commit')
  })

  test('every non-hidden COMMAND_TABLE entry appears exactly once', () => {
    const visible = COMMAND_TABLE.filter((row) => !row.hidden).map((row) => row.name)
    const names = spec.commands.map((c) => c.name)
    expect(names.toSorted()).toEqual([...new Set(visible)].toSorted())
    expect(names.length).toBe(visible.length)
  })

  test('global flags include --json, --no-color, --cwd, --store, plus -V/--version', () => {
    for (const flag of ['--json', '--no-color', '--cwd', '--store'])
      expect(spec.globalFlags).toContain(flag)
    expect(spec.globalFlags).toContain('-V')
    expect(spec.globalFlags).toContain('--version')
    expect(spec.globalFlags).toEqual(offeredFlagTokens(GLOBAL_FLAGS).concat('-V', '--version'))
  })

  test('config: flags are just --scope', () => {
    const config = spec.commands.find((c) => c.name === 'config')!
    expect(config.flags).toEqual(['--scope'])
  })

  test('completion: no top-level flags (its own flags are all pending or on subcommands)', () => {
    const completion = spec.commands.find((c) => c.name === 'completion')!
    expect(completion.flags).toEqual([])
  })

  test('feedback: --body and --upstream', () => {
    const feedback = spec.commands.find((c) => c.name === 'feedback')!
    expect(feedback.flags).toEqual(['--body', '--upstream'])
  })

  test('instructions: --change and --allow-soft; pending --schema absent', () => {
    const instructions = spec.commands.find((c) => c.name === 'instructions')!
    expect(instructions.flags).toEqual(['--change', '--allow-soft'])
  })

  // Regression: the pre-table `show` help omitted `--diff` and mis-described
  // `--requirements-only`; the table row (and now completion) carries every
  // upstream flag, `--diff` and `--requirements` included.
  test('show: every handled flag, in table order, short before long', () => {
    const show = spec.commands.find((c) => c.name === 'show')!
    expect(show.flags).toEqual([
      '--type',
      '--no-interactive',
      '--deltas-only',
      '--requirements-only',
      '--diff',
      '--requirements',
      '--no-scenarios',
      '-r',
      '--requirement',
    ])
  })

  test('archive: handled flags plus the accepted no-op --yes; pending --no-validate absent', () => {
    const archive = spec.commands.find((c) => c.name === 'archive')!
    expect(archive.flags).toEqual(['--skip-specs', '--force-incomplete', '-y', '--yes'])
  })

  test('init: pending flags (--tools, --language, --profile, --copilot-cloud, …) absent', () => {
    const init = spec.commands.find((c) => c.name === 'init')!
    for (const flag of [
      '--tools',
      '--language',
      '--profile',
      '--copilot-cloud',
      '--no-copilot-cloud',
    ])
      expect(init.flags).not.toContain(flag)
    expect(init.flags).toContain('--no-animation')
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

describe('three-way parity: --help flags == completion flags == parser-accepted flags', () => {
  const spec = buildCompletionSpec()
  const visibleRows = COMMAND_TABLE.filter((row) => !row.hidden)

  for (const row of visibleRows) {
    test(`${row.name}: completion offers exactly the table's handled + no-op flags`, () => {
      const expectedLong = offeredFlags(row).map((flag) => flag.name)
      const completionCmd = spec.commands.find((c) => c.name === row.name)!
      const completionLong = completionCmd.flags.filter((token) => token.startsWith('--'))
      expect(completionLong).toEqual(expectedLong)
    })

    test(`${row.name}: --help lists every offered flag and no pending one`, async () => {
      const help = await helpOutput(row.name)
      for (const flag of offeredFlags(row)) expect(help).toContain(flag.name)
      const pendingFlags = row.flags.filter((flag) => isPending(flag.status))
      for (const flag of pendingFlags) expect(help).not.toContain(flag.name)
    })
  }

  // The parser only exists on `table` rows — a `forward` row hands its argv to
  // the wrapped binary untouched, so cospec never accepts or rejects it there.
  const tableRows = visibleRows.filter((row): row is TableCommandRow => row.parse === 'table')

  for (const row of tableRows) {
    test(`${row.name}: the parser accepts every offered flag and refuses every pending one`, () => {
      for (const flag of offeredFlags(row)) {
        const args = flag.takesValue === true ? [flag.name, 'x'] : [flag.name]
        const result = parseCommandArgs(row, args)
        expect(result.ok).toBe(true)
      }
      for (const flag of row.flags.filter((f) => isPending(f.status))) {
        const args = flag.takesValue === true ? [flag.name, 'x'] : [flag.name]
        const result = parseCommandArgs(row, args)
        expect(result.ok).toBe(false)
      }
    })
  }
})
