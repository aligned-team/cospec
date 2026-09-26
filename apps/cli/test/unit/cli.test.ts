import { describe, expect, test } from 'bun:test'

import { run } from '../../src/cli.ts'

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

  test('--help on an unknown command still errors (does not print help)', async () => {
    const r = await dispatch(['bogus', '--help'])
    expect(r.code).toBe(1)
    expect(r.err).toContain("unknown command 'bogus'")
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
    for (const flag of ['--tools', '--language', '--profile', '--copilot-cloud'])
      expect(init.out).not.toContain(flag)
    expect(init.out).toContain('--no-animation')
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
    expect(completion.out).not.toContain('Subcommands:')
    const update = await dispatch(['update', '--help'])
    expect(update.out).toContain('Usage: cospec update [options]')
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
    ['show', 'foo', '--store-path', '/x'],
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

describe('cli dispatcher: --cwd and --store refuse a missing or empty value', () => {
  // Each argv would otherwise run `list` against the local repo; the refusal
  // must come first, before any command module loads.
  for (const [argv, err] of [
    [['list', '--store'], "cospec list: option '--store <id>' argument missing\n"],
    [['list', '--cwd'], "cospec list: option '--cwd <path>' argument missing\n"],
    [['--store'], "cospec: option '--store <id>' argument missing\n"],
    [['--cwd'], "cospec: option '--cwd <path>' argument missing\n"],
    [['list', '--store='], "cospec list: option '--store <id>' argument must not be empty\n"],
    [['list', '--store', ''], "cospec list: option '--store <id>' argument must not be empty\n"],
    [['list', '--cwd='], "cospec list: option '--cwd <path>' argument must not be empty\n"],
    [['--cwd', '', 'list'], "cospec list: option '--cwd <path>' argument must not be empty\n"],
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
