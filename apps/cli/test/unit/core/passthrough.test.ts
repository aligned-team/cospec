import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CommandContext } from '../../../src/cli.ts'
import {
  enforcePassthroughJson,
  isOpenspecErrorStatus,
  OpenspecCallError,
  passthroughOpenspec,
  PINNED_OPENSPEC_VERSION,
  stripSuppressedStderr,
  suppressRelayedStderrLine,
  type OpenspecResult,
} from '../../../src/core/openspec.ts'
import {
  callPassthrough,
  renderJsonDocument,
  respellCommandFields,
} from '../../../src/core/passthrough-command.ts'

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
  fn: (capturedArgs: () => string[], capturedCwd: () => string | undefined) => Promise<T>,
): Promise<T> {
  const originalSpawn = Bun.spawn
  let captured: string[] = []
  let capturedCwd: string | undefined
  // @ts-expect-error — test-only override of Bun.spawn's overloaded signature.
  Bun.spawn = (cmd: string[], opts: { cwd?: string }) => {
    // cmd is [execPath, openspecBinPath, '--no-color', ...args].
    const args = cmd.slice(2)
    const isVersionProbe = args.length === 2 && args[0] === '--no-color' && args[1] === '--version'
    const response = isVersionProbe
      ? { stdout: `${PINNED_OPENSPEC_VERSION}\n`, stderr: '', exitCode: 0 }
      : { stdout: canned.stdout ?? '', stderr: canned.stderr ?? '', exitCode: canned.exitCode ?? 0 }
    if (!isVersionProbe) {
      captured = args.slice(1) // drop the forced leading --no-color
      capturedCwd = opts.cwd
    }
    return {
      stdout: new Response(response.stdout).body,
      stderr: new Response(response.stderr).body,
      exited: Promise.resolve(response.exitCode),
    }
  }
  return fn(
    () => captured,
    () => capturedCwd,
  ).finally(() => {
    Bun.spawn = originalSpawn
  })
}

describe('passthroughOpenspec (stubbed spawn)', () => {
  test('threads the flags between the command path and the user args', async () => {
    await withStubbedSpawn({ stdout: JSON.stringify({ ok: true }), exitCode: 0 }, async (args) => {
      const res = await passthroughOpenspec(
        { command: ['show'], threaded: ['--json', '--store', 'platform'], args: ['foo', '--type'] },
        { cwd: '/repo' },
      )
      expect(args()).toEqual(['show', '--json', '--store', 'platform', 'foo', '--type'])
      expect(res.exitCode).toBe(0)
    })
  })

  test('a --json among the user args holds the call to no JSON invariant', async () => {
    // `show c1 --type --json`: the user's `--json` is `--type`'s value.
    await withStubbedSpawn(
      { stdout: '', stderr: "Unknown item 'c1'.\n", exitCode: 1 },
      async () => {
        const res = await passthroughOpenspec(
          { command: ['show'], args: ['c1', '--type', '--json'] },
          { cwd: '/repo' },
        )
        expect(res.exitCode).toBe(1)
        expect(res.stderr).toBe("Unknown item 'c1'.\n")
      },
    )
  })

  test('a violation names the call without a bare openspec command', async () => {
    await withStubbedSpawn({ stdout: 'not json', exitCode: 0 }, async () => {
      const err = await passthroughOpenspec(
        { command: ['show'], threaded: ['--json'], args: ['x'] },
        { cwd: '/repo' },
      ).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(OpenspecCallError)
      expect((err as Error).message).toContain('`show --json x`')
      expect((err as Error).message).not.toMatch(/\bopenspec\b/)
    })
  })

  test('accepts the passthrough default exit-code allow-list [0, 1]', async () => {
    await withStubbedSpawn({ stdout: 'not found\n', exitCode: 1 }, async () => {
      const res = await passthroughOpenspec({ command: ['show'], args: ['nope'] }, { cwd: '/repo' })
      expect(res.exitCode).toBe(1) // relayed, not thrown — 1 is allowed by default
    })
  })

  test('rejects an exit code outside the allow-list with OpenspecCallError', async () => {
    await withStubbedSpawn({ stdout: '', exitCode: 2 }, async () => {
      await expect(
        passthroughOpenspec({ command: ['show'], args: ['nope'] }, { cwd: '/repo' }),
      ).rejects.toBeInstanceOf(OpenspecCallError)
    })
  })

  test('a caller-declared exitCodes override replaces the passthrough default', async () => {
    await withStubbedSpawn({ stdout: '', exitCode: 1 }, async () => {
      await expect(
        passthroughOpenspec(
          { command: ['show'], args: ['nope'] },
          { cwd: '/repo', expect: { exitCodes: [0] } },
        ),
      ).rejects.toBeInstanceOf(OpenspecCallError)
    })
  })

  test('trips a caller-declared stdout deny-list even on an allowed exit code', async () => {
    await withStubbedSpawn(
      { stdout: 'Aborted. No files were changed.\n', exitCode: 0 },
      async () => {
        await expect(
          passthroughOpenspec(
            { command: ['show'], args: ['x'] },
            {
              cwd: '/repo',
              expect: { denyStdout: [/\bAborted\b/] },
            },
          ),
        ).rejects.toThrow(/forbidden pattern/)
      },
    )
  })

  test('normalizes exit 0 + failure envelope to exit 1 for a --json call', async () => {
    const stdout = JSON.stringify({
      status: [{ severity: 'error', code: 'show_error', message: 'Change not found' }],
    })
    await withStubbedSpawn({ stdout, exitCode: 0 }, async () => {
      const res = await passthroughOpenspec(
        { command: ['show'], threaded: ['--json'], args: ['nope'] },
        { cwd: '/repo' },
      )
      expect(res.exitCode).toBe(1)
      expect(res.stdout).toBe(stdout)
    })
  })

  test('a --json call with unparseable stdout throws, even on exit 0', async () => {
    await withStubbedSpawn({ stdout: 'not json at all', exitCode: 0 }, async () => {
      await expect(
        passthroughOpenspec(
          { command: ['show'], threaded: ['--json'], args: ['x'] },
          { cwd: '/repo' },
        ),
      ).rejects.toBeInstanceOf(OpenspecCallError)
    })
  })

  test('a non-JSON call is never held to the one-JSON-doc invariant', async () => {
    await withStubbedSpawn({ stdout: 'human-readable text, not JSON\n', exitCode: 0 }, async () => {
      const res = await passthroughOpenspec({ command: ['show'], args: ['x'] }, { cwd: '/repo' })
      expect(res.exitCode).toBe(0)
      expect(res.stdout).toBe('human-readable text, not JSON\n')
    })
  })
})

