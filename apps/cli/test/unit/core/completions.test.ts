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
import { renderPowerShellCompletion } from '../../../src/core/completions/powershell.ts'
import { buildCompletionSpec, offeredFlagTokens } from '../../../src/core/completions/spec.ts'
import { renderZshCompletion } from '../../../src/core/completions/zsh.ts'
import { commandBlock, commandFlags } from './powershell-script.ts'

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

  test('init: pending flags (--language, --profile) absent, the Copilot cloud pair offered', () => {
    const init = spec.commands.find((c) => c.name === 'init')!
    for (const flag of ['--language', '--profile']) expect(init.flags).not.toContain(flag)
    for (const flag of ['--copilot-cloud', '--no-copilot-cloud']) expect(init.flags).toContain(flag)
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

describe('buildCompletionSpec: tooltips, subcommands and value sets (PowerShell needs them)', () => {
  const spec = buildCompletionSpec()

  test('every offered flag token has the table description, short and long alike', () => {
    for (const row of COMMAND_TABLE.filter((r) => !r.hidden)) {
      const command = spec.commands.find((c) => c.name === row.name)!
      expect(Object.keys(command.flagInfo).toSorted()).toEqual(command.flags.toSorted())
      for (const flag of offeredFlags(row)) {
        const long = command.flagInfo[flag.name]!
        expect(long).toEqual({
          description: flag.description,
          takesValue: flag.takesValue === true,
        })
        if (flag.short !== undefined) expect(command.flagInfo[flag.short]).toEqual(long)
      }
    }
  })

  test('a pending or hidden flag has no entry', () => {
    for (const row of COMMAND_TABLE.filter((r) => !r.hidden)) {
      const command = spec.commands.find((c) => c.name === row.name)!
      for (const flag of row.flags.filter((f) => isPending(f.status) || f.hidden === true))
        expect(command.flagInfo).not.toHaveProperty(flag.name)
    }
  })

  test('the globals have descriptions, -V and --version included', () => {
    expect(Object.keys(spec.globalFlagInfo).toSorted()).toEqual(spec.globalFlags.toSorted())
    for (const flag of offeredFlags({ flags: GLOBAL_FLAGS }))
      expect(spec.globalFlagInfo[flag.name]).toEqual({
        description: flag.description,
        takesValue: flag.takesValue === true,
      })
    expect(spec.globalFlagInfo['-V']).toEqual({ description: 'Show version', takesValue: false })
    expect(spec.globalFlagInfo['--version']).toEqual({
      description: 'Show version',
      takesValue: false,
    })
    expect(spec.globalFlagInfo['--cwd']!.takesValue).toBe(true)
  })

  test('each command lists its non-pending subcommands with their offered flags', () => {
    for (const row of COMMAND_TABLE.filter((r) => !r.hidden)) {
      const command = spec.commands.find((c) => c.name === row.name)!
      const offered = (row.subcommands ?? []).filter((sub) => !isPending(sub.status))
      expect(command.subcommands.map((sub) => sub.name)).toEqual(offered.map((sub) => sub.name))
      for (const sub of offered) {
        const model = command.subcommands.find((s) => s.name === sub.name)!
        expect(model.summary).toBe(sub.summary)
        expect(model.flags).toEqual(offeredFlagTokens(sub.flags))
        expect(Object.keys(model.flagInfo).toSorted()).toEqual(model.flags.toSorted())
      }
    }
  })

  test('schema offers which, validate and fork among its subcommands', () => {
    const names = spec.commands.find((c) => c.name === 'schema')!.subcommands.map((s) => s.name)
    for (const name of ['which', 'validate', 'fork']) expect(names).toContain(name)
  })

  test("a positional's closed value set is the table's, unless pending", () => {
    for (const row of COMMAND_TABLE.filter((r) => !r.hidden)) {
      const command = spec.commands.find((c) => c.name === row.name)!
      const first = row.positionals[0]
      expect(command.choices).toEqual(
        first === undefined || isPending(first.status) ? [] : [...(first.values ?? [])],
      )
    }
    expect(spec.commands.find((c) => c.name === 'new')!.choices).toEqual([])
    const completion = COMMAND_TABLE.find((r) => r.name === 'completion')!
    expect(spec.commands.find((c) => c.name === 'completion')!.choices).toEqual([
      ...(completion.positionals[0]!.values ?? []),
    ])
    for (const pendingValue of Object.keys(completion.positionals[0]!.pendingValues ?? {}))
      expect(spec.commands.find((c) => c.name === 'completion')!.choices).not.toContain(
        pendingValue,
      )
  })

  test('the generate subcommand shares the shell value set', () => {
    const completion = spec.commands.find((c) => c.name === 'completion')!
    expect(completion.subcommands.find((s) => s.name === 'generate')!.choices).toEqual(
      completion.choices,
    )
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
      // The PowerShell script offers the same flags: its block's flags, minus
      // the globals it appends, are the table's offered tokens.
      const block = commandBlock(renderPowerShellCompletion(spec), row.name)!
      const own = commandFlags(block)
        .map((flag) => flag.name)
        .filter(
          (name) => !completionCmd.globalFlags.includes(name) || completionCmd.flags.includes(name),
        )
      expect(own.filter((name) => name.startsWith('--'))).toEqual(expectedLong)
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
    const powershell = renderPowerShellCompletion(spec)
    expect(commandFlags(commandBlock(powershell, 'init')!).map((f) => f.name)).not.toContain(
      '--store',
    )
    expect(commandFlags(commandBlock(powershell, 'list')!).map((f) => f.name)).toContain('--store')
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
