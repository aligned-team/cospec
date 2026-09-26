import { describe, expect, test } from 'bun:test'

import { COMMANDS, GLOBAL_OPTIONS } from '../../../src/cli.ts'
import {
  closest,
  COMMAND_TABLE,
  commandRow,
  flagValue,
  GLOBAL_FLAGS,
  hasFlag,
  isPending,
  isStorePathToken,
  jsonRefusal,
  offeredFlags,
  parseCommandArgs,
  storePathRefusal,
  type CommandRow,
  type ParseRefusal,
  type ParseResult,
  type PendingOwner,
  type TableCommandRow,
} from '../../../src/core/command-table.ts'

function tableRow(name: string): TableCommandRow {
  const row = commandRow(name)
  if (row === undefined || row.parse !== 'table') throw new Error(`no table row '${name}'`)
  return row
}

function parse(name: string, args: string[]): ParseResult {
  return parseCommandArgs(tableRow(name), args)
}

function parsed(name: string, args: string[]) {
  const result = parse(name, args)
  if (!result.ok)
    throw new Error(`expected '${name} ${args.join(' ')}' to parse: ${result.refusal.message}`)
  return result.parsed
}

function refused(name: string, args: string[]): ParseRefusal {
  const result = parse(name, args)
  if (result.ok) throw new Error(`expected '${name} ${args.join(' ')}' to be refused`)
  return result.refusal
}

describe('parseCommandArgs — the six ledger 1.5 cases', () => {
  test('--flag value', () => {
    const p = parsed('status', ['--change', 'foo'])
    expect(flagValue(p, '--change')).toBe('foo')
    expect(p.positionals).toEqual([])
  })

  test('--flag=value', () => {
    const p = parsed('status', ['--change=foo'])
    expect(flagValue(p, '--change')).toBe('foo')
    expect(p.positionals).toEqual([])
  })

  test('a value-taking flag with no value is refused as argument missing', () => {
    const r = refused('status', ['--change'])
    expect(r.kind).toBe('missing-value')
    expect(r.message).toBe("cospec status: option '--change <slug>' argument missing\n")
  })

  test('a pending flag consumes its value and never leaks it into a positional', () => {
    const r = refused('validate', ['--type', 'change', 'x'])
    expect(r).toMatchObject({ kind: 'pending', surface: '--type', owner: 'cli-surface-parity' })
    expect(r.message).toBe("cospec validate: '--type' is not supported yet\n")

    // `--bogus` is consumed as --sort's value, so the pending refusal wins.
    expect(refused('list', ['--sort', '--bogus'])).toMatchObject({
      kind: 'pending',
      surface: '--sort',
    })
    expect(refused('init', ['--language', 'fr', '.'])).toMatchObject({
      kind: 'pending',
      surface: '--language',
    })
    expect(refused('init', ['--language=fr'])).toMatchObject({ kind: 'pending' })
    // With no value to consume it is still pending, not argument missing.
    expect(refused('status', ['--schema'])).toMatchObject({ kind: 'pending', surface: '--schema' })
  })

  test('--schem suggests --schema', () => {
    const r = refused('status', ['--schem', 'custom'])
    expect(r).toMatchObject({ kind: 'unknown-option', option: '--schem', suggestion: '--schema' })
    expect(r.message).toBe("cospec status: unknown option '--schem'\nDid you mean '--schema'?\n")
  })

  test('a positional after flags', () => {
    const p = parsed('validate', ['--strict', '--fast', 'my-change'])
    expect(p.positionals).toEqual(['my-change'])
    expect(hasFlag(p, '--strict')).toBe(true)
    expect(hasFlag(p, '--fast')).toBe(true)
    expect(hasFlag(p, '--all')).toBe(false)
  })
})