describe('relayed stderr suppression (design D7)', () => {
  const warning =
    "Warning: /r/openspec/config.yaml declares store 'suppress-test', but this directory is a " +
    'real OpenSpec root; the declaration is ignored.'
  const banner = 'Using OpenSpec root: suppress-test (/stores/suppress-test)'

  test('drops every registered whole line and keeps everything else', () => {
    suppressRelayedStderrLine(warning)
    suppressRelayedStderrLine(banner)
    const stderr = `${banner}\nfirst\n${warning}\nlast ${banner}\n${warning}`
    expect(stripSuppressedStderr(stderr)).toBe(`first\nlast ${banner}\n`)
  })

  test('passthroughOpenspec returns stderr without a registered line', async () => {
    suppressRelayedStderrLine(banner)
    await withStubbedSpawn({ stdout: 'ok\n', stderr: `${banner}\nother\n` }, async () => {
      const res = await passthroughOpenspec({ command: ['schemas'] }, { cwd: '/repo' })
      expect(res.stderr).toBe('other\n')
      expect(res.stdout).toBe('ok\n')
    })
  })
})

function planningRepo(): { repo: string; sub: string } {
  const repo = mkdtempSync(join(tmpdir(), 'cospec-passthrough-'))
  const sub = join(repo, 'src', 'deep')
  mkdirSync(join(repo, 'openspec', 'changes'), { recursive: true })
  mkdirSync(sub, { recursive: true })
  return { repo, sub }
}

const ctxAt = (cwd: string): CommandContext => ({
  args: [],
  cwd,
  flags: { json: true, noColor: false, cwd },
})

/** A healthy store `alpha` on disk; the stubbed registry listing names it. */
function storeFixture(): { dir: string; store: string; listing: string } {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-passthrough-store-'))
  const store = join(dir, 'alpha')
  mkdirSync(join(store, '.openspec-store'), { recursive: true })
  mkdirSync(join(store, 'openspec'), { recursive: true })
  writeFileSync(join(store, '.openspec-store', 'store.yaml'), 'version: 1\nid: alpha\n')
  writeFileSync(join(store, 'openspec', 'config.yaml'), 'schema: spec-driven\n')
  mkdirSync(join(dir, 'work'))
  // Every non-version spawn gets this stdout: the registry listing parses it,
  // and the passthrough call's `--json` invariant accepts it as one document.
  const listing = JSON.stringify({ stores: [{ id: 'alpha', root: store }] })
  return { dir, store, listing }
}

const storeCtx = (cwd: string): CommandContext => ({
  args: [],
  cwd,
  flags: { json: true, noColor: false, cwd, store: 'alpha' },
})

