import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'

import type { CommandContext } from '../../../src/cli.ts'
import { storePathRefusal } from '../../../src/core/command-table.ts'
import {
  forwardCall,
  isParseRejection,
  relayGroupRefusal,
  relayRespelled,
  relayStorePathRefusal,
} from '../../../src/core/forward-relay.ts'
import {
  OpenspecCallError,
  type OpenspecResult,
  PINNED_OPENSPEC_VERSION,
} from '../../../src/core/openspec.ts'
import { respellRemedies } from '../../../src/core/remedies.ts'

const UPSTREAM_REDIRECT =
  '✖ Error: --store-path is not supported. Register the path with openspec store register <path>, then select it with --store <id>.\n' +
  'Fix: openspec store register <path>, then rerun with --store <id>.\n'

function result(partial: Partial<OpenspecResult>): OpenspecResult {
  return { stdout: '', stderr: '', exitCode: 1, ...partial }
}

describe('isParseRejection', () => {
  test("commander's rejections and the redirect, with nothing on stdout", () => {
    expect(isParseRejection(result({ stderr: "error: unknown option '--bogus'\n" }))).toBe(true)
    expect(
      isParseRejection(
        result({ stderr: "error: option '--store-path <path>' argument missing\n" }),
      ),
    ).toBe(true)
    expect(isParseRejection(result({ stderr: "error: too many arguments for 'show'.\n" }))).toBe(
      true,
    )
    expect(isParseRejection(result({ stderr: UPSTREAM_REDIRECT }))).toBe(true)
  })

  test('every refusal shape commander 14 raises while it parses', () => {
    for (const stderr of [
      "error: missing required argument 'id'\n",
      "error: unknown command 'bogus'\n",
      "error: option '--mode <m>' argument 'x' is invalid. Allowed choices are a, b.\n",
      "error: option '--mode <m>' value 'x' from env 'MODE' is invalid. Allowed choices are a.\n",
      "error: command-argument value 'x' is invalid for argument 'shell'. Allowed choices are bash.\n",
      "error: required option '--name <n>' not specified\n",
      "error: option '--a' cannot be used with option '--b'\n",
      "error: environment variable 'A' cannot be used with option '--b'\n",
    ])
      expect(isParseRejection(result({ stderr })), stderr).toBe(true)
  })

  test('anything the command itself printed is not one', () => {
    expect(isParseRejection(result({ stderr: "Unknown item 'c1'.\n" }))).toBe(false)
    expect(isParseRejection(result({ stdout: '{}', stderr: "error: unknown option '--x'" }))).toBe(
      false,
    )
  })
})

describe('forwardCall', () => {
  test('returns a parse rejection the call threw as an ordinary result', async () => {
    const rejected = result({ stderr: "error: unknown option '--store-path'\n" })
    const got = await forwardCall(() => Promise.reject(new OpenspecCallError('x', rejected)))
    expect(got).toBe(rejected)
  })

  test('still throws every other wrapped-call violation', async () => {
    const bad = new OpenspecCallError('exited 2', result({ exitCode: 2, stderr: 'boom\n' }))
    await expect(forwardCall(() => Promise.reject(bad))).rejects.toBe(bad)
  })
})

describe('relayStorePathRefusal', () => {
  let written: { stream: string; text: string }[] = []
  let restore: (() => void)[] = []
  beforeEach(() => {
    written = []
    restore = (['stdout', 'stderr'] as const).map((stream) => {
      const spy = spyOn(process[stream], 'write').mockImplementation((chunk) => {
        written.push({ stream, text: String(chunk) })
        return true
      })
      return () => spy.mockRestore()
    })
  })
  afterEach(() => {
    for (const undo of restore) undo()
  })

  test("answers every dialect of the binary's refusal with cospec's redirect", () => {
    const envelope = JSON.stringify({
      schemas: [],
      root: null,
      status: [{ severity: 'error', code: 'store_path_not_supported', message: 'openspec' }],
    })
    // A document only where the binary emitted its envelope for a `--json`
    // caller; commander's refusal (the option undeclared, or declared with no
    // value) comes before any output, so it stays text even under `--json`.
    for (const [run, json, document] of [
      [result({ stderr: UPSTREAM_REDIRECT }), false, false],
      [result({ stderr: "error: unknown option '--store-path'\n" }), false, false],
      [result({ stderr: "error: option '--store-path <path>' argument missing\n" }), false, false],
      [result({ stdout: envelope }), true, true],
      [result({ stderr: "error: unknown option '--store-path'\n" }), true, false],
      [result({ stderr: "error: option '--store-path <path>' argument missing\n" }), true, false],
      [result({ stderr: UPSTREAM_REDIRECT }), true, false],
    ] as const) {
      written = []
      expect(relayStorePathRefusal(run, json)).toBe(1)
      const refusal = storePathRefusal(document)
      expect(written).toEqual([{ stream: refusal.stream, text: refusal.text }])
    }
  })

  test('never reclassifies a run that exited 0, or any other failure', () => {
    expect(relayStorePathRefusal(result({ exitCode: 0, stdout: 'created\n' }), false)).toBe(
      undefined,
    )
    expect(relayStorePathRefusal(result({ stderr: "Unknown item 'c1'.\n" }), false)).toBe(undefined)
    expect(written).toEqual([])
  })
})

