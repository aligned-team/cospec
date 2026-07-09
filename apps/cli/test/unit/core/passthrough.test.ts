import { describe, expect, test } from 'bun:test'

import {
  enforcePassthroughJson,
  isOpenspecErrorStatus,
  OpenspecCallError,
  passthroughOpenspec,
  PINNED_OPENSPEC_VERSION,
  type OpenspecResult,
} from '../../../src/core/openspec.ts'

function result(partial: Partial<OpenspecResult>): OpenspecResult {
  return { stdout: '', stderr: '', exitCode: 0, ...partial }
}

describe('isOpenspecErrorStatus', () => {
  test('true for a status array with a severity: error entry', () => {
    expect(
      isOpenspecErrorStatus({
        status: [{ severity: 'error', code: 'unknown_item', message: 'nope' }],
      }),
    ).toBe(true)
  })

  test('true when an error entry sits alongside non-error entries', () => {
    expect(
      isOpenspecErrorStatus({
        status: [
          { severity: 'warning', code: 'w', message: 'warn' },
          { severity: 'error', code: 'e', message: 'fail', fix: 'do x' },
        ],
      }),
    ).toBe(true)
  })

  test('false for an empty or all-non-error status array', () => {
    expect(isOpenspecErrorStatus({ status: [] })).toBe(false)
    expect(
      isOpenspecErrorStatus({ status: [{ severity: 'warning', code: 'w', message: 'm' }] }),
    ).toBe(false)
  })

  test('false when there is no top-level status array at all', () => {
    expect(isOpenspecErrorStatus({ changes: [] })).toBe(false)
    expect(isOpenspecErrorStatus({ status: 'error' })).toBe(false)
    expect(isOpenspecErrorStatus(null)).toBe(false)
    expect(isOpenspecErrorStatus('not an object')).toBe(false)
    expect(isOpenspecErrorStatus(42)).toBe(false)
  })
})

describe('enforcePassthroughJson', () => {
  test('throws OpenspecCallError when stdout is not parseable JSON', () => {
    expect(() =>
      enforcePassthroughJson('openspec show x --json', result({ stdout: 'not json' })),
    ).toThrow(OpenspecCallError)
  })

  test('throws when stdout is empty (no JSON document at all)', () => {
    expect(() => enforcePassthroughJson('openspec show x --json', result({ stdout: '' }))).toThrow(
      /did not emit a single parseable JSON document/,
    )
  })

  test('normalizes exitCode to 1 when exit 0 carries the failure envelope', () => {
    // The documented openspec quirk: `show <unknown> --json` exits 0 while
    // stdout is `{ status: [{ severity: "error", ... }] }`.
    const stdout = JSON.stringify({
      status: [{ severity: 'error', code: 'show_error', message: 'Change not found' }],
    })
    const out = enforcePassthroughJson('openspec show x --json', result({ stdout, exitCode: 0 }))
    expect(out.exitCode).toBe(1)
    expect(out.stdout).toBe(stdout) // stdout is relayed verbatim, untouched
  })

  test('leaves a genuine success body and exit code untouched', () => {
    const stdout = JSON.stringify({ changes: [] })
    const out = enforcePassthroughJson('openspec list --json', result({ stdout, exitCode: 0 }))
    expect(out.exitCode).toBe(0)
    expect(out.stdout).toBe(stdout)
  })

  test('does not re-normalize an already-nonzero exit code carrying the envelope', () => {
    const stdout = JSON.stringify({ status: [{ severity: 'error', code: 'e', message: 'm' }] })
    const out = enforcePassthroughJson('openspec status --json', result({ stdout, exitCode: 1 }))
    expect(out.exitCode).toBe(1)
  })
})

/**
 * Stub `Bun.spawn` for the duration of one call so `passthroughOpenspec` can
 * be exercised end to end — argv threading, `runOpenspec`'s expectation
 * enforcement, and the JSON invariant — without touching the real pinned
 * binary. The stub answers `--version` (so `assertVersion`'s memoized check
 * passes on whichever test happens to trigger it first) and otherwise hands
 * back the canned response, capturing the args it was invoked with.
 */