describe('parseCommandArgs — refusals', () => {
  test('unknown option: exact text, no suggestion when none is close', () => {
    const r = refused('list', ['--bogus'])
    expect(r.kind).toBe('unknown-option')
    expect(r.message).toBe("cospec list: unknown option '--bogus'\n")
  })

  test('an unknown option is refused wherever it sits', () => {
    expect(refused('validate', ['my-change', '--typo', 'x'])).toMatchObject({
      kind: 'unknown-option',
      option: '--typo',
      suggestion: '--type',
    })
  })

  test('a boolean flag given a value is unknown as a whole token, as upstream reports it', () => {
    expect(refused('validate', ['--strict=1'])).toMatchObject({
      kind: 'unknown-option',
      option: '--strict=1',
      suggestion: '--strict',
    })
  })

  test('an unknown short option suggests only short flags', () => {
    expect(refused('archive', ['-x', 'c'])).toMatchObject({ kind: 'unknown-option', option: '-x' })
    expect(refused('archive', ['-x', 'c'])).toMatchObject({ suggestion: '-y' })
  })

  test('a typo of a global flag suggests the global', () => {
    expect(refused('list', ['--jsn'])).toMatchObject({ suggestion: '--json' })
  })

  test('a value is the next token whatever it looks like (commander semantics)', () => {
    const p = parsed('status', ['--change', '--all'])
    expect(flagValue(p, '--change')).toBe('--all')
    expect(hasFlag(p, '--all')).toBe(false)
  })

  test('too many positionals', () => {
    const r = refused('list', ['foo'])
    expect(r).toMatchObject({ kind: 'too-many-arguments', expected: 0, received: 1 })
    expect(r.message).toBe('cospec list: too many arguments. Expected 0 arguments but got 1.\n')
    expect(refused('archive', ['a', 'b']).message).toBe(
      'cospec archive: too many arguments. Expected 1 argument but got 2.\n',
    )
  })

  test('a missing required positional is left to the command', () => {
    expect(parsed('archive', []).positionals).toEqual([])
    expect(parsed('new', ['feat: add a thing']).positionals).toEqual(['feat: add a thing'])
  })

  test('`--` ends option parsing', () => {
    expect(parsed('feedback', ['--', '--not-a-flag']).positionals).toEqual(['--not-a-flag'])
  })

  test('a bare `-` is a positional', () => {
    expect(parsed('check-commit', ['-']).positionals).toEqual(['-'])
  })

  test('a short alias is stored under its long name', () => {
    expect(hasFlag(parsed('archive', ['c', '-y']), '--yes')).toBe(true)
  })

  test('--store-path is refused with the redirect in both forms, never as unknown', () => {
    for (const args of [['--store-path', '/x'], ['--store-path=/x']]) {
      const r = refused('list', args)
      expect(r.kind).toBe('store-path')
      expect(r.message).toBe(storePathRefusal(false).text)
    }
  })
})

describe('accepted no-ops', () => {
  test.each([
    ['init', ['--no-animation', '.'], '--no-animation'],
    ['archive', ['c', '-y'], '--yes'],
    ['archive', ['c', '--yes'], '--yes'],
    ['list', ['--changes'], '--changes'],
  ] as const)('%s %p parses', (name, args, flag) => {
    expect(hasFlag(parsed(name, [...args]), flag)).toBe(true)
  })

  test('exactly the three design no-ops are marked no-op', () => {
    const noOps = COMMAND_TABLE.flatMap((row) =>
      row.flags.filter((f) => f.status === 'no-op').map((f) => `${row.name} ${f.name}`),
    )
    expect(noOps.toSorted()).toEqual(['archive --yes', 'init --no-animation', 'list --changes'])
  })
})

// The design's pending table, restricted to what the command table marks
// (tool ids, `experimental` and alias entries live elsewhere).
const EXPECTED_PENDING: [string, string, PendingOwner][] = [
  ['init', '--tools', 'upstream-spellings'],
  ['init', '--language', 'workflow-profiles'],
  ['init', '--profile', 'workflow-profiles'],
  ['init', '--copilot-cloud', 'github-copilot'],
  ['init', '--no-copilot-cloud', 'github-copilot'],
  ['update', '[path]', 'upstream-spellings'],
  ['new', 'change', 'upstream-spellings'],
  ['validate', '--type', 'cli-surface-parity'],
  ['validate', '--report', 'cli-surface-parity'],
  ['validate', '--concurrency', 'cli-surface-parity'],
  ['status', '--schema', 'cli-surface-parity'],
  ['list', '--sort', 'cli-surface-parity'],
  ['instructions', '--schema', 'upstream-spellings'],
  ['archive', '--no-validate', 'archive-and-sync-parity'],
  ['completion', 'generate', 'upstream-spellings'],
  ['completion', 'install', 'completion-install'],
  ['completion', 'uninstall', 'completion-install'],
  ['completion', 'powershell', 'completion-install'],
  ['__complete', 'schemas', 'cli-surface-parity'],
  ['__complete', 'archived-changes', 'cli-surface-parity'],
]