describe('respellRemedies', () => {
  test("show's no-proposal remedy, as text and inside a JSON string", () => {
    expect(
      respellRemedies(
        '✖ Error: Change "c1" has no proposal.md yet. Run "openspec status --change c1" to see which artifact comes next.\n',
      ),
    ).toBe(
      '✖ Error: Change "c1" has no proposal.md yet. Run "cospec status --change c1" to see which artifact comes next.\n',
    )
    const message =
      'Change "c1" has no proposal.md yet. Run "openspec status --change c1" to see which artifact comes next.'
    const json = JSON.stringify({ message }, null, 2)
    expect(JSON.parse(respellRemedies(json))).toEqual({
      message: message.replace('"openspec status', '"cospec status'),
    })
  })

  test("show's noun-form remedy is dropped, leaving upstream's store-root wording", () => {
    expect(
      respellRemedies(
        "Ambiguous item 'dup' matches both a change and a spec.\n" +
          'Pass --type change|spec, or use: openspec change show / openspec spec show\n',
      ),
    ).toBe("Ambiguous item 'dup' matches both a change and a spec.\nPass --type change|spec.\n")
  })

  test("view's footer, plain and wrapped in color codes", () => {
    expect(
      respellRemedies(
        '\nUse openspec list --changes or openspec list --specs for detailed views\n',
      ),
    ).toBe('\nUse cospec list --changes or cospec list --specs for detailed views\n')
    expect(
      respellRemedies(
        '\nUse \u001b[37mopenspec list --changes\u001b[39m or \u001b[37mopenspec list --specs\u001b[39m for detailed views',
      ),
    ).toBe(
      '\nUse \u001b[37mcospec list --changes\u001b[39m or \u001b[37mcospec list --specs\u001b[39m for detailed views',
    )
  })

  test("status's Next: remedy for a legacy-schema change", () => {
    expect(respellRemedies('\nNext: openspec instructions specs --change "sd1" --json\n')).toBe(
      '\nNext: cospec instructions specs --change "sd1" --json\n',
    )
  })

  test("the no-root answer's init remedy, capitalised or not", () => {
    expect(respellRemedies('Fix: Run openspec init to create a root here.\n')).toBe(
      'Fix: Run cospec init to create a root here.\n',
    )
    expect(
      respellRemedies(
        'No OpenSpec root found in the current directory or its ancestors. Registered stores: st1, st2. Pass --store <id> to use one, or run openspec init to create a local root.',
      ),
    ).toBe(
      'No OpenSpec root found in the current directory or its ancestors. Registered stores: st1, st2. Pass --store <id> to use one, or run cospec init to create a local root.',
    )
  })

  test('a path that reads like a remedy stays as it is, quoted or not', () => {
    for (const text of [
      "✖ Error: EACCES: permission denied, mkdir '/w/Bob's run openspec init dir/openspec'\n",
      '✖ Error: Invalid store declaration in /w/run openspec init/openspec/config.yaml: bad.\n',
      '✖ Error: Invalid store declaration in /w/a (openspec list --specs)/openspec/config.yaml: bad.\n',
    ])
      expect(respellRemedies(text)).toBe(text)
  })

  test('paths and prose that are not a relayed remedy stay as they are', () => {
    const text = 'openspec/changes/c1/ is nested. See .openspec.yaml; run openspec status by hand.'
    expect(respellRemedies(text)).toBe(text)
  })
})

describe('relayRespelled', () => {
  let written: { stream: string; text: string }[] = []
  let restore: (() => void)[] = []
  beforeEach(() => {
    written = []
    restore = (['stdout', 'stderr'] as const).map((stream) => {
      const spy = spyOn(process[stream], 'write').mockImplementation((chunk) => {
        written.push({ stream, text: String(chunk) })
        return true
      })
      return () => spy.mockRestore()
    })
  })
  afterEach(() => {
    for (const undo of restore) undo()
  })

  const FIX = '    Fix: Run: openspec store doctor st2\n'
  const SPELLED = '    Fix: Run: cospec store doctor st2\n'

  test('a successful answer is relayed as the binary wrote it', () => {
    expect(relayRespelled(result({ exitCode: 0, stdout: FIX }), false)).toBe(0)
    expect(written).toEqual([{ stream: 'stdout', text: FIX }])
  })

  test('a successful answer is relayed untouched, stdout and stderr', () => {
    const user = 'Run openspec init to create a root here.\n'
    expect(relayRespelled(result({ exitCode: 0, stdout: FIX, stderr: user }), true)).toBe(0)
    expect(written).toEqual([
      { stream: 'stdout', text: FIX },
      { stream: 'stderr', text: user },
    ])
  })

  test("a failed answer's upstream remedies are respelled", () => {
    expect(relayRespelled(result({ exitCode: 1, stderr: FIX }), false)).toBe(1)
    expect(written).toEqual([{ stream: 'stderr', text: SPELLED }])
  })
})