describe('callPassthrough — spawnInRoot (ledger 3.7)', () => {
  test('spawns in root.base with no --store', async () => {
    const { repo, sub } = planningRepo()
    try {
      await withStubbedSpawn({ stdout: '{}' }, async (args, cwd) => {
        await callPassthrough(ctxAt(sub), { command: ['templates'], spawnInRoot: true })
        expect(cwd()).toBe(realpathSync(repo))
        expect(args()).toEqual(['templates', '--json'])
      })
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })

  test('for a --store root, spawns in the store with no --store', async () => {
    const { dir, store, listing } = storeFixture()
    try {
      await withStubbedSpawn({ stdout: listing }, async (args, cwd) => {
        await callPassthrough(storeCtx(join(dir, 'work')), {
          command: ['schema', 'which'],
          args: ['feat'],
          spawnInRoot: true,
        })
        expect(cwd()).toBe(realpathSync(store))
        expect(args()).toEqual(['schema', 'which', '--json', 'feat'])
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('without it, spawns in root.cwd plus root.storeArgs', async () => {
    const { dir, listing } = storeFixture()
    try {
      await withStubbedSpawn({ stdout: listing }, async (args, cwd) => {
        await callPassthrough(storeCtx(join(dir, 'work')), { command: ['schemas'] })
        expect(cwd()).toBe(join(dir, 'work'))
        expect(args()).toEqual(['schemas', '--json', '--store', 'alpha'])
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('callPassthrough — a failed selection on a forward row (ledger 5.7)', () => {
  // An empty `--store` fails selection before any registry read, so the only
  // non-version spawn is the parse probe.
  const failing = (cwd: string, parsed?: true): CommandContext => ({
    args: [],
    cwd,
    flags: { json: false, noColor: false, cwd, store: '' },
    ...(parsed === true ? { parsed: { flags: {}, positionals: [] } as never } : {}),
  })

  test("returns the binary's refusal, asked in a scratch dir with no --store", async () => {
    const { repo } = planningRepo()
    try {
      const refusal = "error: unknown option '--bogus'\n"
      await withStubbedSpawn({ stderr: refusal, exitCode: 1 }, async (args, cwd) => {
        const { result, code } = await callPassthrough(failing(repo), {
          command: ['schemas'],
          args: ['--bogus'],
        })
        expect(code).toBe(1)
        expect(result.stderr).toBe(refusal)
        expect(args()).toEqual(['schemas', '--bogus'])
        expect(cwd()).not.toBe(repo)
        expect(cwd()).toContain('cospec-parse-')
      })
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })

  test('an argv the binary accepts rethrows the selection failure', async () => {
    const { repo } = planningRepo()
    try {
      await withStubbedSpawn({ stdout: 'ran\n', exitCode: 0 }, async () => {
        const err = await callPassthrough(failing(repo), { command: ['schemas'] }).catch(
          (error: unknown) => error,
        )
        expect((err as { diagnostic?: { code: string } }).diagnostic?.code).toBe('invalid_store_id')
      })
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })

  test('a table row (already parsed) never asks the binary', async () => {
    const { repo } = planningRepo()
    try {
      await withStubbedSpawn(
        { stderr: "error: unknown option '--x'\n", exitCode: 1 },
        async (args) => {
          const err = await callPassthrough(failing(repo, true), {
            command: ['instructions', 'proposal'],
          }).catch((error: unknown) => error)
          expect((err as { diagnostic?: { code: string } }).diagnostic?.code).toBe(
            'invalid_store_id',
          )
          expect(args()).toEqual([])
        },
      )
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })
})

describe('respellCommandFields (structural respell of a relayed document)', () => {
  const doc = {
    references: [
      {
        store_id: 'openspec-team',
        fetch: 'openspec show <spec-id> --type spec --store openspec-team',
        status: [{ code: 'x', fix: 'Run: openspec store doctor openspec-team' }],
      },
      { store_id: 'plain', fetch: 'git clone -- r p && openspec store register p --id plain' },
    ],
    note: 'openspec show x',
  }
  const fields = [
    { path: ['references', '[]', 'fetch'] },
    { path: ['references', '[]', 'status', '[]', 'fix'], lead: 'Run: ' },
  ]

  test('spells only the leading openspec token of each named field', () => {
    expect(respellCommandFields(doc, fields)).toEqual({
      references: [
        {
          store_id: 'openspec-team',
          fetch: 'cospec show <spec-id> --type spec --store openspec-team',
          status: [{ code: 'x', fix: 'Run: cospec store doctor openspec-team' }],
        },
        // Not in command position: left for the owner of that field's shape.
        { store_id: 'plain', fetch: 'git clone -- r p && openspec store register p --id plain' },
      ],
      // A field the map does not name is never touched.
      note: 'openspec show x',
    })
  })

  test('leaves the input document as it was', () => {
    const before = structuredClone(doc)
    respellCommandFields(doc, fields)
    expect(doc).toEqual(before)
  })

  test('a missing path, a non-string value or a non-array step is left alone', () => {
    const odd = { references: { fetch: 'openspec show x' }, other: [1, 'openspec x'] }
    expect(
      respellCommandFields(odd, [
        { path: ['references', '[]', 'fetch'] },
        { path: ['absent', 'fetch'] },
        { path: ['other', '[]'] },
      ]),
    ).toEqual(odd)
    expect(respellCommandFields({ fix: 42 }, [{ path: ['fix'] }])).toEqual({ fix: 42 })
  })

  test('a lead that does not match leaves the field alone', () => {
    expect(
      respellCommandFields({ fix: 'openspec store doctor x' }, [{ path: ['fix'], lead: 'Run: ' }]),
    ).toEqual({
      fix: 'openspec store doctor x',
    })
  })

  test('renderJsonDocument renders two-space JSON and a newline', () => {
    expect(renderJsonDocument({ a: [1] })).toBe('{\n  "a": [\n    1\n  ]\n}\n')
  })
})