function pendingSurfaces(row: CommandRow): [string, string, PendingOwner][] {
  const out: [string, string, PendingOwner][] = []
  for (const f of row.flags) if (isPending(f.status)) out.push([row.name, f.name, f.status.pending])
  for (const p of row.positionals) {
    if (isPending(p.status)) out.push([row.name, `[${p.name}]`, p.status.pending])
    for (const [value, owner] of Object.entries(p.pendingValues ?? {}))
      out.push([row.name, value, owner])
  }
  for (const s of row.subcommands ?? []) {
    if (isPending(s.status)) out.push([row.name, s.name, s.status.pending])
    for (const f of s.flags)
      if (isPending(f.status)) out.push([`${row.name} ${s.name}`, f.name, f.status.pending])
  }
  return out
}

function pendingKey([command, surface, owner]: [string, string, PendingOwner]): string {
  return `${command} ${surface} ${owner}`
}

describe('pending surfaces', () => {
  test('the table marks exactly the design pending surfaces, each with its owner', () => {
    const actual = COMMAND_TABLE.flatMap(pendingSurfaces)
    expect(actual.map(pendingKey).toSorted()).toEqual(EXPECTED_PENDING.map(pendingKey).toSorted())
  })

  const argvFor: Record<string, string[]> = {
    'init --tools': ['--tools', 'claude'],
    'init --language': ['--language', 'fr', '.'],
    'init --profile': ['--profile', 'core'],
    'init --copilot-cloud': ['--copilot-cloud'],
    'init --no-copilot-cloud': ['--no-copilot-cloud'],
    'update [path]': ['.'],
    'new change': ['change', 'my-change'],
    'validate --type': ['--type', 'change', 'x'],
    'validate --report': ['--report', 'full'],
    'validate --concurrency': ['--concurrency', '4'],
    'status --schema': ['--schema', 'custom'],
    'list --sort': ['--sort', 'name'],
    'instructions --schema': ['proposal', '--schema', 'feat'],
    'archive --no-validate': ['c', '--no-validate'],
    'completion generate': ['generate', 'zsh'],
    'completion install': ['install', 'zsh', '--verbose'],
    'completion uninstall': ['uninstall', '-y'],
    'completion powershell': ['powershell'],
    '__complete schemas': ['schemas'],
    '__complete archived-changes': ['archived-changes'],
  }

  test.each(EXPECTED_PENDING)(
    '%s %s is refused as not supported yet',
    (command, surface, owner) => {
      const args = argvFor[`${command} ${surface}`]
      if (args === undefined) throw new Error(`no argv for ${command} ${surface}`)
      const r = refused(command, args)
      expect(r).toMatchObject({ kind: 'pending', surface, owner })
      expect(r.message).toBe(`cospec ${command}: '${surface}' is not supported yet\n`)
    },
  )

  test('pending flags are never offered to help or completion', () => {
    for (const row of COMMAND_TABLE)
      for (const f of offeredFlags(row)) expect(isPending(f.status)).toBe(false)
    expect(offeredFlags(tableRow('list')).map((f) => f.name)).toEqual([
      '--specs',
      '--blocked',
      '--changes',
    ])
  })
})

