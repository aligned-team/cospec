// `buildCompletionSpec` unit tests (ledger rows 3.2, 3.3). The completion
// spec, `--help` and the parser all read the same `COMMAND_TABLE` row, so this
// file checks two things: the spec matches the table directly (a regression
// tripwire per command), and the three surfaces — help, completion, parser —
// never drift apart (the three-way parity test, ledger 3.3).

import { describe, expect, test } from 'bun:test'

import { commandHelpText, run } from '../../../src/cli.ts'
import {
  COMMAND_TABLE,
  GLOBAL_FLAGS,
  isPending,
  offeredFlags,
  parseCommandArgs,
  rowGlobalFlags,
  type TableCommandRow,
} from '../../../src/core/command-table.ts'
import { renderBashCompletion } from '../../../src/core/completions/bash.ts'
import { renderFishCompletion } from '../../../src/core/completions/fish.ts'
import { buildCompletionSpec, offeredFlagTokens } from '../../../src/core/completions/spec.ts'
import { renderZshCompletion } from '../../../src/core/completions/zsh.ts'

/** Capture `run()`'s stdout for a `--help` invocation. */
async function helpOutput(command: string): Promise<string> {
  // Commander's help command answers `help --help` with the program's help,
  // so the `help` row's own screen is read from the renderer directly.
  const row = COMMAND_TABLE.find((r) => r.name === command)
  if (row?.parse === 'table' && row.operands === 'lenient') return commandHelpText(row)
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

  test('instructions: --change, --allow-soft and --schema', () => {
    const instructions = spec.commands.find((c) => c.name === 'instructions')!
    expect(instructions.flags).toEqual(['--change', '--allow-soft', '--schema'])
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

  test('archive: handled flags plus the accepted no-op --yes', () => {
    const archive = spec.commands.find((c) => c.name === 'archive')!
    expect(archive.flags).toEqual([
      '--skip-specs',
      '--force-incomplete',
      '-y',
      '--yes',
      '--no-validate',
    ])
  })

  test('init: pending flags (--language, --profile, --copilot-cloud, …) absent', () => {
    const init = spec.commands.find((c) => c.name === 'init')!
    for (const flag of ['--language', '--profile', '--copilot-cloud', '--no-copilot-cloud'])
      expect(init.flags).not.toContain(flag)
    expect(init.flags).toContain('--no-animation')
    // An alias flag completes like any offered flag.
    expect(init.flags).toContain('--tools')
  })

  test('dynamic positionals: new→types, show→changes+specs, archive→changes', () => {
    expect(spec.commands.find((c) => c.name === 'new')!.positional).toEqual(['types'])
    expect(spec.commands.find((c) => c.name === 'show')!.positional).toEqual(['changes', 'specs'])
    expect(spec.commands.find((c) => c.name === 'archive')!.positional).toEqual(['changes'])
    expect(spec.commands.find((c) => c.name === 'config')!.positional).toEqual([])
  })

  test('dynamic flag values: --change completes to changes, every --schema to schemas', () => {
    expect(spec.commands.find((c) => c.name === 'status')!.flagValues).toEqual({
      '--change': 'changes',
      '--schema': 'schemas',
    })
    expect(spec.commands.find((c) => c.name === 'instructions')!.flagValues).toEqual({
      '--change': 'changes',
      '--schema': 'schemas',
    })
    expect(spec.commands.find((c) => c.name === 'templates')!.flagValues).toEqual({
      '--schema': 'schemas',
    })
    const declaring = spec.commands.filter((c) => c.flags.includes('--schema')).map((c) => c.name)
    expect(
      spec.commands.filter((c) => c.flagValues['--schema'] === 'schemas').map((c) => c.name),
    ).toEqual(declaring)
  })

  test('schema which|validate|fork complete their first positional from schemas', () => {
    expect(spec.commands.find((c) => c.name === 'schema')!.subcommandPositional).toEqual({
      which: ['schemas'],
      validate: ['schemas'],
      fork: ['schemas'],
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

    test(`${row.name}: completion and --help offer exactly the globals the row accepts`, async () => {
      const accepted = rowGlobalFlags(row).map((flag) => flag.name)
      const completionCmd = spec.commands.find((c) => c.name === row.name)!
      expect(completionCmd.globalFlags.filter((t) => t.startsWith('--'))).toEqual([
        ...accepted,
        '--version',
      ])
      const help = await helpOutput(row.name)
      expect(help.includes('--store <id>')).toBe(accepted.includes('--store'))
    })

    test(`${row.name}: --help lists every offered flag and no pending one`, async () => {
      const help = await helpOutput(row.name)
      for (const flag of offeredFlags(row)) expect(help).toContain(flag.name)
      const pendingFlags = row.flags.filter((flag) => isPending(flag.status))
      for (const flag of pendingFlags) expect(help).not.toContain(flag.name)
    })
  }

  test('a row that refuses --store is offered none after its name, in every shell', () => {
    expect(spec.commands.find((c) => c.name === 'init')!.globalFlags).not.toContain('--store')
    expect(spec.commands.find((c) => c.name === 'list')!.globalFlags).toContain('--store')
    expect(spec.globalFlags).toContain('--store')
    expect(renderBashCompletion(spec)).toMatch(/ {4}init\)\n {6}globals='[^']*'/)
    expect(renderZshCompletion(spec)).toMatch(/ {4}init\)\n {6}global_flags=\(/)
    expect(renderFishCompletion(spec)).toContain(
      "complete -c cospec -n 'not __fish_seen_subcommand_from init update completion feedback help' -l store",
    )
  })

  // The parser only exists on `table` rows — a `forward` row hands its argv to
  // the wrapped binary untouched, so cospec never accepts or rejects it there.
  const tableRows = visibleRows.filter((row): row is TableCommandRow => row.parse === 'table')

  for (const row of tableRows) {
    test(`${row.name}: the parser accepts every offered flag and refuses every pending one`, () => {
      // Each required positional filled, so a refusal can only be the flag's.
      const required = row.positionals.filter((p) => p.required).map(() => 'x')
      for (const flag of offeredFlags(row)) {
        const args = [...required, ...(flag.takesValue === true ? [flag.name, 'x'] : [flag.name])]
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