function withStubbedSpawn<T>(
  canned: { stdout?: string; stderr?: string; exitCode?: number },
  fn: (capturedArgs: () => string[]) => Promise<T>,
): Promise<T> {
  const originalSpawn = Bun.spawn
  let captured: string[] = []
  // @ts-expect-error — test-only override of Bun.spawn's overloaded signature.
  Bun.spawn = (cmd: string[], _opts: unknown) => {
    // cmd is [execPath, openspecBinPath, '--no-color', ...args].
    const args = cmd.slice(2)
    const isVersionProbe = args.length === 2 && args[0] === '--no-color' && args[1] === '--version'
    const response = isVersionProbe
      ? { stdout: `${PINNED_OPENSPEC_VERSION}\n`, stderr: '', exitCode: 0 }
      : { stdout: canned.stdout ?? '', stderr: canned.stderr ?? '', exitCode: canned.exitCode ?? 0 }
    if (!isVersionProbe) captured = args.slice(1) // drop the forced leading --no-color
    return {
      stdout: new Response(response.stdout).body,
      stderr: new Response(response.stderr).body,
      exited: Promise.resolve(response.exitCode),
    }
  }
  return fn(() => captured).finally(() => {
    Bun.spawn = originalSpawn
  })
}

describe('passthroughOpenspec (stubbed spawn)', () => {
  test('threads args and storeArgs onto the spawned command', async () => {
    await withStubbedSpawn({ stdout: JSON.stringify({ ok: true }), exitCode: 0 }, async (args) => {
      const res = await passthroughOpenspec(['show', 'foo', '--json'], {
        cwd: '/repo',
        storeArgs: ['--store', 'platform'],
      })
      expect(args()).toEqual(['show', 'foo', '--json', '--store', 'platform'])
      expect(res.exitCode).toBe(0)
    })
  })

  test('accepts the passthrough default exit-code allow-list [0, 1]', async () => {
    await withStubbedSpawn({ stdout: 'not found\n', exitCode: 1 }, async () => {
      const res = await passthroughOpenspec(['show', 'nope'], { cwd: '/repo' })
      expect(res.exitCode).toBe(1) // relayed, not thrown — 1 is allowed by default
    })
  })

  test('rejects an exit code outside the allow-list with OpenspecCallError', async () => {
    await withStubbedSpawn({ stdout: '', exitCode: 2 }, async () => {
      await expect(passthroughOpenspec(['show', 'nope'], { cwd: '/repo' })).rejects.toBeInstanceOf(
        OpenspecCallError,
      )
    })
  })

  test('a caller-declared exitCodes override replaces the passthrough default', async () => {
    await withStubbedSpawn({ stdout: '', exitCode: 1 }, async () => {
      await expect(
        passthroughOpenspec(['show', 'nope'], { cwd: '/repo', expect: { exitCodes: [0] } }),
      ).rejects.toBeInstanceOf(OpenspecCallError)
    })
  })

  test('trips a caller-declared stdout deny-list even on an allowed exit code', async () => {
    await withStubbedSpawn(
      { stdout: 'Aborted. No files were changed.\n', exitCode: 0 },
      async () => {
        await expect(
          passthroughOpenspec(['show', 'x'], {
            cwd: '/repo',
            expect: { denyStdout: [/\bAborted\b/] },
          }),
        ).rejects.toThrow(/forbidden pattern/)
      },
    )
  })

  test('normalizes exit 0 + failure envelope to exit 1 for a --json call', async () => {
    const stdout = JSON.stringify({
      status: [{ severity: 'error', code: 'show_error', message: 'Change not found' }],
    })
    await withStubbedSpawn({ stdout, exitCode: 0 }, async () => {
      const res = await passthroughOpenspec(['show', 'nope', '--json'], { cwd: '/repo' })
      expect(res.exitCode).toBe(1)
      expect(res.stdout).toBe(stdout)
    })
  })

  test('a --json call with unparseable stdout throws, even on exit 0', async () => {
    await withStubbedSpawn({ stdout: 'not json at all', exitCode: 0 }, async () => {
      await expect(
        passthroughOpenspec(['show', 'x', '--json'], { cwd: '/repo' }),
      ).rejects.toBeInstanceOf(OpenspecCallError)
    })
  })

  test('a non-JSON call is never held to the one-JSON-doc invariant', async () => {
    await withStubbedSpawn({ stdout: 'human-readable text, not JSON\n', exitCode: 0 }, async () => {
      const res = await passthroughOpenspec(['show', 'x'], { cwd: '/repo' })
      expect(res.exitCode).toBe(0)
      expect(res.stdout).toBe('human-readable text, not JSON\n')
    })
  })
})