/**
 * Runs `fn` with every wrapped call answered by `canned` (the version probe
 * with the pin) and process output captured; returns the wrapped argv.
 */
async function withCannedAnswer<T>(
  canned: Partial<OpenspecResult>,
  fn: () => Promise<T>,
): Promise<{ value?: T; error?: unknown; argv: string[][]; out: string; err: string }> {
  const argv: string[][] = []
  let out = ''
  let err = ''
  const originalSpawn = Bun.spawn
  const outSpy = spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    out += String(chunk)
    return true
  })
  const errSpy = spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    err += String(chunk)
    return true
  })
  // @ts-expect-error — test-only override of Bun.spawn's overloaded signature.
  Bun.spawn = (cmd: string[]) => {
    const args = cmd.slice(3)
    const version = args.length === 1 && args[0] === '--version'
    if (!version) argv.push(args)
    const answer = version ? { stdout: `${PINNED_OPENSPEC_VERSION}\n` } : canned
    return {
      stdout: new Response(answer.stdout ?? '').body,
      stderr: new Response(answer.stderr ?? '').body,
      exited: Promise.resolve(answer.exitCode ?? 0),
    }
  }
  try {
    return { value: await fn(), argv, out, err }
  } catch (error) {
    return { error, argv, out, err }
  } finally {
    Bun.spawn = originalSpawn
    outSpy.mockRestore()
    errSpy.mockRestore()
  }
}

function groupCtx(json: boolean): CommandContext {
  return { args: [], flags: { json, noColor: false, cwd: '/repo' }, cwd: '/repo' }
}

describe('relayGroupRefusal', () => {
  const doc = (code: string) =>
    `${JSON.stringify({
      status: [
        {
          severity: 'error',
          code,
          message: "Unknown command 'x' for 'openspec store'. Store subcommands: setup.",
          fix: 'Run a store subcommand, or use the lifecycle command with --store <id>.',
        },
      ],
    })}\n`

  test('threads --json right after the group, ahead of the argv, its -- kept', async () => {
    const run = await withCannedAnswer(
      { stdout: doc('unknown_store_subcommand'), exitCode: 1 },
      () => relayGroupRefusal(groupCtx(true), 'store', ['--', '--bogus']),
    )
    expect(run.argv).toEqual([['store', '--json', '--', '--bogus']])
    expect(run.value).toBe(1)
    expect(run.out).toBe(respellRemedies(doc('unknown_store_subcommand')))
    expect(run.out).toContain("'cospec store'")
  })

  test("relays the binary's text refusal respelled, and commander's rejection", async () => {
    const text =
      "Error: unknown command 'x' for 'openspec store'.\n  openspec new change <change-id> --store <id>\n"
    const refused = await withCannedAnswer({ stderr: text, exitCode: 1 }, () =>
      relayGroupRefusal(groupCtx(false), 'store', ['x']),
    )
    expect(refused.argv).toEqual([['store', 'x']])
    expect(refused.value).toBe(1)
    expect(refused.err).toBe(respellRemedies(text))
    const commander = "error: unknown option '--bogus'\n"
    const rejected = await withCannedAnswer({ stderr: commander, exitCode: 1 }, () =>
      relayGroupRefusal(groupCtx(true), 'workset', ['--bogus']),
    )
    expect(rejected.value).toBe(1)
    expect(rejected.err).toBe(commander)
  })

  test('any other answer is a wrapped-call violation', async () => {
    for (const canned of [
      { stdout: doc('store_not_found'), exitCode: 1 },
      { stdout: doc('unknown_store_subcommand'), exitCode: 0 },
      { stdout: 'not a document', exitCode: 1 },
    ]) {
      const run = await withCannedAnswer(canned, () =>
        relayGroupRefusal(groupCtx(true), 'store', ['x']),
      )
      expect(run.error).toBeInstanceOf(OpenspecCallError)
      expect(run.out + run.err).toBe('')
    }
    const text = await withCannedAnswer({ stdout: 'x\n', exitCode: 1 }, () =>
      relayGroupRefusal(groupCtx(false), 'workset', ['x']),
    )
    expect(text.error).toBeInstanceOf(OpenspecCallError)
  })
})
