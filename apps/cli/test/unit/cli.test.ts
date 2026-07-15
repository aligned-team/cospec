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
