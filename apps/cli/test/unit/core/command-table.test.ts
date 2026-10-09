import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { COMMAND_MODULES, GLOBAL_OPTIONS } from '../../../src/cli.ts'
import {
  closest,
  COMMAND_TABLE,
  commandRow,
  flagSpelling,
  flagValue,
  GLOBAL_FLAGS,
  hasFlag,
  isPending,
  isStorePathToken,
  jsonRefusal,
  lastFlagOf,
  offeredFlags,
  parseCommandArgs,
  parseSubcommandArgs,
  rowGlobalFlags,
  splitShortCluster,
  storePathInOptionPosition,
  storePathRefusal,
  storePathTakesValue,
  takesNextToken,
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
    const r = refused('init', ['--profile', 'core', 'x', 'y'])
    expect(r).toMatchObject({ kind: 'pending', surface: '--profile', owner: 'workflow-profiles' })
    expect(r.message).toBe("cospec init: '--profile' is not supported yet\n")

    // `--bogus` is consumed as --language's value, so the pending refusal wins.
    expect(refused('init', ['--language', '--bogus'])).toMatchObject({
      kind: 'pending',
      surface: '--language',
    })
    expect(refused('init', ['--language', 'fr', '.'])).toMatchObject({
      kind: 'pending',
      surface: '--language',
    })
    expect(refused('init', ['--language=fr'])).toMatchObject({ kind: 'pending' })
    expect(refused('init', ['--profile', 'custom'])).toMatchObject({
      kind: 'pending',
      surface: '--profile',
    })
  })

  test('a pending flag with no value is argument missing, as a handled flag is', () => {
    const r = refused('status', ['--schema'])
    expect(r).toMatchObject({ kind: 'missing-value', flag: '--schema' })
    expect(r.message).toBe("cospec status: option '--schema <name>' argument missing\n")
    // It outranks an unknown option or a pending flag earlier in the argv.
    expect(refused('list', ['--bogus', '--sort'])).toMatchObject({
      kind: 'missing-value',
      flag: '--sort',
    })
    expect(refused('status', ['--schema', 'x', '--schema'])).toMatchObject({
      kind: 'missing-value',
    })
    expect(refused('init', ['--language']).message).toBe(
      "cospec init: option '--language <language>' argument missing\n",
    )
  })

  test('--schem suggests --schema', () => {
    const r = refused('status', ['--schem', 'custom'])
    expect(r).toMatchObject({
      kind: 'unknown-option',
      option: '--schem',
      suggestions: ['--schema'],
    })
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
      suggestions: ['--type'],
    })
  })

  test('a boolean flag given a value is unknown as a whole token, as upstream reports it', () => {
    expect(refused('validate', ['--strict=1'])).toMatchObject({
      kind: 'unknown-option',
      option: '--strict=1',
      suggestions: ['--strict'],
    })
  })

  test('an unknown short option gets no suggestion, as commander gives none', () => {
    const refusal = refused('archive', ['-Y', 'c'])
    expect(refusal).toMatchObject({ kind: 'unknown-option', option: '-Y' })
    expect(refusal).not.toHaveProperty('suggestions')
    expect(refusal?.message).toBe("cospec archive: unknown option '-Y'\n")
  })

  test('a typo of a global flag suggests the global', () => {
    expect(refused('list', ['--jsn'])).toMatchObject({ suggestions: ['--json'] })
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

  test("a missing required positional is commander's missing required argument", () => {
    expect(refused('archive', [])).toEqual({
      kind: 'missing-argument',
      command: 'archive',
      argument: 'change',
      message:
        "cospec archive: missing required argument 'change'\ncospec archive: usage — cospec archive <change>\n",
    })
    const usage =
      'cospec new: usage — cospec new <type> <slug> | cospec new "<type>: <description>"\n'
    expect(refused('new', []).message).toBe(
      `cospec new: missing required argument 'type'\n${usage}`,
    )
    expect(refused('new', ['feat']).message).toBe(
      `cospec new: missing required argument 'slug'\n${usage}`,
    )
    expect(refused('feedback', ['--body', 'b']).message).toStartWith(
      "cospec feedback: missing required argument 'message'\n",
    )
    // Every table row with a required positional refuses it given nothing.
    for (const row of COMMAND_TABLE) {
      if (row.parse !== 'table') continue
      const first = row.positionals[0]
      if (first?.required !== true) expect(parse(row.name, []).ok, row.name).toBe(true)
      else expect(refused(row.name, []), row.name).toMatchObject({ argument: first.name })
    }
  })

  test('a compound value fills the positionals after it', () => {
    expect(parsed('new', ['feat: add a thing']).positionals).toEqual(['feat: add a thing'])
    expect(refused('new', ['feat: add a thing', '--store-path', '/x']).kind).toBe('store-path')
  })

  test('a missing argument outranks --store-path and too-many, and yields to an unknown option', () => {
    for (const args of [
      ['--store-path', '/x'],
      ['feat', '--store-path', '/x'],
    ])
      expect(refused('new', args).kind).toBe('missing-argument')
    expect(refused('archive', ['--store-path=/x']).kind).toBe('missing-argument')
    expect(refused('new', ['feat', '--bogus', '--store-path', '/x']).kind).toBe('unknown-option')
    expect(refused('apply', ['--store-path', '/x']).kind).toBe('unknown-option')
    expect(refused('new', ['feat', '--store-path'])).toMatchObject({ kind: 'missing-value' })
    // A positional that --change or --all displaces is never missing.
    expect(parse('status', ['--change', 'c']).ok).toBe(true)
  })

  test('check-commit takes no message file as the advisory no-op it is', () => {
    expect(parsed('check-commit', []).positionals).toEqual([])
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

  test('--store-path yields to every other parse refusal, as upstream refuses it in the action', () => {
    expect(refused('list', ['--store-path', '/x', '--bogus'])).toMatchObject({
      kind: 'unknown-option',
      option: '--bogus',
    })
    expect(refused('list', ['--store-path', '/x', 'extra']).kind).toBe('too-many-arguments')
    expect(refused('list', ['--store-path=/x', 'extra']).kind).toBe('too-many-arguments')
    expect(refused('validate', ['--store-path', '/x', 'a', 'b']).kind).toBe('too-many-arguments')
    // `archive --no-validate` is handled now, so only --store-path is left to refuse.
    expect(refused('archive', ['c', '--store-path', '/x', '--no-validate']).kind).toBe('store-path')
    // Its value is consumed, so it never counts as a positional.
    expect(refused('validate', ['--store-path', '/x', 'a']).kind).toBe('store-path')
  })

  test('--store-path with no value is a missing value, raised ahead of every other refusal', () => {
    for (const args of [
      ['--store-path'],
      ['extra', '--store-path'],
      ['--bogus', '--store-path'],
      ['--sort', 'x', '--store-path'],
    ]) {
      expect(refused('list', args), args.join(' ')).toMatchObject({
        kind: 'missing-value',
        flag: '--store-path',
        message: storePathRefusal(false).text,
      })
    }
  })

  test('a later missing value outranks an earlier unknown option or pending flag', () => {
    expect(refused('status', ['--bogus', '--change'])).toMatchObject({
      kind: 'missing-value',
      flag: '--change',
    })
    expect(refused('init', ['--language', 'x', '--bogus'])).toMatchObject({
      kind: 'pending',
      surface: '--language',
    })
    expect(refused('init', ['--bogus', '--language', 'x'])).toMatchObject({
      kind: 'unknown-option',
      option: '--bogus',
    })
  })

  test('the recorded refusal outranks too many arguments', () => {
    expect(refused('list', ['a', '--bogus']).kind).toBe('unknown-option')
    expect(refused('init', ['a', 'b', '--language', 'x']).kind).toBe('pending')
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

  test('exactly the four design no-ops are marked no-op', () => {
    const noOps = COMMAND_TABLE.flatMap((row) =>
      row.flags.filter((f) => f.status === 'no-op').map((f) => `${row.name} ${f.name}`),
    )
    expect(noOps.toSorted()).toEqual([
      'archive --yes',
      'experimental --no-interactive',
      'init --no-animation',
      'list --changes',
    ])
  })
})

// The design's pending table, restricted to what the command table marks
// (tool ids, `experimental` and alias entries live elsewhere).
const EXPECTED_PENDING: [string, string, PendingOwner][] = [
  ['init', '--language', 'workflow-profiles'],
  ['init', '--profile', 'workflow-profiles'],
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
    const path = `${row.name} ${s.name}`
    if (isPending(s.status)) out.push([row.name, s.name, s.status.pending])
    for (const f of s.flags) if (isPending(f.status)) out.push([path, f.name, f.status.pending])
    for (const p of s.positionals) {
      if (isPending(p.status)) out.push([path, `[${p.name}]`, p.status.pending])
      for (const [value, owner] of Object.entries(p.pendingValues ?? {}))
        out.push([path, value, owner])
    }
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
    'init --language': ['--language', 'fr', '.'],
    'init --profile': ['--profile', 'core'],
  }

  /** The pending refusal `command surface` gets, named on the row it was typed on. */
  function expectPendingRefusal(command: string, surface: string, owner: PendingOwner): void {
    const args = argvFor[`${command} ${surface}`]
    if (args === undefined) throw new Error(`no argv for ${command} ${surface}`)
    const row = command.split(' ')[0]!
    const r = refused(row, args)
    expect(r).toMatchObject({ kind: 'pending', surface, owner })
    expect(r.message).toBe(`cospec ${command}: '${surface}' is not supported yet\n`)
  }

  test.each(EXPECTED_PENDING)('%s %s is refused as not supported yet', expectPendingRefusal)

  // `PendingOwner` no longer names it at all; this also guards the data.
  test('no pending surface is owned by upstream-spellings', () => {
    const owned = EXPECTED_PENDING.filter(([, , owner]) => `${owner}` === 'upstream-spellings')
    expect(owned).toEqual([])
  })

  test('pending flags are never offered to help or completion', () => {
    for (const row of COMMAND_TABLE)
      for (const f of offeredFlags(row)) expect(isPending(f.status)).toBe(false)
    expect(offeredFlags(tableRow('list')).map((f) => f.name)).toEqual([
      '--specs',
      '--blocked',
      '--changes',
      '--sort',
    ])
  })
})

describe('table shape', () => {
  test('the rows, in help order, with exactly __complete, check-commit and experimental hidden', () => {
    expect(COMMAND_TABLE.map((row) => row.name)).toEqual([
      'init',
      'update',
      'doctor',
      'new',
      'migrate',
      'validate',
      'status',
      'list',
      'instructions',
      'apply',
      'archive',
      'sync-specs',
      'sync-blockers',
      'store',
      'context',
      'workset',
      'show',
      'view',
      'schemas',
      'schema',
      'templates',
      'config',
      'completion',
      'feedback',
      'help',
      '__complete',
      'check-commit',
      'experimental',
    ])
    expect(COMMAND_TABLE.filter((row) => row.hidden).map((row) => row.name)).toEqual([
      '__complete',
      'check-commit',
      'experimental',
    ])
    // Design decision 5: `experimental` is a table row with a module of its
    // own, never a command list in cli.ts.
    expect(commandRow('experimental')).toMatchObject({ parse: 'table', aliasOf: 'init' })
    expect(COMMAND_MODULES['experimental']).toBeDefined()
    expect(commandRow('help')).toMatchObject({ parse: 'table', hidden: false, operands: 'lenient' })
    expect(COMMAND_MODULES['help']).toBeDefined()
  })

  test('every row dispatches to a command module, and every module has a row, in the same order', async () => {
    expect(Object.keys(COMMAND_MODULES)).toEqual(COMMAND_TABLE.map((row) => row.name))
    const modules = await Promise.all(
      COMMAND_TABLE.map(async (row) => [row.name, await COMMAND_MODULES[row.name]!()] as const),
    )
    for (const [name, mod] of modules)
      expect(typeof mod.run, `commands module for '${name}' exports run`).toBe('function')
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

  test('a table row refuses --store exactly when its module never reads it', () => {
    const readsStore =
      /\bresolveRoot(?:OrDocument)?\(|\brunPassthrough\(|\bcallPassthrough\(|flags\.store\b/
    for (const row of COMMAND_TABLE) {
      if (row.parse !== 'table') continue
      const file = row.name === '__complete' ? 'complete' : row.name
      const source = readFileSync(
        join(import.meta.dir, '..', '..', '..', 'src', 'commands', `${file}.ts`),
        'utf8',
      )
      expect(row.store, row.name).toBe(readsStore.test(source) ? 'accepted' : 'refused')
    }
    const refused = COMMAND_TABLE.filter((row) => row.parse === 'table' && row.store === 'refused')
    expect(refused.map((row) => row.name).toSorted()).toEqual(
      [
        'check-commit',
        'completion',
        'experimental',
        'feedback',
        'help',
        'init',
        'update',
      ].toSorted(),
    )
  })

  test('a store-refused row refuses --store as unknown, never suggesting it', () => {
    const init = tableRow('init')
    for (const argv of [['--store', 'x'], ['--store=x'], ['--store']]) {
      const r = parseCommandArgs(init, argv)
      if (r.ok) throw new Error(`init accepted ${argv.join(' ')}`)
      expect(r.refusal.kind).toBe('unknown-option')
      expect(r.refusal.message).toStartWith(`cospec init: unknown option '${argv[0]}'\n`)
      expect(r.refusal.message).not.toContain("'--store'?")
    }
    expect(rowGlobalFlags(init).map((f) => f.name)).not.toContain('--store')
    expect(rowGlobalFlags(tableRow('list'))).toBe(GLOBAL_FLAGS)
    expect(rowGlobalFlags(commandRow('config')!)).toBe(GLOBAL_FLAGS)
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

function ok(row: TableCommandRow, args: string[]) {
  const result = parseCommandArgs(row, args)
  if (!result.ok) throw new Error(result.refusal.message)
  return result.parsed
}

/**
 * The parser's alias, hidden-flag and lenient-operand handling on synthetic
 * rows, independent of which table surfaces carry the markings.
 */
describe('parseCommandArgs — aliases, hidden flags, lenient operands', () => {
  const init = tableRow('init')
  const aliased: TableCommandRow = {
    ...init,
    flags: [
      ...init.flags.filter((f) => f.name !== '--tools'),
      {
        name: '--tools',
        takesValue: true,
        placeholder: '<tools>',
        description: 'upstream spelling of --harness',
        status: 'handled',
        origin: 'upstream',
        aliasOf: '--harness',
      },
      {
        name: '--secret',
        takesValue: true,
        placeholder: '<x>',
        description: 'hidden',
        status: 'handled',
        origin: 'upstream',
        hidden: true,
      },
    ],
  }
  const lenient: TableCommandRow = {
    ...tableRow('list'),
    flags: [],
    positionals: [{ name: 'command', required: false, status: 'handled', origin: 'upstream' }],
    operands: 'lenient',
  }
  test("an alias flag's value is stored under the flag it spells, with the typed spelling", () => {
    const p = ok(aliased, ['--tools', 'claude'])
    expect(p.flags).toEqual({ '--harness': 'claude' })
    expect(flagSpelling(p, '--harness')).toBe('--tools')
    expect(flagSpelling(ok(aliased, ['--harness', 'claude']), '--harness')).toBe('--harness')
    expect(flagSpelling(ok(aliased, []), '--harness')).toBe('--harness')
  })

  test('a repeat across the two spellings is last-wins', () => {
    const tools = ok(aliased, ['--harness', 'a', '--tools=b'])
    expect(flagValue(tools, '--harness')).toBe('b')
    expect(flagSpelling(tools, '--harness')).toBe('--tools')
    const harness = ok(aliased, ['--tools', 'b', '--harness', 'a'])
    expect(flagValue(harness, '--harness')).toBe('a')
    expect(flagSpelling(harness, '--harness')).toBe('--harness')
  })

  test('occurrences lists each long flag in argv order across alias, short and = spellings', () => {
    const p = ok(aliased, ['--tools=a', '--force', '--harness', 'b', '--yes'])
    expect(p.occurrences).toEqual(['--harness', '--force', '--harness', '--yes'])
    expect(ok(tableRow('archive'), ['c', '-y', '--yes']).occurrences).toEqual(['--yes', '--yes'])
  })

  test('occurrences is absent when no flag was given and omits a positional', () => {
    expect(ok(aliased, ['.']).occurrences).toBeUndefined()
  })

  test('lastFlagOf is the last of the pair typed, whichever spelling or count', () => {
    const init = tableRow('init')
    const pair = ['--copilot-cloud', '--no-copilot-cloud'] as const
    const last = (args: string[]) => lastFlagOf(ok(init, args), ...pair)
    expect(last(['--copilot-cloud', '--no-copilot-cloud'])).toBe(false)
    expect(last(['--no-copilot-cloud', '--copilot-cloud'])).toBe(true)
    expect(last(['--copilot-cloud', '--no-copilot-cloud', '--copilot-cloud'])).toBe(true)
    expect(last(['--no-copilot-cloud', '--no-copilot-cloud'])).toBe(false)
    expect(last(['--copilot-cloud'])).toBe(true)
    expect(last(['--force'])).toBeUndefined()
    expect(last([])).toBeUndefined()
  })

  test('an alias flag with no value is refused naming its own placeholder', () => {
    const result = parseCommandArgs(aliased, ['--tools'])
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.refusal.message).toBe(
        "cospec init: option '--tools <tools>' argument missing\n",
      )
  })

  test('a hidden flag is parsed but never offered', () => {
    expect(ok(aliased, ['--secret', 's']).flags['--secret']).toBe('s')
    const offered = offeredFlags(aliased).map((f) => f.name)
    expect(offered).toContain('--tools')
    expect(offered).not.toContain('--secret')
  })

  test('a lenient row ends its operands at the first undeclared option, ignores the excess', () => {
    expect(ok(lenient, ['list', 'extra', '-x', '--store-path'])).toEqual({
      positionals: ['list'],
      flags: {},
    })
    expect(ok(lenient, ['--bogus', 'list'])).toEqual({ positionals: [], flags: {} })
    expect(ok(lenient, ['--store-path', '/x', 'list'])).toEqual({ positionals: [], flags: {} })
    expect(ok(lenient, ['--', 'list'])).toEqual({ positionals: ['list'], flags: {} })
    expect(parseCommandArgs(tableRow('list'), ['--bogus']).ok).toBe(false)
  })
})

describe('upstream spellings (aliases, hidden flags, lenient operands)', () => {
  test('init --tools stores its value under --harness and records the spelling', () => {
    const p = parsed('init', ['--tools', 'claude,codex'])
    expect(flagValue(p, '--harness')).toBe('claude,codex')
    expect(hasFlag(p, '--tools')).toBe(false)
    expect(flagSpelling(p, '--harness')).toBe('--tools')
    expect(flagSpelling(parsed('init', ['--harness', 'none']), '--harness')).toBe('--harness')
  })

  test('a repeat across the two spellings is last-wins, as commander resolves it', () => {
    const tools = parsed('init', ['--harness', 'claude', '--tools', 'codex'])
    expect(flagValue(tools, '--harness')).toBe('codex')
    expect(flagSpelling(tools, '--harness')).toBe('--tools')
    const harness = parsed('init', ['--tools=codex', '--harness', 'claude'])
    expect(flagValue(harness, '--harness')).toBe('claude')
    expect(flagSpelling(harness, '--harness')).toBe('--harness')
  })

  test('--tools with no value is refused naming its own placeholder', () => {
    expect(refused('init', ['--tools'])).toMatchObject({
      kind: 'missing-value',
      flag: '--tools',
      message: "cospec init: option '--tools <tools>' argument missing\n",
    })
  })

  test('a hidden flag is parsed but never offered to help or completion', () => {
    const change = tableRow('new').subcommands?.find((sub) => sub.name === 'change')
    if (change === undefined) throw new Error('no new change subcommand')
    const offered = offeredFlags(change).map((flag) => flag.name)
    expect(offered).toEqual(['--schema', '--description', '--goal'])
    const hidden = change.flags.filter((flag) => 'hidden' in flag && flag.hidden === true)
    expect(hidden.map((flag) => flag.name)).toEqual(['--initiative', '--areas'])
    expect(parsed('new', ['change', 'x', '--initiative', 'y']).flags['--initiative']).toBe('y')
  })

  test("the help row's lenient operands ignore undeclared options and excess operands", () => {
    expect(parsed('help', ['list', 'extra', '--bogus'])).toEqual({
      positionals: ['list'],
      flags: {},
    })
    expect(parsed('help', ['--json', 'list'])).toEqual({ positionals: [], flags: {} })
    expect(parsed('help', [])).toMatchObject({ positionals: [] })
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

describe('takesNextToken (phase B pairs a value-taking flag with its value)', () => {
  test("a row's and its named subcommand's space-form value flags, and --store-path", () => {
    const store = commandRow('store')!
    const setup = store.subcommands!.find((s) => s.name === 'setup')!
    expect(takesNextToken([commandRow('status')!], '--change', true)).toBe(true)
    expect(takesNextToken([store], '--path', false)).toBe(false)
    expect(takesNextToken([store, setup], '--path', false)).toBe(true)
    expect(takesNextToken([store, setup], '--init-git', false)).toBe(false)
    expect(takesNextToken([commandRow('list')!], '--sort', true)).toBe(true)
    expect(takesNextToken([commandRow('list')!], '--sort=x', true)).toBe(false)
    expect(takesNextToken([], '--store-path', true)).toBe(true)
    expect(takesNextToken([], '--store-path', false)).toBe(false)
  })

  test('--store-path takes a value exactly on the rows whose upstream command declares it', () => {
    // dist/cli/index.js hiddenStorePathOption() on list, view, archive, validate,
    // show, status, instructions, schemas and new change; commands/context.js
    // and commands/doctor.js add their own.
    expect(
      COMMAND_TABLE.filter(storePathTakesValue)
        .map((row) => row.name)
        .toSorted(),
    ).toEqual([
      'archive',
      'context',
      'doctor',
      'instructions',
      'list',
      'new',
      'schemas',
      'show',
      'status',
      'validate',
      'view',
    ])
  })

  test('the forward rows that select their root through --store are marked accepted', () => {
    // show/schemas declare `--store` upstream; templates/schema spawn in the
    // store's root (root-resolution-parity). store/workset/config take no root.
    const forward = COMMAND_TABLE.filter((row) => row.parse === 'forward')
    expect(
      forward
        .filter((row) => row.store === 'accepted')
        .map((row) => row.name)
        .toSorted(),
    ).toEqual(['schema', 'schemas', 'show', 'templates'])
    expect(
      forward
        .filter((row) => row.store === undefined)
        .map((row) => row.name)
        .toSorted(),
    ).toEqual(['config', 'store', 'workset'])
  })
})

describe('splitShortCluster (one step of commander splitting -ab…)', () => {
  const archive = [commandRow('archive')!]
  const show = [commandRow('show')!]
  test('a declared boolean first letter leaves the rest as the next token', () => {
    expect(splitShortCluster(archive, '-yh')).toEqual({ head: '-y', tail: '-h', takesValue: false })
    expect(splitShortCluster(archive, '-yyx')).toEqual({
      head: '-y',
      tail: '-yx',
      takesValue: false,
    })
  })
  test('a declared value-taking first letter takes the rest as its value', () => {
    expect(splitShortCluster(show, '-rh')).toEqual({ head: '-r', tail: 'h', takesValue: true })
  })
  test('no split: an undeclared first letter, -h first, a long flag, a lone short', () => {
    expect(splitShortCluster(archive, '-xy')).toBeUndefined()
    expect(splitShortCluster(archive, '-hy')).toBeUndefined()
    expect(splitShortCluster([commandRow('list')!], '-yh')).toBeUndefined()
    expect(splitShortCluster(archive, '--yes')).toBeUndefined()
    expect(splitShortCluster(archive, '-y')).toBeUndefined()
  })
})

describe('storePathInOptionPosition (the terminal-handover pre-spawn check)', () => {
  const config = commandRow('config')!
  const sub = (row: CommandRow, name: string) => row.subcommands!.find((s) => s.name === name)!
  const edit = [config, sub(config, 'edit')]
  const workset = commandRow('workset')!
  const open = [workset, sub(workset, 'open')]

  test('finds --store-path in option position, in both forms', () => {
    expect(storePathInOptionPosition(edit, ['--store-path', '/x'])).toBe(true)
    expect(storePathInOptionPosition(edit, ['--store-path'])).toBe(true)
    expect(storePathInOptionPosition(open, ['w1', '--store-path=/x'])).toBe(true)
  })

  test('a declared value-taking flag consumes it as its value', () => {
    expect(storePathInOptionPosition(open, ['--tool', '--store-path', 'w1'])).toBe(false)
    expect(storePathInOptionPosition(open, ['--tool=code', '--store-path', '/x'])).toBe(true)
  })

  test("an earlier undeclared option is the binary's to refuse first", () => {
    expect(storePathInOptionPosition(edit, ['--bogus', '--store-path', '/x'])).toBe(false)
  })

  test('after -- it is an operand', () => {
    expect(storePathInOptionPosition(open, ['--', '--store-path', '/x'])).toBe(false)
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

describe('parseSubcommandArgs (one forward-row leaf, parsed as a table row is)', () => {
  test("parses a leaf's own argv and names the leaf in its refusals", () => {
    const row = commandRow('workset')!
    const open = row.subcommands!.find((s) => s.name === 'open')!
    const ok = parseSubcommandArgs(row, open, ['w1', '--tool', 'code'])
    expect(ok).toEqual({
      ok: true,
      parsed: {
        subcommand: 'open',
        positionals: ['w1'],
        flags: { '--tool': 'code' },
        occurrences: ['--tool'],
      },
    })
    const refused = parseSubcommandArgs(row, open, ['w1', '--tol', 'code'])
    expect(refused.ok).toBe(false)
    if (!refused.ok) {
      expect(refused.refusal.kind).toBe('unknown-option')
      expect(refused.refusal.message).toBe(
        "cospec workset open: unknown option '--tol'\nDid you mean '--tool'?\n",
      )
    }
  })
})