describe('table shape', () => {
  test('every COMMANDS entry has a row, and every row a COMMANDS entry, in the same order', () => {
    expect(COMMAND_TABLE.map((row) => row.name)).toEqual(COMMANDS.map((c) => c.name))
    for (const entry of COMMANDS)
      expect(commandRow(entry.name)?.hidden ?? false).toBe(entry.hidden ?? false)
  })

  test('forward rows are exactly the design list', () => {
    const forward = COMMAND_TABLE.filter((row) => row.parse === 'forward').map((row) => row.name)
    expect(forward.toSorted()).toEqual(
      ['config', 'schema', 'schemas', 'show', 'store', 'templates', 'workset'].toSorted(),
    )
  })

  test('only view and completion refuse --json; forward rows carry no json marking', () => {
    const refusing = COMMAND_TABLE.filter((row) => row.parse === 'table' && row.json === 'refused')
    expect(refusing.map((row) => row.name).toSorted()).toEqual(['completion', 'view'])
    for (const row of COMMAND_TABLE) if (row.parse === 'forward') expect('json' in row).toBe(false)
  })

  test('every value-taking flag has a placeholder and no boolean flag does', () => {
    const surfaces = COMMAND_TABLE.flatMap((row) => [row, ...(row.subcommands ?? [])])
    for (const surface of [...surfaces, { name: 'globals', flags: GLOBAL_FLAGS }]) {
      const names = surface.flags.map((f) => f.name)
      expect(new Set(names).size).toBe(names.length)
      for (const f of surface.flags) {
        expect(f.name.startsWith('--')).toBe(true)
        expect(f.placeholder !== undefined).toBe(f.takesValue === true)
        expect(f.description.length).toBeGreaterThan(0)
      }
    }
  })

  test('no row repeats a global flag', () => {
    const globals = new Set(GLOBAL_FLAGS.map((f) => f.name))
    for (const row of COMMAND_TABLE)
      for (const f of row.flags) expect(globals.has(f.name)).toBe(false)
  })

  test('GLOBAL_FLAGS matches the flags GLOBAL_OPTIONS documents', () => {
    const documented = [...GLOBAL_OPTIONS.matchAll(/--[a-z][a-z-]*/g)]
      .map((m) => m[0])
      .filter((flag, index, all) => all.indexOf(flag) === index)
    expect(documented.toSorted()).toEqual(GLOBAL_FLAGS.map((f) => f.name).toSorted())
  })

  test('show declares the spec and diff flags, --requirements-only as the deprecated alias', () => {
    const show = commandRow('show')!
    expect(offeredFlags(show).map((f) => f.name)).toEqual(
      expect.arrayContaining([
        '--diff',
        '--requirements',
        '--deltas-only',
        '--requirements-only',
        '--no-scenarios',
        '--requirement',
        '--type',
      ]),
    )
    const alias = show.flags.find((f) => f.name === '--requirements-only')!
    expect(alias.description).toMatch(/deprecated alias of --deltas-only/i)
    expect(show.flags.find((f) => f.name === '--requirement')?.short).toBe('-r')
  })

  test('no shipped table text names bare openspec as a command to run', () => {
    expect(JSON.stringify(COMMAND_TABLE)).not.toMatch(/\bopenspec (?!>=)[a-z]/)
  })
})

describe('--store-path guard', () => {
  test('recognises both forms and nothing else', () => {
    expect(isStorePathToken('--store-path')).toBe(true)
    expect(isStorePathToken('--store-path=/x')).toBe(true)
    expect(isStorePathToken('--store')).toBe(false)
    expect(isStorePathToken('--store-paths')).toBe(false)
  })

  test('text form is upstream redirect respelled to cospec, on stderr', () => {
    const r = storePathRefusal(false)
    expect(r.stream).toBe('stderr')
    expect(r.text).toBe(
      '✖ Error: --store-path is not supported. Register the path with cospec store register <path>, then select it with --store <id>.\n' +
        'Fix: cospec store register <path>, then rerun with --store <id>.\n',
    )
    expect(r.text).not.toContain('openspec')
  })

  test('--json form is one document on stdout with upstream status[0] shape', () => {
    const r = storePathRefusal(true)
    expect(r.stream).toBe('stdout')
    expect(r.text).not.toContain('openspec')
    const doc = JSON.parse(r.text) as { status: Record<string, string>[] }
    expect(doc.status).toHaveLength(1)
    expect(doc.status[0]).toEqual({
      severity: 'error',
      code: 'store_path_not_supported',
      message:
        '--store-path is not supported. Register the path with cospec store register <path>, then select it with --store <id>.',
      target: 'store.id',
      fix: 'cospec store register <path>, then rerun with --store <id>.',
    })
  })
})

describe('jsonRefusal', () => {
  test('is byte-identical to the envelope completion.ts writes today', () => {
    expect(
      jsonRefusal('completion', 'cospec completion emits a shell script and cannot emit JSON'),
    ).toBe(
      '{"version":1,"command":"completion","ok":false,"message":"cospec completion emits a shell script and cannot emit JSON"}\n',
    )
  })

  test('the completion row carries that same message', () => {
    const row = tableRow('completion')
    if (row.json !== 'refused') throw new Error('completion must refuse --json')
    expect(row.jsonRefusalMessage).toBe(
      'cospec completion emits a shell script and cannot emit JSON',
    )
  })

  test('view refuses with one parseable document naming view', () => {
    const row = tableRow('view')
    if (row.json !== 'refused') throw new Error('view must refuse --json')
    const doc = JSON.parse(jsonRefusal(row.name, row.jsonRefusalMessage)) as Record<string, unknown>
    expect(doc).toMatchObject({ version: 1, command: 'view', ok: false })
    expect(typeof doc.message).toBe('string')
  })
})

describe('closest', () => {
  test('within edit distance 3 only', () => {
    expect(closest('--schem', ['--schema', '--change'])).toBe('--schema')
    expect(closest('--bogus', ['--specs', '--blocked'])).toBeUndefined()
  })
})
