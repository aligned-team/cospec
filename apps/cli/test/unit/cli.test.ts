import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import pkg from '../../package.json'
import { run } from '../../src/cli.ts'
import { respellRemedies } from '../../src/core/remedies.ts'
import { RootSelectionError } from '../../src/core/root.ts'
import { openspecRaw } from '../fixtures/support.ts'

/**
 * The pinned binary's stderr for `argv` in a scratch directory, with its
 * allowlisted remedies spelled through cospec: what a relayed refusal prints.
 */
async function binaryRefusal(argv: string[]): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-cli-'))
  try {
    const upstream = await openspecRaw(argv, dir, {
      HOME: dir,
      XDG_CONFIG_HOME: join(dir, '.config'),
      XDG_DATA_HOME: join(dir, '.local', 'share'),
      OPENSPEC_TELEMETRY: '0',
      OPENSPEC_NO_COMPLETIONS: '1',
    })
    expect(upstream.exitCode).toBe(1)
    return respellRemedies(upstream.stderr)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Run the top-level dispatcher, capturing stdout/stderr and its exit code. */
async function dispatch(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  let out = ''
  let err = ''
  const origOut = process.stdout.write
  const origErr = process.stderr.write
  const sink =
    (target: 'out' | 'err') =>
    (chunk: unknown): boolean => {
      const text = typeof chunk === 'string' ? chunk : String(chunk)
      if (target === 'out') out += text
      else err += text
      return true
    }
  process.stdout.write = sink('out') as typeof process.stdout.write
  process.stderr.write = sink('err') as typeof process.stderr.write
  try {
    const code = await run(argv)
    return { code, out, err }
  } finally {
    process.stdout.write = origOut
    process.stderr.write = origErr
  }
}

describe('cli dispatcher: --store on a row that never reads it', () => {
  test('feedback refuses --store before filing anything', async () => {
    const r = await dispatch(['feedback', 'msg', '--store', 'x'])
    expect(r.code).toBe(1)
    expect(r.out).toBe('')
    expect(r.err).toBe("cospec feedback: unknown option '--store'\n")
  })

  test('a program-level --store is refused once the row is known', async () => {
    const r = await dispatch(['--store=', 'feedback', 'msg'])
    expect(r.code).toBe(1)
    expect(r.err).toBe("cospec feedback: unknown option '--store'\n")
  })

  test("the row's help lists no --store; a store-reading row's does", async () => {
    const init = await dispatch(['init', '--help'])
    expect(init.out).toContain('Global options:')
    expect(init.out).not.toContain('--store <id>')
    const list = await dispatch(['list', '--help'])
    expect(list.out).toContain('--store <id>')
  })
})

describe('cli dispatcher: per-command --help', () => {
  test('--help after a command prints per-command help, not the command output', async () => {
    const r = await dispatch(['validate', '--help'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('cospec validate — Validate changes and specs')
    expect(r.out).toContain('Usage: cospec validate [name] [options]')
    expect(r.out).toContain('Global options:')
  })

  test('-h after a command is intercepted too', async () => {
    const r = await dispatch(['status', '-h'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('cospec status —')
  })

  test('--help never runs a state-mutating command (archive footgun)', async () => {
    // If the flag fell through into argv, archive would run against the change
    // name and touch the repo. Per-command help must short-circuit first.
    const r = await dispatch(['archive', 'some-change', '--help'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('cospec archive — Validate, archive, and fan out blocker updates')
    expect(r.out).not.toContain('archived')
  })

  // Upstream's program level never dispatches an unknown command, so the help
  // flag it left unconsumed prints the program's help (`openspec bogus --help`).
  test('--help after an unknown command prints the program help, runs nothing', async () => {
    const r = await dispatch(['bogus', '--help'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('Usage: cospec <command> [options]')
    expect(r.err).toBe('')
    const bare = await dispatch(['bogus'])
    expect(bare.code).toBe(1)
    expect(bare.err).toContain("unknown command 'bogus'")
  })

  test('bare --help prints the global command table and advertises per-command help', async () => {
    const r = await dispatch(['--help'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('Commands:')
    expect(r.out).toContain("Run 'cospec <command> --help' for command-specific help.")
  })

  test('init --help lists its own flags, not just the global options', async () => {
    const r = await dispatch(['init', '--help'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('Usage: cospec init [path] [options]')
    expect(r.out).toContain('Command options:')
    for (const flag of ['--gate', '--no-gate', '--harness', '--yes', '--force', '--remove-opsx']) {
      expect(r.out).toContain(flag)
    }
    expect(r.out).toContain('Global options:')
  })

  test('a command with no declared flags still renders only the global options block', async () => {
    const r = await dispatch(['doctor', '--help'])
    expect(r.code).toBe(0)
    expect(r.out).not.toContain('Command options:')
    expect(r.out).toContain('Global options:')
  })

  // Regression: `templates` forwards `--schema <name>` (default `spec-driven`)
  // to the wrapped `openspec templates` call (see commands/templates.ts), but
  // PR #25 ("complete per-command help") left its help entry without the
  // flag, so `--help` silently omitted it. Help now renders from the table row.
  test('templates --help lists its --schema flag', async () => {
    const r = await dispatch(['templates', '--help'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('Command options:')
    expect(r.out).toContain('--schema')
    expect(r.out).toContain('spec-driven')
    expect(r.out).toContain('Global options:')
  })
})

describe('cli dispatcher: bare `help` token', () => {
  test('`cospec <command> help` is identical to `cospec <command> --help`', async () => {
    const withHelpToken = await dispatch(['validate', 'help'])
    const withFlag = await dispatch(['validate', '--help'])
    expect(withHelpToken.code).toBe(withFlag.code)
    expect(withHelpToken.out).toBe(withFlag.out)
  })

  test('`cospec archive help` never runs archive (mutates nothing, matches --help)', async () => {
    const withHelpToken = await dispatch(['archive', 'help'])
    const withFlag = await dispatch(['archive', '--help'])
    expect(withHelpToken.code).toBe(0)
    expect(withHelpToken.out).toBe(withFlag.out)
    expect(withHelpToken.out).not.toContain('archived')
  })

  test('a `help` token that is not immediately after the command is passed through as argv', async () => {
    // 'help' here follows --strict, not the command name, so it is a (nonsense)
    // change-name positional for validate, not a help request.
    const r = await dispatch(['validate', '--strict', 'help'])
    expect(r.out).not.toContain('cospec validate —')
  })

  test('`help` after an absorbed global flag is still the help token', async () => {
    for (const [argv, usage] of [
      [['config', '--no-color', 'help'], 'Usage: cospec config <'],
      [['schema', '--no-color', 'help'], 'Usage: cospec schema <'],
      [['completion', '--no-color', 'help'], 'Usage: cospec completion '],
      [['archive', '--json', 'help'], 'Usage: cospec archive '],
      [['list', '--cwd', '.', 'help'], 'Usage: cospec list '],
    ] as const) {
      const r = await dispatch([...argv])
      expect(r.code, argv.join(' ')).toBe(0)
      expect(r.out, argv.join(' ')).toContain(usage)
    }
  })

  // Upstream's store group has no help subcommand: `help` is the binary's
  // unknown-command refusal, relayed with its sentences spelled through cospec.
  test.failing('`store --no-color help` is the binary’s refusal of help, respelled', async () => {
    const store = await dispatch(['store', '--no-color', 'help'])
    expect(store.code).toBe(1)
    expect(store.err).toBe(await binaryRefusal(['store', 'help']))
  })
})

describe('cli dispatcher: a -- right after the command name', () => {
  test('routes the next token as the subcommand, commander help included', async () => {
    const help = await dispatch(['config', '--', 'help'])
    expect(help.code).toBe(0)
    expect(help.out).toContain('Usage: cospec config <')
    const sub = await dispatch(['config', '--', 'help', 'path'])
    expect(sub.code).toBe(0)
    expect(sub.out).toContain('Usage: cospec config path [options]')
  })

  test.failing('a bare `config --` is config with no subcommand: its help on stderr', async () => {
    const help = await dispatch(['config', '--help'])
    const r = await dispatch(['config', '--'])
    expect(r.code).toBe(1)
    expect(r.out).toBe('')
    expect(r.err).toBe(help.out)
  })

  test('a routed --store-path is an unknown subcommand, not the redirect', async () => {
    const r = await dispatch(['config', '--', '--store-path', '/x'])
    expect(r.code).toBe(1)
    expect(r.err).toContain("cospec config: unknown subcommand '--store-path'")
  })

  test('a row without subcommands keeps -- as its operand terminator', async () => {
    const r = await dispatch(['list', '--', 'extra'])
    expect(r.code).toBe(1)
    expect(r.err).toBe('cospec list: too many arguments. Expected 0 arguments but got 1.\n')
  })
})

describe('cli dispatcher: help renders from the command table', () => {
  test('show --help lists --diff and --requirements, and --requirements-only as the deprecated alias', async () => {
    const r = await dispatch(['show', '--help'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('Usage: cospec show <item> [options]')
    expect(r.out).toMatch(/^ {2}--diff {2,}\S/m)
    expect(r.out).toMatch(/^ {2}--requirements {2,}\S/m)
    expect(r.out).toMatch(/^ {2}--requirements-only +Deprecated alias of --deltas-only/m)
  })

  test('pending flags never appear in help', async () => {
    const init = await dispatch(['init', '--help'])
    for (const flag of ['--language', '--profile', '--copilot-cloud'])
      expect(init.out).not.toContain(flag)
    expect(init.out).toContain('--no-animation')
    // An alias flag is an offered flag: upstream's `init --help` lists `--tools`.
    expect(init.out).toMatch(/^ {2}--tools <tools> +OpenSpec's spelling of --harness/m)
    const list = await dispatch(['list', '--help'])
    expect(list.out).not.toContain('--sort')
    expect(list.out).toContain('--changes')
  })

  test('a row with subcommands lists them with their flags; a subcommand has its own help', async () => {
    const store = await dispatch(['store', '--help'])
    expect(store.out).toContain('Subcommands:')
    expect(store.out).toMatch(/^ {2}setup +Create or register a local store$/m)
    expect(store.out).toMatch(/^ {4}--no-cospec-init +/m)
    const setup = await dispatch(['store', 'setup', '--help'])
    expect(setup.code).toBe(0)
    expect(setup.out).toContain('cospec store setup — Create or register a local store')
    expect(setup.out).toContain('Usage: cospec store setup [id] [options]')
    expect(setup.out).toContain('--path <dir>')
  })

  test('pending subcommands and positionals stay out of help', async () => {
    const completion = await dispatch(['completion', '--help'])
    expect(completion.out).toContain('Usage: cospec completion [bash|zsh|fish] [options]')
    expect(completion.out).not.toMatch(/^ {2}(?:install|uninstall)\b/m)
    expect(completion.out).not.toContain('powershell')
    // `update [path]` is handled (change `upstream-spellings`).
    const update = await dispatch(['update', '--help'])
    expect(update.out).toContain('Usage: cospec update [path] [options]')
  })
})

describe('cli dispatcher: table rows parse before the module loads', () => {
  test('an unknown option is refused with exit 1 and a suggestion', async () => {
    const r = await dispatch(['status', '--schem', 'custom'])
    expect(r.code).toBe(1)
    expect(r.err).toBe("cospec status: unknown option '--schem'\nDid you mean '--schema'?\n")
    expect(r.out).toBe('')
  })

  test('a pending flag is refused as not supported yet', async () => {
    const r = await dispatch(['validate', '--type', 'change', 'x'])
    expect(r.code).toBe(1)
    expect(r.err).toBe("cospec validate: '--type' is not supported yet\n")
  })

  test('a value-taking flag with no value is refused', async () => {
    const r = await dispatch(['sync-blockers', '--change'])
    expect(r.code).toBe(1)
    expect(r.err).toBe("cospec sync-blockers: option '--change <slug>' argument missing\n")
  })

  test('view --json is refused with exactly one JSON document on stdout', async () => {
    const r = await dispatch(['view', '--json'])
    expect(r.code).toBe(1)
    expect(r.err).toBe('')
    expect(JSON.parse(r.out)).toEqual({
      version: 1,
      command: 'view',
      ok: false,
      message: 'cospec view renders a text dashboard and cannot emit JSON',
    })
    expect(r.out.trimEnd().split('\n')).toHaveLength(1)
  })

  test('completion --json keeps its one-document refusal byte for byte', async () => {
    const r = await dispatch(['completion', '--json'])
    expect(r.code).toBe(1)
    expect(r.out).toBe(
      '{"version":1,"command":"completion","ok":false,"message":"cospec completion emits a shell script and cannot emit JSON"}\n',
    )
  })
})

describe('cli dispatcher: --store-path is refused in every position', () => {
  const redirect =
    '✖ Error: --store-path is not supported. Register the path with cospec store register <path>, then select it with --store <id>.\n' +
    'Fix: cospec store register <path>, then rerun with --store <id>.\n'

  for (const argv of [
    ['--store-path', '/x', 'list'],
    ['--store-path=/x', 'list'],
    ['list', '--store-path', '/x'],
    ['list', '--store-path=/x'],
    // A trailing one is a missing value: it answers ahead of an earlier
    // unknown option, a pending flag and help.
    ['list', '--store-path'],
    ['list', '--bogus', '--store-path'],
    ['list', '--help', '--bogus', '--store-path'],
    ['list', '--sort', 'x', '--store-path'],
    // A space-form value is taken whatever it looks like: a global or a help
    // flag there is the value, never absorbed, so even `--json` gets the text.
    ['list', '--store-path', '--store'],
    ['list', '--store-path', '--cwd'],
    ['list', '--store-path', '--json'],
    ['list', '--store-path', '--help'],
    ['list', '--store-path', 'help'],
    // A forward row's binary refuses it itself (contract-tested in the matrix).
  ]) {
    test(argv.join(' '), async () => {
      const r = await dispatch(argv)
      expect(r.code).toBe(1)
      expect(r.err).toBe(redirect)
      expect(r.err).not.toContain('openspec')
      expect(r.err).not.toContain('unknown command')
      expect(r.out).toBe('')
    })
  }

  test('under --json, one envelope on stdout (a later --json counts in the pre-command form)', async () => {
    for (const argv of [
      ['list', '--json', '--store-path', '/x'],
      ['--store-path', '/x', 'list', '--json'],
      ['list', '--json', '--bogus', '--store-path'],
    ]) {
      const r = await dispatch(argv)
      expect(r.code).toBe(1)
      expect(r.err).toBe('')
      const doc = JSON.parse(r.out) as { status: Record<string, string>[] }
      expect(doc.status[0]).toMatchObject({
        severity: 'error',
        code: 'store_path_not_supported',
        target: 'store.id',
      })
      expect(r.out).not.toContain('openspec')
    }
  })
})

describe("cli dispatcher: a value-taking flag's space-form value is never intercepted", () => {
  for (const [argv, err] of [
    // A help flag or a global there is the value: the pending flag is refused
    // with its value consumed, never help, never absorbed.
    [['list', '--sort', '--help'], "cospec list: '--sort' is not supported yet\n"],
    [['list', '--sort', '--json'], "cospec list: '--sort' is not supported yet\n"],
    [['validate', '--type', '--store'], "cospec validate: '--type' is not supported yet\n"],
    // Upstream's program level takes `--no-color` out first, wherever it sits
    // before the first `--`: the flag takes the next token or has none.
    [['list', '--sort', '--no-color'], "cospec list: option '--sort <order>' argument missing\n"],
    [['list', '--sort', '--no-color', 'x'], "cospec list: '--sort' is not supported yet\n"],
    [['list', '--store', '--no-color'], "cospec list: option '--store <id>' argument missing\n"],
    // Past a `--` taken as a value the program level has stopped: both tokens
    // are the command's unknown options.
    [['status', '--change', '--', '--no-color'], "cospec status: unknown option '--no-color'\n"],
    [['status', '--change', '--', '--version'], "cospec status: unknown option '--version'\n"],
  ] as const) {
    test(argv.join(' '), async () => {
      const r = await dispatch([...argv])
      expect(r.code).toBe(1)
      expect(r.err.startsWith(err)).toBe(true)
      expect(r.out).toBe('')
    })
  }
})

describe('cli dispatcher: --store-path before the command takes no value', () => {
  // The program level does not declare it, so help outranks it as an unknown
  // option: `--help` is never its value there.
  test('--store-path --help list prints the program help', async () => {
    const r = await dispatch(['--store-path', '--help', 'list'])
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/^Usage: cospec /m)
    expect(r.err).toBe('')
  })
})

describe('cli dispatcher: a table row refuses --store-path after its other parse refusals', () => {
  for (const [argv, err] of [
    [['list', '--store-path', '/x', '--bogus'], "cospec list: unknown option '--bogus'\n"],
    // `--store` is --store-path's value, so `a` is list's excess operand.
    [
      ['list', '--store-path', '--store', 'a'],
      'cospec list: too many arguments. Expected 0 arguments but got 1.\n',
    ],
    [
      ['list', 'a', '--store-path', '/x'],
      'cospec list: too many arguments. Expected 0 arguments but got 1.\n',
    ],
    [
      ['validate', '--store-path', '/x', 'a', 'b'],
      'cospec validate: too many arguments. Expected 1 argument but got 2.\n',
    ],
  ] as const) {
    test(argv.join(' '), async () => {
      const r = await dispatch([...argv])
      expect(r.code).toBe(1)
      expect(r.err).toBe(err)
      expect(r.out).toBe('')
    })
  }
})

describe('cli dispatcher: an undeclared option before the command is refused', () => {
  // Each argv would otherwise run `list` without the option; the refusal must
  // come before any command module loads.
  for (const [argv, err] of [
    [['--bogus', 'list'], "cospec: unknown option '--bogus'\n"],
    [['--jsn', 'list'], "cospec: unknown option '--jsn'\nDid you mean '--json'?\n"],
    // The whole token is compared, as commander's suggestSimilar does: none is close.
    [['--jsn=1', 'list'], "cospec: unknown option '--jsn=1'\n"],
    [['--verison', 'list'], "cospec: unknown option '--verison'\nDid you mean '--version'?\n"],
    [['-x', 'list'], "cospec: unknown option '-x'\n"],
    [['--bogus'], "cospec: unknown option '--bogus'\n"],
    [['--bogus', 'nosuch'], "cospec: unknown option '--bogus'\n"],
    [['--bogus', '--store-path', '/x', 'list'], "cospec: unknown option '--bogus'\n"],
    [['--bogus', 'show', 'x'], "cospec: unknown option '--bogus'\n"],
  ] as const) {
    test(`${argv.join(' ')} exits 1 with the refusal`, async () => {
      const r = await dispatch([...argv])
      expect(r.code).toBe(1)
      expect(r.err).toBe(err)
      expect(r.out).toBe('')
    })
  }

  test('a version request and help each still win', async () => {
    const version = await dispatch(['--bogus', '--version', 'list'])
    expect(version.code).toBe(0)
    expect(version.out).toBe(`${pkg.version}\n`)
    // Help before the command name is the program's, as `openspec --bogus
    // --help list` prints it.
    const help = await dispatch(['--bogus', '--help', 'list'])
    expect(help.code).toBe(0)
    expect(help.out).toContain('Usage: cospec <command> [options]')
  })

  // Upstream's program-level commander refuses the option before it ever
  // parses the subcommand, so the subcommand's missing or empty value never
  // outranks it.
  for (const argv of [
    ['--bogus', 'list', '--store'],
    ['--bogus', 'list', '--store='],
    ['--bogus', 'show', '--store'],
    ['--bogus', 'list', '--cwd'],
  ]) {
    test(`${argv.join(' ')} refuses the unknown option, not the value`, async () => {
      const r = await dispatch(argv)
      expect(r.code).toBe(1)
      expect(r.err).toBe("cospec: unknown option '--bogus'\n")
      expect(r.out).toBe('')
    })
  }

  test('--store-path alone before the command keeps the redirect', async () => {
    const r = await dispatch(['--store-path', '/x', 'list'])
    expect(r.code).toBe(1)
    expect(r.err).toContain('--store-path is not supported')
    expect(r.err).not.toContain('unknown option')
  })
})

describe('cli dispatcher: --cwd and --store refuse a missing or empty value', () => {
  // Each argv would otherwise run `list` against the local repo; the refusal
  // must come first, before any command module loads.
  for (const [argv, err] of [
    [['list', '--store'], "cospec list: option '--store <id>' argument missing\n"],
    [['list', '--cwd'], "cospec list: option '--cwd <path>' argument missing\n"],
    [['--store'], "cospec: option '--store <id>' argument missing\n"],
    [['--cwd'], "cospec: option '--cwd <path>' argument missing\n"],
    [
      ['store', 'list', '--store='],
      "cospec store: option '--store <id>' argument must not be empty\n",
    ],
    [
      ['config', 'list', '--store='],
      "cospec config: option '--store <id>' argument must not be empty\n",
    ],
    [
      ['list', '--store=', '--cwd='],
      "cospec list: option '--cwd <path>' argument must not be empty\n",
    ],
    [['list', '--cwd='], "cospec list: option '--cwd <path>' argument must not be empty\n"],
    [['--cwd', '', 'list'], "cospec list: option '--cwd <path>' argument must not be empty\n"],
    [['--store='], "cospec: option '--store <id>' argument must not be empty\n"],
    [['--cwd', ''], "cospec: option '--cwd <path>' argument must not be empty\n"],
    [['list', '--help', '--store'], "cospec list: option '--store <id>' argument missing\n"],
    [['list', '--bogus', '--store'], "cospec list: option '--store <id>' argument missing\n"],
    [
      ['list', '--store-path', '/x', '--store'],
      "cospec list: option '--store <id>' argument missing\n",
    ],
  ] as const) {
    test(`${argv.map((a) => (a === '' ? "''" : a)).join(' ')} exits 1 with the refusal`, async () => {
      const r = await dispatch([...argv])
      expect(r.code).toBe(1)
      expect(r.err).toBe(err)
      expect(r.out).toBe('')
    })
  }

  // On a row that selects its root through `--store`, an empty id is the
  // resolver's to refuse, with upstream's `invalid_store_id` (ledger 5.5).
  for (const argv of [
    ['list', '--store='],
    ['list', '--store', ''],
    ['show', 'x', '--store='],
    ['templates', '--store='],
    ['--store=', 'list'],
  ]) {
    test(`${argv.map((a) => (a === '' ? "''" : a)).join(' ')} reaches the resolver`, async () => {
      const err = await dispatch(argv).catch((error: unknown) => error)
      expect(err).toBeInstanceOf(RootSelectionError)
      expect((err as RootSelectionError).diagnostic).toEqual({
        severity: 'error',
        code: 'invalid_store_id',
        message: 'Store id must not be empty',
        target: 'store.id',
        fix: 'Use kebab-case with lowercase letters, numbers, and single hyphen separators.',
      })
    })
  }

  // Upstream accepts an empty value while it parses and refuses it only in
  // its action code, so every parse-time answer outranks it.
  test('--help wins over an empty value with no command', async () => {
    const r = await dispatch(['--store=', '--help'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('Usage: cospec')
    expect(r.err).toBe('')
  })

  test('--help wins over an empty value', async () => {
    const r = await dispatch(['list', '--store=', '--help'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('Usage: cospec list')
    expect(r.err).toBe('')
  })

  for (const [argv, err] of [
    [['list', '--bogus', '--store='], "cospec list: unknown option '--bogus'\n"],
    [['list', '--store=', '--bogus'], "cospec list: unknown option '--bogus'\n"],
    [['list', '--store=', 'a'], 'cospec list: too many arguments'],
    [['--store=', '--bogus', 'list'], "cospec: unknown option '--bogus'\n"],
  ] as const) {
    test(`${argv.join(' ')} gives the parse refusal, not the empty value`, async () => {
      const r = await dispatch([...argv])
      expect(r.code).toBe(1)
      expect(r.err.startsWith(err)).toBe(true)
      expect(r.err).not.toContain('must not be empty')
    })
  }

  test('--store-path wins over an empty value', async () => {
    const r = await dispatch(['list', '--store=', '--store-path', '/x'])
    expect(r.code).toBe(1)
    expect(r.err).toContain('--store-path is not supported')
    expect(r.err).not.toContain('must not be empty')
  })

  test('a version request still wins over a missing value', async () => {
    const r = await dispatch(['list', '--version', '--store'])
    expect(r.code).toBe(0)
    expect(r.err).toBe('')
  })

  test('an unknown command still answers as one', async () => {
    const r = await dispatch(['bogus', '--store'])
    expect(r.code).toBe(1)
    expect(r.err).toContain("cospec: unknown command 'bogus'")
  })
})

describe('cli dispatcher: a -- before the command name', () => {
  // Upstream's program-level commander takes the token after `--` as the
  // command and every later token as its operand; `--` is never an unknown option.
  test('the command after -- runs, not refused as an unknown option', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cospec-cli-terminator-'))
    try {
      const r = await dispatch(['--cwd', dir, '--', 'list'])
      expect(r.err).not.toContain('unknown option')
      // `list` ran: with no openspec/ tree under `dir` it reports no changes or no root.
      expect(r.out + r.err).not.toBe('')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('the empty value is refused only once the command after -- is reached', async () => {
    const r = await dispatch(['--cwd=', '--', 'list'])
    expect(r.code).toBe(1)
    expect(r.err).toBe("cospec list: option '--cwd <path>' argument must not be empty\n")
    const err = await dispatch(['--store=', '--', 'list']).catch((error: unknown) => error)
    expect(err).toBeInstanceOf(RootSelectionError)
    expect((err as RootSelectionError).diagnostic.code).toBe('invalid_store_id')
  })

  for (const argv of [
    ['--', 'list', '--help'],
    ['--', 'list', 'help'],
    ['--', 'list', '--json'],
    ['--', 'list', '--store', 's'],
    ['--no-color', '--', 'list', '--version'],
  ]) {
    test(`${argv.join(' ')}: every token after the command is an operand`, async () => {
      const r = await dispatch(argv)
      expect(r.code).toBe(1)
      expect(r.err).toStartWith('cospec list: too many arguments.')
      expect(r.out).toBe('')
    })
  }

  test('-- completion --json: a dashed token after the command is an operand', async () => {
    const r = await dispatch(['--', 'completion', '--json'])
    expect(r.code).toBe(1)
    // `completion` reads it as its shell operand, never as the `--json` flag.
    expect(r.err).toBe(
      "cospec completion: unsupported shell '--json' (supported: bash, zsh, fish)\n",
    )
    expect(r.out).toBe('')
  })

  for (const [argv, err] of [
    [['--', 'bogus'], "cospec: unknown command 'bogus'\n"],
    [['--', '--version'], "cospec: unknown command '--version'\n"],
    [['--', '--'], "cospec: unknown command '--'\n"],
    [['--bogus', '--', 'list'], "cospec: unknown option '--bogus'\n"],
  ] as const) {
    test(`${argv.join(' ')} exits 1 as upstream does`, async () => {
      const r = await dispatch([...argv])
      expect(r.code).toBe(1)
      expect(r.err).toStartWith(err)
      expect(r.out).toBe('')
    })
  }
})

describe('cli dispatcher: the program level resolves before the command sees its argv', () => {
  test('help before the command name prints the program help, whatever follows', async () => {
    for (const argv of [
      ['--help', 'list'],
      ['--help', 'list', '--store'],
      ['-h', 'show', 'foo'],
      ['--bogus', 'list', '--help'],
      ['--store-path', '/x', 'list', '--help'],
      ['--bogus', '--', '--help'],
    ]) {
      const r = await dispatch(argv)
      expect(r.code, argv.join(' ')).toBe(0)
      expect(r.out, argv.join(' ')).toContain('Usage: cospec <command> [options]')
    }
  })

  test('a pre-command --store-path stops the program level with its redirect', async () => {
    for (const argv of [
      ['--store-path', '/x', 'list', '--store'],
      ['--store-path', '/x', '--bogus', 'list'],
    ]) {
      const r = await dispatch(argv)
      expect(r.code, argv.join(' ')).toBe(1)
      expect(r.err, argv.join(' ')).toContain('--store-path is not supported')
    }
  })

  test('a version flag after the command is not taken as a --store value', async () => {
    const r = await dispatch(['list', '--store', '--version'])
    expect(r.code).toBe(0)
    expect(r.out).toBe(`${pkg.version}\n`)
  })

  test("a command's missing value is raised before its help", async () => {
    const r = await dispatch(['status', '--help', '--change'])
    expect(r.code).toBe(1)
    expect(r.err).toBe("cospec status: option '--change <slug>' argument missing\n")
  })

  test('a help subcommand after a leading -- prints that help', async () => {
    const config = await dispatch(['--', 'config', 'help', 'path'])
    expect(config.code).toBe(0)
    expect(config.out).toContain('Usage: cospec config path [options]')
    const completion = await dispatch(['--', 'completion', 'help'])
    expect(completion.code).toBe(0)
    expect(completion.out).toContain('Usage: cospec completion')
  })

  test.failing('store and workset refuse a help subcommand as upstream does', async () => {
    const store = await dispatch(['store', 'help'])
    expect(store.code).toBe(1)
    expect(store.err).toBe(await binaryRefusal(['store', 'help']))
    const workset = await dispatch(['--', 'workset', 'help'])
    expect(workset.code).toBe(1)
    expect(workset.err).toBe(await binaryRefusal(['workset', 'help']))
  })
})
