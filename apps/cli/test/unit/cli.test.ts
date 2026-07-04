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
    expect(r.out).toContain('Usage: cospec validate [options]')
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
})
